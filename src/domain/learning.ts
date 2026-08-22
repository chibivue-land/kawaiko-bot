import type { LearnedFact, Observation } from "./memory";
import extractorTemplate from "./learning-extractor.md?raw";
import requestTemplate from "./learning-request.md?raw";
import { render } from "./prompt";

/**
 * Turning conversation into durable facts: the extraction prompt and the
 * parsing of what comes back. Pure — calling a model is app-learn.ts's job.
 */

/** Facts per pass. kawaiko is not building a wiki. */
export const MAX_FACTS_PER_PASS = 3;
/** Below this there is not enough new conversation to conclude anything. */
export const MIN_OBSERVATIONS = 8;
/** Upper bound on one pass, which also bounds the prompt (and the cost). */
export const MAX_OBSERVATIONS = 60;
/** Longest a single extracted fact may be. */
const MAX_FACT_LINE = 100;

/**
 * Deliberately not the kawaiko persona: this step extracts, it does not
 * perform. The transcript it reads is untrusted user text, hence the framing.
 */
export const EXTRACTOR_SYSTEM: string = render(extractorTemplate, {
  maxFacts: String(MAX_FACTS_PER_PASS),
  maxLine: String(MAX_FACT_LINE),
}).trim();

/** `- [subject] fact`, tolerant of the bullets and brackets small models pick. */
const FACT_LINE = /^\s*[-*・•]?\s*[[［]([^\]］]{1,40})[\]］]\s*[:：]?\s*(.+?)\s*$/u;

const SERVER_LABELS = new Set(["server", "サーバー", "このサーバー", "全体", "guild"]);

export function buildExtractionPrompt(observations: readonly Observation[]): string {
  const window = observations
    .map(
      (o) =>
        `${o.isKawaiko ? "kawaiko" : o.authorLabel}: ${o.content.replace(/\s+/g, " ").slice(0, 200)}`,
    )
    .join("\n");
  return render(requestTemplate, { window, maxFacts: String(MAX_FACTS_PER_PASS) }).trim();
}

/** Display name -> Discord user id, for everyone who spoke in the window. */
export function speakerIndex(observations: readonly Observation[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const observation of observations) {
    if (observation.isKawaiko) continue;
    index.set(observation.authorLabel.toLowerCase(), observation.authorId);
  }
  return index;
}

/**
 * Parse model output into facts, resolving each subject against the people who
 * actually spoke (so a display name becomes a stable Discord user id).
 */
export function parseFacts(text: string, speakers: ReadonlyMap<string, string>): LearnedFact[] {
  const facts: LearnedFact[] = [];
  for (const line of text.split("\n")) {
    // Checked up front so every branch below is capped, server facts included.
    if (facts.length >= MAX_FACTS_PER_PASS) break;
    const match = FACT_LINE.exec(line);
    if (!match) continue;
    const label = match[1]!.trim();
    const body = match[2]!.trim();
    if (!body || body.length > MAX_FACT_LINE) continue;

    if (SERVER_LABELS.has(label.toLowerCase())) {
      facts.push({ subjectKind: "server", subjectLabel: "このサーバー", body });
      continue;
    }
    const userId = speakers.get(label.toLowerCase());
    facts.push(
      userId
        ? { subjectKind: "user", subjectId: userId, subjectLabel: label, body }
        : { subjectKind: "topic", subjectLabel: label, body },
    );
  }
  return facts;
}
