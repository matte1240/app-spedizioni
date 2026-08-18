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

## Schermate

- **Nuova etichetta** — vettore, sede di partenza, destinatario dalla rubrica (con ricerca),
  numero colli, anteprima del foglio A4 e stampa.
- **Storico** — tutte le spedizioni registrate; `Ristampa` riapre i dati nel modulo mantenendo il
  codice originale, senza consumare un nuovo numero.
- **Rubrica** — importazione dei destinatari da CSV (incolla il testo oppure apri un file).

## Numerazione

Il codice `SI-<anno>-<progressivo>` è assegnato dal server dentro una transazione al momento della
registrazione della spedizione, quindi non ci sono numeri duplicati o saltati. Il contatore riparte
da 1 a ogni anno solare.

## Formato CSV della rubrica

Una riga per destinatario, separatore `;`, `,` o tabulazione:

```
Mario Rossi;Stabilimento Melzo
Laura Riva;Stabilimento Melzo
```

Una riga di intestazione è riconosciuta e saltata se contiene i nomi delle colonne (`nome`,
`cliente`, `destinatario`, `ragione sociale` e `sede`, `destinazione`, `città`, `filiale`…);
altrimenti valgono le prime due colonne. L'importazione **sostituisce** la rubrica corrente, e le
sedi trovate nel file diventano anche le sedi selezionabili come mittente.

## Struttura

```
server.js       server HTTP + API JSON + schema SQLite
app/index.html  pagina unica
app/app.js      stato, rendering delle tre schermate, stampa
app/app.css     stili dell'applicazione
app/nocturne.css design system Nocturne (token e classi, copiato dal bundle di design)
project/        handoff originale di Claude Design (prototipo .dc.html)
chats/          trascrizioni della sessione di design
```

## API

| Metodo | Percorso          | Descrizione                                                  |
| ------ | ----------------- | ------------------------------------------------------------ |
| GET    | `/api/stato`      | rubrica, sedi, vettori, storico, prossimo codice             |
| POST   | `/api/clienti`    | `{ csv }` — sostituisce la rubrica                            |
| POST   | `/api/mittente`   | `{ mittente }` — memorizza la sede di partenza predefinita     |
| POST   | `/api/spedizioni` | registra la spedizione e assegna il codice progressivo        |

## Da definire

I quattro vettori sono ancora quelli di esempio del prototipo (tabella `vettori`): vanno sostituiti
con i nomi reali, insieme agli eventuali dati specifici che ciascun vettore richiede in etichetta
(numero conto, formato del codice, barcode).
