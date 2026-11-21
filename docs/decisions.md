# Decisions

Update this file whenever something is decided. Agents: if it is not here,
it is not decided; ask the humans.

## Decided (21 November 2026, morning)

| Topic | Decision |
| --- | --- |
| Challenge | B · Back Office Autopilot |
| Domain | Passive foreign invoicing for Italian SMEs buying from foreign suppliers |
| Stack | TypeScript, Node 20, one full-stack app, Prettier, Vitest |
| Git | Commit straight to `main`, no PRs, quick and dirty |
| Credits | Each member uses their own Google and ElevenLabs credits and keys, in a local `.env` |
| Agent docs | `AGENTS.md` is the single source; `CLAUDE.md` imports it |

## Open

- **Which process.** Two candidates:
  1. Selecting suppliers that are compliant with Italian tax rules at the
     quote stage.
  2. Collecting foreign invoices automatically, then handling the
     self-invoice ("autofattura") and the related tax obligations.
- Framework and persistence for the app.
- Where ElevenLabs fits in the product.
- Project name (finalists pitch in reverse alphabetical order).
- The quantified business case: who loses time or money today, and how much.

## Domain facts

None verified yet. Tax rules (document types, deadlines, thresholds) must be
checked against Agenzia delle Entrate sources before they are coded as
rules, and each rule must cite its source here.

## Pre-existing components

None so far. Anything reused from before the event must be listed here and
in the submission description.
