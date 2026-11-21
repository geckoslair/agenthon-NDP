# Pitch material

Numbers below come only from [`docs/domain.md`](domain.md), an illustrative
scenario with figures estimated by the team. They are estimates, not
measurements, and no real client data is used. Tax rules are as commonly
reported by accountants, not verified.

## (a) Submission description (as saved on the portal at 15:33)

Written by the team; 411 characters. In the prototype the submission to
the tax authorities and the accounting integration are simulated: say so
if the jury asks.

```text
Probata simplifies foreign supplier invoicing for Italian SMEs by automating the autofatturazione process. It collects and processes foreign invoices, handles Italian VAT compliance, submits the required documents to the tax authorities, and integrates with accounting software. Probata reduces administrative work, prevents errors, and makes purchasing from international suppliers as simple as buying locally.
```

Character count (including spaces): see the check at the end of this file;
it must stay at or below 1000.

## (b) Pitch script, three minutes, in Italian

**Problema (0:00 – 0:30)**

"Ogni mese una piccola software house italiana compra servizi da fornitori
esteri, quasi tutti abbonamenti SaaS pagati con carta. Queste fatture non
passano dallo SdI: qualcuno le raccoglie a mano, una per una, e le consegna
al commercialista, che le integra e le invia entro il 15.

Abbiamo stimato il caso di uno studio tipo. Lo diciamo senza giri di parole:
il costo diretto è basso, fra una e due ore e mezza al mese. Per uno studio
sono 10-30 ore l'anno.

Il problema non è il tempo. Sono gli errori che saltano fuori vicino alla
scadenza: una fattura mancante, intestata a un socio, con IVA estera
addebitata. In due anni, qualche decina di scambi di email sul tema. Poi la
dipendenza da una sola persona. E la scala: una quarantina di fornitori
esteri in due anni, uno o due nuovi al mese. Non è un problema solo di questo studio."

**Soluzione (0:30 – 1:00)**

"Probata è il collega che fa il lavoro e chiede prima. Raccoglie le fatture da
email, API di fatturazione e pannelli dei fornitori. A decidere sono regole
scritte nel codice: il modello legge, il codice decide. Ogni eccezione ferma
la chiusura. Un fornitore mai visto lo cerchiamo sulle sue pagine pubbliche
e, se un fatto non ha una fonte, scriviamo 'non lo so'. Niente parte senza
l'approvazione di una persona, e tutto finisce nel registro."

**Demo dal vivo (1:00 – 2:30)**: copione cliccato qui sotto.

"Ottobre 2026, dati sintetici di una società inventata. Avvio la chiusura: 18
fatture, dieci pronte, otto bloccate. Qui l'IVA tedesca
addebitata, con la riga della fattura come prova e il link al documento
originale. Sable è un fornitore nuovo e la sua pagina non dice come fattura:
Probata non lo deduce, prepara una mail e blocca il pacchetto. Risolvo
l'eccezione e scrivo il motivo: il pacchetto si sblocca e passa da dieci
a undici fatture. Scelgo dove mandarlo, commercialista o gestionale, e
approvo. Per ogni fattura valida c'è una bozza di autofattura: la approvo e
la trasmetto. Nel registro c'è chi ha deciso cosa, e quando."

**Chiusura (2:30 – 3:00)**

"Quello che abbiamo costruito oggi gira su dati sintetici. Le fonti, l'invio
allo SdI e la consegna al gestionale sono simulati, e le bozze di
autofattura non sono validate fiscalmente: lo scriviamo anche
nell'interfaccia. Il caso non si regge sul tempo risparmiato da un singolo
studio, che abbiamo stimato ed è basso, ma sugli errori trovati prima della
scadenza e su un processo che non dipende più da una persona. Probata fa il
lavoro, e chiede prima."

### Se la giuria prova a rompere la demo

