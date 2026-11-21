# Contracts between the three work streams

Frozen by the coordinator. If you need a change here, ask; do not edit.

## Ownership

| Stream           | Owns (may edit)                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline         | `src/lib/pipeline/**`, `src/lib/sources/*` except `types.ts`, `src/lib/research/**`, `src/lib/package/**`, `scripts/run-month.ts`                                                                                   |
| Interface        | `src/app/**` except `src/app/mock/**`, `src/components/**`, `src/lib/queries.ts`, `src/lib/actions.ts`                                                                                                              |
| Data and pitch   | `demo/**`, `scripts/generate-demo-data.ts`, `src/app/mock/**`, `README.md`, `docs/pitch.md`                                                                                                                         |
| Coordinator only | `package.json`, `package-lock.json`, `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/audit.ts`, `src/lib/rules.ts`, `src/lib/extractor.ts`, `src/lib/sources/types.ts`, `docs/**` except `docs/pitch.md`, `AGENTS.md` |

Need a new dependency or a schema change? Ask the coordinator.

## Demo data layout (Data stream produces, Pipeline consumes)

Demo month: **2026-10**. Company: fictional "Acme Studio SRL", VAT
`IT01234567890`, country `IT`. Everything is synthetic.

```
demo/2026-10/
  company.json            CompanyProfile
  suppliers.json          Supplier[] (the registry before the run)
  charges.csv             header: id,date,description,amount,currency
  pdf/<fileName>.pdf      every invoice PDF of the month
  truth/<fileName>.json   ExtractedInvoice for that PDF (ground truth)
  sources.json            which channel delivers which file (see below)
  inbox/<n>.eml           emails whose attachments are PDFs from pdf/
  expected.json           the exceptions the run must raise (for tests)
```

`sources.json`:

```json
{
  "email": ["nimbus-INV-1001.pdf"],
  "billing_api": { "orbit": ["orbit-2026-10.pdf"] },
  "browser": { "glyph": ["glyph-R-88.pdf"] }
}
```

- **Email**: the adapter parses `inbox/*.eml` and saves PDF attachments.
- **Billing API**: `GET /mock/api/<supplierId>/invoices?month=2026-10` returns
  `[{ "number": "...", "date": "...", "pdfUrl": "/mock/api/<supplierId>/invoices/<fileName>" }]`.
  It requires the header `Authorization: Bearer demo-<supplierId>`.
- **Browser**: `/mock/portal/<supplierId>` is a fake supplier dashboard with a
  login form (user `demo`, password `demo`) and an invoices page whose rows
  link to the PDFs. The adapter drives it with Playwright.
- The mock base URL comes from `MOCK_BASE_URL` (default
  `http://localhost:3000`).

No real mailbox, real supplier API or real dashboard is ever contacted: the
brief forbids real data and the repository is public.

## Planted cases (Data stream plants, Pipeline must detect)

One of each, listed in `expected.json` as `{ "fileName", "code" }`:
`FOREIGN_VAT_CHARGED`, `ADDRESSED_TO_PERSON`, `WRONG_MONTH`, `NOT_FOREIGN`,
`DUPLICATE`, `UNREADABLE_FIELD`, `MISSING_EXPECTED_INVOICE` (a recurring
supplier and a card charge with no invoice), `OUT_OF_KNOWN_RULES` (a private
individual outside the EU), and **two unknown suppliers**: one whose billing
facts can be found on its fake portal page (research succeeds), one where
they cannot (`SUPPLIER_FACTS_UNKNOWN`, an email to the supplier is queued).

## Extraction

`getExtractor()` in `src/lib/extractor.ts` returns the fixture extractor by
default (reads `truth/`). Live Gemini is behind `EXTRACTOR=gemini`. Nothing
may depend on a live model call: it has never been run in this project.

## State changes (Interface calls, Pipeline implements)

`src/lib/pipeline/index.ts`: `runMonth`, `resolveException`, `resetDemo`.
`src/lib/audit.ts`: `decideOutgoing`, `markSent`, `setAutoSend`.
The Interface reads the database directly through `src/lib/queries.ts`.

## Conventions agreed between Pipeline and Data (14:50)

1. The supplier id of a file is the part of `fileName` before the first `-`
   (`nimbus-INV-1001.pdf` → `nimbus`). An unknown supplier's public page is
   `/mock/portal/<that id>/billing-info`.
2. On `billing-info` each fact is an element with `data-fact="<name>"` and
   `data-value="<value>"`; its text content is the verbatim quote. Fact
   names: `legal_entity`, `country`, `tax_id`, `reverse_charge` (yes/no),
   `company_addressee` (yes/no), `currency`, `invoice_channel`
   (email|dashboard|api). A missing element means the fact is unknown.
3. Portal login: `/mock/portal/<id>` has `input[name=username]`,
   `input[name=password]` and a submit button. After login the invoices page
   is `/mock/portal/<id>/invoices`, with `<a href="...pdf">` links. PDFs may
   be served without a cookie.
4. The pipeline reads `sources.json` only for which supplier ids use
   `billing_api` or `browser` (the keys), not to pick files.
5. `OUT_OF_KNOWN_RULES`: the truth JSON has `supplierTaxId.value = null` and
   a `supplierCountry` outside the EU.
6. The unknown supplier whose facts can be found raises no exception in
   `expected.json`; the other raises `SUPPLIER_FACTS_UNKNOWN` only.
7. `MISSING_EXPECTED_INVOICE` entries in `expected.json` use
   `"fileName": null` and add `"supplierId"`.
