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
  ddt: "",
  peso: "", // in kg, facoltativo: vuoto vuol dire «non indicato»
  cerca: "",
  csv: "",
  sediTesto: "",
  vettoriTesto: "",
  prossimoCodice: "",
  ristampa: null,
  modifica: null, // spedizione dello storico aperta in modifica: { codice }
  messaggio: null,
  messaggioDove: null, // dove mostrarlo: csv, sedi, vettori, storico
  // borderò
  oggi: "",
  bGiorno: "",
  bVettore: "",
  bSpedizioni: [],
  bSel: [],
  bAperto: null,
  bNota: null, // avviso sul borderò aperto (es. righe aggiunte, da ristampare)
  giornate: [],
  bordero: [],
};

/* Ripiego se il foglio non si può misurare: l'ultima pagina porta anche totali e
   firme, quindi contiene meno righe. */
const RIGHE_PAGINA = 13;
const RIGHE_ULTIMA = 10;

/* Un millimetro in pixel CSS: il foglio è disegnato in millimetri, il layout misura in pixel. */
const MM = 96 / 25.4;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const view = document.getElementById("view");

/** L'esito dell'ultima azione, mostrato solo accanto ai bottoni che l'hanno prodotto. */
const nota = (dove) =>
  stato.messaggio && stato.messaggioDove === dove
    ? `<p class="note text-muted">${esc(stato.messaggio)}</p>`
    : "";

/** Registra l'esito di un'azione e il punto dell'interfaccia in cui mostrarlo. */
function segnala(dove, testo) {
  stato.messaggioDove = dove;
  stato.messaggio = testo;
}

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
  stato.vettoriTesto = s.vettori.join("\n");
  stato.bordero = s.bordero || [];
  stato.giornate = s.giornate || [];
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
      ddt: stato.ddt.trim(),
      peso: pesoTesto(String(stato.peso).replace(",", ".")),
      mittente: "Da: " + stato.mittente + " · " + dataOggi(),
      collo: `${i + 1} / ${stato.colli}`,
    });
  }
  return out;
}

/** Il peso per gli elenchi e i documenti: vuoto se non indicato. */
function pesoTesto(kg) {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("it-IT", { maximumFractionDigits: 3 }) + " kg";
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
        <div class="label-rif">
          <span class="label-codice">${esc(l.codice)}</span>
          ${l.ddt ? `<span class="label-ddt">DDT ${esc(l.ddt)}</span>` : ""}
        </div>
      </div>
      <div class="label-dest">
        <div class="label-kicker">Destinatario${l.codiceCliente ? " · cliente " + esc(l.codiceCliente) : ""}</div>
        <div class="label-nome">${esc(l.nome)}</div>
        <div class="label-sede">${esc(l.indirizzo)}</div>
        <div class="label-sede">${esc(l.capCitta)}</div>
      </div>
      <div class="label-foot">
        <span class="label-mittente">${esc(l.mittente)}</span>
        ${l.peso ? `<span class="label-peso">${esc(l.peso)}</span>` : ""}
        <span class="label-collo">${esc(l.collo)}</span>
      </div>
    </div>`;
}

/** Il codice in anteprima: quello in modifica, quello in ristampa, o il prossimo libero. */
function codiceCorrente() {
  if (stato.modifica) return stato.modifica.codice;
  if (stato.ristampa) return stato.ristampa.codice;
  return stato.prossimoCodice;
}

function htmlAnteprima() {
  const codice = codiceCorrente();
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
  // Senza destinatario o senza DDT non si stampa e non si salva.
  const completo = !!stato.sel && !!stato.ddt.trim();
  return `
  <div class="nuova">
    <div class="form-col">
      <div>
        <h2 class="page-title">${stato.modifica ? "Modifica spedizione" : "Nuova etichetta"}</h2>
        <p class="page-sub text-muted">${
          stato.modifica
            ? "Stai correggendo " + esc(stato.modifica.codice) + ": il codice e la data restano quelli originali."
            : "Una etichetta per collo. Il numero progressivo è assegnato alla stampa."
        }</p>
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

      <div class="campi-affiancati">
        <div class="field">
          <label for="ddt">Numero DDT</label>
          <input class="input" id="ddt" value="${esc(stato.ddt)}" placeholder="es. 1234">
        </div>
        <div class="field">
          <label for="peso">Peso (kg)</label>
          <input class="input" id="peso" value="${esc(stato.peso)}" inputmode="decimal" placeholder="facoltativo">
        </div>
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
  }${stato.ristampa ? " · ristampa di " + esc(stato.ristampa.codice) : ""}${
    stato.sel && !stato.ddt.trim() ? " · manca il numero DDT" : ""
  }</p>
        ${
          stato.modifica
            ? `<button class="btn btn-primary btn-block btn-stampa" type="button" id="aggiorna"${
                completo ? "" : " disabled"
              }>Salva modifiche</button>
               <button class="btn btn-secondary btn-block" type="button" id="aggiorna-stampa"${
                 completo ? "" : " disabled"
               }>Salva e ristampa</button>
               <button class="btn btn-ghost btn-block" type="button" id="annulla-modifica">Annulla</button>`
            : `<button class="btn btn-primary btn-block btn-stampa" type="button" id="stampa"${
                completo ? "" : " disabled"
              }>${stato.ristampa ? "Ristampa" : "Stampa"}</button>
               <button class="btn btn-secondary btn-block" type="button" id="salva"${
                 completo && stato.sel.id && !stato.ristampa ? "" : " disabled"
               }>Salva senza stampare</button>`
        }
        <p class="note text-muted">Nella finestra di stampa: scala 100% e margini «Nessuno», altrimenti le etichette non
        coincidono con la fustella del foglio adesivo.</p>
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

