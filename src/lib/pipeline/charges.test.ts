import { describe, expect, it } from "vitest";
import { parseCharges, splitCsvLine } from "./charges";

describe("parseCharges", () => {
  it("parses rows, quotes and currency case", () => {
    const csv = 'id,date,description,amount,currency\nc1,2026-10-01,"ACME, INC",12.5,usd\n';
    expect(parseCharges(csv)).toEqual([
      { id: "c1", date: "2026-10-01", description: "ACME, INC", amount: 12.5, currency: "USD" },
    ]);
  });
  it("returns nothing for an empty file", () => {
    expect(parseCharges("")).toEqual([]);
  });
  it("rejects a bad amount or a missing column", () => {
    expect(() => parseCharges("id,date,description,amount,currency\nc,d,x,abc,EUR")).toThrow();
    expect(() => parseCharges("id,date\n1,2")).toThrow();
  });
  it("handles escaped quotes", () => {
    expect(splitCsvLine('a,"b ""c""",d')).toEqual(["a", 'b "c"', "d"]);
  });
});
