# Probata — Design System

Identità visiva di Probata. Vale per ogni punto di contatto: sito, prodotto, documenti, presentazioni, email.

## 1. Principi

- **Carta e inchiostro.** Base monocromatica calda, come un documento fiscale stampato. Un solo colore d'accento.
- **Editoriale, non "startup".** Titoli serif, molto spazio bianco, niente gradienti né illustrazioni decorative.
- **Chiarezza prima di tutto.** Probata toglie complessità burocratica: la sua immagine non deve aggiungerne.
- **Affidabile come un professionista.** Tono sobrio e preciso: chi ci usa ci affida adempimenti fiscali.

## 2. Logo

| Variante                       | Uso                                              |
| ------------------------------ | ------------------------------------------------ |
| Logotipo (simbolo + "Probata") | Uso principale: intestazioni, firme, copertine   |
| Simbolo (quadrato + cerchio)   | Spazi ridotti: favicon, icona app, avatar social |

- File sorgente: `logo-text-probata.svg` (preferito), `logo-text-probata.png`.
- Colori ammessi: **inchiostro su carta** (`#141414` su `#f6f3ec` o bianco) e **carta su inchiostro** (`#f1ede4` su `#141414`/`#151513`). Il "taglio" interno del simbolo prende sempre il colore dello sfondo.
- Altezza minima: **20px** a schermo, **8mm** in stampa.
- Area di rispetto: almeno metà dell'altezza del simbolo su ogni lato.
- Il simbolo può comparire da solo come elemento grafico di raccordo (es. tra due concetti collegati).
- Mai: ricolorare con l'accento o i colori di stato, deformare, ruotare, aggiungere ombre, contorni o effetti, posare su foto non uniformi.

## 3. Colori

### Palette

| Nome                 | Chiaro    | Scuro     | Ruolo                                                  |
| -------------------- | --------- | --------- | ------------------------------------------------------ |
| Carta                | `#f6f3ec` | `#151513` | Sfondo principale                                      |
| Carta 2              | `#ece7dc` | `#1e1d1a` | Superfici: card, riquadri, evidenze                    |
| Inchiostro           | `#141414` | `#f1ede4` | Testo, logo, azioni primarie, sezioni invertite        |
| Inchiostro 2         | `#4a4740` | `#b3ad9f` | Testo secondario                                       |
| Linea                | `#d6d0c2` | `#33312c` | Bordi e separatori                                     |
| Terracotta (accento) | `#9b3d22` | `#e0815f` | Enfasi, etichette, numeri, link al passaggio del mouse |

### Colori di stato

| Nome  | Chiaro    | Scuro     | Significato                   |
| ----- | --------- | --------- | ----------------------------- |
| Verde | `#2f6b45` | `#6fbf8b` | Completato, inviato, conforme |
| Ambra | `#8a5a0c` | `#e3b04f` | Da verificare                 |
| Rosso | `#a3321f` | `#ea7a63` | Errore, scartato, bloccato    |

### Regole

- Proporzioni indicative: **Carta ~70% · Inchiostro ~25% · Terracotta <5%**.
- La terracotta non è mai sfondo di grandi aree e non colora il logo.
- I colori di stato si usano **solo** per stati reali (esito SdI, conformità), mai come decorazione. Sempre accompagnati da un testo.
- Versione invertita: sfondo Inchiostro, testo Carta, testo secondario Carta al 70%, bordi Carta al 18%.
- In stampa: usare la palette chiara; il bianco puro è ammesso al posto di Carta.

### Contrasto (WCAG AA ≥ 4.5:1)

| Coppia                | Chiaro | Scuro |
| --------------------- | ------ | ----- |
| Inchiostro su Carta   | 16.6   | 15.6  |
| Inchiostro 2 su Carta | 8.4    | 8.2   |
| Terracotta su Carta   | 6.1    | 6.5   |
| Verde su Carta 2      | 5.1    | 7.6   |
| Ambra su Carta 2      | 4.8    | 8.5   |
| Rosso su Carta 2      | 5.6    | 6.0   |

## 4. Tipografia

Due famiglie: **serif** per la voce del marchio (riprende il logotipo), **sans** per testo e interfaccia.