/** Il menu delle giornate: quelle con spedizioni, più la data scelta se non ne ha. */
function opzioniGiornata() {
  const giorni = stato.giornate.slice();
  if (stato.bGiorno && !giorni.some((g) => g.giorno === stato.bGiorno)) {
    giorni.unshift({ giorno: stato.bGiorno, spedizioni: 0, colli: 0, liberi: 0 });
  }
  return giorni
    .map((g) => {
      // Il giorno per esteso sta nel campo data accanto: qui l'etichetta resta corta.
      const etichetta = [
        g.giorno === stato.oggi ? "Oggi" : dataItaliana(g.giorno),
        g.spedizioni ? `${g.spedizioni} sped.` : "nessuna spedizione",
        g.liberi ? `${g.liberi} liber${g.liberi === 1 ? "a" : "e"}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<option value="${esc(g.giorno)}"${g.giorno === stato.bGiorno ? " selected" : ""}>${esc(etichetta)}</option>`;
    })
    .join("");
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
    peso: righe.reduce((n, r) => n + (Number(r.peso) || 0), 0),
  };
}

/** Misura sul foglio vero quanto spazio resta alle righe e quanto è alta ciascuna:
    gli indirizzi lunghi vanno a capo, quindi le righe non sono tutte uguali. */
function misureBordero(b, righe) {
  const misura = document.createElement("div");
  misura.className = "print-area";
  misura.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden";
  misura.innerHTML = htmlPaginaBordero(b, righe, 1, 1, 0);
  document.body.appendChild(misura);
  const alto = (sel) => {
    const el = misura.querySelector(sel);
    return el ? el.getBoundingClientRect().height : 0;
  };
  const altezze = [...misura.querySelectorAll(".bordero-table tbody tr")].map((tr) => tr.getBoundingClientRect().height);
  const gap = 5 * MM;
  // 297 mm meno i margini interni del foglio (14 sopra, 10 sotto) e un millimetro di sicurezza.
  const utile = (297 - 14 - 10 - 1) * MM;
  const normale = utile - alto(".bordero-head") - alto(".bordero-table thead") - alto(".bordero-pie") - 2 * gap;
  // L'ultima pagina porta anche totali e firme (che hanno 4 mm di stacco sopra).
  const ultima = normale - alto(".bordero-totali") - alto(".bordero-firme") - 4 * MM - 2 * gap;
  misura.remove();
  return { normale, ultima, altezze };
}

/** Divide le righe in pagine A4 riempiendo ogni foglio fino all'altezza disponibile,
    con totali e firme sull'ultima. */
