-- kawaiko の，あるサーバーについての長期記憶．
--
-- 追記専用のログが 2 本．UPDATE も DELETE も一切しない．記憶を訂正するとは，
-- 古い出来事を置き換える / 取り消す新しい出来事を積むこと．だから巻き戻しが
-- 復元ではなく INSERT 1 本で済み，何をなぜ変えたかが後からも読める．
--
-- すべて guild_id (Discord のサーバー) 単位で，チャンネル単位ではない．kawaiko が
-- 学ぶのはサーバー全体についてだから．チャンネル単位の「@kawaiko reset」
-- (源/外界/DO/チャンネル記録.ts) はここに一切触れない．あれが落とすのは今の会話で
-- あって，知識ではない．

-- ---------------------------------------------------------------------------
-- 1. observations — 生の素材．言われたことそのまま，解釈しない．
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observations (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,

  guild_id     TEXT    NOT NULL,

  channel_id   TEXT    NOT NULL,

  message_id   TEXT    NOT NULL UNIQUE,

  author_id    TEXT    NOT NULL,

  author_label TEXT    NOT NULL,
  -- kawaiko が言ったときに 1．自分の発言は反復ガードの入力になる．
  is_kawaiko   INTEGER NOT NULL DEFAULT 0,

  content      TEXT    NOT NULL,

  at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS observations_guild_seq ON observations (guild_id, seq);
CREATE INDEX IF NOT EXISTS observations_author ON observations (guild_id, author_id, seq DESC);

-- ---------------------------------------------------------------------------
-- 2. memory_events — kawaiko が結論したこと．追記専用・畳み込み可能・取り消し可能．
--
-- kind:
--   learn         持続的な事実．`supersedes` が，置き換える改訂元を指す．
--   retract       事実を 1 つ消す (target_seq)．
--   retract_batch 学習 1 回ぶんをまとめて消す (target_batch)．「あの回は駄目だった」
--                 という，いちばんよくある取り消し．
--   rollback      ある位置へ戻す．target_seq < seq < この行の seq の `learn` が
--                 数えられなくなる．効くのは `learn` 行だけなので，巻き戻しは
--                 「学んだことを解く」であって「忘れたことを思い出す」ではない．
--   learn_run     帳簿．その回が observations をどこまで読んだか．読み取り位置は
--                 生きている回の MAX(observed_through) なので，回を取り消すと
--                 位置も巻き戻り，同じ発言をもう一度読み直す．
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_events (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT, -- ロールバックの位置でもある

  guild_id      TEXT    NOT NULL,

  at            INTEGER NOT NULL,
  -- 学習 1 回につき 1 つ．ロールバックの自然な単位．
  batch         TEXT    NOT NULL,

  kind          TEXT    NOT NULL

    CHECK (kind IN ('learn', 'retract', 'retract_batch', 'rollback', 'learn_run')),

  subject_kind  TEXT CHECK (subject_kind IN ('user', 'topic', 'channel', 'server')),

  subject_id    TEXT,

  subject_label TEXT,

  body          TEXT,

  supersedes    INTEGER,  -- learn: この改訂が置き換える連番

  target_seq    INTEGER,  -- retract: 消す連番。rollback: 戻る位置

  target_batch  TEXT,     -- retract_batch: 消す回

  observed_through INTEGER, -- learn_run: そこまで読んだ observations.seq

  source_channel_id TEXT,

  source_message_id TEXT,

  model         TEXT,

  note          TEXT      -- 理由。自由記述。特に retract / rollback 用
);

CREATE INDEX IF NOT EXISTS memory_events_guild_kind ON memory_events (guild_id, kind, seq);
CREATE INDEX IF NOT EXISTS memory_events_subject ON memory_events (guild_id, subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS memory_events_batch ON memory_events (guild_id, batch);

-- ---------------------------------------------------------------------------
-- 3. memory_kept — 取り消しとロールバックを生き延びた learn 行．
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
-- 4. memory_live — kawaiko がいま信じていること．
--
-- 事実が死ぬのは，**生き残っている**改訂に置き換えられたとき．memory_events では
-- なく memory_kept と突き合わせているのは意図的で，置き換えた側が巻き戻されたら
-- 元の事実が復活する (両方消えるのではなく)．
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS memory_live AS
SELECT k.*
FROM memory_kept k
WHERE NOT EXISTS (
  SELECT 1 FROM memory_kept n
  WHERE n.guild_id = k.guild_id AND n.supersedes = k.seq
);
