// Italian texts shown in the exception queue: what happened and what to do.
import type { ExceptionCode } from "../types";

export const EXCEPTION_TEXT: Record<ExceptionCode, { message: string; action: string }> = {
  MISSING_EXPECTED_INVOICE: {
    message: "Manca una fattura attesa questo mese.",
    action:
      "Recuperare la fattura dal fornitore o dal suo portale, oppure confermare che non è dovuta.",
  },
  ADDRESSED_TO_PERSON: {
    message: "La fattura non è intestata alla società.",
    action:
      "Chiedere al fornitore di riemettere la fattura intestata alla società con la sua partita IVA.",
  },
  FOREIGN_VAT_CHARGED: {
    message:
      "Il fornitore estero ha addebitato l'IVA: la fattura andrebbe emessa in reverse charge.",
    action:
      "Inserire la partita IVA della società nel profilo del fornitore e chiedere una nota di credito e una nuova fattura senza IVA.",
  },
  WRONG_MONTH: {
    message: "La data della fattura non è nel mese della chiusura.",
    action:
      "Verificare il mese di competenza: spostarla nel pacchetto del mese corretto o confermarla in questo.",
  },
  NOT_FOREIGN: {
    message: "Il fornitore risulta italiano: non è una fattura di acquisto estera.",
    action: "Escluderla dal pacchetto esteri e gestirla con le fatture italiane (SdI).",
  },
  DUPLICATE: {
    message: "Fattura duplicata: stesso fornitore, numero e importo di un'altra già raccolta.",
    action: "Escludere il duplicato dal pacchetto.",
  },
  SUPPLIER_FACTS_UNKNOWN: {
    message: "Fornitore nuovo: non sono riuscito a stabilire tutti i dati di fatturazione.",
    action:
      "Approvare l'email al fornitore già preparata, oppure inserire a mano i dati mancanti con la fonte.",
  },
  UNREADABLE_FIELD: {
    message: "Non sono riuscito a leggere alcuni campi obbligatori dal documento.",
    action:
      "Aprire il PDF e inserire a mano i valori mancanti, oppure chiedere al fornitore un documento leggibile.",
  },
  OUT_OF_KNOWN_RULES: {
    message:
      "Non so come trattare questo caso: sembra un privato fuori dall'UE, fuori dalle regole note.",
    action: "Decide una persona, sentito il commercialista. Non lo tratto in automatico.",
  },
};

/** EU member states (ISO 3166-1 alpha-2). Greece also appears as "EL" in VAT numbers. */
export const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);