function impagina(b, righe) {
  if (righe.length <= 1) return [righe];
  const { normale, ultima, altezze } = misureBordero(b, righe);
  if (!(ultima > 0) || altezze.length !== righe.length || altezze.some((h) => !(h > 0))) {
    return impaginaFissa(righe);
  }

  const blocchi = [];
  for (let inizio = 0; inizio < righe.length; ) {
    let fine = inizio;
    let usato = 0;
    while (fine < righe.length && (fine === inizio || usato + altezze[fine] <= normale)) {
      usato += altezze[fine];
      fine++;
    }
    blocchi.push([inizio, fine]);
    inizio = fine;
  }

  // Se sull'ultima pagina non ci stanno anche totali e firme, le righe di troppo passano
  // a una pagina nuova.
  const [inizioUltima, fineUltima] = blocchi[blocchi.length - 1];
  const somma = (da, a) => altezze.slice(da, a).reduce((n, h) => n + h, 0);
  if (somma(inizioUltima, fineUltima) > ultima) {
    let taglio = fineUltima;
    let usato = 0;
    while (taglio > inizioUltima && usato + altezze[taglio - 1] <= ultima) {
      usato += altezze[taglio - 1];
      taglio--;
    }
    if (taglio > inizioUltima) {
      blocchi[blocchi.length - 1] = [inizioUltima, taglio];
      blocchi.push([taglio, fineUltima]);
    } else {
      // Nemmeno una riga sta insieme a totali e firme: quelli vanno su una pagina da soli.
      blocchi.push([fineUltima, fineUltima]);
    }
  }

  return blocchi.map(([da, a]) => righe.slice(da, a));
}

