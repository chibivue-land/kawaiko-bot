import { describe, expect, it } from "vitest";
import { runMemoryAdmin } from "./memory-admin";
import { fakeKawaiko, fakeMemory } from "../testing/fakes";

describe("runMemoryAdmin", () => {
  it("says so when no store is bound", async () => {
    const kawaiko = fakeKawaiko({ memory: fakeMemory({ available: false }) });
    const result = await runMemoryAdmin(kawaiko, { kind: "guilds" });
    expect(result.status).toBe(503);
  });

  it("lists the servers kawaiko has observed", async () => {
    const result = await runMemoryAdmin(fakeKawaiko(), { kind: "guilds" });
    expect(result).toEqual({ status: 200, body: { guilds: ["guild-1"] } });
  });

  it("reports what it believes plus the batches to undo", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.memory.facts = [
      {
        seq: 3,
        subjectKind: "server",
        subjectId: null,
        subjectLabel: null,
        body: "深夜は過疎",
        at: 0,
      },
    ];
    const result = await runMemoryAdmin(kawaiko, { kind: "state", guildId: "guild-1" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ guild: "guild-1", cursor: 0, batches: [] });
  });

  it("undoes one learning pass", async () => {
    const result = await runMemoryAdmin(fakeKawaiko(), {
      kind: "retract-batch",
      guildId: "guild-1",
      batch: "batch-1",
    });
    expect(result).toEqual({ status: 200, body: { ok: true, retracted: "batch-1" } });
  });

  it("restores knowledge to an offset", async () => {
    const result = await runMemoryAdmin(fakeKawaiko(), {
      kind: "rollback",
      guildId: "guild-1",
      seq: 42,
    });
    expect(result).toEqual({ status: 200, body: { ok: true, restoredTo: 42 } });
  });

  it("surfaces a store that refused the undo", async () => {
    const memory = fakeMemory();
    memory.rollbackTo = async () => false;
    const result = await runMemoryAdmin(fakeKawaiko({ memory }), {
      kind: "rollback",
      guildId: "guild-1",
      seq: 42,
    });
    expect(result.status).toBe(500);
  });
});
