import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { crc32, writeZipSync } from "./zip-sync";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe("writeZipSync", () => {
  it("writes a zip that unzip can read back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zips-"));
    fs.writeFileSync(path.join(dir, "a.pdf"), "%PDF-1.4 a");
    fs.writeFileSync(path.join(dir, "b.pdf"), "%PDF-1.4 bb");
    const out = writeZipSync(
      [
        { path: path.join(dir, "a.pdf"), name: "a.pdf" },
        { path: path.join(dir, "b.pdf"), name: "b.pdf" },
      ],
      path.join(dir, "out", "p.zip"),
    );
    let listing = "";
    try {
      listing = execFileSync("unzip", ["-t", out]).toString();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return; // no unzip on this machine
      throw error;
    }
    expect(listing).toContain("No errors detected");
    expect(listing).toContain("a.pdf");
  });

  it("writes an empty zip", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zips-"));
    const out = writeZipSync([], path.join(dir, "e.zip"));
    expect(fs.statSync(out).size).toBe(22);
  });

  it("throws on a missing file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zips-"));
    expect(() =>
      writeZipSync([{ path: path.join(dir, "x.pdf"), name: "x.pdf" }], path.join(dir, "z.zip")),
    ).toThrow();
  });
});
