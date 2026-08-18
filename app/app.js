const CSV_ESEMPIO = [
  "Mario Rossi;Stabilimento Melzo",
  "Laura Riva;Stabilimento Melzo",
  "Silvia Conti;Deposito Pioltello",
  "Andrea Neri;Uffici Bologna",
  "Marco Ferrara;Sede Milano",
  "Chiara Bianchi;Uffici Bologna",
  "Paolo Greco;Deposito Pioltello",
  "Elena Sarti;Sede Milano",
].join("\n");

const MAX_COLLI = 20;

const stato = {
  tab: "nuova",
  clienti: [],
  sedi: [],
  vettori: [],
  storico: [],
  mittente: "",
  vettore: "",
  sel: null,
  colli: 1,
  cerca: "",
  csv: "",
  prossimoCodice: "",
  ristampa: null,
  messaggio: null,
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const view = document.getElementById("view");

async function api(path, opzioni) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opzioni,
  });
  const dati = await res.json();
  if (!res.ok) throw new Error(dati.errore || "errore di rete");
  return dati;
}

function applicaStato(s) {
  stato.clienti = s.clienti;
  stato.sedi = s.sedi;
  stato.vettori = s.vettori;
  stato.storico = s.storico;
  stato.mittente = s.mittente;
  stato.prossimoCodice = s.prossimoCodice;
  if (!stato.vettore || !s.vettori.includes(stato.vettore)) stato.vettore = s.vettori[0] || "";
  if (stato.sel != null && !s.clienti.some((c) => c.id === stato.sel)) stato.sel = null;
  if (stato.sel == null) stato.sel = s.clienti.length ? s.clienti[0].id : null;
}

