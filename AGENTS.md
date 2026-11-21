# AGENTS.md

Single source of truth for every coding agent working in this repository
(`CLAUDE.md` only imports this file). Read it fully before doing anything.

## What this is

Team Cicconi's project for **AGENTHON** (GDG Torino hackathon, Saturday
21 November 2026), Track 1 "Agentic AI for business", **Challenge B · Back
Office Autopilot**. Team: Enrico Cicconi, Alberto Angeli, plus a third person
being onboarded.

**Hard deadline: 17:00 today.** The portal records the repository's latest
commit at 17:00; anything pushed later does not count.

## Read these first

| File                         | Content                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `docs/brief.md`              | The challenge, verbatim, and what the jury checks                   |
| `docs/event.md`              | Schedule, submission fields, judging weights, rules that bind us    |
| `docs/credits-google.md`     | Vertex AI credits: models, prices, limits, what is not covered      |
| `docs/credits-elevenlabs.md` | ElevenLabs credits and the special prize                            |
| `docs/domain.md`             | The real-world process, volumes and recurring problems (anonymised) |
| `docs/spec.md`               | What we are building: the run, exceptions, approvals, demo data     |
| `docs/decisions.md`          | Decisions taken so far and open questions                           |

## Product

An autopilot that prepares the monthly package of foreign purchase invoices
for the accountant: it extracts and validates each invoice, reconciles them
with card charges, researches suppliers it has never seen, stops at
exceptions and sends nothing without a person's approval. The spec is
`docs/spec.md`; items tagged **[proposed]** there are not confirmed yet.

## Code map

| Path                         | What                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `src/lib/types.ts`           | Domain types. Every extracted value carries its quote and page           |
| `src/lib/rules.ts`           | Deterministic validation, duplicates, completeness. Tested               |
| `src/lib/db.ts`              | SQLite schema (suppliers, runs, invoices, exceptions, outbox, audit log) |
| `src/lib/audit.ts`           | Append-only log and the approval gate for outgoing emails. Tested        |
| `src/lib/gemini.ts`          | Invoice extraction with Gemini on Vertex AI                              |
| `scripts/extract-invoice.ts` | Smoke test: `npm run extract -- file.pdf 2026-10`                        |
| `src/app/`                   | Next.js UI. Only a counter page so far                                   |

Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run format`.
Run `npm test` and `npm run typecheck` before every push.

Not built yet: the run orchestrator, the exception queue and approval UI,
the package builder, supplier research, synthetic data, the voice brief.

## What wins (from the brief)

"Flashy demos don't win here. The winner is the build that is right, admits
what it doesn't know, and never acts without a person's approval." The jury
and rival teams will try to break it live. So:

- Deterministic rules decide; the LLM extracts, classifies and explains.
- Every exception stops the run and waits for a person.
- Nothing is sent, paid or exported without an explicit human approval.
- Every step is written to an audit log: what, on which input, who approved.
- When the data does not support an answer, say "I don't know".

## Working rules

- **Quick and dirty, but demoable.** It is a hackathon: no PRs, no `develop`,
  commit straight to `main`, push often, small commits.
- Pull with rebase before pushing (`git pull --rebase`). Three people push to
  the same branch.
- Keep `main` runnable at all times. A broken `main` at 17:00 is what the
  jury gets.
- **The repository is public.** Never commit secrets, API keys, emails or
  personal data. Secrets live in `.env` (git-ignored); `.env.example` lists
  the variable names.
- **No real client or personal data** (brief rule). Use synthetic data in
  real formats, or an open-source dataset.
- Code, identifiers, comments, commit messages and docs are in English.
  UI text may be Italian if the product is Italian.
- Stack: Next.js 16 (TypeScript) on Node 20, SQLite via better-sqlite3,
  Prettier, Vitest. Next.js 16 differs from older versions: read the note at
  the end of this file.
- Never invent APIs, model ids, SDK methods or prices. Model ids and prices
  come from `docs/credits-google.md`; check SDK usage against current docs.
- Any pre-existing component used must be declared in the submission
  description (event rules, art. 7.3). Note it in `docs/decisions.md`.

## Paid services: project use only

The Google Cloud and ElevenLabs credits pay for what **the product does at
runtime** (and for the pitch material), not for developing it. Do not call
Gemini, Veo, Nano Banana or ElevenLabs as a coding aid, and keep test calls
small. Each team member uses their own credits, project and key.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