- "Inviate davvero allo SdI e scrivete nel gestionale?": no. Oggi vanno a
  servizi finti dentro l'app e la bozza TD17 non è validata; è costruito il
  percorso con approvazione e registro.
- "La demo usa l'AI?": la demo rilegge estrazioni salvate per stare nei tre
  minuti. Con Gemini dal vivo abbiamo fatto una sola prova: 18 PDF, tutte le
  eccezioni allora attese, 172 secondi. Non è un benchmark.
- "Invialo senza approvare": non si può. Pacchetto e autofatture non partono
  mai da soli; l'invio automatico esiste solo per modelli di mail
  predefiniti, è spento di default e chi lo accende finisce nel registro.
- "E se il fornitore non risponde mai?": "Invia comunque senza queste
  fatture"; chi lo fa resta nel registro.
- "Chi approva è autenticato?": no. L'utente in alto è dimostrativo e
  l'intestazione lo dice ("accesso simulato"): nel prototipo non c'è login.
- "Quanto si risparmia?": per uno studio poco, 10–30 ore l'anno stimate.
  Non abbiamo dati di mercato e non li inventiamo.
- "E le fatture in dollari?": si fermano e chiedono il controvalore in euro
  a una persona. Non inventiamo un cambio.
- Non dire nessun numero che non sia in `docs/domain.md`. Le regole fiscali
  sono riportate dal commercialista e non verificate: dirlo se chiesto.

## (c) Click-by-click demo script (about 90 seconds of the three minutes)

Walked through on the hosted demo on 21 November at 16:18, commit `77eb354`.
Before going on stage: open the site, press **Ripristina demo**, and on
**Approvazioni** set the destination back to "Commercialista" (the reset
keeps the last choice). Scroll a button into view before clicking it.

| Time | Click                                                                                                                         | Say / point at                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1:00 | **Panoramica**: **Ripristina demo**, then **Avvia la chiusura** (about 10 seconds)                                            | "Chiusura completata: 18 fatture, 8 eccezioni, 2 invii da approvare." Tiles: 10 pronte, 8 bloccate.                              |
| 1:12 | Optional: **Ascolta il riepilogo** (16 seconds)                                                                               | "La voce legge soltanto: le approvazioni restano un clic." Skip it if the room is noisy.                                         |
| 1:15 | **Eccezioni**: the card "IVA estera addebitata" (Lumen)                                                                       | The evidence line and **Apri la fattura originale**.                                                                             |
| 1:25 | **Approvazioni**                                                                                                              | "Pacchetto in attesa: manca la risposta di Sable Tools LLC." The email to the supplier is waiting for approval.                  |
| 1:28 | **Eccezioni**: the card "Campo illeggibile" (Tandoor): type the invoice number read on the original PDF, **Salva e verifica** | "Manca un numero: lo inserisco io, Probata lo ricontrolla e segna che è stato scritto a mano." An empty value does not close it. |
| 1:35 | **Eccezioni**: on the Sable card ("Dati del fornitore non trovati") write how it was resolved, **Segna come risolta**         | "Ogni decisione ha un autore." The author is the demo user shown in the header ("accesso simulato").                             |
| 1:50 | **Approvazioni**: choose the destination, **Approva**, then **Invia** or **Consegna al gestionale (simulato)**                | The package is now approvable. Point at "(simulato)" yourself, before the jury does.                                             |
| 2:05 | **Adempimenti**: one draft, **Approva**, **Trasmetti allo SdI (simulato)**                                                    | The foreign invoice, then the TD17 draft. "Bozza dimostrativa, 22% da confermare." A non-EUR invoice shows "Da completare".      |
| 2:20 | **Registro**                                                                                                                  | One line per step: who, on which input, who approved and when.                                                                   |

If the live run fails: show **Registro** and the open exceptions from the
previous closure, and say what failed.

## Character count check

Run this to count the description:

````sh
awk '/^```text$/{f=1;next} /^```$/{f=0} f' docs/pitch.md | tr -d '\n' | wc -m
````
