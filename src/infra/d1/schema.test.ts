import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { memoryEvents, observations } from "./schema";
import migration from "../../../migrations/0001_memory_log.sql?raw";

/**
 * The migration is hand-written because the two views fold retraction,
 * supersession and rollback in more SQL than the schema builder should be asked
 * to express — so Drizzle declares them `.existing()` and the DDL lives in
 * migrations/. That leaves two descriptions of the same tables, which is
 * exactly the sort of thing that drifts silently. This test is the seam.
 */

/** The body of one CREATE TABLE statement in the migration. */
function createTable(name: string): string {
  const match = new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(([\\s\\S]*?)\\n\\);`).exec(
    migration,
  );
  expect(match, `no CREATE TABLE for ${name}`).toBeTruthy();
  return match![1]!;
}

const TABLES = [observations, memoryEvents];

describe("the Drizzle schema and the migration describe the same tables", () => {
  it.each(TABLES.map((table) => [getTableConfig(table).name, table] as const))(
    "%s has matching columns",
    (name, table) => {
      const ddl = createTable(name);
      const declared = getTableConfig(table).columns.map((column) => column.name);
      for (const column of declared) {
        expect(ddl, `${name}.${column} missing from the migration`).toContain(column);
      }
      // And nothing in the migration that Drizzle does not know about: every
      // line that opens a column definition must be a column Drizzle declares.
      const inSql = ddl
        .split("\n")
        .map((line) => /^\s{2}(\w+)\s+(INTEGER|TEXT|REAL)/.exec(line.trim() ? line : "")?.[1])
        .filter((column): column is string => Boolean(column));
      expect(new Set(inSql)).toEqual(new Set(declared));
    },
  );

  it.each(TABLES.map((table) => [getTableConfig(table).name, table] as const))(
    "%s has matching indexes",
    (name, table) => {
      for (const index of getTableConfig(table).indexes) {
        expect(migration, `index ${index.config.name} missing from the migration`).toContain(
          index.config.name,
        );
      }
    },
  );

  it("keeps the message_id uniqueness that makes replaying a window safe", () => {
    expect(createTable("observations")).toMatch(/message_id\s+TEXT\s+NOT NULL\s+UNIQUE/);
    expect(
      getTableConfig(observations).columns.find((c) => c.name === "message_id")?.isUnique,
    ).toBe(true);
  });

  it("declares the views the fold depends on", () => {
    expect(migration).toContain("CREATE VIEW IF NOT EXISTS memory_kept");
    expect(migration).toContain("CREATE VIEW IF NOT EXISTS memory_live");
  });
});
