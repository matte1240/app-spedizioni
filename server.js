const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
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
`);

migra();

/** Allinea i database creati dalle versioni precedenti. */
function migra() {
  const colonne = (tabella) => db.prepare(`PRAGMA table_info(${tabella})`).all().map((c) => c.name);

  if (!colonne("spedizioni").includes("bordero")) {
    db.exec("ALTER TABLE spedizioni ADD COLUMN bordero TEXT NOT NULL DEFAULT ''");
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

const salvaSedi = (sedi) =>
  inTransazione(() => {
    db.prepare("DELETE FROM sedi").run();
    const ins = db.prepare("INSERT INTO sedi (nome, ordine) VALUES (?, ?)");
    sedi.forEach((nome, i) => ins.run(nome, i));
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
         (codice, creato_at, vettore, mittente, cliente_codice, destinatario, indirizzo, cap_citta, colli)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      codice,
      new Date().toISOString(),
      sp.vettore,
      sp.mittente,
      sp.cliente_codice,
      sp.destinatario,
      sp.indirizzo,
      sp.cap_citta,
      sp.colli
    );
    return codice;
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
                                indirizzo, cap_citta, colli, bordero FROM spedizioni`;

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

function stato(q) {
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
    prossimoCodice: prossimoCodice(),
    oggi: giornoLocale(new Date().toISOString()),
  };
}

/* — HTTP — */

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/stato" && req.method === "GET") {
      return json(res, 200, stato(url.searchParams.get("q")));
    }

    if (url.pathname === "/api/clienti" && req.method === "GET") {
      return json(res, 200, { clienti: cercaClienti(url.searchParams.get("q")), totaleClienti: contaClienti() });
    }

    if (url.pathname === "/api/clienti" && req.method === "POST") {
      const { csv } = JSON.parse((await leggiCorpo(req)) || "{}");
      const clienti = parseCsv(csv);
      if (!clienti.length) return json(res, 400, { errore: "Nessuna riga valida nel CSV" });
      importaClienti(clienti);
      return json(res, 200, { importati: clienti.length, stato: stato("") });
    }

    if (url.pathname === "/api/sedi" && req.method === "POST") {
      const { sedi } = JSON.parse((await leggiCorpo(req)) || "{}");
      const pulite = (Array.isArray(sedi) ? sedi : [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s, i, a) => a.indexOf(s) === i);
      if (!pulite.length) return json(res, 400, { errore: "Serve almeno una sede" });
      salvaSedi(pulite);
      return json(res, 200, { stato: stato("") });
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
      const codice = creaSpedizione({
        vettore: String(b.vettore),
        mittente: String(b.mittente),
        cliente_codice: c.codice,
        destinatario: c.ragione_sociale,
        indirizzo: c.indirizzo,
        cap_citta: c.cap_citta,
        colli: Math.max(1, Math.min(99, Number(b.colli) || 1)),
      });
      return json(res, 200, { codice, stato: stato(b.q || "") });
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
      return json(res, 200, { bordero: borderoDettaglio(numero), stato: stato("") });
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
