# Probata

Team Cicconi's project for AGENTHON (GDG Torino, 21 November 2026), Track 1
"Agentic AI for business", Challenge B · Back Office Autopilot. Everything in
this repository was built during the event.

**Probata** prepares the monthly package of foreign purchase invoices that a
small Italian software house hands to its accountant. It collects the
invoices, extracts and validates each one, reconciles them with card
charges, researches suppliers it has never seen, **stops at every exception
and sends nothing without a person's approval**. Every step is written to an
append-only audit log: what, on which input, who approved.

> **Prototype.** Everything runs on synthetic data. The three invoice
> sources (mailbox, supplier billing API, supplier dashboard) and every
> outgoing email are simulated. Self-invoice drafts are not fiscally
> validated, and the submission to SdI and the export to accounting go to
> fake endpoints inside this app: no real mailbox, supplier, accountant, tax
> authority or accounting product is contacted.

Live demo: https://web-production-32589d1c.up.railway.app

## Who it is for

Small Italian software houses and SMEs that buy software and services from
foreign suppliers (mostly SaaS paid by company card) and give the invoices to
an external accountant every month. The foreign invoices do not arrive
through the Italian e-invoicing exchange (SdI): someone collects them by hand,
and the accountant integrates each one and sends it to SdI. The case behind
the project is described in [`docs/domain.md`](docs/domain.md).

## How it works

1. **Collect** the month's invoices from three channels, in this order: the
   mailbox, the supplier's billing API, and browser automation of the
   supplier's dashboard as a fallback.
2. **Extract** from each PDF: supplier, country, tax id, number, date,
   amount, currency, addressee, VAT. Every value keeps the verbatim quote
   and the page it was read from.
3. **Match** the supplier against the registry. A supplier never seen
   before is researched on its public billing page; each fact is kept with
   its source and quote. A fact without a source stays "unknown": it is never
   inferred, and the invoice becomes an exception.
4. **Validate** with deterministic rules (code, not the model): addressed to
   the company, no foreign VAT charged, right month, foreign supplier,
   duplicates, required fields present.
5. **Check completeness**: expected invoices from recurring suppliers and
   card charges with no invoice.
