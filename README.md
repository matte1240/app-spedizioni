# Etichette di spedizione

Portale interno per stampare etichette di spedizione per vettori che non forniscono un proprio
portale. Una etichetta per collo, numerata `1/3`, `2/3`…, impaginata due per foglio A4 adesivo
(148,5 mm ciascuna).

## Avvio

```bash
npm start          # http://localhost:3000
```

Nessuna dipendenza da installare: il server usa `node:http` e il modulo SQLite integrato di Node
(`node:sqlite`), quindi serve **Node 22.5 o superiore**.

Il database viene creato al primo avvio in `data/etichette.db` (percorso modificabile con
`DB_PATH`, porta con `PORT`).

### Con Docker

L'immagine viene costruita e pubblicata su GHCR a ogni push su `main`
(`.github/workflows/docker.yml`, amd64 e arm64):

```bash
docker run -d --name etichette -p 3000:3000 -v etichette-dati:/data \
  ghcr.io/matte1240/app-spedizioni:latest
```

Il database sta nel volume montato su `/data`, quindi sopravvive agli aggiornamenti
dell'immagine. Per costruirla in locale: `docker build -t etichette . && docker run -p 3000:3000 -v
etichette-dati:/data etichette`.

## Ambiente di prova

`demo/etichette-demo.html` è l'applicazione in un unico file, con l'anagrafica incorporata e i dati
salvati nel browser (localStorage) invece che in SQLite: serve per provare l'interfaccia senza
installare nulla. Si rigenera con:

```bash
node demo/build.mjs [percorso/anagrafica.csv]
```

## Schermate

- **Nuova etichetta** — vettore, sede di partenza, destinatario dalla rubrica (con ricerca),
  numero colli, anteprima del foglio A4 e stampa.
- **Borderò** — la distinta per l'autista: scegli vettore e giornata, spunta le spedizioni create e
  stampa. Ogni borderò riceve un numero `BO-<anno>-<progressivo>`; una spedizione già inserita in un
  borderò non può finire in un secondo (resta in elenco, barrata, con il numero a cui appartiene).
  Il documento si impagina da solo su più fogli A4 e l'ultima pagina porta totali e firme.
- **Storico** — tutte le spedizioni registrate, con il borderò di appartenenza; `Ristampa` riapre i
  dati nel modulo mantenendo il codice originale, senza consumare un nuovo numero. `Modifica`
  corregge vettore, sede di partenza, destinatario e colli di una spedizione già stampata (codice e
  data restano quelli originali), `Elimina` la cancella — il codice però non viene riutilizzato. Le
  due azioni restano disponibili finché la spedizione non entra in un borderò: da quel momento sono
  disattivate, perché il documento è già in mano all'autista.
- **Rubrica** — importazione dei destinatari da CSV (incolla il testo oppure apri un file).

## Stampa

Le etichette vanno stampate **a scala 100% e con i margini su «Nessuno»**: il foglio è disegnato in
millimetri (210 × 297 mm, due etichette da 148,5 mm) e deve coincidere con la fustella del foglio
adesivo. In stampa l'interfaccia sparisce del tutto (`display: none`) e la pagina diventa bianca,
così il foglio A4 resta l'unica cosa nel documento e il browser non impagina fogli in più.

## Numerazione

`SI-<anno>-<progressivo>` per le spedizioni, `BO-<anno>-<progressivo>` per i borderò: entrambi
assegnati dal server dentro una transazione, quindi senza numeri duplicati o saltati. I contatori
ripartono da 1 a ogni anno solare.

## Formato CSV dell'anagrafica

Separatore `;`, `,` o tabulazione, con riga di intestazione:

```
Codice;Ragione Sociale;Indirizzo;CAP / Citta';P.IVA
2682;.TRRR DI ALEX NAZZI;VIA MADONNA DEL PODGORA, 32;33048 SAN GIOVANNI AL NATIS-UD;02486620301
```

Le intestazioni sono riconosciute per nome (`codice`, `ragione sociale`, `indirizzo`,
`cap / città`, `p.iva` e sinonimi); senza intestazione valgono le prime tre colonne come ragione
sociale, indirizzo e città. L'importazione **sostituisce** l'anagrafica corrente.

Dal gestionale esporta in CSV; se hai un file Excel, in Excel usa *Salva con nome → CSV UTF-8*.

Le sedi di partenza non arrivano dall'anagrafica: si gestiscono nella pagina Anagrafica, una per
riga.

## Struttura

```
server.js       server HTTP + API JSON + schema SQLite
app/index.html  pagina unica
app/app.js      stato, rendering delle tre schermate, stampa
app/app.css     stili dell'applicazione
app/nocturne.css design system Nocturne (token e classi, copiato dal bundle di design)
demo/build.mjs  genera l'ambiente di prova in un unico file
demo/demo-api.js backend locale (localStorage) usato solo dalla demo
project/        handoff originale di Claude Design (prototipo .dc.html)
chats/          trascrizioni della sessione di design
```

L'interfaccia è la stessa nei due ambienti: `app/app.js` chiama `window.apiLocale` se presente,
altrimenti il server.

## API

| Metodo | Percorso          | Descrizione                                                  |
| ------ | ----------------- | ------------------------------------------------------------ |
| GET    | `/api/stato`      | anagrafica, sedi, vettori, storico, prossimo codice           |
| GET    | `/api/clienti?q=` | ricerca clienti (primi 50 per nome, città, indirizzo, codice) |
| GET    | `/api/spedizioni` | `?giorno=YYYY-MM-DD&vettore=` — spedizioni di una giornata      |
| GET    | `/api/bordero`    | elenco borderò, oppure `?numero=BO-…` per il dettaglio         |
| POST   | `/api/bordero`    | `{ codici, vettore, giorno }` — crea il borderò e lo numera     |
| POST   | `/api/clienti`    | `{ csv }` — sostituisce l'anagrafica                           |
| POST   | `/api/sedi`       | `{ sedi }` — elenco delle sedi di partenza                     |
| POST   | `/api/mittente`   | `{ mittente }` — memorizza la sede di partenza predefinita     |
| POST   | `/api/spedizioni` | registra la spedizione e assegna il codice progressivo        |
| PUT    | `/api/spedizioni/<codice>` | corregge una spedizione (409 se è già in un borderò) |
| DELETE | `/api/spedizioni/<codice>` | elimina una spedizione (409 se è già in un borderò)  |

## Da definire

- **Vettori**: i quattro nomi nella tabella `vettori` sono ancora quelli di esempio del prototipo,
  come gli eventuali dati che ciascun vettore richiede in etichetta (numero conto, formato del
  codice, barcode).
- **Sedi di partenza**: da inserire nella pagina Anagrafica (il database parte con una sola voce,
  «Sede principale»).
