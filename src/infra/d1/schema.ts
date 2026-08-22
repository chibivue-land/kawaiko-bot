import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, sqliteView, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema for kawaiko's long-term memory.
 *
 * The DDL of record is migrations/0001_memory_log.sql — including the two
 * views, whose fold is more SQL than Drizzle's builder should be asked to
 * express. The views are declared here as `.existing()` purely so reads are
 * typed. Keep the two in step when either changes.
 *
 * Model and semantics: domain-memory.ts.
 */

/** Raw messages, exactly as said. Never interpreted, never edited. */
export const observations = sqliteTable(
  "observations",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull().unique(),
    authorId: text("author_id").notNull(),
    authorLabel: text("author_label").notNull(),
    /** 1 when kawaiko said it; its own lines feed the repetition guard. */
    isKawaiko: integer("is_kawaiko").notNull().default(0),
    content: text("content").notNull(),
    at: integer("at").notNull(),
  },
  (table) => [
    index("observations_guild_seq").on(table.guildId, table.seq),
    index("observations_author").on(table.guildId, table.authorId, table.seq),
  ],
);

/**
 * What kawaiko concluded. Append-only: a correction is a `learn` row that
 * supersedes an older one, and an undo is a `retract` / `retract_batch` /
 * `rollback` row. Nothing here is ever UPDATEd or DELETEd.
 */
export const memoryEvents = sqliteTable(
  "memory_events",
  {
    /** Monotonic; doubles as the offset a rollback restores to. */
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    at: integer("at").notNull(),
    /** One id per learning pass: the unit of rollback. */
    batch: text("batch").notNull(),
    kind: text("kind", {
      enum: ["learn", "retract", "retract_batch", "rollback", "learn_run"],
    }).notNull(),
    subjectKind: text("subject_kind", { enum: ["user", "topic", "channel", "server"] }),
    subjectId: text("subject_id"),
    subjectLabel: text("subject_label"),
    body: text("body"),
    /** learn: the seq this revision replaces. */
    supersedes: integer("supersedes"),
    /** retract: the seq to kill. rollback: the restore point. */
    targetSeq: integer("target_seq"),
    /** retract_batch: the batch to kill. */
    targetBatch: text("target_batch"),
    /** learn_run: highest observations.seq consumed. */
    observedThrough: integer("observed_through"),
    sourceChannelId: text("source_channel_id"),
    sourceMessageId: text("source_message_id"),
    model: text("model"),
    note: text("note"),
  },
  (table) => [
    index("memory_events_guild_kind").on(table.guildId, table.kind, table.seq),
    index("memory_events_subject").on(table.guildId, table.subjectKind, table.subjectId),
    index("memory_events_batch").on(table.guildId, table.batch),
  ],
);

const liveColumns = {
  seq: integer("seq").notNull(),
  guildId: text("guild_id").notNull(),
  at: integer("at").notNull(),
  batch: text("batch").notNull(),
  subjectKind: text("subject_kind", { enum: ["user", "topic", "channel", "server"] }),
  subjectId: text("subject_id"),
  subjectLabel: text("subject_label"),
  body: text("body"),
  supersedes: integer("supersedes"),
};

/** `learn` rows that survived retraction and rollback. */
export const memoryKept = sqliteView("memory_kept", liveColumns).existing();

/** What kawaiko currently believes: memory_kept minus superseded rows. */
export const memoryLive = sqliteView("memory_live", liveColumns).existing();

/**
 * How far a surviving learning pass has read. Expressed here because it has to
 * skip retracted and rolled-back runs, which is the same fold the views apply.
 */
export const liveLearnRun = sql`
  memory_events.kind = 'learn_run'
  AND NOT EXISTS (
    SELECT 1 FROM memory_events r
     WHERE r.guild_id = memory_events.guild_id AND r.kind = 'retract_batch'
       AND r.target_batch = memory_events.batch
  )
  AND NOT EXISTS (
    SELECT 1 FROM memory_events b
     WHERE b.guild_id = memory_events.guild_id AND b.kind = 'rollback'
       AND memory_events.seq > b.target_seq AND memory_events.seq < b.seq
  )`;