| Famiglia | Stack                                                                                   |
| -------- | --------------------------------------------------------------------------------------- |
| Serif    | `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`      |
| Sans     | `ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |

In documenti e presentazioni: Palatino (o Book Antiqua) per i titoli, il sans di sistema per il testo.

| Ruolo     | Famiglia | Dimensione (web)                                    | Peso | Interlinea |
| --------- | -------- | --------------------------------------------------- | ---- | ---------- |
| Display   | serif    | `clamp(2.5rem, 6vw, 4.6rem)`                        | 400  | 1.1        |
| Titolo 1  | serif    | `clamp(2rem, 4vw, 3rem)`                            | 400  | 1.1        |
| Titolo 2  | serif    | `1.4rem`                                            | 400  | 1.1        |
| Citazione | serif    | `1.5rem` → `3.2rem`                                 | 400  | 1.2–1.35   |
| Lead      | sans     | `1.2rem`, Inchiostro 2                              | 400  | 1.6        |
| Testo     | sans     | `17px`                                              | 400  | 1.6        |
| Piccolo   | sans     | `.85–.95rem`                                        | 400  | 1.6        |
| Etichetta | sans     | `.78rem`, MAIUSCOLO, spaziatura `.14em`, Terracotta | 600  | —          |

- Titoli serif sempre peso 400, mai grassetto; `letter-spacing: -.01em`.
- Enfasi nei titoli: corsivo in Terracotta, una sola volta per titolo.
- L'etichetta in maiuscolo introduce i titoli di sezione (1–4 parole).
- Lunghezza riga: testo max ~70 caratteri; citazioni max ~22 parole per riga.

## 5. Spaziatura e layout

Scala: **4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64 · 104** px.

- Contenitore web: max `1120px`, margini laterali `24px` (minimo `16px` su telefono).
- Distanza tra sezioni: `104px` su web, separate da una linea sottile.
- Gap tra card: `20px`. Tra colonne di contenuto: `64px`.
- Composizione: allineamento a sinistra, griglie regolari, molto spazio vuoto. Il centrato è riservato a citazioni e chiamate all'azione finali.

## 6. Forme ed elevazione

| Raggio | Valore  | Uso                          |
| ------ | ------- | ---------------------------- |
| Pill   | `999px` | Bottoni, tag, campi di input |
| L      | `18px`  | Card principali              |
| M      | `14px`  | Riquadri e griglie           |
| S      | `12px`  | Elementi dentro una card     |
| XS     | `6px`   | Badge                        |

- Elevazione = **bordo**, non ombra. Bordo 1px Linea; 1px Inchiostro per l'elemento evidenziato.
- Ombra (solo per l'elemento più importante della vista): `0 8px 24px -14px rgba(0,0,0,.45)`.

## 7. Componenti

### Bottoni

- **Primario:** sfondo Inchiostro, testo Carta, pill, peso 600, padding `14px 24px`. Hover: sfondo Terracotta.
- **Secondario:** trasparente, bordo 1px Inchiostro. Hover: si riempie di Inchiostro.
- Un solo primario per vista.

### Card documento

Il componente distintivo di Probata: rappresenta un documento fiscale (fattura, autofattura).

- Contenitore Carta 2 con righe su Carta; ogni riga: nome soggetto (600) + luogo (Inchiostro 2) a sinistra, importo in serif a destra.
- Sotto, tag con tipo di operazione e stati.
- Il documento generato da Probata è evidenziato: bordo Inchiostro, ombra, badge con il tipo documento (es. `AUTOFATTURA TD17`).
- La trasformazione si indica con `↓ PROBATA` in etichetta Terracotta.

### Tag di stato

Pill piccola (`.74rem`) su Carta 2 con pallino colorato + testo. Senza colore = informazione neutra.

### Badge

Maiuscolo `.7rem`, peso 700, sfondo Inchiostro, testo Carta, raggio 6px.

### Liste numerate

Numeri `01–04` in serif grande Terracotta, sopra una linea 2px Inchiostro.

### Campi di input

Pill, bordo 1px Inchiostro 2, sfondo Carta. Messaggi di conferma in Verde, errori in Rosso, sempre testuali.

## 8. Immagini e icone

- Preferire **documenti e dati reali** (fatture, stati, importi) a illustrazioni o foto stock.
- Icone: tratto semplice, monocromatiche Inchiostro, nessun riempimento colorato.
- Frecce tipografiche (`→`, `↓`) invece di icone dove bastano.
- Niente gradienti, 3D, emoji, mascotte.

## 9. Accessibilità

- Contrasto testo minimo AA (sezione 3).
- Focus visibile: contorno 2px Terracotta, distanza 3px.
- Lo stato non si comunica mai solo col colore.
- Ogni campo ha un'etichetta; logo con testo alternativo "Probata".

## 10. Tono di voce

- Italiano, seconda persona singolare ("carica", "il tuo ERP").
- Frasi brevi. Nomina gli adempimenti reali (SdI, TD17, reverse charge) senza fare lezioni di normativa.
- Promesse concrete e verificabili; niente superlativi ("rivoluzionario", "il migliore").
- Struttura dei messaggi: problema → sollievo ("Fornitore estero? L'autofattura si fa da sola.").
- Affermazioni fiscali sempre verificate con un professionista prima della pubblicazione.

## 11. Token

```css
:root {
  --paper: #f6f3ec;
  --paper-2: #ece7dc;
  --ink: #141414;
  --ink-2: #4a4740;
  --line: #d6d0c2;
  --accent: #9b3d22;
  --ok: #2f6b45;
  --warn: #8a5a0c;
  --bad: #a3321f;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --sans: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --r-pill: 999px;
  --r-l: 18px;
  --r-m: 14px;
  --r-s: 12px;
  --r-xs: 6px;
  --shadow: 0 8px 24px -14px rgba(0, 0, 0, 0.45);
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #151513;
    --paper-2: #1e1d1a;
    --ink: #f1ede4;
    --ink-2: #b3ad9f;
    --line: #33312c;
    --accent: #e0815f;
    --ok: #6fbf8b;
    --warn: #e3b04f;
    --bad: #ea7a63;
  }
}
```
