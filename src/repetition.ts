/**
 * Deterministic output-side guard against kawaiko saying the same thing forever.
 *
 * The reply prompts feed the channel transcript back into the model, and that
 * transcript contains kawaiko's own past lines. Small models read a run of
 * similarly-shaped self-lines as a few-shot template and lock onto it, so a
 * single channel can end up receiving the same sentence skeleton
 * (「〇〇さん，それはあまりに〜〜」) no matter what anyone says. A prompt-side
 * 「同じことを繰り返さない」is far too weak to break that loop, so we measure
 * the overlap ourselves and let the caller regenerate.
 */

/** Bigram (Dice) overlap at or above this counts as "the same thing again". */
export const SIMILAR_THRESHOLD = 0.6;
/** Sharing a normalized opening this long is a template lock-in on its own. */
const OPENING_LENGTH = 7;
/** Score assigned to a shared opening, regardless of what follows it. */
const OPENING_MATCH_SCORE = 0.75;
/** Shorter than this, only exact matches count (短文は偶然かぶる)。 */
const MIN_COMPARABLE_LENGTH = 6;
/** How many past self-lines to show the model / compare against. */
export const AVOID_LIMIT = 6;

/**
 * Strip everything that varies between two instances of the same template:
 * mentions, emoji, links, punctuation, and the leading 「〇〇さん，」 address
 * (the name rotates per message, the skeleton behind it does not).
 */
export function normalizeLine(text: string): string {
  return (
    text
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(/<@!?&?\d+>/g, "")
      .replace(/https?:\/\/\S+/g, "")
      // Leading 「〇〇さん，」 address: the name rotates per message, the sentence
      // template behind it does not. Requires a delimiter after the honorific so
      // that words merely containing 「さん」 are left alone.
      .replace(
        /^\s*\S{1,24}?\s*(?:さん|くん|ちゃん|様|氏)(?=[、,，。．!！?？:：\s]|$)[、,，。．!！?？:：\s]*/u,
        "",
      )
      .replace(/[\s\p{P}\p{S}]/gu, "")
      .toLowerCase()
  );
}

function bigrams(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length - 1; i++) out.push(text.slice(i, i + 2));
  return out;
}

/** Dice coefficient over character bigrams (works well for Japanese). */
function dice(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return a === b ? 1 : 0;
  const pool = new Map<string, number>();
  for (const gram of left) pool.set(gram, (pool.get(gram) ?? 0) + 1);
  let hits = 0;
  for (const gram of right) {
    const remaining = pool.get(gram) ?? 0;
    if (remaining > 0) {
      pool.set(gram, remaining - 1);
      hits++;
    }
  }
  return (2 * hits) / (left.length + right.length);
}

/** 0 (nothing in common) .. 1 (identical) against the most similar past line. */
export function repetitionScore(text: string, previous: readonly string[]): number {
  const candidate = normalizeLine(text);
  if (!candidate) return 0;

  let worst = 0;
  for (const line of previous) {
    const past = normalizeLine(line);
    if (!past) continue;
    if (candidate === past) return 1;

    const shortest = Math.min(candidate.length, past.length);
    if (shortest < MIN_COMPARABLE_LENGTH) continue;

    let score = dice(candidate, past);
    if (
      shortest >= OPENING_LENGTH &&
      candidate.slice(0, OPENING_LENGTH) === past.slice(0, OPENING_LENGTH)
    ) {
      score = Math.max(score, OPENING_MATCH_SCORE);
    }
    worst = Math.max(worst, score);
  }
  return worst;
}

/** True when the reply is close enough to a recent one to feel like a loop. */
export function isRepetitive(text: string, previous: readonly string[]): boolean {
  return repetitionScore(text, previous) >= SIMILAR_THRESHOLD;
}

/** Prompt block naming the shapes the model must not reuse. Empty when nothing to avoid. */
export function buildAvoidBlock(previous: readonly string[]): string {
  const lines = previous
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .slice(0, AVOID_LIMIT);
  if (lines.length === 0) return "";
  return `

直近で kawaiko 自身が言ったこと (**書き出し・構文・オチをコピーするのは禁止**。同じ型を繰り返すと様式美が死ぬ):
${lines.map((line) => `- ${line.slice(0, 80)}`).join("\n")}`;
}

/** Appended to the prompt when a first attempt came back as a repeat. */
export const RETRY_NUDGE = `さっきの案は直前の自分の発言と同じ型だった。書き出し・構文・オチを全部変えて、別の角度で言い直して。相手の名前で呼びかける書き出しは使わない。`;
