/* Backend locale per l'ambiente di prova: stesse rotte del server, ma i dati
   stanno nel browser (localStorage). Nessuna riga dell'interfaccia cambia. */
(() => {
  const CHIAVE = "etichette-demo-v1";
  const LIMITE = 50;

  // CLIENTI_DEMO è iniettato dal build: [codice, ragione sociale, indirizzo, cap/città]
  const anagraficaIniziale = (window.CLIENTI_DEMO || []).map((c, i) => ({
    id: i + 1,
    codice: c[0],
    ragione_sociale: c[1],
    indirizzo: c[2],
    cap_citta: c[3],
  }));

  const iniziale = () => ({
    clienti: anagraficaIniziale,
    sedi: ["Magazzino Udine", "Deposito Trieste", "Sede Pordenone", "Filiale Gorizia"],
    vettori: ["Trasporti Bianchi", "Corriere Alpi", "Logistica Padana", "Ritiro in sede"],
    mittente: "Magazzino Udine",
    spedizioni: [],
    bordero: [],
    contatore: {},
    contatoreBordero: {},
  });

  let db;
  try {
    const salvato = localStorage.getItem(CHIAVE);
    db = salvato ? JSON.parse(salvato) : iniziale();
    if (!db.clienti || !db.clienti.length) db.clienti = anagraficaIniziale;
    db.bordero = db.bordero || [];
    db.contatoreBordero = db.contatoreBordero || {};
  } catch {
    db = iniziale();
  }

  function salva() {
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(db));
    } catch (e) {
      console.warn("stato non salvato:", e.message);
    }
  }

  function cerca(q) {
    const query = String(q || "").trim().toLowerCase();
    const ordinati = db.clienti;
    if (!query) return ordinati.slice(0, LIMITE);
    const iniziano = [];
    const contengono = [];
    for (const c of ordinati) {
      const nome = c.ragione_sociale.toLowerCase();
      if (c.codice === query || nome.startsWith(query)) iniziano.push(c);
      else if (
        nome.includes(query) ||
        c.cap_citta.toLowerCase().includes(query) ||
        c.indirizzo.toLowerCase().includes(query)
      )
        contengono.push(c);
      if (iniziano.length >= LIMITE) break;
    }
    return iniziano.concat(contengono).slice(0, LIMITE);
  }

  const codiceDa = (anno, seq) => "SI-" + anno + "-" + String(seq).padStart(4, "0");

  /** Il numero del documento di trasporto: obbligatorio, una riga sola. */
  const ddtValido = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

  /** Il peso in kg: facoltativo, 0 vuol dire «non indicato». Accetta la virgola. */
  function pesoValido(v) {
    const n = Number(String(v ?? "").replace(",", ".").trim());
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.round(n * 1000) / 1000, 99999);
  }

  function prossimoCodice() {
    const anno = new Date().getFullYear();
    return codiceDa(anno, (db.contatore[anno] || 0) + 1);
  }

  const giornoLocale = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  function elencoBordero() {
    return db.bordero.map((b) => {
      const righe = db.spedizioni.filter((s) => s.bordero === b.numero);
      return {
        numero: b.numero,
        giorno: b.giorno,
        vettore: b.vettore,
        creatoAt: b.creatoAt,
        spedizioni: righe.length,
        colli: righe.reduce((n, r) => n + r.colli, 0),
      };
    });
  }

  function borderoDettaglio(numero) {
    const b = db.bordero.find((x) => x.numero === numero);
    if (!b) return null;
    const righe = db.spedizioni.filter((s) => s.bordero === numero).slice().reverse();
    return {
      ...b,
      righe,
      colli: righe.reduce((n, r) => n + r.colli, 0),
      peso: righe.reduce((n, r) => n + (Number(r.peso) || 0), 0),
    };
  }

  /** Le giornate con spedizioni, dalla più recente: alimentano il menu del borderò. */
  function giornate(limite = 30) {
    const conteggi = new Map();
    for (const s of db.spedizioni) {
      const giorno = giornoLocale(s.data);
      const g = conteggi.get(giorno) || { giorno, spedizioni: 0, colli: 0, liberi: 0 };
      g.spedizioni++;
      g.colli += s.colli;
      if (!s.bordero) g.liberi++;
      conteggi.set(giorno, g);
    }
    return [...conteggi.values()].sort((a, b) => b.giorno.localeCompare(a.giorno)).slice(0, limite);
  }

  function stato(q) {
    return {
      clienti: cerca(q),
      totaleClienti: db.clienti.length,
      limiteRicerca: LIMITE,
      sedi: db.sedi,
      mittente: db.sedi.includes(db.mittente) ? db.mittente : db.sedi[0] || "",
      vettori: db.vettori,
      storico: db.spedizioni.slice(0, 200),
      bordero: elencoBordero(),
      giornate: giornate(),
      formato: db.formato === 4 ? 4 : 2,
      prossimoCodice: prossimoCodice(),
      oggi: giornoLocale(new Date().toISOString()),
    };
  }

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
    return campi.map((x) => x.trim());
  }

  const COLONNE = {
    codice: /^(codice|cod\.? ?cliente|id)$/,
    ragione_sociale: /^(ragione ?sociale|nome|cliente|destinatario|denominazione)$/,
    indirizzo: /^(indirizzo|via|recapito)$/,
    cap_citta: /^(cap ?\/? ?citt[àa]'?|citt[àa]|localit[àa]|comune|cap)$/,
  };

  function parseCsv(testo) {
    const righe = String(testo || "")
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (!righe.length) return [];
    const sep = [";", "\t", ","].reduce(
      (best, s) => (dividiRiga(righe[0], s).length > dividiRiga(righe[0], best).length ? s : best),
      ";"
    );
    const intestazione = dividiRiga(righe[0], sep).map((c) => c.toLowerCase().replace(/\s+/g, " "));
    const mappa = {};
    for (const [campo, re] of Object.entries(COLONNE)) {
      const i = intestazione.findIndex((c) => re.test(c));
      if (i !== -1) mappa[campo] = i;
    }
    const conIntestazione = mappa.ragione_sociale !== undefined;
    const dati = conIntestazione ? righe.slice(1) : righe;
    if (!conIntestazione) Object.assign(mappa, { ragione_sociale: 0, indirizzo: 1, cap_citta: 2 });
    const out = [];
    dati.forEach((riga) => {
      const campi = dividiRiga(riga, sep);
      const val = (campo) => (mappa[campo] !== undefined ? campi[mappa[campo]] || "" : "");
      const ragione = val("ragione_sociale");
      if (!ragione) return;
      out.push({
        id: out.length + 1,
        codice: val("codice").replace(/\.0$/, ""),
        ragione_sociale: ragione,
        indirizzo: val("indirizzo"),
        cap_citta: val("cap_citta"),
      });
    });
    return out;
  }

  window.apiLocale = async (percorso, opzioni) => {
    const [rotta, query] = percorso.split("?");
    const q = new URLSearchParams(query || "").get("q") || "";
    const corpo = opzioni && opzioni.body ? JSON.parse(opzioni.body) : {};
    const metodo = (opzioni && opzioni.method) || "GET";

    if (rotta === "/api/stato") return stato(q);
    if (rotta === "/api/clienti" && metodo === "GET") return { clienti: cerca(q), totaleClienti: db.clienti.length };

    if (rotta === "/api/clienti" && metodo === "POST") {
      const clienti = parseCsv(corpo.csv);
      if (!clienti.length) throw new Error("Nessuna riga valida nel CSV");
      db.clienti = clienti;
      salva();
      return { importati: clienti.length, stato: stato("") };
    }

    if (rotta === "/api/sedi" || rotta === "/api/vettori") {
      const campo = rotta === "/api/sedi" ? "sedi" : "vettori";
      const pulite = (corpo[campo] || [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s, i, a) => a.indexOf(s) === i);
      if (!pulite.length) throw new Error(campo === "sedi" ? "Serve almeno una sede" : "Serve almeno un vettore");
      db[campo] = pulite;
      salva();
      return { stato: stato("") };
    }

    if (rotta === "/api/formato") {
      const n = Number(corpo.formato);
      if (n !== 2 && n !== 4) throw new Error("formato non previsto");
      db.formato = n;
      salva();
      return { formato: n };
    }

    if (rotta === "/api/mittente") {
      db.mittente = String(corpo.mittente || "");
      salva();
      return { mittente: db.mittente };
    }

    if (rotta === "/api/spedizioni" && metodo === "GET") {
      const giorno = new URLSearchParams(query || "").get("giorno") || giornoLocale(new Date().toISOString());
      const vettore = new URLSearchParams(query || "").get("vettore") || "";
      return {
        giorno,
        spedizioni: db.spedizioni
          .filter((s) => giornoLocale(s.data) === giorno && (!vettore || s.vettore === vettore))
          .slice()
          .reverse(),
      };
    }

    if (rotta === "/api/bordero" && metodo === "GET") {
      const numero = new URLSearchParams(query || "").get("numero");
      if (!numero) return { bordero: elencoBordero() };
      const b = borderoDettaglio(numero);
      if (!b) throw new Error("borderò inesistente");
      return b;
    }

    if (rotta.startsWith("/api/bordero/") && metodo === "POST") {
      const numero = decodeURIComponent(rotta.slice("/api/bordero/".length));
      const b = db.bordero.find((x) => x.numero === numero);
      if (!b) throw new Error("borderò inesistente");
      const codici = (corpo.codici || []).map(String);
      const righe = codici.map((c) => db.spedizioni.find((s) => s.codice === c));
      if (righe.some((r) => !r)) throw new Error("spedizione inesistente");
      for (const r of righe) {
        if (r.bordero) throw new Error("La spedizione " + r.codice + " è già nel borderò " + r.bordero + ".");
        if (giornoLocale(r.data) !== b.giorno)
          throw new Error("La spedizione " + r.codice + " non è della giornata del borderò.");
        if (r.vettore !== b.vettore)
          throw new Error("La spedizione " + r.codice + " è di un altro vettore (" + r.vettore + ").");
      }
      righe.forEach((r) => (r.bordero = numero));
      salva();
      return { bordero: borderoDettaglio(numero), stato: stato("") };
    }

    if (rotta === "/api/bordero" && metodo === "POST") {
      const codici = (corpo.codici || []).map(String);
      const righe = db.spedizioni.filter((s) => codici.includes(s.codice) && !s.bordero);
      if (!righe.length) throw new Error("nessuna spedizione da inserire");
      const anno = new Date().getFullYear();
      const seq = (db.contatoreBordero[anno] || 0) + 1;
      db.contatoreBordero[anno] = seq;
      const numero = "BO-" + anno + "-" + String(seq).padStart(4, "0");
      db.bordero.unshift({
        numero,
        creatoAt: new Date().toISOString(),
        giorno: String(corpo.giorno || giornoLocale(new Date().toISOString())),
        vettore: String(corpo.vettore),
        mittente: righe[0].mittente || String(corpo.mittente),
      });
      righe.forEach((r) => (r.bordero = numero));
      salva();
      return { bordero: borderoDettaglio(numero), stato: stato("") };
    }

    if (rotta.startsWith("/api/spedizioni/") && (metodo === "PUT" || metodo === "DELETE")) {
      const codice = decodeURIComponent(rotta.slice("/api/spedizioni/".length));
      const sp = db.spedizioni.find((s) => s.codice === codice);
      if (!sp) throw new Error("spedizione inesistente");
      if (sp.bordero)
        throw new Error(
          "La spedizione è nel borderò " + sp.bordero + ": non è più " + (metodo === "DELETE" ? "eliminabile." : "modificabile.")
        );
      if (metodo === "DELETE") {
        // Il contatore non torna indietro: il codice resta bruciato, come sul server.
        db.spedizioni = db.spedizioni.filter((s) => s.codice !== codice);
        salva();
        return { stato: stato(q) };
      }
      const c = db.clienti.find((x) => x.id === Number(corpo.clienteId));
      const destinatario = c ? c.ragione_sociale : String(corpo.destinatario || "").trim();
      if (!destinatario) throw new Error("destinatario mancante");
      const ddt = ddtValido(corpo.ddt);
      if (!ddt) throw new Error("Manca il numero DDT");
      Object.assign(sp, {
        vettore: String(corpo.vettore),
        mittente: String(corpo.mittente),
        clienteCodice: c ? c.codice : String(corpo.clienteCodice || ""),
        nome: destinatario,
        indirizzo: c ? c.indirizzo : String(corpo.indirizzo || ""),
        capCitta: c ? c.cap_citta : String(corpo.capCitta || ""),
        colli: Math.max(1, Math.min(99, Number(corpo.colli) || 1)),
        ddt,
        peso: pesoValido(corpo.peso),
      });
      salva();
      return { codice, stato: stato(corpo.q || "") };
    }

    if (rotta === "/api/spedizioni") {
      const c = db.clienti.find((x) => x.id === Number(corpo.clienteId));
      if (!c) throw new Error("cliente sconosciuto");
      const anno = new Date().getFullYear();
      const seq = (db.contatore[anno] || 0) + 1;
      db.contatore[anno] = seq;
      const ddt = ddtValido(corpo.ddt);
      if (!ddt) throw new Error("Manca il numero DDT");
      const codice = codiceDa(anno, seq);
      db.spedizioni.unshift({
        codice,
        data: new Date().toISOString(),
        vettore: String(corpo.vettore),
        mittente: String(corpo.mittente),
        clienteCodice: c.codice,
        nome: c.ragione_sociale,
        indirizzo: c.indirizzo,
        capCitta: c.cap_citta,
        colli: Math.max(1, Math.min(99, Number(corpo.colli) || 1)),
        ddt,
        peso: pesoValido(corpo.peso),
        bordero: "",
      });
      salva();
      return { codice, stato: stato(corpo.q || "") };
    }

    throw new Error("endpoint sconosciuto: " + rotta);
  };

  /* Nell'anteprima l'app gira dentro un iframe: la stampa diretta stamperebbe
     la pagina ospite, quindi i fogli vanno in una finestra dedicata. */
  window.stampaLocale = () => {
    const area = document.querySelector(".print-area");
    const finestra = area && window.open("", "_blank", "width=900,height=1000");
    if (!finestra) {
      window.print();
      return;
    }
    const stili = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    finestra.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Etichette</title><style>${stili}
       html,body{margin:0;background:#fff}
       .print-area{display:block}
       .sheet{box-shadow:none !important;break-after:page}
       .print-area .sheet:last-child{break-after:auto}
       @page{size:A4;margin:0}</style></head><body>${area.outerHTML}</body></html>`
    );
    finestra.document.close();
    finestra.focus();
    setTimeout(() => {
      finestra.print();
      window.dispatchEvent(new Event("afterprint"));
    }, 250);
  };

  window.azzeraDemo = () => {
    localStorage.removeItem(CHIAVE);
    location.reload();
  };
})();
