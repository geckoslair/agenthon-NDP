# Decisions

Update this file whenever something is decided. Agents: if it is not here,
it is not decided; ask the humans.

## Decided (21 November 2026, morning)

| Topic | Decision |
| --- | --- |
| Challenge | B · Back Office Autopilot |
| Domain | Italian software houses buying from foreign suppliers (passive foreign invoicing) |
| MVP process | Decision support in the quoting flow: is this foreign supplier compliant with Italian tax rules, and what does it really cost |
| Long-term vision (not today) | Automated invoice collection, analysis, split across cost centres, self-invoice and tax obligations |
| Stack | TypeScript, Node 20, one full-stack app, Prettier, Vitest |
| Git | Commit straight to `main`, no PRs, quick and dirty |
| Credits | Each member uses their own Google and ElevenLabs credits and keys, in a local `.env` |
| Agent docs | `AGENTS.md` is the single source; `CLAUDE.md` imports it |

## Open

- **How decision support becomes an end-to-end process.** Challenge B asks
  for "raw input in, finished output out", a stop at exceptions, and an
  approval before anything is sent, paid or exported. The MVP needs a raw
  input, a finished output and an irreversible step. Not settled yet.
- Which quote: the one received from the supplier, or the one the software
  house writes for its client.
- Framework and persistence for the app.
- Where ElevenLabs fits in the product.
- Project name (finalists pitch in reverse alphabetical order).
- The quantified business case: who loses time or money today, and how much.

## Domain facts

See `docs/domain.md`. None verified yet. Tax rules (document types, deadlines, thresholds) must be
checked against Agenzia delle Entrate sources before they are coded as
rules, and each rule must cite its source here.

## Pre-existing components

None so far. Anything reused from before the event must be listed here and
in the submission description.
