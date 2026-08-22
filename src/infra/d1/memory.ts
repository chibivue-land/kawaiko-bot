import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { MemoryStore } from "../../app/ports";
import { describeFailure } from "../../app/ports";
import {
  type AppendResult,
  type BatchSummary,
  type Fact,
  type LearnedFact,
  type Observation,
  type ObservationInput,
  MAX_FACTS_IN_PROMPT,
  normalizeFactBody,
  planFactMerge,
} from "../../domain/memory";
import { liveLearnRun, memoryEvents, memoryLive, observations } from "./schema";
import { nowInstant } from "../../domain/time";

/**
 * MemoryStore backed by D1 through Drizzle.
 *
 * Every method is failure-tolerant on purpose: remembering is a side quest, and
 * a database hiccup must never stop kawaiko from answering. Callers get an
 * empty result and a warning in the log instead of an exception.
 */
export function d1MemoryStore(db: D1Database): MemoryStore {
  const orm = drizzle(db);
  return new D1MemoryStore(orm);
}

class D1MemoryStore implements MemoryStore {
  readonly available = true;

  constructor(private readonly db: DrizzleD1Database) {}

  async observe(rows: readonly ObservationInput[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      // Ignore duplicates on message_id so replaying an overlapping window is
      // harmless — and keeps the first-seen content rather than a later edit.
      await this.db
        .insert(observations)
        .values(
          rows.map((row) => ({
            guildId: row.guildId,
            channelId: row.channelId,
            messageId: row.messageId,
            authorId: row.authorId,
            authorLabel: row.authorLabel,
            isKawaiko: row.isKawaiko ? 1 : 0,
            content: row.content,
            at: row.at,
          })),
        )
        .onConflictDoNothing();
    } catch (err) {
      console.warn("memory: failed to record observations:", describeFailure(err));
    }
  }

  async liveFacts(guildId: string, opts?: { subjectId?: string; limit?: number }): Promise<Fact[]> {
    try {
      const rows = await this.db
        .select()
        .from(memoryLive)
        .where(eq(memoryLive.guildId, guildId))
        // Anything about the person being answered comes first; it is the part
        // most likely to matter right now.
        .orderBy(
          desc(
            sql`${memoryLive.subjectId} IS NOT NULL AND ${memoryLive.subjectId} = ${opts?.subjectId ?? ""}`,
          ),
          desc(memoryLive.seq),
        )
        .limit(opts?.limit ?? MAX_FACTS_IN_PROMPT);
      return rows.map((row): Fact => ({
        seq: row.seq,
        subjectKind: row.subjectKind ?? "server",
        subjectId: row.subjectId,
        subjectLabel: row.subjectLabel,
        body: row.body ?? "",
        at: row.at,
      }));
    } catch (err) {
      console.warn("memory: failed to read live facts:", describeFailure(err));
      return [];
    }
  }

  async guilds(limit = 20): Promise<string[]> {
    try {
      const rows = await this.db
        .select({ guildId: observations.guildId, latest: sql<number>`MAX(${observations.seq})` })
        .from(observations)
        .groupBy(observations.guildId)
        .orderBy(desc(sql`latest`))
        .limit(limit);
      return rows.map((row) => row.guildId);
    } catch (err) {
      console.warn("memory: failed to list guilds:", describeFailure(err));
      return [];
    }
  }

  async learnCursor(guildId: string): Promise<number> {
    try {
      const [row] = await this.db
        .select({ cursor: sql<number | null>`MAX(${memoryEvents.observedThrough})` })
        .from(memoryEvents)
        .where(and(eq(memoryEvents.guildId, guildId), liveLearnRun));
      return row?.cursor ?? 0;
    } catch (err) {
      console.warn("memory: failed to read the learn cursor:", describeFailure(err));
      return 0;
    }
  }

  async unlearned(guildId: string, afterSeq: number, limit = 60): Promise<Observation[]> {
    try {
      const rows = await this.db
        .select()
        .from(observations)
        .where(and(eq(observations.guildId, guildId), gt(observations.seq, afterSeq)))
        .orderBy(asc(observations.seq))
        .limit(limit);
      return rows.map((row): Observation => ({
        seq: row.seq,
        channelId: row.channelId,
        authorId: row.authorId,
        authorLabel: row.authorLabel,
        isKawaiko: row.isKawaiko === 1,
        content: row.content,
        at: row.at,
      }));
    } catch (err) {
      console.warn("memory: failed to read observations:", describeFailure(err));
      return [];
    }
  }

