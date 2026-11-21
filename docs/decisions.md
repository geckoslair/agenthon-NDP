# Decisions

Update this file whenever something is decided. Agents: if it is not here,
it is not decided; ask the humans.

## Decided (21 November 2026, morning)

| Topic | Decision |
| --- | --- |
| Challenge | B · Back Office Autopilot |
| Domain | Italian software houses buying from foreign suppliers (passive foreign invoicing) |
| MVP process | A supplier qualification agent. When a software house prepares a quote for a client and needs external suppliers to cover some features, the agent researches a candidate supplier from external sources and says whether it fits the company's fiscal needs |
| Role of the real case | The studio described in `docs/domain.md` is evidence of the problem, not the data source of the product. The agent must work for suppliers nobody has used before |
| Long-term vision (not today) | Automated invoice collection, analysis, split across cost centres, self-invoice and tax obligations |
| Stack | TypeScript, Node 20, one full-stack app, Prettier, Vitest |
| Git | Commit straight to `main`, no PRs, quick and dirty |
| Credits | Each member uses their own Google and ElevenLabs credits and keys, in a local `.env` |
| Agent docs | `AGENTS.md` is the single source; `CLAUDE.md` imports it |

## Open

- **How the agent satisfies Challenge B.** It needs a finished output (not
  only a verdict), a stop at exceptions, and an approval before something
  irreversible. Not settled yet.
- Which facts the agent must establish about a supplier, and from which
  sources. Every fact must carry its source; no source means "unknown".
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
