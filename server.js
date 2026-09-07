const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const APP_DIR = path.join(__dirname, "app");
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "etichette.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS clienti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codice TEXT NOT NULL DEFAULT '',
    ragione_sociale TEXT NOT NULL,
    indirizzo TEXT NOT NULL DEFAULT '',
    cap_citta TEXT NOT NULL DEFAULT '',
    piva TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_clienti_nome ON clienti (ragione_sociale);
  CREATE TABLE IF NOT EXISTS sedi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    ordine INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS vettori (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    ordine INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS spedizioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codice TEXT NOT NULL UNIQUE,
    creato_at TEXT NOT NULL,
    vettore TEXT NOT NULL,
    mittente TEXT NOT NULL,
    cliente_codice TEXT NOT NULL DEFAULT '',
    destinatario TEXT NOT NULL,
    indirizzo TEXT NOT NULL DEFAULT '',
    cap_citta TEXT NOT NULL DEFAULT '',
    colli INTEGER NOT NULL,
    ddt TEXT NOT NULL DEFAULT '',
    peso REAL NOT NULL DEFAULT 0,
    bordero TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS bordero (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    creato_at TEXT NOT NULL,
    giorno TEXT NOT NULL,
    vettore TEXT NOT NULL,
    mittente TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contatore (
    tipo TEXT NOT NULL,
    anno INTEGER NOT NULL,
    ultimo INTEGER NOT NULL,
    PRIMARY KEY (tipo, anno)
  );
  CREATE TABLE IF NOT EXISTS impostazioni (
    chiave TEXT PRIMARY KEY,
    valore TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS utenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utente TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nome TEXT NOT NULL DEFAULT '',
    hash TEXT NOT NULL,
    creato_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessioni (
    token TEXT PRIMARY KEY,
    utente_id INTEGER NOT NULL,
    creato_at TEXT NOT NULL
  );
`);

migra();

/** Allinea i database creati dalle versioni precedenti. */
function migra() {
  const colonne = (tabella) => db.prepare(`PRAGMA table_info(${tabella})`).all().map((c) => c.name);

  if (!colonne("spedizioni").includes("bordero")) {
    db.exec("ALTER TABLE spedizioni ADD COLUMN bordero TEXT NOT NULL DEFAULT ''");
  }
  // ddt e peso: le spedizioni già registrate restano senza (stringa vuota e 0).
  if (!colonne("spedizioni").includes("ddt")) {
    db.exec("ALTER TABLE spedizioni ADD COLUMN ddt TEXT NOT NULL DEFAULT ''");
  }
  if (!colonne("spedizioni").includes("peso")) {
    db.exec("ALTER TABLE spedizioni ADD COLUMN peso REAL NOT NULL DEFAULT 0");
  }
  // contatore: da una riga per anno a una riga per (tipo, anno).
  if (!colonne("contatore").includes("tipo")) {
    db.exec(`
      ALTER TABLE contatore RENAME TO contatore_vecchio;
      CREATE TABLE contatore (
        tipo TEXT NOT NULL, anno INTEGER NOT NULL, ultimo INTEGER NOT NULL,
        PRIMARY KEY (tipo, anno)
      );
      INSERT INTO contatore (tipo, anno, ultimo) SELECT 'spedizione', anno, ultimo FROM contatore_vecchio;
      DROP TABLE contatore_vecchio;
    `);
  }
}

const VETTORI_DEFAULT = ["Trasporti Bianchi", "Corriere Alpi", "Logistica Padana", "Ritiro in sede"];
const SEDI_DEFAULT = ["Sede principale"];
seedSeNecessario("vettori", VETTORI_DEFAULT);
seedSeNecessario("sedi", SEDI_DEFAULT);

function seedSeNecessario(tabella, valori) {
  if (db.prepare(`SELECT COUNT(*) n FROM ${tabella}`).get().n > 0) return;
  const ins = db.prepare(`INSERT INTO ${tabella} (nome, ordine) VALUES (?, ?)`);
  valori.forEach((nome, i) => ins.run(nome, i));
}

const getImpostazione = db.prepare("SELECT valore FROM impostazioni WHERE chiave = ?");
const setImpostazione = db.prepare(
  "INSERT INTO impostazioni (chiave, valore) VALUES (?, ?) ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore"
);

/* — utenti e sessioni — */

/* Accesso unico per tutti: chi entra vede e fa tutto, non ci sono ruoli né permessi. */

const COOKIE_SESSIONE = "sessione";
const DURATA_SESSIONE = 30 * 24 * 60 * 60; // secondi
const UTENTE_INIZIALE = process.env.ADMIN_UTENTE || "admin";
// Il file con la password generata sta accanto al database, non nei log.
const FILE_PASSWORD = path.join(path.dirname(DB_PATH), "password-iniziale.txt");

/** La password non viene mai salvata: si conserva `salt:derivata`, entrambi esadecimali. */
function cifraPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
}

function passwordCorretta(password, salvato) {
  const [salt, atteso] = String(salvato || "").split(":");
  if (!salt || !atteso) return false;
  const attesoBuf = Buffer.from(atteso, "hex");
  const calcolato = crypto.scryptSync(password, salt, 64);
  return attesoBuf.length === calcolato.length && crypto.timingSafeEqual(attesoBuf, calcolato);
}

/** Al primo avvio serve un modo per entrare, ma non una password uguale per tutti:
    la si prende da ADMIN_PASSWORD, altrimenti se ne genera una a caso. */
function seedUtente() {
  if (db.prepare("SELECT COUNT(*) n FROM utenti").get().n > 0) return;
  const scelta = process.env.ADMIN_PASSWORD || "";
  const password = scelta || crypto.randomBytes(12).toString("base64url");
  db.prepare("INSERT INTO utenti (utente, nome, hash, creato_at) VALUES (?, ?, ?, ?)").run(
    UTENTE_INIZIALE,
    "Amministratore",
    cifraPassword(password),
    new Date().toISOString()
  );
  if (scelta) return console.log(`Nessun utente: creato «${UTENTE_INIZIALE}» con la password di ADMIN_PASSWORD.`);

  // I log finiscono in giro (docker logs, raccoglitori esterni): la password no.
  try {
    fs.writeFileSync(FILE_PASSWORD, password + "\n", { mode: 0o600 });
    console.log(
      `Nessun utente: creato «${UTENTE_INIZIALE}». La password è in ${FILE_PASSWORD}: ` +
        "entra, cambiala dalla schermata Utenti, poi cancella il file."
    );
  } catch (e) {
    // Senza il file non si entrerebbe più: come ultima spiaggia si scrive a schermo.
    console.log(
      `Nessun utente: creato «${UTENTE_INIZIALE}» con password «${password}» ` +
        `(non ho potuto scrivere ${FILE_PASSWORD}: ${e.message}). Cambiala subito.`
    );
  }
}
seedUtente();

// Le sessioni scadute restano in tabella finché qualcuno non le usa: si ripuliscono all'avvio.
db.prepare("DELETE FROM sessioni WHERE creato_at < ?").run(
  new Date(Date.now() - DURATA_SESSIONE * 1000).toISOString()
);

const elencoUtenti = () =>
  db.prepare("SELECT id, utente, nome, creato_at FROM utenti ORDER BY utente COLLATE NOCASE").all();

const contaUtenti = () => db.prepare("SELECT COUNT(*) n FROM utenti").get().n;

const utentePerId = (id) => db.prepare("SELECT id, utente, nome FROM utenti WHERE id = ?").get(id) || null;

function creaSessione(utenteId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessioni (token, utente_id, creato_at) VALUES (?, ?, ?)").run(
    token,
    utenteId,
    new Date().toISOString()
  );
  return token;
}

/** L'utente di una sessione valida, oppure null (token sconosciuto, scaduto o utente rimosso). */
function utenteDellaSessione(token) {
  if (!token) return null;
  const s = db.prepare("SELECT utente_id, creato_at FROM sessioni WHERE token = ?").get(token);
  if (!s) return null;
  if (Date.now() - Date.parse(s.creato_at) > DURATA_SESSIONE * 1000) {
    db.prepare("DELETE FROM sessioni WHERE token = ?").run(token);
    return null;
  }
  return utentePerId(s.utente_id);
}

/** Chi cambia password o sparisce non deve restare collegato altrove. */
const chiudiSessioniDi = (utenteId) => db.prepare("DELETE FROM sessioni WHERE utente_id = ?").run(utenteId);

function accedi(nomeUtente, password) {
  const u = db.prepare("SELECT id, utente, nome, hash FROM utenti WHERE utente = ?").get(String(nomeUtente || "").trim());
  if (!u || !passwordCorretta(String(password || ""), u.hash)) return null;
  return { id: u.id, utente: u.utente, nome: u.nome };
}

function creaUtente({ utente, nome, password }) {
  if (db.prepare("SELECT 1 FROM utenti WHERE utente = ?").get(utente)) {
    throw Object.assign(new Error("Nome utente già in uso"), { stato: 409 });
  }
  db.prepare("INSERT INTO utenti (utente, nome, hash, creato_at) VALUES (?, ?, ?, ?)").run(
    utente,
    nome,
    cifraPassword(password),
    new Date().toISOString()
  );
}

/** Cambia nome e, solo se ne arriva una nuova, la password. */
function aggiornaUtente(id, { nome, password }) {
  const u = db.prepare("SELECT id FROM utenti WHERE id = ?").get(id);
  if (!u) throw Object.assign(new Error("Utente inesistente"), { stato: 404 });
  db.prepare("UPDATE utenti SET nome = ? WHERE id = ?").run(nome, id);
  if (password) {
    db.prepare("UPDATE utenti SET hash = ? WHERE id = ?").run(cifraPassword(password), id);
    chiudiSessioniDi(id);
  }
}

function eliminaUtente(id) {
  const u = db.prepare("SELECT id FROM utenti WHERE id = ?").get(id);
  if (!u) throw Object.assign(new Error("Utente inesistente"), { stato: 404 });
  // Senza utenti nessuno potrebbe più entrare: l'ultimo non si cancella.
  if (contaUtenti() <= 1) throw Object.assign(new Error("Serve almeno un utente"), { stato: 400 });
  chiudiSessioniDi(id);
  db.prepare("DELETE FROM utenti WHERE id = ?").run(id);
}

/* — CSV — */

/** Divide una riga CSV rispettando le virgolette. */
function dividiRiga(riga, sep) {
  const campi = [];
  let corrente = "";
  let virgolette = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') {
      if (virgolette && riga[i + 1] === '"') {
        corrente += '"';
        i++;
      } else virgolette = !virgolette;
    } else if (c === sep && !virgolette) {
      campi.push(corrente);
      corrente = "";
    } else corrente += c;
  }
  campi.push(corrente);
  return campi.map((c) => c.trim());
}

const COLONNE = {
  codice: /^(codice|cod\.? ?cliente|id)$/,
  ragione_sociale: /^(ragione ?sociale|nome|cliente|destinatario|denominazione)$/,
  indirizzo: /^(indirizzo|via|recapito)$/,
  cap_citta: /^(cap ?\/? ?citt[àa]'?|citt[àa]|localit[àa]|comune|cap)$/,
  piva: /^(p\.? ?iva|partita ?iva|piva|vat)$/,
};

function parseCsv(text) {
  const righe = String(text || "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (!righe.length) return [];

  const sep = [";", "\t", ","].reduce(
    (best, s) => (dividiRiga(righe[0], s).length > dividiRiga(righe[0], best).length ? s : best),
    ";"
  );

  const intestazione = dividiRiga(righe[0], sep).map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
  const mappa = {};
  for (const [campo, re] of Object.entries(COLONNE)) {
    const i = intestazione.findIndex((c) => re.test(c));
    if (i !== -1) mappa[campo] = i;
  }
  const conIntestazione = mappa.ragione_sociale !== undefined;
  const dati = conIntestazione ? righe.slice(1) : righe;
  // Senza intestazione riconoscibile: prime colonne nell'ordine del file.
  if (!conIntestazione) Object.assign(mappa, { ragione_sociale: 0, indirizzo: 1, cap_citta: 2 });

  const out = [];
  const visti = new Set();
  for (const riga of dati) {
    const campi = dividiRiga(riga, sep);
    const val = (campo) => (mappa[campo] !== undefined ? campi[mappa[campo]] || "" : "");
    const ragione = val("ragione_sociale");
    if (!ragione) continue;
    const cliente = {
      codice: val("codice").replace(/\.0$/, ""),
      ragione_sociale: ragione,
      indirizzo: val("indirizzo"),
      cap_citta: val("cap_citta"),
      piva: val("piva"),
    };
    const chiave = cliente.codice || cliente.ragione_sociale + "|" + cliente.indirizzo;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(cliente);
  }
  return out;
}

/* — scritture — */

/** Il numero del documento di trasporto: obbligatorio, una riga sola. */
const ddtValido = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

/** Il peso in kg: facoltativo, 0 vuol dire «non indicato». Accetta la virgola. */
function pesoValido(v) {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 1000) / 1000, 99999);
}

/** Errore con codice HTTP, per le risposte 4xx dalle funzioni di scrittura. */
class ErroreHttp extends Error {
  constructor(stato, messaggio) {
    super(messaggio);
    this.stato = stato;
  }
}

function inTransazione(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const importaClienti = (clienti) =>
  inTransazione(() => {
    db.prepare("DELETE FROM clienti").run();
    const ins = db.prepare(
      "INSERT INTO clienti (codice, ragione_sociale, indirizzo, cap_citta, piva) VALUES (?, ?, ?, ?, ?)"
    );
    for (const c of clienti) ins.run(c.codice, c.ragione_sociale, c.indirizzo, c.cap_citta, c.piva);
  });

/** Sostituisce un elenco di nomi ordinati (sedi o vettori). */
const salvaElenco = (tabella, valori) =>
  inTransazione(() => {
    db.prepare(`DELETE FROM ${tabella}`).run();
    const ins = db.prepare(`INSERT INTO ${tabella} (nome, ordine) VALUES (?, ?)`);
    valori.forEach((nome, i) => ins.run(nome, i));
  });

/** Avanza il contatore annuale del tipo indicato. Da usare dentro una transazione. */
function prossimoSeq(tipo) {
  const anno = new Date().getFullYear();
  const riga = db.prepare("SELECT ultimo FROM contatore WHERE tipo = ? AND anno = ?").get(tipo, anno);
  const seq = (riga ? riga.ultimo : 0) + 1;
  db.prepare(
    `INSERT INTO contatore (tipo, anno, ultimo) VALUES (?, ?, ?)
     ON CONFLICT(tipo, anno) DO UPDATE SET ultimo = excluded.ultimo`
  ).run(tipo, anno, seq);
  return { anno, seq };
}

const creaSpedizione = (sp) =>
  inTransazione(() => {
    const { anno, seq } = prossimoSeq("spedizione");
    const codice = codiceDa(anno, seq);
    db.prepare(
      `INSERT INTO spedizioni
         (codice, creato_at, vettore, mittente, cliente_codice, destinatario, indirizzo, cap_citta,
          colli, ddt, peso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      codice,
      new Date().toISOString(),
      sp.vettore,
      sp.mittente,
      sp.cliente_codice,
      sp.destinatario,
      sp.indirizzo,
      sp.cap_citta,
      sp.colli,
      sp.ddt,
      sp.peso
    );
    return codice;
  });

/** Modifica una spedizione già registrata. Il codice e la data non cambiano. */
const aggiornaSpedizione = (codice, sp) =>
  inTransazione(() => {
    const riga = db.prepare("SELECT bordero FROM spedizioni WHERE codice = ?").get(codice);
    if (!riga) throw new ErroreHttp(404, "spedizione inesistente");
    if (riga.bordero) throw new ErroreHttp(409, "La spedizione è nel borderò " + riga.bordero + ": non è più modificabile.");
    db.prepare(
      `UPDATE spedizioni SET vettore = ?, mittente = ?, cliente_codice = ?, destinatario = ?,
              indirizzo = ?, cap_citta = ?, colli = ?, ddt = ?, peso = ?
       WHERE codice = ?`
    ).run(
      sp.vettore,
      sp.mittente,
      sp.cliente_codice,
      sp.destinatario,
      sp.indirizzo,
      sp.cap_citta,
      sp.colli,
      sp.ddt,
      sp.peso,
      codice
    );
  });

/** Elimina una spedizione. Il contatore non torna indietro: il codice resta bruciato. */
const eliminaSpedizione = (codice) =>
  inTransazione(() => {
    const riga = db.prepare("SELECT bordero FROM spedizioni WHERE codice = ?").get(codice);
    if (!riga) throw new ErroreHttp(404, "spedizione inesistente");
    if (riga.bordero) throw new ErroreHttp(409, "La spedizione è nel borderò " + riga.bordero + ": non è più eliminabile.");
    db.prepare("DELETE FROM spedizioni WHERE codice = ?").run(codice);
  });

const creaBordero = (b) =>
  inTransazione(() => {
    const posti = b.codici.map(() => "?").join(",");
    const righe = db
      .prepare(
        `SELECT codice, colli, mittente FROM spedizioni
         WHERE codice IN (${posti}) AND bordero = ''`
      )
      .all(...b.codici);
    if (!righe.length) throw new Error("nessuna spedizione da inserire");
    // Il mittente del documento è quello con cui le spedizioni sono state create.
    const mittente = righe[0].mittente || b.mittente;

    const { anno, seq } = prossimoSeq("bordero");
    const numero = "BO-" + anno + "-" + String(seq).padStart(4, "0");
    db.prepare(
      "INSERT INTO bordero (numero, creato_at, giorno, vettore, mittente) VALUES (?, ?, ?, ?, ?)"
    ).run(numero, new Date().toISOString(), b.giorno, b.vettore, mittente);
    const marca = db.prepare("UPDATE spedizioni SET bordero = ? WHERE codice = ?");
    for (const r of righe) marca.run(numero, r.codice);
    return numero;
  });

/** Aggiunge spedizioni a un borderò già emesso: devono essere della stessa giornata
    e dello stesso vettore, e non appartenere già a un altro borderò. */
const aggiungiAlBordero = (numero, codici) =>
  inTransazione(() => {
    const b = db.prepare("SELECT numero, giorno, vettore FROM bordero WHERE numero = ?").get(numero);
    if (!b) throw new ErroreHttp(404, "borderò inesistente");
    const posti = codici.map(() => "?").join(",");
    const righe = db
      .prepare(`SELECT codice, creato_at, vettore, bordero FROM spedizioni WHERE codice IN (${posti})`)
      .all(...codici);
    if (righe.length !== codici.length) throw new ErroreHttp(404, "spedizione inesistente");
    for (const r of righe) {
      if (r.bordero) throw new ErroreHttp(409, `La spedizione ${r.codice} è già nel borderò ${r.bordero}.`);
      if (giornoLocale(r.creato_at) !== b.giorno)
        throw new ErroreHttp(409, `La spedizione ${r.codice} non è della giornata del borderò.`);
      if (r.vettore !== b.vettore)
        throw new ErroreHttp(409, `La spedizione ${r.codice} è di un altro vettore (${r.vettore}).`);
    }
    const marca = db.prepare("UPDATE spedizioni SET bordero = ? WHERE codice = ?");
    for (const r of righe) marca.run(numero, r.codice);
    return righe.length;
  });

/* — letture — */

const codiceDa = (anno, seq) => "SI-" + anno + "-" + String(seq).padStart(4, "0");

function ultimoSeq(tipo) {
  const anno = new Date().getFullYear();
  const riga = db.prepare("SELECT ultimo FROM contatore WHERE tipo = ? AND anno = ?").get(tipo, anno);
  return riga ? riga.ultimo : 0;
}

function prossimoCodice() {
  return codiceDa(new Date().getFullYear(), ultimoSeq("spedizione") + 1);
}

const RIGA_SPEDIZIONE = `SELECT codice, creato_at, vettore, mittente, cliente_codice, destinatario,
                                indirizzo, cap_citta, colli, ddt, peso, bordero FROM spedizioni`;

const mappaSpedizione = (r) => ({
  codice: r.codice,
  data: r.creato_at,
  vettore: r.vettore,
  mittente: r.mittente,
  clienteCodice: r.cliente_codice,
  nome: r.destinatario,
  indirizzo: r.indirizzo,
  capCitta: r.cap_citta,
  colli: r.colli,
  ddt: r.ddt,
  peso: r.peso,
  bordero: r.bordero,
});

/** Spedizioni di un giorno (data locale YYYY-MM-DD), opzionalmente di un vettore. */
function spedizioniDelGiorno(giorno, vettore) {
  const righe = db.prepare(`${RIGA_SPEDIZIONE} ORDER BY id`).all();
  return righe
    .map(mappaSpedizione)
    .filter((r) => giornoLocale(r.data) === giorno && (!vettore || r.vettore === vettore));
}

function giornoLocale(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function borderoDettaglio(numero) {
  const b = db.prepare("SELECT numero, creato_at, giorno, vettore, mittente FROM bordero WHERE numero = ?").get(numero);
  if (!b) return null;
  const righe = db.prepare(`${RIGA_SPEDIZIONE} WHERE bordero = ? ORDER BY id`).all(numero).map(mappaSpedizione);
  return {
    numero: b.numero,
    creatoAt: b.creato_at,
    giorno: b.giorno,
    vettore: b.vettore,
    mittente: b.mittente,
    righe,
    colli: righe.reduce((n, r) => n + r.colli, 0),
    peso: righe.reduce((n, r) => n + r.peso, 0),
  };
}

function elencoBordero() {
  return db
    .prepare(
      `SELECT b.numero, b.giorno, b.vettore, b.creato_at,
              (SELECT COUNT(*) FROM spedizioni s WHERE s.bordero = b.numero) AS spedizioni,
              (SELECT IFNULL(SUM(s.colli), 0) FROM spedizioni s WHERE s.bordero = b.numero) AS colli
       FROM bordero b ORDER BY b.id DESC LIMIT 50`
    )
    .all()
    .map((r) => ({
      numero: r.numero,
      giorno: r.giorno,
      vettore: r.vettore,
      creatoAt: r.creato_at,
      spedizioni: r.spedizioni,
      colli: r.colli,
    }));
}

/** Le giornate con spedizioni, dalla più recente: alimentano il menu del borderò. */
function giornate(limite = 30) {
  const conteggi = new Map();
  for (const r of db.prepare("SELECT creato_at, colli, bordero FROM spedizioni").all()) {
    const giorno = giornoLocale(r.creato_at);
    const g = conteggi.get(giorno) || { giorno, spedizioni: 0, colli: 0, liberi: 0 };
    g.spedizioni++;
    g.colli += r.colli;
    if (!r.bordero) g.liberi++;
    conteggi.set(giorno, g);
  }
  return [...conteggi.values()].sort((a, b) => b.giorno.localeCompare(a.giorno)).slice(0, limite);
}

const LIMITE_RICERCA = 50;

function cercaClienti(q) {
  const query = String(q || "").trim();
  if (!query) {
    return db
      .prepare("SELECT id, codice, ragione_sociale, indirizzo, cap_citta FROM clienti ORDER BY ragione_sociale LIMIT ?")
      .all(LIMITE_RICERCA);
  }
  const like = "%" + query.replace(/[%_]/g, "") + "%";
  return db
    .prepare(
      `SELECT id, codice, ragione_sociale, indirizzo, cap_citta FROM clienti
       WHERE ragione_sociale LIKE ? OR cap_citta LIKE ? OR indirizzo LIKE ? OR codice = ?
       ORDER BY CASE WHEN ragione_sociale LIKE ? THEN 0 ELSE 1 END, ragione_sociale
       LIMIT ?`
    )
    .all(like, like, like, query, query.replace(/[%_]/g, "") + "%", LIMITE_RICERCA);
}

const contaClienti = () => db.prepare("SELECT COUNT(*) n FROM clienti").get().n;

function cliente(id) {
  return db.prepare("SELECT id, codice, ragione_sociale, indirizzo, cap_citta FROM clienti WHERE id = ?").get(id) || null;
}

function stato(q, utente) {
  const sedi = db.prepare("SELECT nome FROM sedi ORDER BY ordine, id").all().map((r) => r.nome);
  const mittente = getImpostazione.get("mittente")?.valore || sedi[0] || "";
  return {
    clienti: cercaClienti(q),
    totaleClienti: contaClienti(),
    limiteRicerca: LIMITE_RICERCA,
    sedi,
    mittente: sedi.includes(mittente) ? mittente : sedi[0] || "",
    vettori: db.prepare("SELECT nome FROM vettori ORDER BY ordine, id").all().map((r) => r.nome),
    storico: db.prepare(`${RIGA_SPEDIZIONE} ORDER BY id DESC LIMIT 200`).all().map(mappaSpedizione),
    bordero: elencoBordero(),
    giornate: giornate(),
    formato: Number(getImpostazione.get("formato")?.valore) === 4 ? 4 : 2,
    prossimoCodice: prossimoCodice(),
    oggi: giornoLocale(new Date().toISOString()),
    utente: utente ? utentePerId(utente.id) : null,
    utenti: elencoUtenti(),
  };
}

/* — HTTP — */

const ELENCHI = {
  "/api/sedi": { tabella: "sedi", campo: "sedi", errore: "Serve almeno una sede" },
  "/api/vettori": { tabella: "vettori", campo: "vettori", errore: "Serve almeno un vettore" },
};

function leggiCorpo(req, limite = 20 * 1024 * 1024) {
  return new Promise((risolvi, rifiuta) => {
    let dati = "";
    req.on("data", (c) => {
      dati += c;
      if (dati.length > limite) {
        rifiuta(new Error("corpo troppo grande"));
        req.destroy();
      }
    });
    req.on("end", () => risolvi(dati));
    req.on("error", rifiuta);
  });
}

/** Il valore di un cookie della richiesta, o null. */
function cookie(req, nome) {
  for (const parte of String(req.headers.cookie || "").split(";")) {
    const i = parte.indexOf("=");
    if (i <= 0 || parte.slice(0, i).trim() !== nome) continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      // Valore non decodificabile (cookie manomesso o troncato): vale come «nessuna sessione».
      // Senza questa rete perfino /login risponderebbe 500 e il browser resterebbe chiuso fuori.
      return null;
    }
  }
  return null;
}

function json(res, code, body) {
  const testo = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(testo),
  });
  res.end(testo);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ico": "image/x-icon",
};

