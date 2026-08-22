import type { Kawaiko } from "./ports";

/**
 * Reading and undoing what kawaiko has learned.
 *
 * The store is an append-only log, so every "undo" here is an append: nothing
 * is restored and nothing is lost, which is what makes these safe to run from
 * a phone at 3am.
 */

export type MemoryQuery =
  | { kind: "guilds" }
  | { kind: "state"; guildId: string }
  | { kind: "retract-batch"; guildId: string; batch: string; note?: string }
  | { kind: "rollback"; guildId: string; seq: number; note?: string };

export type MemoryAdminResult =
  | { status: 503; body: { error: string } }
  | { status: 200; body: unknown }
  | { status: 500; body: { ok: false } };

export async function runMemoryAdmin(
  kawaiko: Kawaiko,
  query: MemoryQuery,
): Promise<MemoryAdminResult> {
  if (!kawaiko.memory.available) {
    return { status: 503, body: { error: "no memory store bound" } };
  }
  switch (query.kind) {
    case "guilds":
      return { status: 200, body: { guilds: await kawaiko.memory.guilds() } };
    case "state":
      return {
        status: 200,
        body: {
          guild: query.guildId,
          cursor: await kawaiko.memory.learnCursor(query.guildId),
          facts: await kawaiko.memory.liveFacts(query.guildId, { limit: 200 }),
          batches: await kawaiko.memory.batches(query.guildId),
        },
      };
    case "retract-batch": {
      const ok = await kawaiko.memory.retractBatch(query.guildId, query.batch, query.note);
      return ok
        ? { status: 200, body: { ok, retracted: query.batch } }
        : { status: 500, body: { ok: false } };
    }
    case "rollback": {
      const ok = await kawaiko.memory.rollbackTo(query.guildId, query.seq, query.note);
      return ok
        ? { status: 200, body: { ok, restoredTo: query.seq } }
        : { status: 500, body: { ok: false } };
    }
  }
}
