# Domain context: foreign purchase invoices in a small software house

An illustrative scenario: an estimate of how a typical small Italian web
studio and its external accountant handle foreign purchase invoices, based
on the team's own working experience. **It is not client data and it names
no real person or company: this repository is public and the brief forbids
real client or personal data.** Never add names, emails, amounts tied to a
person, or real invoices here or in the test data. All figures below are
estimates, not measurements.

Tax rules below are **as commonly reported by accountants**. They are not
verified against official sources. Verify before coding them as rules.

## The situation

The studio buys software and services from foreign suppliers, almost all
SaaS paid by company card. These invoices do not arrive through the Italian
e-invoicing exchange (SdI): someone collects them by hand and hands them to
the accountant, who issues the integration or self-invoice to SdI.

## Current monthly process

1. Early in the month the accountant asks for the documents, with a
   deadline between the 4th and the 7th.
2. The admin person logs into each supplier's dashboard and searches the
   mailboxes, and downloads the PDFs dated in the previous month.
3. They compare against card and bank charges to spot what is missing.
4. What they cannot reach (dashboards without access) they ask a partner
   for, by email, chat or a 15 to 30 minute call.
5. Everything goes into one zip, sent by email with a numbered,
   alphabetical supplier list and the total invoice count. Notes go in
   brackets, for example "(13 invoices)" or "still to be received".
6. The accountant integrates each invoice and sends it to SdI by the 15th.
   Questions and error reports come back by email, often days before the
   deadline.

The month an invoice belongs to is decided by the **invoice date**, not by
the charge date or the receipt date.

## Rules as reported (unverified)

- Foreign purchase invoices must be integrated and sent to SdI by the 15th
  of the month after receipt. Services use document type TD17.
- Lateness counts from the receipt date; when that cannot be proven, the
  document date is used. The payment date does not count.
- Penalty: 2 EUR per missing or late invoice, up to 1,000 EUR, halved if
  fixed within 15 days.
- The integration needs a tax identifier for the supplier. When a foreign
  supplier has none, the value `0` was used. A non-EU national tax id was
  accepted in one case.
- The invoice must be addressed to the company, with its VAT number, and
  without foreign VAT charged (reverse charge). Otherwise the supplier must
  cancel and reissue it.

## Volumes (estimated)

- Around 10 invoices a month at first, 15 to 25 a month as the studio adopts
  more services.
- Peaks come from a single supplier issuing many invoices in a month.
- About forty distinct suppliers over two years: under half recurring, the
  rest occasional or one-off (many are annual renewals).
- One or two new suppliers a month.

## Recurring problems (each one is a candidate exception)

| #   | Problem                                                                                           | Root cause                                                              |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Invoice missing from the monthly package, found after the deadline                                | Manual collection; annual renewals; invoices issued at month end        |
| 2   | Invoice addressed to a partner personally, or with a personal VAT number                          | Account created with personal details; no check on the first invoice    |
| 3   | Foreign VAT charged instead of reverse charge                                                     | Company VAT number not entered or not validated in the supplier account |
| 4   | Supplier tax identifier missing or invalid                                                        | No shared supplier registry                                             |
| 5   | Invoice and card charge do not match                                                              | Several invoices per supplier; no reconciliation                        |
| 6   | Italian supplier classified as foreign                                                            | Classification from memory                                              |
| 7   | Credit notes and refunds handled case by case                                                     | No coded rule                                                           |
| 8   | Invoice filed under the wrong month                                                               | Month decided by eye                                                    |
| 9   | Gap in a recurring supplier's sequence, noticed by the accountant                                 | No expected-invoice check upstream                                      |
| 10  | Two documents for one purchase (receipt plus invoice, or a reissued invoice)                      | No deduplication                                                        |
| 11  | Supplier is a private individual outside the EU, or an exempt freelancer without an EU VAT number | Rare case with no known rule                                            |

## Estimated cost

Order of magnitude for one small studio, estimated by the team:

- **About 1 to 2.5 hours a month** spent collecting and checking foreign
  invoices and answering the accountant's questions.
- A few dozen email exchanges on the topic over two years, plus occasional
  15 to 30 minute calls.
- Penalties: a handful of late invoices at 2 EUR each.

Not estimated: the accountant's time.

**Read this honestly: for one small studio the direct cost is low**, 10 to
30 hours a year. The business case cannot rest on this number alone. It
must rest on scale (how many companies share the problem), on the errors
that surface months later, and on dependence on single people.

## What is missing today

- One up-to-date registry of foreign suppliers: country, tax id, EU or
  non-EU, expected frequency, where the invoice is found, who owns the
  account.
- A monthly completeness check: which invoices are expected, which arrived.
- Reconciliation between invoices and card or bank charges.
- Validation of each invoice before it goes to the accountant.
- A queryable history of what was sent.

## Constraint

The accountant may change. The recipient and the package format must be
configurable; nothing may depend on one specific firm.
