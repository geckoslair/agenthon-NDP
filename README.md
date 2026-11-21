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

TypeScript on Node 20. Gemini on Vertex AI. ElevenLabs.

## Getting started

```sh
cp .env.example .env   # then fill in your own values
```

Run instructions will be added with the application scaffold.

## For contributors and coding agents

Start from [`AGENTS.md`](AGENTS.md), then the files in [`docs/`](docs).
