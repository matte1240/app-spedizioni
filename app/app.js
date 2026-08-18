const MAX_COLLI = 20;
const ATTESA_RICERCA = 180;

const stato = {
  tab: "nuova",
  risultati: [],
  totaleClienti: 0,
  limiteRicerca: 50,
  sedi: [],
  vettori: [],
  storico: [],
  mittente: "",
  vettore: "",
  sel: null, // cliente selezionato (oggetto completo)
  colli: 1,
  cerca: "",
  csv: "",
  sediTesto: "",
  prossimoCodice: "",
  ristampa: null,
  messaggio: null,
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const view = document.getElementById("view");

async function api(path, opzioni) {
  // L'ambiente di prova (demo/) sostituisce il backend con uno locale al browser.
  if (window.apiLocale) return window.apiLocale(path, opzioni);
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opzioni });
  const dati = await res.json();
  if (!res.ok) throw new Error(dati.errore || "errore di rete");
  return dati;
}

function applicaStato(s) {
  stato.risultati = s.clienti;
  stato.totaleClienti = s.totaleClienti;
  stato.limiteRicerca = s.limiteRicerca ?? stato.limiteRicerca;
  stato.sedi = s.sedi;
  stato.vettori = s.vettori;
  stato.storico = s.storico;
  stato.mittente = s.mittente;
  stato.prossimoCodice = s.prossimoCodice;
  stato.sediTesto = s.sedi.join("\n");
  if (!stato.vettore || !s.vettori.includes(stato.vettore)) stato.vettore = s.vettori[0] || "";
  if (!stato.sel) stato.sel = s.clienti[0] || null;
}

/* — formattazione — */