const clienteSel = () => stato.clienti.find((c) => c.id === stato.sel) || null;

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
  const c = clienteSel();
  const out = [];
  for (let i = 0; i < stato.colli; i++) {
    out.push({
      nome: c ? c.nome : "—",
      sede: c ? c.sede : "—",
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
        <div class="label-kicker">Destinatario</div>
        <div class="label-nome">${esc(l.nome)}</div>
        <div class="label-sede">${esc(l.sede)}</div>
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

function htmlNuova() {
  const q = stato.cerca.trim().toLowerCase();
  const filtrati = stato.clienti.filter((c) => !q || (c.nome + " " + c.sede).toLowerCase().includes(q));
  const sheets = Math.ceil(stato.colli / 2);
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
          ${stato.sedi.map((s) => `<option value="${esc(s)}"${s === stato.mittente ? " selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </div>

      <div class="stack-10">
        <div class="row-between">
          <h6 class="section-label">Destinatario</h6>
          <span class="text-muted" style="font-size:12px">${stato.clienti.length} destinatari in rubrica</span>
        </div>
        <input class="input" id="cerca" placeholder="Cerca nella rubrica…" value="${esc(stato.cerca)}">
        <div class="contact-list">
          ${
            filtrati.length
              ? filtrati
                  .map(
                    (c) => `
            <button class="contact" type="button" data-cliente="${c.id}" aria-selected="${c.id === stato.sel}">
              <span class="contact-text">
                <span class="contact-name">${esc(c.nome)}</span>
                <span class="contact-sede">${esc(c.sede)}</span>
              </span>
              <span class="contact-mark">${c.id === stato.sel ? "SELEZIONATO" : ""}</span>
            </button>`
                  )
                  .join("")
              : `<div class="list-empty text-muted">Nessun destinatario. Importa la rubrica da CSV.</div>`
          }
        </div>
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
        <button class="btn btn-primary btn-block btn-stampa" type="button" id="stampa"${clienteSel() ? "" : " disabled"}>${
    stato.ristampa ? "Ristampa" : "Stampa"
  }</button>
        <button class="btn btn-secondary btn-block" type="button" id="salva"${
          clienteSel() && !stato.ristampa ? "" : " disabled"
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
      <thead><tr><th>Codice</th><th>Data</th><th>Vettore</th><th>Destinatario</th><th>Sede</th><th>Colli</th><th></th></tr></thead>
      <tbody>
        ${stato.storico
          .map(
            (r) => `
          <tr>
            <td class="num">${esc(r.codice)}</td>
            <td class="text-muted">${esc(dataBreve(r.data))}</td>
            <td><span class="tag tag-neutral">${esc(r.vettore)}</span></td>
            <td>${esc(r.nome)}</td>
            <td class="text-muted">${esc(r.sede)}</td>
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
        <h2 class="page-title">Rubrica</h2>
        <p class="page-sub text-muted">Importa da CSV: una riga per destinatario — nome, sede.</p>
      </div>
      <div class="field">
        <label for="csv">CSV</label>
        <textarea class="input csv-input" id="csv" placeholder="Mario Rossi;Stabilimento Melzo">${esc(stato.csv)}</textarea>
      </div>
      <div class="rubrica-actions">
        <button class="btn btn-primary" type="button" id="importa"${righe ? "" : " disabled"}>Importa (${righe} righe)</button>
        <button class="btn btn-secondary" type="button" id="scegli-file">Apri file CSV…</button>
        <button class="btn btn-secondary" type="button" id="esempio">Carica esempio</button>
        <input type="file" id="file-csv" accept=".csv,.txt" hidden>
      </div>
      <p class="note text-muted">L'importazione sostituisce la rubrica corrente. Le sedi trovate nel file diventano anche le sedi selezionabili come mittente.${
        stato.messaggio ? " " + esc(stato.messaggio) : ""
      }</p>
    </div>
    <div class="rubrica-list">
      <h6 class="text-muted" style="margin:0">${stato.clienti.length} destinatari in rubrica</h6>
      ${
        stato.clienti.length
          ? `<table class="table">
        <thead><tr><th>Destinatario</th><th>Sede</th><th></th></tr></thead>
        <tbody>
          ${stato.clienti
            .map(
              (c) => `
            <tr>
              <td>${esc(c.nome)}</td>
              <td class="text-muted">${esc(c.sede)}</td>
              <td class="cell-right"><button class="btn btn-ghost" type="button" data-usa="${c.id}">Usa</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p class="empty-state text-muted">Rubrica vuota.</p>`
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

view.addEventListener("click", async (e) => {
  const t = e.target;

  const vettore = t.closest("[data-vettore]");
  if (vettore) {
    stato.vettore = vettore.dataset.vettore;
    stato.ristampa = null;
    return render();
  }

  const cliente = t.closest("[data-cliente]");
  if (cliente) {
    stato.sel = Number(cliente.dataset.cliente);
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
  if (t.closest("#salva")) return registra().then(() => vaiA("storico"));

  const ristampa = t.closest("[data-ristampa]");
  if (ristampa) {
    const r = stato.storico.find((x) => x.codice === ristampa.dataset.ristampa);
    if (!r) return;
    const c = stato.clienti.find((x) => x.nome === r.nome && x.sede === r.sede) || stato.clienti.find((x) => x.nome === r.nome);
    stato.sel = c ? c.id : stato.sel;
    stato.colli = r.colli;
    stato.vettore = stato.vettori.includes(r.vettore) ? r.vettore : stato.vettore;
    stato.cerca = "";
    stato.ristampa = { codice: r.codice };
    return vaiA("nuova");
  }

  const usa = t.closest("[data-usa]");
  if (usa) {
    stato.sel = Number(usa.dataset.usa);
    stato.cerca = "";
    stato.ristampa = null;
    return vaiA("nuova");
  }

  if (t.closest("#esempio")) {
    stato.csv = CSV_ESEMPIO;
    stato.messaggio = null;
    return render();
  }

  if (t.closest("#scegli-file")) return document.getElementById("file-csv").click();

  if (t.closest("#importa")) {
    try {
      const s = await api("/api/clienti", { method: "POST", body: JSON.stringify({ csv: stato.csv }) });
      applicaStato(s);
      stato.messaggio = `Importati ${s.clienti.length} destinatari.`;
    } catch (err) {
      stato.messaggio = "Importazione fallita: " + err.message;
    }
    return render();
  }
});

view.addEventListener("input", (e) => {
  if (e.target.id === "cerca") {
    stato.cerca = e.target.value;
    return render();
  }
  if (e.target.id === "csv") {
    stato.csv = e.target.value;
    const importa = document.getElementById("importa");
    if (importa) importa.disabled = !stato.csv.split("\n").some((r) => r.trim());
  }
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

async function registra() {
  const c = clienteSel();
  if (!c) return null;
  const { codice, stato: s } = await api("/api/spedizioni", {
    method: "POST",
    body: JSON.stringify({
      vettore: stato.vettore,
      mittente: stato.mittente,
      destinatario: c.nome,
      sede: c.sede,
      colli: stato.colli,
    }),
  });
  applicaStato(s);
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
  setTimeout(() => window.print(), 60);
}

window.addEventListener("afterprint", () => {
  if (!stato.ristampa) return;
  stato.ristampa = null;
  render();
});

async function avvia() {
  try {
    const s = await api("/api/stato");
    applicaStato(s);
    if (!s.clienti.length) stato.csv = CSV_ESEMPIO;
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
