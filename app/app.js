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
  // borderò
  oggi: "",
  bGiorno: "",
  bVettore: "",
  bSpedizioni: [],
  bSel: [],
  bAperto: null,
  bordero: [],
};

/* Righe per pagina: l'ultima pagina porta anche totali e firme, quindi ne
   contiene meno (misurato sul foglio A4 reale). */
const RIGHE_PAGINA = 15;
const RIGHE_ULTIMA = 12;

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
  stato.bordero = s.bordero || [];
  stato.oggi = s.oggi || stato.oggi;
  if (!stato.bGiorno) stato.bGiorno = stato.oggi;
  if (!stato.vettore || !s.vettori.includes(stato.vettore)) stato.vettore = s.vettori[0] || "";
  if (!stato.bVettore || !s.vettori.includes(stato.bVettore)) stato.bVettore = s.vettori[0] || "";
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

/* — borderò — */

function dataItaliana(giorno) {
  const [a, m, g] = String(giorno || "").split("-");
  return g ? `${g}/${m}/${a}` : giorno;
}

/** Il borderò mostrato: quello aperto, oppure la bozza con le spedizioni spuntate. */
function borderoCorrente() {
  if (stato.bAperto) return stato.bAperto;
  const righe = stato.bSpedizioni.filter((s) => stato.bSel.includes(s.codice));
  return {
    numero: "bozza",
    giorno: stato.bGiorno,
    vettore: stato.bVettore,
    mittente: (righe[0] && righe[0].mittente) || stato.mittente,
    righe,
    colli: righe.reduce((n, r) => n + r.colli, 0),
  };
}

/** Divide le righe in pagine A4, riservando spazio a totali e firme sull'ultima. */
function impagina(righe) {
  if (righe.length <= RIGHE_ULTIMA) return [righe];
  const prime = righe.slice(0, righe.length - RIGHE_ULTIMA);
  const quante = Math.ceil(prime.length / RIGHE_PAGINA);
  const per = Math.ceil(prime.length / quante);
  const pagine = [];
  for (let i = 0; i < prime.length; i += per) pagine.push(prime.slice(i, i + per));
  pagine.push(righe.slice(righe.length - RIGHE_ULTIMA));
  return pagine;
}

function htmlPaginaBordero(b, righe, pagina, pagine, primo) {
  const ultima = pagina === pagine;
  return `
    <div class="sheet bordero-sheet">
      <div class="bordero-head">
        <div>
          <div class="label-kicker">Borderò di consegna</div>
          <div class="bordero-numero">${esc(b.numero === "bozza" ? "BOZZA" : b.numero)}</div>
        </div>
        <div class="bordero-meta">
          <div><span>Vettore</span><strong>${esc(b.vettore)}</strong></div>
          <div><span>Data</span><strong>${esc(dataItaliana(b.giorno))}</strong></div>
          <div><span>Mittente</span><strong>${esc(b.mittente)}</strong></div>
        </div>
      </div>
      <table class="bordero-table">
        <thead>
          <tr><th>#</th><th>Spedizione</th><th>Destinatario</th><th>Indirizzo</th><th>Località</th><th class="col-colli">Colli</th></tr>
        </thead>
        <tbody>
          ${
            righe.length
              ? righe
                  .map(
                    (r, i) => `
            <tr>
              <td>${primo + i + 1}</td>
              <td class="num">${esc(r.codice)}</td>
              <td>${esc(r.nome)}</td>
              <td>${esc(r.indirizzo)}</td>
              <td>${esc(r.capCitta)}</td>
              <td class="col-colli">${r.colli}</td>
            </tr>`
                  )
                  .join("")
              : `<tr><td colspan="6" class="bordero-vuoto">Nessuna spedizione selezionata</td></tr>`
          }
        </tbody>
      </table>
      ${
        ultima
          ? `<div class="bordero-totali">
               <span>Totale</span>
               <strong>${b.righe.length} ${b.righe.length === 1 ? "spedizione" : "spedizioni"} · ${b.colli} ${
              b.colli === 1 ? "collo" : "colli"
            }</strong>
             </div>
             <div class="bordero-firme">
               <div class="firma"><span>Consegnato da</span><div class="riga-firma"></div></div>
               <div class="firma"><span>Ritirato da (autista) — data e ora</span><div class="riga-firma"></div></div>
             </div>`
          : ""
      }
      <div class="bordero-pie">
        <span>${esc(b.mittente)}</span>
        <span>Pagina ${pagina} di ${pagine}</span>
      </div>
    </div>`;
}

