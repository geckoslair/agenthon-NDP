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
month. See `docs/domain.md` for the scenario behind it.

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

## Exceptions that stop an invoice **[built]**

All taken from real episodes in `docs/domain.md`.

| Exception                                   | Rule                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Expected invoice missing (retired at 16:30) | No longer raised. Reconciliation with recurring suppliers and card charges still runs and is logged |
| Addressed to a person                       | Addressee or VAT number is not the company's                                                        |
| Foreign VAT charged                         | VAT amount greater than zero on a foreign invoice                                                   |
| Wrong month                                 | Invoice date outside the month of the run                                                           |
| Not foreign                                 | Supplier country is Italy                                                                           |
| Duplicate                                   | Same supplier, number and amount, or receipt plus invoice for one charge                            |
| Supplier facts unknown                      | Research did not establish the required facts                                                       |
| Out of known rules                          | For example a private individual outside the EU: "I don't know, a person decides"                   |

Each exception shows the evidence, a proposed action, and waits for a
person. Resolving it is logged with who decided.

## Human approval points **[decided in principle]**

- Sending the package to the accountant.
- Any outgoing email, unless a person enabled unattended sending for its
  template.
- Adding or changing a supplier in the registry. **[not built: researched
  suppliers are added with status "unknown"]**

## Audit log **[decided]**

Append-only. One row per step: timestamp, run, invoice or supplier, step,
input reference, result, source, and for approvals who approved and when.

## Demo data **[built]**

Synthetic only: one fictional month with about twenty invoice PDFs in
different layouts from fictional suppliers, a CSV of card charges, and a
registry of recurring suppliers. Planted cases: one of each exception above
and one unknown supplier that the research resolves. No real company,
person or invoice.

## Voice (ElevenLabs) **[built]**

A spoken morning brief of the run: how many invoices are ready, what is
missing, which exceptions wait for a decision. Approval stays a click, not
a voice command. Not built: a conversational agent that answers "why is
this invoice blocked?" from the log.

## Stack **[decided]**

Next.js (TypeScript) with SQLite, run locally for the demo. Gemini on
Vertex AI (`gemini-3.8-flash`) for extraction and research. A backup video
of the demo recorded before 17:00.

## Changes at 16:30 **[built]**

Requested by the team after reviewing the interface; this supersedes the
exception table above where they differ.

- **Missing expected invoice is retired.** The run no longer raises it.
  Rows already in a database are kept for history but are not listed, not
  counted and never block a package. This is a deliberate scope reduction.
- **Exclude.** For wrong month, foreign VAT charged and addressed to a
  person, a person can exclude the invoice from the closure's package. The
  PDF and an audit record stay; the date is not changed, the invoice is not
  marked valid and is not moved to another month. All open exceptions on
  that invoice close with it.
- **Ask for a correction.** For foreign VAT charged and addressed to a
  person, a person can queue an email to the supplier (approval required,
  sending simulated). The exception stays open until a corrected document is
  attached, extracted and passes the rules again. A note or an approved
  email is never proof of correction.
- **Complete unreadable fields.** A person types the missing values; they
  are validated, saved as manual corrections and the rules run again.

## Self-invoicing, SdI and accounting **[built as a simulation]**

Added at 15:30 to match the submitted description. For each valid invoice
the run writes a self-invoice draft (TD17, simplified XML, not fiscally
validated; 22% ordinary rate assumed and shown as "to confirm"). Non-EUR
invoices wait for a person to supply the EUR amount. A person approves each
draft; only then can it be submitted to the simulated SdI endpoint, and
only submitted drafts can be exported to the simulated accounting endpoint.
Every step is in the audit log. Code: `src/lib/compliance/`.

## Not today

A validated FatturaPA self-invoice and a real submission to SdI, a real
accounting integration, real mailbox or bank
connections, the sales cycle, supplier selection at the quoting stage (the
registry built here is what will make it reliable later).
