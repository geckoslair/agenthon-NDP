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
| Role of the real case        | The studio in `docs/domain.md` is evidence of the problem. Demo data is synthetic                                                                                                                                      |
| Long-term vision (not today) | Supplier selection at the quoting stage, self-invoice XML and SdI, split across cost centres                                                                                                                           |
| Stack                        | TypeScript, Node 20, one full-stack app, Prettier, Vitest                                                                                                                                                              |
| Git                          | Commit straight to `main`, no PRs, quick and dirty                                                                                                                                                                     |
| Credits                      | Each member uses their own Google and ElevenLabs credits and keys, in a local `.env`                                                                                                                                   |
| Agent docs                   | `AGENTS.md` is the single source; `CLAUDE.md` imports it                                                                                                                                                               |

## Open

- Where ElevenLabs fits in the product.
- Project name (finalists pitch in reverse alphabetical order).
- How to frame the business case: the measured cost for one studio is low
  (see `docs/domain.md`).

## Domain facts

See `docs/domain.md`. None verified yet. Tax rules (document types, deadlines, thresholds) must be
checked against Agenzia delle Entrate sources before they are coded as
rules, and each rule must cite its source here.

## Pre-existing components

None so far. Anything reused from before the event must be listed here and
in the submission description.