function htmlAnteprimaBordero() {
  const b = borderoCorrente();
  const pagine = impagina(b.righe);
  let primo = 0;
  const fogli = pagine.map((righe, i) => {
    const html = htmlPaginaBordero(b, righe, i + 1, pagine.length, primo);
    primo += righe.length;
    return html;
  });
  const altezza = Math.round(pagine.length * 297 * 3.7795 * 0.55 + (pagine.length - 1) * 18);
  return `
    <div class="preview-col">
      <div class="preview-head">
        <h6 class="text-muted" style="margin:0">Anteprima borderò</h6>
        <span class="text-muted" style="font-size:12px">${esc(b.numero === "bozza" ? "non ancora generato" : b.numero)}</span>
      </div>
      <div class="print-scale" style="height:${altezza}px">
        <div class="print-area">${fogli.join("")}</div>
      </div>
    </div>`;
}

function htmlBordero() {
  const b = borderoCorrente();
  const disponibili = stato.bSpedizioni.filter((s) => !s.bordero);
  const tutteSpuntate = disponibili.length > 0 && disponibili.every((s) => stato.bSel.includes(s.codice));
  return `
  <div class="nuova">
    <div class="form-col">
      <div>
        <h2 class="page-title">Borderò</h2>
        <p class="page-sub text-muted">La distinta da consegnare all'autista: scegli vettore e giornata, spunta le spedizioni e stampa.</p>
      </div>

      <div class="field">
        <label>Vettore</label>
        <div class="chips">
          ${stato.vettori
            .map(
              (v) =>
                `<button class="chip" type="button" aria-pressed="${v === stato.bVettore}" data-bvettore="${esc(v)}">${esc(v)}</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="field">
        <label for="giorno">Giornata</label>
        <input class="input" type="date" id="giorno" value="${esc(stato.bGiorno)}">
      </div>

      <div class="stack-10">
        <div class="row-between">
          <h6 class="section-label">Spedizioni</h6>
          ${
            disponibili.length
              ? `<button class="btn btn-ghost" type="button" id="spunta-tutte">${
                  tutteSpuntate ? "Deseleziona tutte" : "Seleziona tutte"
                }</button>`
              : ""
          }
        </div>
        <div class="contact-list">
          ${
            stato.bSpedizioni.length
              ? stato.bSpedizioni.map(htmlRigaSpedizione).join("")
              : `<div class="list-empty text-muted">Nessuna spedizione per ${esc(stato.bVettore)} il ${esc(
                  dataItaliana(stato.bGiorno)
                )}.</div>`
          }
        </div>
      </div>

      <div class="colli">
        <span class="colli-label">${b.righe.length} ${b.righe.length === 1 ? "spedizione" : "spedizioni"}</span>
        <span class="colli-count">${b.colli} ${b.colli === 1 ? "collo" : "colli"}</span>
      </div>

      <div class="stack-10">
        ${
          stato.bAperto
            ? `<p class="note text-muted">Borderò ${esc(stato.bAperto.numero)} generato.</p>
               <button class="btn btn-primary btn-block btn-stampa" type="button" id="stampa-bordero">Stampa borderò</button>
               <button class="btn btn-secondary btn-block" type="button" id="nuovo-bordero">Prepara un altro borderò</button>`
            : `<p class="note text-muted">Le spedizioni inserite in un borderò non possono finire in un secondo borderò.</p>
               <button class="btn btn-primary btn-block btn-stampa" type="button" id="genera-bordero"${
                 stato.bSel.length ? "" : " disabled"
               }>Genera e stampa</button>`
        }
      </div>

      ${
        stato.bordero.length
          ? `<div class="stack-10">
               <h6 class="text-muted" style="margin:0">Borderò recenti</h6>
               <table class="table">
                 <tbody>
                   ${stato.bordero
                     .map(
                       (r) => `
                     <tr>
                       <td class="num">${esc(r.numero)}</td>
                       <td class="text-muted">${esc(dataItaliana(r.giorno))}</td>
                       <td>${esc(r.vettore)}</td>
                       <td class="text-muted">${r.spedizioni} sped. · ${r.colli} colli</td>
                       <td class="cell-right"><button class="btn btn-ghost" type="button" data-apri="${esc(r.numero)}">Apri</button></td>
                     </tr>`
                     )
                     .join("")}
                 </tbody>
               </table>
             </div>`
          : ""
      }
    </div>
    ${htmlAnteprimaBordero()}
  </div>`;
}

function htmlRigaSpedizione(s) {
  const inBordero = !!s.bordero;
  const spuntata = stato.bSel.includes(s.codice);
  return `
    <label class="contact riga-sped${inBordero ? " riga-usata" : ""}">
      <input type="checkbox" data-sped="${esc(s.codice)}"${spuntata ? " checked" : ""}${inBordero ? " disabled" : ""}>
      <span class="contact-text">
        <span class="contact-name">${esc(s.nome)}</span>
        <span class="contact-sede">${esc(s.codice)} · ${esc(s.capCitta)}</span>
      </span>
      <span class="contact-mark">${inBordero ? esc(s.bordero) : s.colli + (s.colli === 1 ? " collo" : " colli")}</span>
    </label>`;
}

function htmlStorico() {
  return `
  <div class="storico">
    <h2 class="page-title">Storico</h2>
    <p class="page-sub text-muted">Ristampa riapre i dati nel modulo mantenendo il codice originale.</p>
    ${
      stato.storico.length
        ? `<table class="table">
      <thead><tr><th>Codice</th><th>Data</th><th>Vettore</th><th>Destinatario</th><th>Città</th><th>Colli</th><th>Borderò</th><th></th></tr></thead>
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
            <td class="num text-muted">${r.bordero ? esc(r.bordero) : "—"}</td>
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

  const pagine = { storico: htmlStorico, rubrica: htmlRubrica, bordero: htmlBordero, nuova: htmlNuova };
  view.innerHTML = (pagine[stato.tab] || htmlNuova)();

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
  if (tab === "bordero" && !stato.bAperto) caricaGiornata();
}

async function caricaGiornata() {
  try {
    const r = await api(
      `/api/spedizioni?giorno=${encodeURIComponent(stato.bGiorno)}&vettore=${encodeURIComponent(stato.bVettore)}`
    );
    stato.bSpedizioni = r.spedizioni;
    stato.bSel = r.spedizioni.filter((s) => !s.bordero).map((s) => s.codice);
    render();
  } catch (err) {
    console.error(err);
  }
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

  const bVettore = t.closest("[data-bvettore]");
  if (bVettore) {
    stato.bVettore = bVettore.dataset.bvettore;
    stato.bAperto = null;
    render();
    return caricaGiornata();
  }

  if (t.closest("#spunta-tutte")) {
    const disponibili = stato.bSpedizioni.filter((s) => !s.bordero);
    const tutte = disponibili.every((s) => stato.bSel.includes(s.codice));
    stato.bSel = tutte ? [] : disponibili.map((s) => s.codice);
    return render();
  }

  if (t.closest("#genera-bordero")) return generaBordero();
  if (t.closest("#stampa-bordero")) {
    setTimeout(() => (window.stampaLocale || window.print)(), 60);
    return;
  }
  if (t.closest("#nuovo-bordero")) {
    stato.bAperto = null;
    render();
    return caricaGiornata();
  }

  const apri = t.closest("[data-apri]");
  if (apri) {
    try {
      const b = await api("/api/bordero?numero=" + encodeURIComponent(apri.dataset.apri));
      stato.bAperto = b;
      stato.bGiorno = b.giorno;
      stato.bVettore = b.vettore;
      stato.bSpedizioni = b.righe;
      stato.bSel = b.righe.map((r) => r.codice);
      render();
    } catch (err) {
      alert("Impossibile aprire il borderò: " + err.message);
    }
    return;
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
  if (e.target.id === "giorno") {
    stato.bGiorno = e.target.value;
    stato.bAperto = null;
    render();
    return caricaGiornata();
  }
  if (e.target.dataset && e.target.dataset.sped) {
    const codice = e.target.dataset.sped;
    stato.bSel = e.target.checked ? stato.bSel.concat(codice) : stato.bSel.filter((c) => c !== codice);
    return render();
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

async function generaBordero() {
  try {
    const r = await api("/api/bordero", {
      method: "POST",
      body: JSON.stringify({
        codici: stato.bSel,
        vettore: stato.bVettore,
        mittente: stato.mittente,
        giorno: stato.bGiorno,
      }),
    });
    stato.bAperto = r.bordero;
    stato.bSpedizioni = r.bordero.righe;
    stato.bSel = r.bordero.righe.map((x) => x.codice);
    stato.bordero = r.stato.bordero;
    stato.storico = r.stato.storico;
    render();
    setTimeout(() => (window.stampaLocale || window.print)(), 60);
  } catch (err) {
    alert("Impossibile generare il borderò: " + err.message);
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
  vaiA(["nuova", "storico", "rubrica", "bordero"].includes(hash) ? hash : "nuova");
}

avvia();
