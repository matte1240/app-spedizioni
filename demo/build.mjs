/* Genera l'ambiente di prova: un unico file HTML con l'interfaccia reale,
   il backend locale (localStorage) e l'anagrafica di esempio incorporata.

   uso: node demo/build.mjs [data/anagrafiche.csv] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const radice = path.join(dir, "..");
const sorgenteCsv = process.argv[2] || path.join(radice, "data", "anagrafiche.csv");
const uscita = path.join(dir, "etichette-demo.html");

const leggi = (p) => fs.readFileSync(p, "utf8");

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

const righe = leggi(sorgenteCsv).split(/\r?\n/).filter((r) => r.trim());
// Colonne: Codice, Ragione Sociale, Indirizzo, CAP / Città (la P.IVA non serve in etichetta).
const clienti = righe
  .slice(1)
  .map((r) => dividiRiga(r, ";").slice(0, 4))
  .filter((c) => c[1])
  .sort((a, b) => a[1].localeCompare(b[1], "it"));

/* Il markup viene preso da app/index.html: una sola fonte per la navigazione. */
const indice = leggi(path.join(radice, "app", "index.html"));
const corpo = indice
  .slice(indice.indexOf("<body>") + 6, indice.indexOf("</body>"))
  .replace(/<script[^>]*><\/script>/g, "")
  .trim();
const avviso = `<div class="avviso">
    <strong>Ambiente di prova</strong>
    <span>CLIENTI clienti reali caricati · i dati restano nel tuo browser, non su un server</span>
    <button type="button" onclick="azzeraDemo()">Azzera dati di prova</button>
  </div>`;

const nocturne = leggi(path.join(radice, "app", "nocturne.css")).replace(/@import url\([^)]*\);/, "");
const appCss = leggi(path.join(radice, "app", "app.css"));
const appJs = leggi(path.join(radice, "app", "app.js"));
const demoApi = leggi(path.join(dir, "demo-api.js"));

const html = `<title>Etichette di spedizione</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
${nocturne}
${appCss}

.avviso {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
  padding: 10px 32px;
  background: var(--color-accent-900);
  border-bottom: 1px solid var(--color-divider);
  font-size: 12px; color: var(--color-text);
}
.avviso strong { font-weight: 600; color: var(--color-accent); }
.avviso button {
  font: inherit; font-size: 12px; cursor: pointer;
  padding: 3px 10px; border-radius: var(--radius-md);
  background: transparent; border: 1px solid var(--color-divider); color: var(--color-text);
}
.avviso button:hover { background: color-mix(in srgb, var(--color-text) 8%, transparent); }
</style>

${corpo.replace('<div class="app">', '<div class="app">\n  ' + avviso.replace("CLIENTI", clienti.length))}

<script>window.CLIENTI_DEMO = ${JSON.stringify(clienti)};</script>
<script>${demoApi}</script>
<script>${appJs}</script>
`;

fs.writeFileSync(uscita, html);
console.log(
  "scritto " + path.relative(radice, uscita) + " — " + clienti.length + " clienti, " + Math.round(html.length / 1024) + " KB"
);