6. **Build the package** (zip of the PDFs plus the summary email in the
   accountant's usual format) and **wait for approval**. Every outgoing
   email is a draft until a person approves it.

The language model extracts and explains; the rules decide. Exceptions
handled: missing expected invoice, addressed to a person, foreign VAT
charged, wrong month, not a foreign supplier, duplicate, supplier facts
unknown, unreadable field, and cases outside the known rules ("I don't
know, a person decides"). See [`docs/spec.md`](docs/spec.md).

## What the model does, and what was measured

Extraction is done by Gemini 3.8 Flash on Vertex AI: it reads each PDF and
returns every field with the verbatim quote and page. Rules written in code
then decide; the model never does.

Measured on 21 November 2026 on the demo month: with live Gemini extraction
(`EXTRACTOR=gemini`) the run over the 18 PDFs raised **exactly the 9
exceptions listed in `demo/2026-10/expected.json`**, in 172 seconds
(sequential calls). One run, one dataset: it is a check, not a benchmark.

Because that is too slow to click through in a three-minute pitch, the
hosted demo and the tests replay the stored extraction in
`demo/2026-10/truth/` (written by the data generator, not by the model).
Unknown-supplier research in the demo parses tagged fields from the fake
supplier pages; it does not use a model.

## Technologies

- Next.js 16 (App Router), React 19, TypeScript, Node 20, Tailwind CSS,
  shadcn/ui components on Base UI
- SQLite via better-sqlite3 (suppliers, runs, invoices, exceptions, outbox,
  audit log)
- Gemini on Vertex AI (`@google/genai`) for live invoice extraction, optional
- ElevenLabs text to speech (`@elevenlabs/elevenlabs-js`, model `eleven_flash_v2_5`) for the spoken brief
- Playwright (browser collection channel), mailparser (email channel),
  archiver (package zip), zod
- pdfkit (generates the synthetic demo invoices), Vitest, Prettier, ESLint

Third-party libraries are used under their own licences. There are no
pre-existing components: the code was written during the event.

## Run it locally

Requirements: Node 20 or later.

```sh
npm ci
npx playwright install chromium   # only for the browser channel
cp .env.example .env              # optional, see below
npm run dev                       # http://localhost:3000
npm test
```

The SQLite database is created on first use. By default invoice extraction
reads the ground truth next to the demo data (`demo/<month>/truth/`), so the
app, the tests and the demo run **without any API key and without any model
call**. Live extraction with Gemini is opt-in: set `EXTRACTOR=gemini` and the
Google variables in `.env`, and log in with
`gcloud auth application-default login`.

## Spoken brief (ElevenLabs)

The overview has a button **Ascolta il riepilogo**: it reads aloud a
15-second summary built from the database (totals, open exceptions by kind,
what waits for approval).
It only reads: it approves and sends nothing. Set `ELEVENLABS_API_KEY` in
`.env`; optional `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL`. Without a key
the route `/api/brief/audio` answers 503.
Audio is cached in `data/voice/` (git-ignored) by a hash of the text, so
repeating the same brief costs nothing.

## Run the demo month

The repository contains a synthetic month, October 2026, for the fictional
"Acme Studio SRL": 18 invoice PDFs from 13 invented suppliers (plus a 14th, recurring, whose invoice is missing) in five
different layouts, card charges, a supplier registry, a fixture mailbox and
the list of exceptions the run must raise
([`demo/2026-10/README.md`](demo/2026-10/README.md)).

Start the app (`npm run dev`), open <http://localhost:3000>, press
**Avvia la chiusura**, then go through **Eccezioni**, **Approvazioni** and
**Adempimenti**. **Ripristina demo** starts again from scratch.

From the terminal, with the app running as the mock supplier server:

```sh
MOCK_BASE_URL=http://localhost:3000 npx tsx scripts/run-month.ts 2026-10 --reset
```

To regenerate the dataset (deterministic, same files every time):

```sh
npx tsx scripts/generate-demo-data.ts
```

## What is simulated, and what is not built

Simulated, on purpose (the brief forbids real client data and this
repository is public):

- **Sending.** Emails to the accountant and to suppliers are never sent: the
  "send" step records the approved message in the outbox and the audit log.
- **The three sources.** The mailbox is a folder of `.eml` files; the billing
  API is `GET /mock/api/<supplier>/invoices` served by this same app with a
  bearer token; the supplier dashboards are fake pages at
  `/mock/portal/<supplier>` (login `demo` / `demo`), marked as demo pages.
  The supplier "billing and VAT FAQ" pages used for research are fake too.
- **Self-invoicing, SdI and accounting.** For each valid invoice the
  autopilot writes a self-invoice draft (document type TD17) as a small XML
  file. It is a **demonstration draft, not fiscally validated**: the
  structure is simplified, and the 22% ordinary VAT rate is an assumption to
  confirm with an accountant. Invoices not in EUR stop and ask a person for
  the amount in EUR; no exchange rate is invented. After a person approves a
  draft, "submission to SdI" posts it to a fake endpoint in this app
  (`/mock/sdi/submit`) that returns a made-up receipt or a rejection, and
  "export to accounting" posts entries to a fake accounting endpoint
  (`/mock/accounting/entries`). No tax authority and no accounting product
  is contacted.
- **Data.** All companies, people and tax ids are invented; none belongs to a
  real person or business.

Not built:

- A real, validated self-invoice (FatturaPA XML) and a real submission to
  SdI; a real accounting integration. See the simulation above.
- Real mailbox, bank or supplier connections.
- Voice input or voice approvals. The spoken brief is output only: approvals stay a click.
- Live VIES validation of tax ids. The tax rules in
  [`docs/domain.md`](docs/domain.md) are as reported by an accountant and are
  not verified against official sources.

## Repository map

| Path                            | What                                                           |
| ------------------------------- | -------------------------------------------------------------- |
| `src/lib/rules.ts`              | Deterministic validation, duplicates, completeness             |
| `src/lib/pipeline/`             | The monthly run orchestrator                                   |
| `src/lib/sources/`              | Email, billing API and browser collection                      |
| `src/lib/research/`             | Unknown-supplier research with quoted sources                  |
| `src/lib/package/`              | Zip and summary email for the accountant                       |
| `src/lib/audit.ts`              | Append-only log and the approval gate for outgoing emails      |
| `src/app/`                      | Interface (Italian): overview, exceptions, approvals, registry |
| `src/app/mock/`                 | Mock billing API and fake supplier portals                     |
| `demo/2026-10/`                 | Synthetic demo month                                           |
| `scripts/generate-demo-data.ts` | Generator of the demo month                                    |

## For contributors and coding agents

Start from [`AGENTS.md`](AGENTS.md), then the files in [`docs/`](docs).
