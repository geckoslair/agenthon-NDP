import { describe, expect, it } from "vitest";
import {
  actorLabel,
  channelLabel,
  deadlineFor,
  daysToDeadline,
  nextClosureLabel,
  fieldLabel,
  manualNote,
  unreadableEvidence,
  today,
  cleanName,
  exceptionLabel,
  formatAmount,
  formatDateTime,
  formatMonth,
  invoiceStatus,
  outboxStatus,
  selfInvoiceStatus,
  supplierStatus,
} from "./format";

describe("format helpers", () => {
  it("translates known exception codes and passes unknown ones through", () => {
    expect(exceptionLabel("DUPLICATE").title).toBe("Fattura duplicata");
    expect(exceptionLabel("SOMETHING_NEW").title).toBe("SOMETHING_NEW");
  });

  it("labels channels, with a fallback for missing values", () => {
    expect(channelLabel("email")).toBe("Email");
    expect(channelLabel("api")).toBe("API del fornitore");
    expect(channelLabel(null)).toBe("Non indicato");
    expect(channelLabel("fax")).toBe("fax");
  });

  it("maps statuses to a label and a tone", () => {
    expect(supplierStatus("unknown")).toEqual({ label: "Da verificare", tone: "warn" });
    expect(outboxStatus("sent").label).toContain("simulata");
    expect(invoiceStatus("exception").tone).toBe("bad");
    expect(invoiceStatus("weird").tone).toBe("neutral");
  });

  it("formats months, dates and amounts", () => {
    expect(formatMonth("2026-10")).toBe("ottobre 2026");
    expect(formatMonth("oops")).toBe("oops");
    expect(formatDateTime("2026-11-21 14:05:09")).toBe("21/11/2026 15:05"); // UTC to Rome, winter
    expect(formatDateTime("2026-07-01 23:30:00")).toBe("02/07/2026 01:30"); // summer, next day
    expect(formatDateTime("not a date")).toBe("not a date");
    expect(formatDateTime(null)).toBe("—");
    expect(formatAmount(12345.5, "EUR")).toBe("12.345,50 EUR");
    expect(formatAmount(1234.5)).toBe("1234,50");
    expect(formatAmount(null)).toBe("non trovato");
  });

  it("shows the autopilot by name and people as they are", () => {
    expect(actorLabel("autopilot")).toBe("Autopilota");
    expect(actorLabel("Maria")).toBe("Maria");
  });

  it("cleans person names", () => {
    expect(cleanName("  Maria   Rossi ")).toBe("Maria Rossi");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(undefined)).toBeNull();
    expect(cleanName("x".repeat(81))).toBeNull();
  });

  it("labels self-invoice statuses", () => {
    expect(selfInvoiceStatus("needs_input")).toEqual({ label: "Da completare", tone: "warn" });
    expect(selfInvoiceStatus("submitted").label).toContain("simulata");
    expect(selfInvoiceStatus("rejected").tone).toBe("bad");
    expect(selfInvoiceStatus("x").tone).toBe("neutral");
  });
});

describe("deadline helpers", () => {
  it("computes days to the 15th of the month after the closure month", () => {
    expect(deadlineFor("2026-10")?.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(deadlineFor("2026-12")?.toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(deadlineFor("bad")).toBeNull();
    expect(daysToDeadline("2026-10", new Date("2026-11-10T09:00:00Z"))).toBe(5);
    expect(daysToDeadline("2026-10", new Date("2026-11-15T23:00:00Z"))).toBe(0);
    expect(daysToDeadline("2026-10", new Date("2026-11-21T10:00:00Z"))).toBe(-6);
    expect(daysToDeadline("x", new Date())).toBeNull();
  });

  it("finds the next closure date, the 3rd, strictly after today", () => {
    expect(nextClosureLabel(new Date("2026-11-21T10:00:00Z"))).toBe("3 dicembre 2026");
    expect(nextClosureLabel(new Date("2026-11-01T10:00:00Z"))).toBe("3 novembre 2026");
    expect(nextClosureLabel(new Date("2026-11-03T10:00:00Z"))).toBe("3 dicembre 2026");
    expect(nextClosureLabel(new Date("2026-12-20T10:00:00Z"))).toBe("3 gennaio 2027");
  });
});

describe("today", () => {
  const now = new Date("2026-11-21T10:00:00Z");
  it("uses the pinned date when PROBATA_TODAY is valid", () => {
    const t = today("2026-11-04", now);
    expect(t.demo).toBe("2026-11-04");
    expect(t.date.toISOString().slice(0, 10)).toBe("2026-11-04");
    expect(daysToDeadline("2026-10", t.date)).toBe(11);
  });
  it("falls back to the real date when unset, empty or invalid", () => {
    for (const bad of [undefined, "", "tomorrow", "2026-13-01", "2026-02-30", "04/11/2026"]) {
      const t = today(bad, now);
      expect(t.demo).toBeNull();
      expect(t.date).toBe(now);
    }
  });
});

describe("manual field helpers", () => {
  it("labels fields and passes unknown ones through", () => {
    expect(fieldLabel("invoiceNumber")).toBe("Numero fattura");
    expect(fieldLabel("invoiceDate")).toBe("Data fattura (AAAA-MM-GG)");
    expect(fieldLabel("somethingElse")).toBe("somethingElse");
  });
  it("describes who typed a value and when", () => {
    expect(manualNote("Maria", "2026-11-21 14:05:00")).toBe(
      "inserito a mano da Maria il 21/11/2026 15:05",
    );
    expect(manualNote("Maria", "2026-11-21T14:05:00.000Z")).toBe(
      "inserito a mano da Maria il 21/11/2026 15:05",
    );
    expect(manualNote(undefined, undefined)).toBe("inserito a mano da una persona");
  });
});

describe("unreadableEvidence", () => {
  it("translates the raw field names to Italian labels", () => {
    expect(unreadableEvidence("Campi non letti: invoiceNumber")).toBe("Non letto: Numero fattura");
    expect(unreadableEvidence("Campi non letti: invoiceNumber, currency")).toBe(
      "Non letto: Numero fattura, Valuta",
    );
  });
  it("returns null when the text is not in that form", () => {
    expect(unreadableEvidence(null)).toBeNull();
    expect(unreadableEvidence("")).toBeNull();
    expect(unreadableEvidence("altro testo")).toBeNull();
    expect(unreadableEvidence("Campi non letti:  , ")).toBeNull();
  });
});
