# Etichette di spedizione

Portale interno per stampare etichette di spedizione per vettori che non forniscono un proprio
portale. Una etichetta per collo, numerata `1/3`, `2/3`…, impaginata su foglio A4 adesivo: due per
foglio (210 × 148,5 mm) oppure quattro (105 × 148,5 mm), a seconda dei fogli che si hanno.

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

- **Nuova etichetta** — vettore, sede di partenza, numero DDT, peso, destinatario dalla rubrica (con
  ricerca), numero colli, anteprima del foglio A4 e stampa. `Salva senza stampare` registra la
  spedizione e basta: le etichette si stampano poi tutte insieme dal Borderò, senza sprecare mezzi
  fogli. Il **numero DDT è obbligatorio** (senza,
  i pulsanti restano spenti) e finisce in etichetta sotto il codice; il **peso in kg è facoltativo**
  (accetta la virgola) e compare in etichetta accanto al numero di collo.
- **Borderò** — la distinta per l'autista: scegli vettore e giornata, spunta le spedizioni create e
  stampa. La giornata si sceglie dal menu dei giorni che hanno spedizioni (con quante e quante sono
  ancora da assegnare), oppure dal campo data accanto per una data qualsiasi. Ogni borderò riceve un
  numero `BO-<anno>-<progressivo>`; il documento riporta DDT e peso di ogni riga, con i totali di
  colli e chilogrammi in fondo; una spedizione già inserita in un borderò non può finire in un
  secondo (resta in elenco, barrata, con il numero a cui appartiene). Il documento si impagina da
  solo su più fogli A4 e l'ultima pagina porta totali e firme. Un borderò già stampato si riapre da
  «Borderò recenti» e accetta altre spedizioni **della stessa giornata e dello stesso vettore**: si
  spuntano quelle ancora libere e si preme `Aggiungi al borderò`, poi lo si ristampa per sostituire
  la copia dell'autista. L'anteprima ha due viste, `Borderò` ed `Etichette`: la seconda impagina di
  fila le etichette di tutte le spedizioni scelte, due per foglio, così resta libero al massimo mezzo
  foglio in fondo invece di uno per spedizione con numero di colli dispari. `Stampa etichette` manda
  in stampa quella vista.
- **Storico** — tutte le spedizioni registrate, con il borderò di appartenenza; `Ristampa` riapre i
  dati nel modulo mantenendo il codice originale, senza consumare un nuovo numero. `Modifica`
  corregge vettore, sede di partenza, destinatario e colli di una spedizione già stampata (codice e
  data restano quelli originali), `Elimina` la cancella — il codice però non viene riutilizzato. Le
  due azioni restano disponibili finché la spedizione non entra in un borderò: da quel momento sono
  disattivate, perché il documento è già in mano all'autista.
- **Anagrafica** — importazione dei destinatari da CSV (incolla il testo oppure apri un file) e i due
  elenchi dell'applicazione, uno per riga: le **sedi di partenza** e i **vettori**. L'ordine delle
  righe è quello dei pulsanti nelle altre schermate; le spedizioni già registrate tengono il vettore
  con cui sono nate, anche se lo togli dall'elenco.

## Stampa

Le etichette vanno stampate **a scala 100% e con i margini su «Nessuno»**: il foglio è disegnato in
millimetri (210 × 297 mm, con etichette da 210 × 148,5 mm o 105 × 148,5 mm) e deve coincidere con la
fustella del foglio adesivo. In stampa l'interfaccia sparisce del tutto (`display: none`) e la pagina diventa bianca,
così il foglio A4 resta l'unica cosa nel documento e il browser non impagina fogli in più.

## Documento di trasporto e peso

Ogni spedizione porta il **numero DDT** (obbligatorio, fino a 40 caratteri) e il **peso in kg**
(facoltativo: vuoto o 0 vuol dire «non indicato», la virgola va bene). I due campi si correggono
dallo Storico come il resto della spedizione. I database creati prima di questi campi si aggiornano
da soli al primo avvio: le spedizioni già registrate restano senza DDT e senza peso.

## Stampa delle etichette in blocco

Stampare le etichette una spedizione alla volta lascia mezzo foglio inutilizzato ogni volta che i
colli sono dispari. Il giro normale è quindi: durante la giornata si registrano le spedizioni con
`Salva senza stampare`, e a fine giornata, nella schermata Borderò, si passa alla vista `Etichette`
e si stampa tutto in un colpo solo — le etichette scorrono da una spedizione all'altra sullo stesso
foglio. Con 11 etichette servono 6 fogli invece di 8.

Accanto all'anteprima — sia in «Nuova etichetta» sia nella vista `Etichette` del Borderò — si sceglie
l'impaginazione: **2 per foglio** (mezzo A4) o **4 per foglio** (un quarto di A4, in griglia 2 × 2).
L'etichetta rimpicciolisce in proporzione; la scelta resta memorizzata sul server, quindi vale per
tutte le postazioni finché non si cambiano i fogli adesivi. Le stesse 11 etichette stanno in 6 fogli
a due per foglio e in 3 a quattro per foglio.

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

Le sedi di partenza e i vettori non arrivano dal CSV: si scrivono nella pagina Anagrafica, uno per
riga, e sostituiscono l'elenco precedente (serve almeno una voce per elenco).

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
| GET    | `/api/stato`      | anagrafica, sedi, vettori, storico, giornate, prossimo codice  |
| GET    | `/api/clienti?q=` | ricerca clienti (primi 50 per nome, città, indirizzo, codice) |
| GET    | `/api/spedizioni` | `?giorno=YYYY-MM-DD&vettore=` — spedizioni di una giornata      |
| GET    | `/api/bordero`    | elenco borderò, oppure `?numero=BO-…` per il dettaglio         |
| POST   | `/api/bordero`    | `{ codici, vettore, giorno }` — crea il borderò e lo numera     |
| POST   | `/api/bordero/<numero>` | `{ codici }` — aggiunge spedizioni a un borderò esistente |
| POST   | `/api/clienti`    | `{ csv }` — sostituisce l'anagrafica                           |
| POST   | `/api/sedi`       | `{ sedi }` — elenco delle sedi di partenza                     |
| POST   | `/api/vettori`    | `{ vettori }` — elenco dei vettori                             |
| POST   | `/api/mittente`   | `{ mittente }` — memorizza la sede di partenza predefinita     |
| POST   | `/api/formato`    | `{ formato }` — etichette per foglio A4: 2 o 4                 |
| POST   | `/api/spedizioni` | registra la spedizione e assegna il codice progressivo        |
| PUT    | `/api/spedizioni/<codice>` | corregge una spedizione (409 se è già in un borderò) |
| DELETE | `/api/spedizioni/<codice>` | elimina una spedizione (409 se è già in un borderò)  |

## Da definire

- **Vettori e sedi**: si scrivono nella pagina Anagrafica. Il database parte con i quattro nomi di
  esempio del prototipo e con una sola sede, «Sede principale»: vanno sostituiti con quelli veri al
  primo avvio.
- **Dati per vettore**: restano da definire gli eventuali dati che ciascun vettore richiede in
  etichetta (numero conto, formato del codice, barcode).
