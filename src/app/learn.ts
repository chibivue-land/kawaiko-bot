import type { JobOutcome, Kawaiko } from "./ports";
import { describeFailure } from "./ports";
import { speak } from "./generation";
import {
  EXTRACTOR_SYSTEM,
  MAX_OBSERVATIONS,
  MIN_OBSERVATIONS,
  buildExtractionPrompt,
  parseFacts,
  speakerIndex,
} from "../domain/learning";

/**
 * The learning pass: fold new observations of a server into durable facts.
 *
 * Runs on the hourly cron rather than per message, which caps it at one extra
 * generation an hour and — more usefully — makes each pass a single `batch` in
 * the log. That batch is the unit of rollback, and because the read cursor is
 * derived from surviving passes, undoing one rewinds the cursor with it.
 */
export async function runLearningPass(
  kawaiko: Kawaiko,
  opts?: { force?: boolean },
): Promise<JobOutcome> {
  if (!kawaiko.memory.available) {
    console.log("learn: no memory store bound, nothing to remember into");
    return { ok: true, skipped: "no-database" };
  }

  const { allowed, spentUsd } = await kawaiko.budget.allows();
  if (!allowed) {
    console.warn(`learn: monthly budget exceeded (spent ~$${spentUsd.toFixed(2)}), skipping`);
    return { ok: true, skipped: "budget" };
  }

  try {
    const guilds = await kawaiko.memory.guilds();
    if (guilds.length === 0) {
      console.log("learn: no observed servers yet");
      return { ok: true, skipped: "no-observations" };
    }
    let model: string | undefined;
    for (const guildId of guilds) {
      model = (await learnGuild(kawaiko, guildId, opts?.force ?? false)) ?? model;
    }
    await kawaiko.budget.finish("learn", true, undefined, model);
    return { ok: true };
  } catch (err) {
    console.error("learn failed:", err);
    const error = describeFailure(err);
    await kawaiko.budget.finish("learn", false, error);
    return { ok: false, error };
  }
}

async function learnGuild(
  kawaiko: Kawaiko,
  guildId: string,
  force: boolean,
): Promise<string | undefined> {
  const cursor = await kawaiko.memory.learnCursor(guildId);
  const observations = await kawaiko.memory.unlearned(guildId, cursor, MAX_OBSERVATIONS);
  // A quiet hour costs nothing: without enough new conversation there is
  // nothing to conclude, and no model is called at all.
  if (observations.length < (force ? 1 : MIN_OBSERVATIONS)) {
    console.log(`learn: ${guildId} has only ${observations.length} new messages, waiting`);
    return undefined;
  }

  const { text, costUsd, model } = await speak(kawaiko.generator, {
    system: EXTRACTOR_SYSTEM,
    prompt: buildExtractionPrompt(observations),
    effort: "low",
    maxTokens: 512,
  });
  await kawaiko.budget.record(costUsd);

  const batch = kawaiko.newBatchId();
  const observedThrough = observations[observations.length - 1]!.seq;
  const result = await kawaiko.memory.appendLearned({
    guildId,
    batch,
    facts: parseFacts(text, speakerIndex(observations)),
    observedThrough,
    model,
  });
  console.log(
    `learn: ${guildId} batch=${batch} read=${observations.length} through=${observedThrough} ` +
      `learned=${result.learned} refined=${result.refined} skipped=${result.skipped} (~$${costUsd.toFixed(4)})`,
  );
  return model;
}
