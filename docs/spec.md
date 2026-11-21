# Product spec (working draft)

Status legend: **[decided]** confirmed by the team, **[proposed]** default
suggested but not yet confirmed. Change the tag when it is confirmed.

## One line

An autopilot that prepares the monthly package of foreign purchase invoices
for the accountant: it collects, checks and reconciles the invoices,
researches suppliers it has never seen, stops at exceptions, and sends
nothing without a person's approval. **[decided]**

## Who it is for

Small Italian software houses and SMEs that buy software and services from
foreign suppliers and hand the invoices to an external accountant every
month. See `docs/domain.md` for the real case behind it.

## The monthly run **[decided]**

Raw input: invoices collected from three channels, in this order: email,
the supplier's billing API when it has one, and browser automation of the
supplier's dashboard as a fallback. Plus the card or bank charges (CSV) and
the supplier registry. In the demo all three channels run on synthetic
sources (see `docs/contracts.md`).

1. **Extract** from each PDF: supplier, country, tax identifier, invoice
   number and date, amount, currency, addressee and addressee VAT number,
   foreign VAT charged or not. Each value keeps a pointer to where in the
   document it was read.
2. **Match the supplier** against the registry.
3. **Unknown supplier**: the agent does not stop. It researches the
   supplier's billing details (see below). Only if it cannot establish them
   does it raise an exception.
4. **Validate** each invoice with deterministic rules (see exceptions).
5. **Check completeness**: invoices expected from recurring suppliers and
   card charges without a matching invoice.
6. **Build the package**: zip of the PDFs plus the summary email in the
   format the accountant already receives (total count, numbered
   alphabetical supplier list, notes in brackets).
7. **Wait for approval**, then send (simulated) and write the audit log.

Finished output: the approved package and email, an updated supplier
registry, and the log.

## Unknown supplier research **[decided]**

Facts to establish, each with its source and a quoted snippet:

- legal entity that issues the invoice, and its country;
- tax identifier, and its validity (VIES for EU suppliers);
- whether it invoices an Italian VAT-registered company without foreign VAT;
- whether the invoice can be addressed to a company;
- invoicing currency;
- how the invoice is obtained (email, dashboard, API).

Sources, in order: the invoice itself, the supplier's public pages (terms,
billing docs, VAT FAQ), VIES, then asking the supplier or the accountant.

A fact with no source is "unknown". The agent never infers it. If facts
are still unknown after research, the invoice becomes an exception.

**Outgoing emails [decided]:** web research is autonomous (read-only).
Every email to a supplier or to the accountant is drafted and waits for a
person's approval. A person can then switch a **predefined template** to
unattended sending; from then on emails from that template go out without
a click, and the log records who enabled it. This is off by default, can be
revoked, and never applies to the monthly package or to free-text emails.
Implemented in `src/lib/audit.ts` (`queueOutgoing`, `setAutoSend`).

## Exceptions that stop an invoice **[proposed]**

All taken from real episodes in `docs/domain.md`.

| Exception                | Rule                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| Expected invoice missing | Recurring supplier in the registry, or a card charge, with no invoice this month  |
| Addressed to a person    | Addressee or VAT number is not the company's                                      |
| Foreign VAT charged      | VAT amount greater than zero on a foreign invoice                                 |
| Wrong month              | Invoice date outside the month of the run                                         |
| Not foreign              | Supplier country is Italy                                                         |
| Duplicate                | Same supplier, number and amount, or receipt plus invoice for one charge          |
| Supplier facts unknown   | Research did not establish the required facts                                     |
| Out of known rules       | For example a private individual outside the EU: "I don't know, a person decides" |

Each exception shows the evidence, a proposed action, and waits for a
person. Resolving it is logged with who decided.

## Human approval points **[decided in principle]**

- Sending the package to the accountant.
- Any outgoing email, unless a person enabled unattended sending for its
  template.
- Adding or changing a supplier in the registry. **[proposed]**

## Audit log **[decided]**

Append-only. One row per step: timestamp, run, invoice or supplier, step,
input reference, result, source, and for approvals who approved and when.

## Demo data **[proposed]**

Synthetic only: one fictional month with about twenty invoice PDFs in
different layouts from fictional suppliers, a CSV of card charges, and a
registry of recurring suppliers. Planted cases: one of each exception above
and one unknown supplier that the research resolves. No real company,
person or invoice.

## Voice (ElevenLabs) **[proposed]**

A spoken morning brief of the run: how many invoices are ready, what is
missing, which exceptions wait for a decision. Approval stays a click, not
a voice command. Stretch: a conversational agent that answers "why is this
invoice blocked?" from the log.

## Stack **[decided]**

Next.js (TypeScript) with SQLite, run locally for the demo. Gemini on
Vertex AI (`gemini-3.8-flash`) for extraction and research. A backup video
of the demo recorded before 17:00.

## Not today

Generating the self-invoice XML and sending to SdI, real mailbox or bank
connections, the sales cycle, supplier selection at the quoting stage (the
registry built here is what will make it reliable later).
