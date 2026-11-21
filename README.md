# agenthon-NDP

Team Cicconi's project for AGENTHON (GDG Torino, 21 November 2026), Track 1
"Agentic AI for business", Challenge B · Back Office Autopilot.

An autopilot for the monthly package of foreign purchase invoices that an
Italian software house hands to its accountant. It extracts and validates
each invoice, reconciles them with card charges, researches suppliers it
has never seen, stops at exceptions, and sends nothing without a person's
approval. Every step is logged.

> Work in progress. Description, technologies and start instructions are
> completed before the 17:00 submission.

## Technologies

Next.js 16 and TypeScript on Node 20, SQLite, Gemini on Vertex AI,
ElevenLabs, Vitest.

## Getting started

Requirements: Node 20 or later, and the gcloud CLI for Gemini.

```sh
npm install
cp .env.example .env              # then fill in your own values
gcloud auth application-default login
npm run dev                       # http://localhost:3000
npm test
```

The SQLite database is created on first use in `data/app.db`.

## For contributors and coding agents

Start from [`AGENTS.md`](AGENTS.md), then the files in [`docs/`](docs).