  async appendLearned(args: {
    guildId: string;
    batch: string;
    facts: readonly LearnedFact[];
    observedThrough: number;
    model?: string;
  }): Promise<AppendResult> {
    const result: AppendResult = { learned: 0, refined: 0, skipped: 0 };
    // Reconcile against everything believed, not just the prompt-sized slice.
    const known = await this.liveFacts(args.guildId, { limit: 500 });
    const now = nowInstant().epochMilliseconds;
    const rows: (typeof memoryEvents.$inferInsert)[] = [];

    for (const fact of args.facts) {
      const merge = planFactMerge(fact, known);
      if (merge.action === "skip") {
        result.skipped++;
        continue;
      }
      if (merge.action === "refine") result.refined++;
      else result.learned++;
      rows.push({
        guildId: args.guildId,
        at: now,
        batch: args.batch,
        kind: "learn",
        subjectKind: fact.subjectKind,
        subjectId: fact.subjectId ?? null,
        subjectLabel: fact.subjectLabel ?? null,
        body: normalizeFactBody(fact.body),
        supersedes: merge.action === "refine" ? merge.supersedes : null,
        sourceChannelId: fact.sourceChannelId ?? null,
        sourceMessageId: fact.sourceMessageId ?? null,
        model: args.model ?? null,
      });
    }

    // Always close the pass, even when it learned nothing: otherwise the cursor
    // never advances and the same messages get re-read forever.
    rows.push({
      guildId: args.guildId,
      at: now,
      batch: args.batch,
      kind: "learn_run",
      observedThrough: args.observedThrough,
      model: args.model ?? null,
    });

    try {
      await this.db.insert(memoryEvents).values(rows);
    } catch (err) {
      console.warn("memory: failed to append learned facts:", describeFailure(err));
      return { learned: 0, refined: 0, skipped: 0 };
    }
    return result;
  }

  async batches(guildId: string, limit = 20): Promise<BatchSummary[]> {
    try {
      const rows = await this.db.run(sql`
        SELECT e.batch                                              AS batch,
               MAX(e.at)                                            AS at,
               SUM(CASE WHEN e.kind = 'learn' THEN 1 ELSE 0 END)    AS facts,
               MAX(e.observed_through)                              AS observed_through,
               SUM(CASE WHEN l.seq IS NOT NULL THEN 1 ELSE 0 END)   AS live
          FROM memory_events e
          LEFT JOIN memory_live l ON l.seq = e.seq
         WHERE e.guild_id = ${guildId} AND e.kind IN ('learn', 'learn_run')
         GROUP BY e.batch
         ORDER BY at DESC
         LIMIT ${limit}`);
      return (rows.results as unknown as RawBatch[]).map((row): BatchSummary => ({
        batch: row.batch,
        at: row.at,
        facts: row.facts,
        observedThrough: row.observed_through,
        live: row.live,
      }));
    } catch (err) {
      console.warn("memory: failed to summarize batches:", describeFailure(err));
      return [];
    }
  }

  /** Undo one learning pass. The rows stay; they just stop counting. */
  async retractBatch(guildId: string, batch: string, note?: string): Promise<boolean> {
    return this.appendUndo({
      guildId,
      batch: `retract:${batch}`,
      kind: "retract_batch",
      targetBatch: batch,
      note: note ?? null,
    });
  }

  /** Restore this server's knowledge to the state it had at `seq`. */
  async rollbackTo(guildId: string, seq: number, note?: string): Promise<boolean> {
    return this.appendUndo({
      guildId,
      batch: `rollback:${seq}`,
      kind: "rollback",
      targetSeq: seq,
      note: note ?? null,
    });
  }

  private async appendUndo(row: Omit<typeof memoryEvents.$inferInsert, "at">): Promise<boolean> {
    try {
      await this.db.insert(memoryEvents).values({ ...row, at: nowInstant().epochMilliseconds });
      return true;
    } catch (err) {
      console.warn(`memory: failed to append ${row.kind}:`, describeFailure(err));
      return false;
    }
  }
}

interface RawBatch {
  batch: string;
  at: number;
  facts: number;
  observed_through: number | null;
  live: number;
}

/**
 * Stand-in for when no database is bound. Everything no-ops, so the use cases
 * stay free of "if (env.DB)" and the Worker runs unchanged before provisioning.
 */
export const NO_MEMORY: MemoryStore = {
  available: false,
  async observe() {},
  async liveFacts() {
    return [];
  },
  async guilds() {
    return [];
  },
  async learnCursor() {
    return 0;
  },
  async unlearned() {
    return [];
  },
  async appendLearned() {
    return { learned: 0, refined: 0, skipped: 0 };
  },
  async batches() {
    return [];
  },
  async retractBatch() {
    return false;
  },
  async rollbackTo() {
    return false;
  },
};