function servi(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const file = path.resolve(APP_DIR, rel);
  if (!file.startsWith(APP_DIR + path.sep)) return json(res, 403, { errore: "vietato" });
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, 404, { errore: "non trovato" });
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}

/* Pagina di accesso e fogli di stile che le servono: raggiungibili senza essere entrati. */
const PUBBLICI = new Set(["/login", "/login.html", "/app.css", "/nocturne.css"]);

function vaiA(res, dove) {
  res.writeHead(302, { location: dove });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    // Serve al HEALTHCHECK del container, che non ha una sessione: non espone dati.
    if (url.pathname === "/api/salute" && req.method === "GET") {
      return json(res, 200, { ok: true, utenti: contaUtenti() });
    }

    const utente = utenteDellaSessione(cookie(req, COOKIE_SESSIONE));

    if (url.pathname === "/api/login" && req.method === "POST") {
      const b = JSON.parse((await leggiCorpo(req, 4 * 1024)) || "{}");
      const u = accedi(b.utente, b.password);
      if (!u) return json(res, 401, { errore: "Utente o password non validi" });
      const token = creaSessione(u.id);
      res.setHeader(
        "set-cookie",
        `${COOKIE_SESSIONE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURATA_SESSIONE}`
      );
      return json(res, 200, { utente: u });
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      const token = cookie(req, COOKIE_SESSIONE);
      if (token) db.prepare("DELETE FROM sessioni WHERE token = ?").run(token);
      res.setHeader("set-cookie", `${COOKIE_SESSIONE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return json(res, 200, { uscito: true });
    }

    if (!utente) {
      if (url.pathname.startsWith("/api/")) return json(res, 401, { errore: "Sessione scaduta" });
      if (url.pathname === "/login") return servi(res, "/login.html");
      if (PUBBLICI.has(url.pathname)) return servi(res, url.pathname);
      return vaiA(res, "/login");
    }

    // Chi è già dentro non ha motivo di rivedere il modulo di accesso.
    if (url.pathname === "/login" || url.pathname === "/login.html") return vaiA(res, "/");

    if (url.pathname === "/api/utenti" && req.method === "GET") {
      return json(res, 200, { utenti: elencoUtenti() });
    }

    if (url.pathname === "/api/utenti" && req.method === "POST") {
      const b = JSON.parse((await leggiCorpo(req, 4 * 1024)) || "{}");
      const nomeUtente = String(b.utente || "").trim();
      const password = String(b.password || "");
      if (!nomeUtente) return json(res, 400, { errore: "Manca il nome utente" });
      if (password.length < 4) return json(res, 400, { errore: "La password deve avere almeno 4 caratteri" });
      try {
        creaUtente({ utente: nomeUtente, nome: String(b.nome || "").trim(), password });
      } catch (e) {
        return json(res, e.stato || 400, { errore: e.message });
      }
      return json(res, 200, { stato: stato("", utente) });
    }

    if (url.pathname.startsWith("/api/utenti/") && (req.method === "PUT" || req.method === "DELETE")) {
      const id = Number(url.pathname.slice("/api/utenti/".length));
      if (!Number.isInteger(id) || id <= 0) return json(res, 400, { errore: "utente sconosciuto" });
      try {
        if (req.method === "DELETE") {
          eliminaUtente(id);
          return json(res, 200, { stato: stato("", utente), uscito: id === utente.id });
        }
        const b = JSON.parse((await leggiCorpo(req, 4 * 1024)) || "{}");
        const password = String(b.password || "");
        if (password && password.length < 4) {
          return json(res, 400, { errore: "La password deve avere almeno 4 caratteri" });
        }
        aggiornaUtente(id, { nome: String(b.nome || "").trim(), password });
        // Cambiando la propria password si chiudono anche le sessioni: si rientra.
        return json(res, 200, { stato: stato("", utente), uscito: Boolean(password) && id === utente.id });
      } catch (e) {
        return json(res, e.stato || 400, { errore: e.message });
      }
    }

    if (url.pathname === "/api/stato" && req.method === "GET") {
      return json(res, 200, stato(url.searchParams.get("q"), utente));
    }

    if (url.pathname === "/api/clienti" && req.method === "GET") {
      return json(res, 200, { clienti: cercaClienti(url.searchParams.get("q")), totaleClienti: contaClienti() });
    }

    if (url.pathname === "/api/clienti" && req.method === "POST") {
      const { csv } = JSON.parse((await leggiCorpo(req)) || "{}");
      const clienti = parseCsv(csv);
      if (!clienti.length) return json(res, 400, { errore: "Nessuna riga valida nel CSV" });
      importaClienti(clienti);
      return json(res, 200, { importati: clienti.length, stato: stato("", utente) });
    }

    if (ELENCHI[url.pathname] && req.method === "POST") {
      const { tabella, campo, errore } = ELENCHI[url.pathname];
      const corpo = JSON.parse((await leggiCorpo(req)) || "{}");
      const pulite = (Array.isArray(corpo[campo]) ? corpo[campo] : [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s, i, a) => a.indexOf(s) === i);
      if (!pulite.length) return json(res, 400, { errore });
      salvaElenco(tabella, pulite);
      return json(res, 200, { stato: stato("", utente) });
    }

    if (url.pathname === "/api/formato" && req.method === "POST") {
      const { formato } = JSON.parse((await leggiCorpo(req)) || "{}");
      const n = Number(formato);
      if (n !== 2 && n !== 4) return json(res, 400, { errore: "formato non previsto" });
      setImpostazione.run("formato", String(n));
      return json(res, 200, { formato: n });
    }

    if (url.pathname === "/api/mittente" && req.method === "POST") {
      const { mittente } = JSON.parse((await leggiCorpo(req)) || "{}");
      if (!mittente) return json(res, 400, { errore: "mittente mancante" });
      setImpostazione.run("mittente", String(mittente));
      return json(res, 200, { mittente: String(mittente) });
    }

    if (url.pathname === "/api/spedizioni" && req.method === "POST") {
      const b = JSON.parse((await leggiCorpo(req)) || "{}");
      const c = cliente(Number(b.clienteId));
      if (!c) return json(res, 400, { errore: "cliente sconosciuto" });
      if (!b.vettore || !b.mittente) return json(res, 400, { errore: "dati incompleti" });
      const ddt = ddtValido(b.ddt);
      if (!ddt) return json(res, 400, { errore: "Manca il numero DDT" });
      const codice = creaSpedizione({
        vettore: String(b.vettore),
        mittente: String(b.mittente),
        cliente_codice: c.codice,
        destinatario: c.ragione_sociale,
        indirizzo: c.indirizzo,
        cap_citta: c.cap_citta,
        colli: Math.max(1, Math.min(99, Number(b.colli) || 1)),
        ddt,
        peso: pesoValido(b.peso),
      });
      return json(res, 200, { codice, stato: stato(b.q || "", utente) });
    }

    if (url.pathname.startsWith("/api/spedizioni/") && (req.method === "PUT" || req.method === "DELETE")) {
      const codice = decodeURIComponent(url.pathname.slice("/api/spedizioni/".length));
      try {
        if (req.method === "DELETE") {
          eliminaSpedizione(codice);
          return json(res, 200, { stato: stato(url.searchParams.get("q") || "", utente) });
        }
        const b = JSON.parse((await leggiCorpo(req)) || "{}");
        if (!b.vettore || !b.mittente) return json(res, 400, { errore: "dati incompleti" });
        // Il destinatario arriva dall'anagrafica; se il cliente non c'è più valgono i dati inviati.
        const c = cliente(Number(b.clienteId));
        const destinatario = c ? c.ragione_sociale : String(b.destinatario || "").trim();
        if (!destinatario) return json(res, 400, { errore: "destinatario mancante" });
        const ddt = ddtValido(b.ddt);
        if (!ddt) return json(res, 400, { errore: "Manca il numero DDT" });
        aggiornaSpedizione(codice, {
          vettore: String(b.vettore),
          mittente: String(b.mittente),
          cliente_codice: c ? c.codice : String(b.clienteCodice || ""),
          destinatario,
          indirizzo: c ? c.indirizzo : String(b.indirizzo || ""),
          cap_citta: c ? c.cap_citta : String(b.capCitta || ""),
          colli: Math.max(1, Math.min(99, Number(b.colli) || 1)),
          ddt,
          peso: pesoValido(b.peso),
        });
        return json(res, 200, { codice, stato: stato(b.q || "", utente) });
      } catch (e) {
        return json(res, e.stato || 400, { errore: e.message });
      }
    }

    if (url.pathname === "/api/spedizioni" && req.method === "GET") {
      const giorno = url.searchParams.get("giorno") || giornoLocale(new Date().toISOString());
      return json(res, 200, {
        giorno,
        spedizioni: spedizioniDelGiorno(giorno, url.searchParams.get("vettore") || ""),
      });
    }

    if (url.pathname === "/api/bordero" && req.method === "GET") {
      const numero = url.searchParams.get("numero");
      if (numero) {
        const b = borderoDettaglio(numero);
        return b ? json(res, 200, b) : json(res, 404, { errore: "borderò inesistente" });
      }
      return json(res, 200, { bordero: elencoBordero() });
    }

    if (url.pathname.startsWith("/api/bordero/") && req.method === "POST") {
      const numero = decodeURIComponent(url.pathname.slice("/api/bordero/".length));
      const b = JSON.parse((await leggiCorpo(req)) || "{}");
      const codici = (Array.isArray(b.codici) ? b.codici : []).map(String).filter(Boolean);
      if (!codici.length) return json(res, 400, { errore: "Nessuna spedizione selezionata" });
      try {
        aggiungiAlBordero(numero, codici);
      } catch (e) {
        return json(res, e.stato || 400, { errore: e.message });
      }
      return json(res, 200, { bordero: borderoDettaglio(numero), stato: stato("", utente) });
    }

    if (url.pathname === "/api/bordero" && req.method === "POST") {
      const b = JSON.parse((await leggiCorpo(req)) || "{}");
      const codici = (Array.isArray(b.codici) ? b.codici : []).map(String).filter(Boolean);
      if (!codici.length) return json(res, 400, { errore: "Nessuna spedizione selezionata" });
      if (!b.vettore || !b.mittente) return json(res, 400, { errore: "dati incompleti" });
      let numero;
      try {
        numero = creaBordero({
          codici,
          vettore: String(b.vettore),
          mittente: String(b.mittente),
          giorno: String(b.giorno || giornoLocale(new Date().toISOString())),
        });
      } catch (e) {
        return json(res, 400, { errore: e.message });
      }
      return json(res, 200, { bordero: borderoDettaglio(numero), stato: stato("", utente) });
    }

    if (url.pathname.startsWith("/api/")) return json(res, 404, { errore: "endpoint sconosciuto" });
    if (req.method !== "GET") return json(res, 405, { errore: "metodo non consentito" });
    return servi(res, url.pathname);
  } catch (e) {
    console.error(e);
    return json(res, 500, { errore: "errore interno" });
  }
});

server.listen(PORT, () => {
  console.log("Etichette di spedizione — http://localhost:" + PORT + " (db: " + DB_PATH + ")");
});
