# Pitch material

Numbers below come only from [`docs/domain.md`](domain.md), the anonymised
summary of the real case: the studio's own time tracking over 25 months
(November 2024 to November 2026) and its email history. Nothing else is
quoted. Tax rules are as reported by the accountant, not verified.

## (a) Submission description (max 1000 characters)

```text
Probata prepares the monthly package of foreign purchase invoices that a small Italian software house gives its accountant. It collects invoices from email, supplier billing APIs and supplier dashboards (browser automation), reads each value with its source quote and page, validates every invoice with deterministic rules (not the model), reconciles invoices with card charges and researches unknown suppliers, keeping the source of each fact and answering "unknown" when there is none. It stops at every exception (foreign VAT, wrong month, duplicate, missing or misaddressed invoice, cases outside known rules) and sends nothing without a person's approval. Every step goes to an append-only audit log. Sending and the three sources are simulated on synthetic data. No pre-existing components: all built today. Libraries: Next.js, React, SQLite, Playwright, pdfkit, mailparser, archiver, zod, Tailwind, shadcn/ui, Vitest, Gemini SDK.
```

Character count (including spaces): see the check at the end of this file;
it must stay at or below 1000.

## (b) Pitch script, three minutes, in Italian

**Problema (0:00 – 0:30)**

"Ogni mese una piccola software house italiana compra servizi da fornitori
esteri, quasi tutti abbonamenti SaaS pagati con carta. Queste fatture non
passano dallo SdI: qualcuno le raccoglie a mano, una per una, e le consegna
al commercialista, che le integra e le invia entro il 15.

Abbiamo misurato un caso reale, anonimizzato, su 25 mesi di tracciamento del
tempo. Lo diciamo senza giri di parole: il costo diretto è basso, circa 0,8
ore al mese di voci dedicate, al massimo 2,5 contando per intero ogni voce
mista. Per uno studio sono 10-30 ore l'anno.

Il problema non è il tempo. Sono gli errori che saltano fuori vicino alla
scadenza: una fattura mancante, intestata a un socio, con IVA estera
addebitata. In 23 mesi, circa 39 conversazioni email sul tema. Poi la
dipendenza da una sola persona. E la scala: 44 fornitori in 22 mesi, in
media 1,6 nuovi al mese. Non è un problema solo di questo studio."

**Soluzione (0:30 – 1:00)**

"Probata è il collega che fa il lavoro e chiede prima. Raccoglie le fatture da
email, API di fatturazione e pannelli dei fornitori. Ogni dato letto porta la
citazione e la pagina da cui viene. A decidere sono regole deterministiche:
il modello legge e spiega, il codice decide. Ogni eccezione ferma il giro. Un
fornitore mai visto lo cerchiamo sulle sue pagine pubbliche e, se un fatto
non ha una fonte, scriviamo 'non lo so'. Niente parte senza l'approvazione di
una persona, e tutto finisce nel registro."

**Demo dal vivo (1:00 – 2:30)**: copione cliccato qui sotto.

"Ottobre 2026, dati sintetici di una società inventata. Avvio il giro: 18
documenti da tre canali, dieci eccezioni, ognuna con la prova accanto. Qui
l'IVA tedesca addebitata: ecco la riga citata. Qui una fattura intestata a una
persona. Qui un fornitore ricorrente senza fattura. Helix è nuovo: sulla sua
pagina Probata trova soggetto, paese, partita IVA e che fattura senza IVA alle
imprese UE. Su Sable la pagina non lo dice: non lo deduce, lo segnala e
prepara una mail che aspetta la mia approvazione. Il pacchetto non è partito.
Risolvo un'eccezione, lascio nome e motivo. Approvo: l'invio è simulato. Nel
registro c'è chi ha approvato e quando."

**Chiusura (2:30 – 3:00)**

"Quello che abbiamo costruito oggi gira su dati sintetici, con invio e fonti
simulati, e non genera ancora l'autofattura per lo SdI. Il caso non si regge
sul tempo risparmiato da un singolo studio, ma sugli errori trovati prima
della scadenza, su un processo che non dipende più da una persona e su tutte
le aziende con lo stesso problema. Probata fa il lavoro, e chiede prima."

### Se la giuria prova a rompere la demo

- "Invialo senza approvare": non si può; il pacchetto resta in attesa e
  l'invio automatico è spento di default.
- "E se il fornitore non pubblica nulla?": è il caso Sable, risponde "non lo
  so" e passa la decisione a una persona.
- "Il modello può sbagliare?": le regole sono codice; ogni valore ha
  citazione e pagina da controllare.
- Non dire: tempo risparmiato in euro, penali risparmiate, nessun numero che
  non sia in `docs/domain.md`. Le regole fiscali sono riportate dal
  commercialista e non verificate: dirlo se chiesto.

## (c) Click-by-click demo script (about 90 seconds of the three minutes)

Labels are the ones in the current Italian interface; adjust if the
interface changed. Start with the app running (`npm run build && npm start`,
Chromium installed with `npx playwright install chromium`), a clean demo
database, and a backup video of this same path ready.

| Time | Click                                                                                                               | Say / point at                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1:05 | **Panoramica**, press **Ripristina demo**                                                                           | "Parto da zero: ottobre 2026, dati sintetici."                                        |
| 1:10 | Press **Avvia il giro del mese**                                                                                    | Counters fill in: email, API, browser. 18 documenti.                                  |
| 1:20 | Read **Pronte / Bloccate / Mancanti**                                                                               | "Quello che è pulito passa. Il resto aspetta una persona."                            |
| 1:25 | **Eccezioni**, the FOREIGN_VAT_CHARGED one (Lumen)                                                                  | The evidence shows the quoted line "VAT 19%: EUR 15.20".                              |
| 1:35 | Open the invoice (**fatture**) detail                                                                               | Each value with its quote and page: "non c'è un valore senza fonte".                  |
| 1:45 | Back in **Eccezioni**: the person-addressee (Cobalt), the missing invoice (Marlow), the card charge without invoice | "Una fattura intestata a un socio. Un ricorrente che manca, trovato oggi, non il 15." |
| 1:55 | **Fornitori**: Helix (researched) and Sable (unknown)                                                               | Helix: each fact with source and quote. Sable: "non lo so", mail in bozza.            |
| 2:10 | **Approvazioni**: the draft email to the supplier and the package                                                   | "Niente è partito." Show **Invio automatico** is off.                                 |
| 2:15 | **Eccezioni**: **Segna come risolta** on one exception, enter name and reason                                       | "Ogni decisione ha un nome."                                                          |
| 2:25 | **Approvazioni**: press **Approva** on the package                                                                  | Status: sent (simulated).                                                             |
| 2:30 | **Registro**                                                                                                        | Audit log: what, on which input, who approved and when.                               |

Fallback if the live run fails: play the backup video, then show **Registro**
and the open exceptions from a previous run.

## Character count check

Run this to count the description:

````sh
awk '/^```text$/{f=1;next} /^```$/{f=0} f' docs/pitch.md | tr -d '\n' | wc -m
````
