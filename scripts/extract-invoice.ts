// Smoke test for Gemini on Vertex AI: npm run extract -- path/to/invoice.pdf
// Costs a fraction of a cent per call. Uses project credits: keep test calls few.
import { extractInvoice } from "../src/lib/gemini";
import { validateInvoice } from "../src/lib/rules";

const [pdf, month = new Date().toISOString().slice(0, 7)] = process.argv.slice(2);
if (!pdf) {
  console.error("Usage: npm run extract -- <invoice.pdf> [YYYY-MM]");
  process.exit(1);
}

const company = {
  legalName: process.env.COMPANY_LEGAL_NAME ?? "Acme Studio SRL",
  vatId: process.env.COMPANY_VAT_ID ?? "IT01234567890",
  country: "IT",
};

extractInvoice(pdf)
  .then((invoice) => {
    console.log(JSON.stringify(invoice, null, 2));
    console.log("Exceptions:", validateInvoice(invoice, company, month));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