function dataBreve(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dataOggi() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function etichette(codice) {
  const c = stato.sel;
  const out = [];
  for (let i = 0; i < stato.colli; i++) {
    out.push({
      codiceCliente: c ? c.codice : "",
      nome: c ? c.ragione_sociale : "—",
      indirizzo: c ? c.indirizzo : "",
      capCitta: c ? c.cap_citta : "",
      codice,
      vettore: stato.vettore,
      mittente: "Da: " + stato.mittente + " · " + dataOggi(),
      collo: `${i + 1} / ${stato.colli}`,
    });
  }
  return out;
}

function fogli(labels) {
  const out = [];
  for (let i = 0; i < labels.length; i += 2) out.push([labels[i], labels[i + 1] || null]);
  return out.length ? out : [[null, null]];
}

/* — render — */

function htmlSlot(l) {
  if (!l) return `<div class="slot"><div class="slot-empty">Slot libero</div></div>`;
  return `
    <div class="slot">
      <div class="label-head">
        <div>
          <div class="label-kicker">Vettore</div>
          <div class="label-vettore">${esc(l.vettore)}</div>
        </div>
        <span class="label-codice">${esc(l.codice)}</span>
      </div>
      <div class="label-dest">
        <div class="label-kicker">Destinatario${l.codiceCliente ? " · cliente " + esc(l.codiceCliente) : ""}</div>
        <div class="label-nome">${esc(l.nome)}</div>
        <div class="label-sede">${esc(l.indirizzo)}</div>
        <div class="label-sede">${esc(l.capCitta)}</div>
      </div>
      <div class="label-foot">
        <span class="label-mittente">${esc(l.mittente)}</span>
        <span class="label-collo">${esc(l.collo)}</span>
      </div>
    </div>`;
}

function htmlAnteprima() {
  const codice = stato.ristampa ? stato.ristampa.codice : stato.prossimoCodice;
  const sheets = fogli(etichette(codice));
  const altezza = Math.round(sheets.length * 297 * 3.7795 * 0.55 + (sheets.length - 1) * 18);
  return `
    <div class="preview-col">
      <div class="preview-head">
        <h6 class="text-muted" style="margin:0">Anteprima foglio A4</h6>
        <span class="text-muted" style="font-size:12px">${esc(codice)}</span>
      </div>
      <div class="print-scale" style="height:${altezza}px">
        <div class="print-area">
          ${sheets.map((sh) => `<div class="sheet">${sh.map(htmlSlot).join("")}</div>`).join("")}
        </div>
      </div>
    </div>`;
}

function htmlContatto(c) {
  const scelto = stato.sel && stato.sel.id === c.id;
  return `
    <button class="contact" type="button" data-cliente="${c.id}" aria-selected="${!!scelto}">
      <span class="contact-text">
        <span class="contact-name">${esc(c.ragione_sociale)}</span>
        <span class="contact-sede">${esc([c.indirizzo, c.cap_citta].filter(Boolean).join(" · "))}</span>
      </span>
      <span class="contact-mark">${scelto ? "SELEZIONATO" : esc(c.codice)}</span>
    </button>`;
}

function htmlNuova() {
  const sheets = Math.ceil(stato.colli / 2);
  const parziale = stato.risultati.length >= stato.limiteRicerca;
  return `
  <div class="nuova">
    <div class="form-col">
      <div>
        <h2 class="page-title">Nuova etichetta</h2>
        <p class="page-sub text-muted">Una etichetta per collo. Il numero progressivo è assegnato alla stampa.</p>
      </div>

      <div class="field">
        <label>Vettore</label>
        <div class="chips">
          ${stato.vettori
            .map(
              (v) =>
                `<button class="chip" type="button" aria-pressed="${v === stato.vettore}" data-vettore="${esc(v)}">${esc(v)}</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="field">
        <label for="mittente">Sede di partenza</label>
        <select class="input" id="mittente">
          ${stato.sedi
            .map((s) => `<option value="${esc(s)}"${s === stato.mittente ? " selected" : ""}>${esc(s)}</option>`)
            .join("")}
        </select>
      </div>

      <div class="stack-10">
        <div class="row-between">
          <h6 class="section-label">Destinatario</h6>
          <span class="text-muted" style="font-size:12px">${stato.totaleClienti} clienti in anagrafica</span>
        </div>
        <input class="input" id="cerca" placeholder="Cerca per nome, città o codice…" value="${esc(stato.cerca)}">
        <div class="contact-list">
          ${
            stato.risultati.length
              ? stato.risultati.map(htmlContatto).join("")
              : `<div class="list-empty text-muted">Nessun risultato. ${
                  stato.totaleClienti ? "Prova con un altro termine." : "Importa l'anagrafica dalla Rubrica."
                }</div>`
          }
        </div>
        ${parziale ? `<p class="note text-muted">Primi ${stato.limiteRicerca} risultati — affina la ricerca.</p>` : ""}
        ${
          stato.sel && !stato.risultati.some((c) => c.id === stato.sel.id)
            ? `<div class="scelto">
                 <span class="scelto-nome">${esc(stato.sel.ragione_sociale)}</span>
                 <span class="text-muted">${esc([stato.sel.indirizzo, stato.sel.cap_citta].filter(Boolean).join(" · "))}</span>
               </div>`
            : ""
        }
      </div>

      <div class="colli">
        <span class="colli-label">Numero colli</span>
        <div class="colli-controls">
          <button class="btn btn-secondary btn-icon" type="button" id="meno">−</button>
          <span class="colli-count">${stato.colli}</span>
          <button class="btn btn-secondary btn-icon" type="button" id="piu">+</button>
        </div>
      </div>

      <div class="stack-10">
        <p class="note text-muted">${stato.colli} ${stato.colli === 1 ? "etichetta" : "etichette"} · ${sheets} ${
    sheets === 1 ? "foglio A4" : "fogli A4"
  }${stato.ristampa ? " · ristampa di " + esc(stato.ristampa.codice) : ""}</p>
        <button class="btn btn-primary btn-block btn-stampa" type="button" id="stampa"${stato.sel ? "" : " disabled"}>${
    stato.ristampa ? "Ristampa" : "Stampa"
  }</button>
        <button class="btn btn-secondary btn-block" type="button" id="salva"${
          stato.sel && stato.sel.id && !stato.ristampa ? "" : " disabled"
        }>Salva senza stampare</button>
      </div>
    </div>
    ${htmlAnteprima()}
  </div>`;
}

function htmlStorico() {
  return `
  <div class="storico">
    <h2 class="page-title">Storico</h2>
    <p class="page-sub text-muted">Ristampa riapre i dati nel modulo mantenendo il codice originale.</p>
    ${
      stato.storico.length
        ? `<table class="table">
      <thead><tr><th>Codice</th><th>Data</th><th>Vettore</th><th>Destinatario</th><th>Città</th><th>Colli</th><th></th></tr></thead>
      <tbody>
        ${stato.storico
          .map(
            (r) => `
          <tr>
            <td class="num">${esc(r.codice)}</td>
            <td class="text-muted">${esc(dataBreve(r.data))}</td>
            <td><span class="tag tag-neutral">${esc(r.vettore)}</span></td>
            <td>${esc(r.nome)}</td>
            <td class="text-muted">${esc(r.capCitta)}</td>
            <td>${r.colli}</td>
            <td class="cell-right"><button class="btn btn-ghost" type="button" data-ristampa="${esc(r.codice)}">Ristampa</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`
        : `<p class="empty-state text-muted">Nessuna spedizione registrata.</p>`
    }
  </div>`;
}

function htmlRubrica() {
  const righe = stato.csv.split("\n").filter((r) => r.trim()).length;
  return `
  <div class="rubrica">
    <div class="rubrica-col">
      <div>
        <h2 class="page-title">Anagrafica</h2>
        <p class="page-sub text-muted">Importa i clienti da CSV: codice, ragione sociale, indirizzo, CAP / città, P.IVA.</p>
      </div>
      <div class="field">
        <label for="csv">CSV</label>
        <textarea class="input csv-input" id="csv" placeholder="Codice;Ragione Sociale;Indirizzo;CAP / Citta';P.IVA">${esc(
          stato.csv
        )}</textarea>
      </div>
      <div class="rubrica-actions">
        <button class="btn btn-primary" type="button" id="importa"${righe ? "" : " disabled"}>Importa (${righe} righe)</button>
        <button class="btn btn-secondary" type="button" id="scegli-file">Apri file CSV…</button>
        <input type="file" id="file-csv" accept=".csv,.txt" hidden>
      </div>
      <p class="note text-muted">L'importazione sostituisce l'anagrafica corrente. Dal gestionale esporta in CSV (in Excel: <em>Salva con nome → CSV UTF-8</em>).${
        stato.messaggio ? " " + esc(stato.messaggio) : ""
      }</p>

      <div class="field">
        <label for="sedi">Sedi di partenza (una per riga)</label>
        <textarea class="input sedi-input" id="sedi">${esc(stato.sediTesto)}</textarea>
      </div>
      <div class="rubrica-actions">
        <button class="btn btn-secondary" type="button" id="salva-sedi">Salva sedi</button>
      </div>
    </div>
    <div class="rubrica-list">
      <h6 class="text-muted" style="margin:0">${stato.totaleClienti} clienti in anagrafica</h6>
      <input class="input" id="cerca-rubrica" placeholder="Cerca…" value="${esc(stato.cerca)}">
      ${
        stato.risultati.length
          ? `<table class="table">
        <thead><tr><th>Codice</th><th>Ragione sociale</th><th>Indirizzo</th><th>CAP / Città</th><th></th></tr></thead>
        <tbody>
          ${stato.risultati
            .map(
              (c) => `
            <tr>
              <td class="num text-muted">${esc(c.codice)}</td>
              <td>${esc(c.ragione_sociale)}</td>
              <td class="text-muted">${esc(c.indirizzo)}</td>
              <td class="text-muted">${esc(c.cap_citta)}</td>
              <td class="cell-right"><button class="btn btn-ghost" type="button" data-usa="${c.id}">Usa</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p class="empty-state text-muted">Nessun cliente.</p>`
      }
    </div>
  </div>`;
}

function render() {
  const attivo = document.activeElement;
  const focusId = attivo && attivo.id;
  const caret = attivo && "selectionStart" in attivo ? attivo.selectionStart : null;

  view.innerHTML = stato.tab === "storico" ? htmlStorico() : stato.tab === "rubrica" ? htmlRubrica() : htmlNuova();

  document.querySelectorAll(".app-nav a").forEach((a) => {
    if (a.dataset.tab === stato.tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (caret != null && "setSelectionRange" in el) el.setSelectionRange(caret, caret);
    }
  }
}

/* — eventi — */

function vaiA(tab) {
  stato.tab = tab;
  if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
  render();
}

document.querySelector(".app-nav").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-tab]");
  if (!a) return;
  e.preventDefault();
  vaiA(a.dataset.tab);
});

let timerRicerca = null;
function ricercaDifferita() {
  clearTimeout(timerRicerca);
  timerRicerca = setTimeout(async () => {
    try {
      const r = await api("/api/clienti?q=" + encodeURIComponent(stato.cerca));
      stato.risultati = r.clienti;
      stato.totaleClienti = r.totaleClienti;
      render();
    } catch (err) {
      console.error(err);
    }
  }, ATTESA_RICERCA);
}

view.addEventListener("click", async (e) => {
  const t = e.target;

  const vettore = t.closest("[data-vettore]");
  if (vettore) {
    stato.vettore = vettore.dataset.vettore;
    stato.ristampa = null;
    return render();
  }

  const contatto = t.closest("[data-cliente]");
  if (contatto) {
    stato.sel = stato.risultati.find((c) => c.id === Number(contatto.dataset.cliente)) || stato.sel;
    stato.ristampa = null;
    return render();
  }

  if (t.closest("#piu")) {
    stato.colli = Math.min(MAX_COLLI, stato.colli + 1);
    stato.ristampa = null;
    return render();
  }
  if (t.closest("#meno")) {
    stato.colli = Math.max(1, stato.colli - 1);
    stato.ristampa = null;
    return render();
  }

  if (t.closest("#stampa")) return stampa();
  if (t.closest("#salva")) {
    try {
      await registra();
      vaiA("storico");
    } catch (err) {
      alert("Impossibile registrare la spedizione: " + err.message);
    }
    return;
  }

  const ristampa = t.closest("[data-ristampa]");
  if (ristampa) return preparaRistampa(ristampa.dataset.ristampa);

  const usa = t.closest("[data-usa]");
  if (usa) {
    stato.sel = stato.risultati.find((c) => c.id === Number(usa.dataset.usa)) || stato.sel;
    stato.ristampa = null;
    return vaiA("nuova");
  }

  if (t.closest("#scegli-file")) return document.getElementById("file-csv").click();

  if (t.closest("#importa")) {
    const btn = t.closest("#importa");
    btn.disabled = true;
    btn.textContent = "Importazione…";
    try {
      const r = await api("/api/clienti", { method: "POST", body: JSON.stringify({ csv: stato.csv }) });
      stato.cerca = "";
      stato.sel = null;
      applicaStato(r.stato);
      stato.csv = "";
      stato.messaggio = `Importati ${r.importati} clienti.`;
    } catch (err) {
      stato.messaggio = "Importazione fallita: " + err.message;
    }
    return render();
  }

  if (t.closest("#salva-sedi")) {
    try {
      const r = await api("/api/sedi", {
        method: "POST",
        body: JSON.stringify({ sedi: stato.sediTesto.split("\n") }),
      });
      const cerca = stato.cerca;
      applicaStato(r.stato);
      stato.cerca = cerca;
      stato.messaggio = "Sedi aggiornate.";
      ricercaDifferita();
    } catch (err) {
      stato.messaggio = "Salvataggio sedi fallito: " + err.message;
    }
    return render();
  }
});

view.addEventListener("input", (e) => {
  if (e.target.id === "cerca" || e.target.id === "cerca-rubrica") {
    stato.cerca = e.target.value;
    return ricercaDifferita();
  }
  if (e.target.id === "csv") {
    stato.csv = e.target.value;
    const importa = document.getElementById("importa");
    if (importa) importa.disabled = !stato.csv.split("\n").some((r) => r.trim());
    return;
  }
  if (e.target.id === "sedi") stato.sediTesto = e.target.value;
});

view.addEventListener("change", async (e) => {
  if (e.target.id === "mittente") {
    stato.mittente = e.target.value;
    stato.ristampa = null;
    render();
    try {
      await api("/api/mittente", { method: "POST", body: JSON.stringify({ mittente: stato.mittente }) });
    } catch (err) {
      console.error(err);
    }
    return;
  }
  if (e.target.id === "file-csv" && e.target.files[0]) {
    stato.csv = await e.target.files[0].text();
    stato.messaggio = null;
    render();
  }
});

/* — azioni — */

async function preparaRistampa(codiceSpedizione) {
  const r = stato.storico.find((x) => x.codice === codiceSpedizione);
  if (!r) return;
  stato.colli = r.colli;
  stato.vettore = stato.vettori.includes(r.vettore) ? r.vettore : stato.vettore;
  stato.ristampa = { codice: r.codice };
  stato.cerca = r.clienteCodice || r.nome;
  stato.sel = {
    id: null,
    codice: r.clienteCodice,
    ragione_sociale: r.nome,
    indirizzo: r.indirizzo,
    cap_citta: r.capCitta,
  };
  vaiA("nuova");
  try {
    const ric = await api("/api/clienti?q=" + encodeURIComponent(stato.cerca));
    stato.risultati = ric.clienti;
    const trovato = ric.clienti.find((c) => (r.clienteCodice ? c.codice === r.clienteCodice : c.ragione_sociale === r.nome));
    if (trovato) stato.sel = trovato;
    render();
  } catch (err) {
    console.error(err);
  }
}

async function registra() {
  if (!stato.sel || !stato.sel.id) return null;
  const { codice, stato: s } = await api("/api/spedizioni", {
    method: "POST",
    body: JSON.stringify({
      vettore: stato.vettore,
      mittente: stato.mittente,
      clienteId: stato.sel.id,
      colli: stato.colli,
      q: stato.cerca,
    }),
  });
  const sel = stato.sel;
  applicaStato(s);
  stato.sel = sel;
  return codice;
}

async function stampa() {
  if (!stato.ristampa) {
    try {
      const codice = await registra();
      if (!codice) return;
      stato.ristampa = { codice };
    } catch (err) {
      alert("Impossibile registrare la spedizione: " + err.message);
      return;
    }
  }
  render();
  // L'ambiente di prova stampa in una finestra separata (vedi demo/).
  setTimeout(() => (window.stampaLocale || window.print)(), 60);
}

window.addEventListener("afterprint", () => {
  if (!stato.ristampa) return;
  stato.ristampa = null;
  render();
});

async function avvia() {
  try {
    applicaStato(await api("/api/stato"));
  } catch (err) {
    view.innerHTML = `<div class="storico"><h2 class="page-title">Server non raggiungibile</h2><p class="text-muted">${esc(
      err.message
    )}</p></div>`;
    return;
  }
  const hash = location.hash.replace("#", "");
  if (["nuova", "storico", "rubrica"].includes(hash)) stato.tab = hash;
  render();
}

avvia();
