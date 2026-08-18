# Portale stampa etichette spedizione

_Started 2026-08-18 06:39 UTC_

---

## User

Creami un portale per stampare etichette di spedizione interne per la mia azienda

## Assistant



## User

Answered — who: Magazzino / spedizioni (uso quotidiano, veloce), Un solo operatore addetto alle spedizioni; label_content: Destinatario (reparto/sede), Numero progressivo; flow: Import da file CSV / lista; screens: Nuova etichetta, Anteprima e stampa, Storico spedizioni, Rubrica sedi e reparti, Stampa in blocco, Dashboard con statistiche; platform: Desktop; variations: No, una sola proposta completa; context: 4 sedi, foglio A4 adesivo con 2 etichette, una sopra e una sotto

## Assistant

_[tool: ask_user]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Portale pronto, in italiano e sul design system Nocturne: cinque schermate (Riepilogo, Nuova etichetta, Stampa in blocco da CSV, Storico, Rubrica delle 4 sedi). L'etichetta è minimale come richiesto — destinatario grande e numero progressivo — impaginata due per foglio A4 adesivo (148,5 mm ciascuna); il pulsante Stampa apre la stampa reale con solo i fogli visibili.

Aperti: numerazione progressiva finta (parte da SI-2026-0148) e nessun barcode, dato che non l'hai selezionato — posso aggiungerlo se le etichette vanno scansionate alla consegna.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

Now the bulk preview loop (rename its scoped names) and the grid min-width:

_[tool: dc_html_str_replace]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Semplificato: tre schermate.

- **Nuova etichetta**: scegli la tua sede da elenco, il destinatario dalla rubrica (con ricerca), e il numero colli. Nessun reparto.
- **Rubrica**: importazione da CSV (`nome;sede`) — le sedi trovate diventano anche l'elenco delle sedi mittente.
- **Storico** con ristampa.

Una etichetta per collo, numerata 1/3, 2/3…, sempre due per foglio A4 adesivo.

## User

scusa, non sono spedizioni interne, sono per un vettore che non ha portale per etichette, quindi le dobbiamo fare noi, fammi selezionare anche il vettore

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the label header, the notes line and the storico column:

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Now the logic:

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Aggiunto il vettore: selezione a pulsanti nel modulo (4 vettori d'esempio), stampato in alto sull'etichetta con il codice progressivo, e nuova colonna Vettore nello storico — la ristampa recupera anche quello. Il portale ora si chiama "Etichette di spedizione".

Dimmi i nomi reali dei vettori e se ognuno richiede dati specifici in etichetta (es. numero conto, formato codice), così li adatto.

