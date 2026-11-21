# Decisions

Update this file whenever something is decided. Agents: if it is not here,
it is not decided; ask the humans.

## Decided (21 November 2026, morning)

| Topic                        | Decision                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Challenge                    | B · Back Office Autopilot                                                                                                                                                                                              |
| Domain                       | Italian software houses buying from foreign suppliers (passive foreign invoicing)                                                                                                                                      |
| Process                      | The monthly package of foreign purchase invoices for the accountant, run end to end. Full spec in `docs/spec.md`                                                                                                       |
| Unknown suppliers            | When the run meets a supplier with no billing data on file, the agent does not stop: it researches the data on the web and by asking the supplier or the accountant. It raises an exception only if it cannot get them |
| Role of the scenario         | The scenario in `docs/domain.md` illustrates the problem. Demo data is synthetic                                                                                                                                       |
| Long-term vision (not today) | Supplier selection at the quoting stage, self-invoice XML and SdI, split across cost centres                                                                                                                           |
| Stack                        | TypeScript, Node 20, one full-stack app, Prettier, Vitest                                                                                                                                                              |
| Git                          | Commit straight to `main`, no PRs, quick and dirty                                                                                                                                                                     |
| Credits                      | Each member uses their own Google and ElevenLabs credits and keys, in a local `.env`                                                                                                                                   |
| Agent docs                   | `AGENTS.md` is the single source; `CLAUDE.md` imports it                                                                                                                                                               |

## Decided (21 November 2026, afternoon)

- **Project name:** Probata (domain probata.it, DNS configured later).
- **Invoice collection:** three channels in order: email, the supplier's
  billing API, browser automation (Playwright) as fallback. All on synthetic
  sources in the demo.
- **Interface:** shadcn components styled with `docs/design.md`.
- **Hosting:** a Railway project in the Piramid workspace.
- **Orchestration:** three parallel agent streams with the ownership and
  interfaces in `docs/contracts.md`.

## Decided (21 November 2026, 15:30)

- **Submission saved on the portal** with the team's own description. It
  promises self-invoicing ("autofatturazione"), Italian VAT compliance,
  submission to the tax authorities and accounting integration.
- **Scope change to match it:** these are added as a clearly labelled
  simulation: self-invoice drafts (TD17, not fiscally validated), a
  simulated SdI submission and a simulated accounting export, each behind a
  person's approval. This reverses the earlier "not today" for the
  self-invoice XML and SdI.

## Decided (21 November 2026, 15:45 to 16:20), after the team reviewed the UI

- **Wording:** the monthly run is called "chiusura" in the interface.
- **Overview:** a dashboard of counts; no per-channel breakdown; the next
  closure is shown as "prevista" because no scheduler exists.
- **Invoice page:** values only, with a link to the original PDF. Quotes
  stay as evidence on exceptions.
- **Package:** blocked while a request to a supplier is unanswered; a person
  can send it anyway, and that is logged.
- **Destination:** the accountant by email, or a direct ERP integration
  (simulated), chosen by a person.
- **Unreadable fields:** a person types the missing values; they are
  validated, saved with their own provenance ("manual", who, when, no
  quote), the rules run again, and the exception closes only if the problem
  is really solved.
- **Signed-in user:** there is no login. The team chose a made-up demo user
  set on the server; the header says "accesso simulato".
- **Voice:** reduced to one button on the overview.
- **Not done:** a recorded video of the browser collection; a second month
  of demo data.

## Decided (21 November 2026, 16:30), last round

- **Missing expected invoice retired** as an exception (scope reduction).
- **"Escludi"** for wrong month, foreign VAT and addressed to a person.
- **"Richiedi correzione"** for foreign VAT and addressed to a person, with
  a corrected document that must pass the rules before anything resolves.
- Details in `docs/spec.md`, section "Changes at 16:30".

## Open

- Where ElevenLabs fits in the product.
- How to frame the business case: the estimated cost for one studio is low
  (see `docs/domain.md`).

## Domain facts

See `docs/domain.md`. None verified yet. Tax rules (document types, deadlines, thresholds) must be
checked against Agenzia delle Entrate sources before they are coded as
rules, and each rule must cite its source here.

## Pre-existing components

None. The Probata brand, design system and logo were also made today
(confirmed by the team at 15:20). Anything reused from before the event must be listed here and
in the submission description.
