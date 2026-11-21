import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "./db";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(path.dirname(file), { recursive: true });
});

function tempFile(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "probata-db-")), "app.db");
  files.push(file);
  return file;
}

const columns = (file: string) => {
  const db = openDb(file);
  const names = (db.prepare("PRAGMA table_info(invoices)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  db.close();
  return names;
};

describe("openDb", () => {
  it("creates the schema with the channel columns on a new file", () => {
    expect(columns(tempFile())).toEqual(expect.arrayContaining(["source", "origin"]));
  });

  it("adds the channel columns to a database created before they existed", () => {
    const file = tempFile();
    const old = new Database(file);
    old.exec(
      "CREATE TABLE invoices (id INTEGER PRIMARY KEY, run_id INTEGER, file_name TEXT, supplier_id TEXT, extracted TEXT, status TEXT)",
    );
    old.prepare("INSERT INTO invoices (file_name, extracted) VALUES ('a.pdf', '{}')").run();
    old.close();
    expect(columns(file)).toEqual(expect.arrayContaining(["source", "origin"]));
    const db = openDb(file);
    expect(db.prepare("SELECT file_name, source FROM invoices").get()).toEqual({
      file_name: "a.pdf",
      source: null,
    });
    db.close();
  });

  it("can be opened twice without failing", () => {
    const file = tempFile();
    columns(file);
    expect(() => columns(file)).not.toThrow();
  });
});