/** Ripiego a numero fisso di righe, se la misura sul foglio non è possibile. */
function impaginaFissa(righe) {
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
          <tr><th>#</th><th>Spedizione</th><th>DDT</th><th>Destinatario</th><th>Indirizzo</th><th>Località</th><th class="col-colli">Colli</th><th class="col-peso">Peso</th></tr>
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
              <td class="num">${esc(r.ddt || "—")}</td>
              <td>${esc(r.nome)}</td>
              <td>${esc(r.indirizzo)}</td>
              <td>${esc(r.capCitta)}</td>
              <td class="col-colli">${r.colli}</td>
              <td class="col-peso">${esc(pesoTesto(r.peso) || "—")}</td>
            </tr>`
                  )
                  .join("")
              : b.righe.length
              ? ""
              : `<tr><td colspan="8" class="bordero-vuoto">Nessuna spedizione selezionata</td></tr>`
          }
        </tbody>
      </table>
      ${
        ultima
          ? `<div class="bordero-totali">
               <span>Totale</span>
               <strong>${b.righe.length} ${b.righe.length === 1 ? "spedizione" : "spedizioni"} · ${b.colli} ${
              b.colli === 1 ? "collo" : "colli"
            }${pesoTesto(b.peso) ? " · " + esc(pesoTesto(b.peso)) : ""}</strong>
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
  const pagine = impagina(b, b.righe);
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
        <label for="giornata">Giornata</label>
        <div class="giornata-riga">
          <select class="input" id="giornata">
            ${opzioniGiornata()}
          </select>
          <input class="input" type="date" id="giorno" value="${esc(stato.bGiorno)}" title="Altra data">
        </div>
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
        <span class="colli-count">${b.colli} ${b.colli === 1 ? "collo" : "colli"}${
    pesoTesto(b.peso) ? " · " + esc(pesoTesto(b.peso)) : ""
  }</span>
      </div>

      <div class="stack-10">
        ${
          stato.bAperto
            ? `<p class="note text-muted">${
                stato.bNota
                  ? esc(stato.bNota)
                  : "Borderò " + esc(stato.bAperto.numero) +
                    " generato. Finché resta la giornata puoi ancora aggiungere spedizioni: dopo, ristampalo."
              }</p>
               ${
                 disponibili.length
                   ? `<button class="btn btn-primary btn-block" type="button" id="aggiungi-bordero"${
                       stato.bSel.length ? "" : " disabled"
                     }>Aggiungi al borderò${stato.bSel.length ? ` (${stato.bSel.length})` : ""}</button>`
                   : ""
               }
               <button class="btn ${
                 disponibili.length ? "btn-secondary" : "btn-primary"
               } btn-block btn-stampa" type="button" id="stampa-bordero">Stampa borderò</button>
               <button class="btn btn-ghost btn-block" type="button" id="nuovo-bordero">Prepara un altro borderò</button>`
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
        <span class="contact-sede">${esc(s.codice)}${s.ddt ? " · DDT " + esc(s.ddt) : ""} · ${esc(s.capCitta)}</span>
      </span>
      <span class="contact-mark">${
        inBordero
          ? esc(s.bordero)
          : s.colli + (s.colli === 1 ? " collo" : " colli") + (pesoTesto(s.peso) ? " · " + esc(pesoTesto(s.peso)) : "")
      }</span>
    </label>`;
}

function htmlStorico() {
  return `
  <div class="storico">
    <h2 class="page-title">Storico</h2>
    <p class="page-sub text-muted">Ristampa riapre i dati nel modulo mantenendo il codice originale. Una spedizione si
    può correggere o eliminare finché non entra in un borderò.</p>
    ${nota("storico")}
    ${
      stato.storico.length
        ? `<table class="table">
      <thead><tr><th>Codice</th><th>DDT</th><th>Data</th><th>Vettore</th><th>Destinatario</th><th>Città</th><th>Colli</th><th>Peso</th><th>Borderò</th><th></th></tr></thead>
      <tbody>
        ${stato.storico
          .map(
            (r) => `
          <tr>
            <td class="num">${esc(r.codice)}</td>
            <td class="num">${r.ddt ? esc(r.ddt) : "—"}</td>
            <td class="text-muted">${esc(dataBreve(r.data))}</td>
            <td><span class="tag tag-neutral">${esc(r.vettore)}</span></td>
            <td>${esc(r.nome)}</td>
            <td class="text-muted">${esc(r.capCitta)}</td>
            <td>${r.colli}</td>
            <td class="num text-muted">${pesoTesto(r.peso) || "—"}</td>
            <td class="num text-muted">${r.bordero ? esc(r.bordero) : "—"}</td>
            <td class="cell-right azioni-riga">
              <button class="btn btn-ghost" type="button" data-ristampa="${esc(r.codice)}">Ristampa</button>
              <button class="btn btn-ghost" type="button" data-modifica="${esc(r.codice)}"${
              r.bordero ? ` disabled title="Già nel borderò ${esc(r.bordero)}"` : ""
            }>Modifica</button>
              <button class="btn btn-ghost btn-elimina" type="button" data-elimina="${esc(r.codice)}"${
              r.bordero ? ` disabled title="Già nel borderò ${esc(r.bordero)}"` : ""
            }>Elimina</button>
            </td>
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
        stato.messaggioDove === "csv" && stato.messaggio ? " " + esc(stato.messaggio) : ""
      }</p>

      <div class="field">
        <label for="sedi">Sedi di partenza (una per riga)</label>
        <textarea class="input sedi-input" id="sedi">${esc(stato.sediTesto)}</textarea>
      </div>
      <div class="rubrica-actions">
        <button class="btn btn-secondary" type="button" id="salva-sedi">Salva sedi</button>
      </div>
      ${nota("sedi")}

      <div class="field">
        <label for="vettori">Vettori (uno per riga)</label>
        <textarea class="input sedi-input" id="vettori">${esc(stato.vettoriTesto)}</textarea>
      </div>
      <div class="rubrica-actions">
        <button class="btn btn-secondary" type="button" id="salva-vettori">Salva vettori</button>
      </div>
      ${nota("vettori")}
      <p class="note text-muted">L'ordine è quello dei pulsanti nelle altre schermate. Le spedizioni
      già registrate tengono il vettore con cui sono nate, anche se qui lo togli.</p>
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
  // Anche con un borderò aperto: nel frattempo possono essere nate altre spedizioni.
  if (tab === "bordero") caricaGiornata();
}

async function caricaGiornata() {
  try {
    const r = await api(
      `/api/spedizioni?giorno=${encodeURIComponent(stato.bGiorno)}&vettore=${encodeURIComponent(stato.bVettore)}`
    );
    stato.bSpedizioni = r.spedizioni;
    // Con un borderò aperto la spunta parte vuota: si aggiunge solo quello che si sceglie.
    stato.bSel = stato.bAperto ? [] : r.spedizioni.filter((s) => !s.bordero).map((s) => s.codice);
    render();
  } catch (err) {
    console.error(err);
  }
}

document.querySelector(".app-nav").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-tab]");
  if (!a) return;
  e.preventDefault();
  stato.messaggio = null;
  if (a.dataset.tab === "nuova") {
    stato.modifica = null;
    stato.ristampa = null;
  }
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
    stato.bNota = null;
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
  if (t.closest("#aggiungi-bordero")) return aggiungiAlBordero();
  if (t.closest("#stampa-bordero")) {
    setTimeout(() => (window.stampaLocale || window.print)(), 60);
    return;
  }
  if (t.closest("#nuovo-bordero")) {
    stato.bAperto = null;
    stato.bNota = null;
    render();
    return caricaGiornata();
  }

  const apri = t.closest("[data-apri]");
  if (apri) {
    try {
      const b = await api("/api/bordero?numero=" + encodeURIComponent(apri.dataset.apri));
      stato.bAperto = b;
      stato.bNota = null;
      stato.bGiorno = b.giorno;
      stato.bVettore = b.vettore;
      stato.bSpedizioni = b.righe;
      stato.bSel = [];
      render();
      await caricaGiornata();
    } catch (err) {
      alert("Impossibile aprire il borderò: " + err.message);
    }
    return;
  }

  if (t.closest("#stampa")) return stampa();
  if (t.closest("#salva")) {
    try {
      await registra();
      azzeraModulo();
      vaiA("storico");
    } catch (err) {
      alert("Impossibile registrare la spedizione: " + err.message);
    }
    return;
  }

  const ristampa = t.closest("[data-ristampa]");
  if (ristampa) return preparaRistampa(ristampa.dataset.ristampa);

  const modifica = t.closest("[data-modifica]");
  if (modifica) return preparaModifica(modifica.dataset.modifica);

  const elimina = t.closest("[data-elimina]");
  if (elimina) return eliminaSpedizione(elimina.dataset.elimina);

  if (t.closest("#aggiorna")) return salvaModifica(false);
  if (t.closest("#aggiorna-stampa")) return salvaModifica(true);
  if (t.closest("#annulla-modifica")) {
    stato.modifica = null;
    stato.sel = stato.risultati[0] || null;
    stato.colli = 1;
    return vaiA("storico");
  }

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
      segnala("csv", `Importati ${r.importati} clienti.`);
    } catch (err) {
      segnala("csv", "Importazione fallita: " + err.message);
    }
    return render();
  }

  if (t.closest("#salva-sedi")) return salvaElenco("sedi", stato.sediTesto);
  if (t.closest("#salva-vettori")) return salvaElenco("vettori", stato.vettoriTesto);
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
  if (e.target.id === "ddt" || e.target.id === "peso") {
    stato[e.target.id] = e.target.value;
    return render();
  }
  if (e.target.id === "sedi") stato.sediTesto = e.target.value;
  if (e.target.id === "vettori") stato.vettoriTesto = e.target.value;
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
  if (e.target.id === "giorno" || e.target.id === "giornata") {
    if (!e.target.value) return;
    stato.bGiorno = e.target.value;
    stato.bAperto = null;
    stato.bNota = null;
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

/** Salva l'elenco di sedi o vettori scritto nella schermata Anagrafica. */
async function salvaElenco(campo, testo) {
  const fatto = campo === "sedi" ? "Sedi aggiornate." : "Vettori aggiornati.";
  try {
    const r = await api("/api/" + campo, {
      method: "POST",
      body: JSON.stringify({ [campo]: testo.split("\n") }),
    });
    const cerca = stato.cerca;
    applicaStato(r.stato);
    stato.cerca = cerca;
    segnala(campo, fatto);
    ricercaDifferita();
  } catch (err) {
    segnala(campo, "Salvataggio fallito: " + err.message);
  }
  render();
}

/** Riporta nel modulo una spedizione dello storico, per ristamparla o correggerla. */
async function apriNelModulo(codiceSpedizione, modo) {
  const r = stato.storico.find((x) => x.codice === codiceSpedizione);
  if (!r) return;
  stato.colli = r.colli;
  stato.ddt = r.ddt || "";
  stato.peso = r.peso ? String(r.peso).replace(".", ",") : "";
  stato.vettore = stato.vettori.includes(r.vettore) ? r.vettore : stato.vettore;
  if (stato.sedi.includes(r.mittente)) stato.mittente = r.mittente;
  stato.ristampa = modo === "ristampa" ? { codice: r.codice } : null;
  stato.modifica = modo === "modifica" ? { codice: r.codice } : null;
  stato.messaggio = null;
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

const preparaRistampa = (codice) => apriNelModulo(codice, "ristampa");
const preparaModifica = (codice) => apriNelModulo(codice, "modifica");

/** Salva le correzioni sulla spedizione aperta: il codice e la data non cambiano. */
async function salvaModifica(poiStampa) {
  if (!stato.modifica) return;
  const codice = stato.modifica.codice;
  try {
    const { stato: s } = await api("/api/spedizioni/" + encodeURIComponent(codice), {
      method: "PUT",
      body: JSON.stringify({
        vettore: stato.vettore,
        mittente: stato.mittente,
        // Senza cliente in anagrafica valgono i dati già in etichetta.
        clienteId: stato.sel && stato.sel.id,
        clienteCodice: stato.sel ? stato.sel.codice : "",
        destinatario: stato.sel ? stato.sel.ragione_sociale : "",
        indirizzo: stato.sel ? stato.sel.indirizzo : "",
        capCitta: stato.sel ? stato.sel.cap_citta : "",
        colli: stato.colli,
        ddt: stato.ddt,
        peso: stato.peso,
        q: stato.cerca,
      }),
    });
    const sel = stato.sel;
    applicaStato(s);
    stato.sel = sel;
    stato.modifica = null;
    if (poiStampa) {
      stato.ristampa = { codice };
      render();
      return setTimeout(() => (window.stampaLocale || window.print)(), 60);
    }
    segnala("storico", `Spedizione ${codice} aggiornata.`);
    vaiA("storico");
  } catch (err) {
    alert("Impossibile salvare le modifiche: " + err.message);
  }
}

async function eliminaSpedizione(codice) {
  const r = stato.storico.find((x) => x.codice === codice);
  const dettaglio = r ? ` — ${r.nome}, ${r.colli} ${r.colli === 1 ? "collo" : "colli"}` : "";
  if (!confirm(`Eliminare la spedizione ${codice}${dettaglio}?\nIl codice non verrà riutilizzato.`)) return;
  try {
    const { stato: s } = await api(
      "/api/spedizioni/" + encodeURIComponent(codice) + "?q=" + encodeURIComponent(stato.cerca),
      { method: "DELETE" }
    );
    const sel = stato.sel;
    const cerca = stato.cerca;
    applicaStato(s);
    stato.sel = sel;
    stato.cerca = cerca;
    if (stato.modifica && stato.modifica.codice === codice) stato.modifica = null;
    if (stato.ristampa && stato.ristampa.codice === codice) stato.ristampa = null;
    segnala("storico", `Spedizione ${codice} eliminata.`);
    render();
  } catch (err) {
    alert("Impossibile eliminare la spedizione: " + err.message);
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
    stato.bNota = null;
    stato.bSel = [];
    stato.bordero = r.stato.bordero;
    stato.storico = r.stato.storico;
    stato.giornate = r.stato.giornate || stato.giornate;
    await caricaGiornata();
    setTimeout(() => (window.stampaLocale || window.print)(), 60);
  } catch (err) {
    alert("Impossibile generare il borderò: " + err.message);
  }
}

/** Aggiunge al borderò aperto le spedizioni spuntate: il documento va ristampato. */
async function aggiungiAlBordero() {
  if (!stato.bAperto || !stato.bSel.length) return;
  const quante = stato.bSel.length;
  try {
    const r = await api("/api/bordero/" + encodeURIComponent(stato.bAperto.numero), {
      method: "POST",
      body: JSON.stringify({ codici: stato.bSel }),
    });
    stato.bAperto = r.bordero;
    stato.bSel = [];
    stato.bordero = r.stato.bordero;
    stato.storico = r.stato.storico;
    stato.giornate = r.stato.giornate || stato.giornate;
    stato.bNota = `${quante} ${quante === 1 ? "spedizione aggiunta" : "spedizioni aggiunte"} a ${
      r.bordero.numero
    }: ristampa il borderò e sostituisci la copia dell'autista.`;
    await caricaGiornata();
  } catch (err) {
    alert("Impossibile aggiungere le spedizioni: " + err.message);
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
      ddt: stato.ddt,
      peso: stato.peso,
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

/** Svuota i dati della singola spedizione, lasciando vettore, sede e destinatario. */
function azzeraModulo() {
  stato.ddt = "";
  stato.peso = "";
  stato.colli = 1;
}

window.addEventListener("afterprint", () => {
  if (!stato.ristampa) return;
  stato.ristampa = null;
  azzeraModulo();
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
