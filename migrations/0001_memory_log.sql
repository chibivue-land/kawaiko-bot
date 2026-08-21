-- kawaiko's long-term memory of a Discord server.
--
-- Two append-only logs. Nothing here is ever UPDATEd or DELETEd: correcting a
-- memory means appending a newer event that supersedes or retracts an older
-- one. That is what makes a rollback a single INSERT rather than a restore,
-- and it means the reason for every change stays readable after the fact.
--
-- Everything is scoped by guild_id (the Discord server), never by channel:
-- kawaiko learns about the server as a whole. The channel-level
-- "@kawaiko reset" (ChannelMemory in src/do.ts) deliberately does not touch
-- any of this — that command drops the current conversation, not knowledge.

-- ---------------------------------------------------------------------------
-- 1. observations — the raw substrate. Verbatim, never interpreted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observations (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT    NOT NULL,
  channel_id   TEXT    NOT NULL,
  message_id   TEXT    NOT NULL UNIQUE,
  author_id    TEXT    NOT NULL,
  author_label TEXT    NOT NULL,
  -- 1 when kawaiko said it. Its own lines are the input to the repetition guard.
  is_kawaiko   INTEGER NOT NULL DEFAULT 0,
  content      TEXT    NOT NULL,
  at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS observations_guild_seq ON observations (guild_id, seq);
CREATE INDEX IF NOT EXISTS observations_author ON observations (guild_id, author_id, seq DESC);

-- ---------------------------------------------------------------------------
-- 2. memory_events — what kawaiko concluded. Append-only, foldable, revertible.
--
-- kind:
--   learn         a durable fact. `supersedes` points at the revision it replaces.
--   retract       kill one fact (target_seq).
--   retract_batch kill a whole learning run (target_batch) — the usual "that
--                 pass produced garbage" undo.
--   rollback      restore to an offset: every `learn` with target_seq < seq <
--                 this row's seq stops counting. Only `learn` rows are affected,
--                 so a rollback un-learns without un-forgetting.
--   learn_run     bookkeeping: how far into `observations` a pass consumed.
--                 The cursor is MAX(observed_through) over live runs, so
--                 rolling a batch back also rewinds the cursor and the same
--                 messages get read again.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_events (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT, -- also the rollback offset
  guild_id      TEXT    NOT NULL,
  at            INTEGER NOT NULL,
  -- One id per learning pass: the natural unit of rollback.
  batch         TEXT    NOT NULL,
  kind          TEXT    NOT NULL
    CHECK (kind IN ('learn', 'retract', 'retract_batch', 'rollback', 'learn_run')),
  subject_kind  TEXT CHECK (subject_kind IN ('user', 'topic', 'channel', 'server')),
  subject_id    TEXT,
  subject_label TEXT,
  body          TEXT,
  supersedes    INTEGER,  -- learn: the seq this revision replaces
  target_seq    INTEGER,  -- retract: the seq to kill. rollback: the restore point
  target_batch  TEXT,     -- retract_batch: the batch to kill
  observed_through INTEGER, -- learn_run: highest observations.seq consumed
  source_channel_id TEXT,
  source_message_id TEXT,
  model         TEXT,
  note          TEXT      -- why; free text, for retract/rollback especially
);

CREATE INDEX IF NOT EXISTS memory_events_guild_kind ON memory_events (guild_id, kind, seq);
CREATE INDEX IF NOT EXISTS memory_events_subject ON memory_events (guild_id, subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS memory_events_batch ON memory_events (guild_id, batch);

-- ---------------------------------------------------------------------------
-- 3. memory_kept — learn events that survived retraction and rollback.
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS memory_kept AS
SELECT e.*
FROM memory_events e
WHERE e.kind = 'learn'
  AND NOT EXISTS (
    SELECT 1 FROM memory_events r
    WHERE r.guild_id = e.guild_id AND r.kind = 'retract' AND r.target_seq = e.seq
  )
  AND NOT EXISTS (
    SELECT 1 FROM memory_events r
    WHERE r.guild_id = e.guild_id AND r.kind = 'retract_batch' AND r.target_batch = e.batch
  )
  AND NOT EXISTS (
    SELECT 1 FROM memory_events b
    WHERE b.guild_id = e.guild_id AND b.kind = 'rollback'
      AND e.seq > b.target_seq AND e.seq < b.seq
  );

-- ---------------------------------------------------------------------------
-- 4. memory_live — what kawaiko currently believes.
--
-- A fact dies when a *surviving* revision supersedes it. Checking against
-- memory_kept rather than memory_events is deliberate: if the replacement is
-- rolled back, the original comes back rather than both vanishing.
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS memory_live AS
SELECT k.*
FROM memory_kept k
WHERE NOT EXISTS (
  SELECT 1 FROM memory_kept n
  WHERE n.guild_id = k.guild_id AND n.supersedes = k.seq
);
