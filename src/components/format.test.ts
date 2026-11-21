import { describe, expect, it } from "vitest";
import {
  actorLabel,
  channelLabel,
  cleanName,
  exceptionLabel,
  formatAmount,
  formatDateTime,
  formatMonth,
  invoiceStatus,
  outboxStatus,
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
});
