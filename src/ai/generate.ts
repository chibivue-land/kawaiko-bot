import { GoogleGenAI } from "@google/genai";
import type { Env } from "../env";
import { estimateCostUsd } from "./cost";
import {
  EMPTY_RESPONSE_LINES,
  LEAK_DEFLECTION_LINES,
  REFUSAL_LINES,
  REPETITION_BREAK_LINES,
  pickLine,
} from "../lines";
import { leaksSystemPrompt } from "../leakguard";
import { RETRY_NUDGE, isRepetitive, repetitionScore } from "../repetition";

export interface GenerateOptions {
  system: string;
  prompt: string;
  /** > 0 enables Google Search grounding (Gemini has no per-call use cap). */
  maxSearches?: number;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  /** Estimated cost (USD) for this request. */
  costUsd: number;
  /** The model that actually served the response. */
  model: string;
}

// Workers AI first (no API key, free daily allocation on the Cloudflare
// account itself); Gemini entries kick in only if a key with quota exists.
const DEFAULT_MODELS =
  "@cf/google/gemma-4-26b-a4b-it,@cf/zai-org/glm-4.7-flash,gemini-3.5-flash-lite";

/** Readable one-liner for a failure from any provider, for logs and /status. */
function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.trim();
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Generate one kawaiko utterance.
 * Browsing is provided by the built-in google_search tool (grounding).
 * KAWAIKO_MODEL is a comma-separated preference list tried in order: any model
 * that fails for any reason hands off to the next one, and only the last
 * failure propagates.
 */
export async function generate(env: Env, options: GenerateOptions): Promise<GenerateResult> {
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const models = (env.KAWAIKO_MODEL || DEFAULT_MODELS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    try {
      const result = model.startsWith("@cf/")
        ? await generateWithWorkersAi(env, model, options)
        : await generateWithGemini(client, model, options);
      // Never let the system prompt (or corpus) reach Discord verbatim.
      if (leaksSystemPrompt(result.text, options.system)) {
        console.warn("generate: blocked a system-prompt leak");
        return { ...result, text: pickLine(LEAK_DEFLECTION_LINES) };
      }
      return result;
    } catch (err) {
      // Always fall through. The preference list exists precisely so one
      // provider running dry does not take kawaiko down, and the failure modes
      // are not enumerable in advance: this used to match error text against a
      // list of "retryable" codes and went down the day Workers AI answered
      // "AiError: 4006: you have used up your daily free allocation of 10,000
      // neurons" — a message with none of those codes in it. Only the last
      // model's failure is fatal now.
      lastError = err;
      console.warn(
        `generate: ${model} failed (${index + 1}/${models.length}): ${describeError(err)}`,
      );
    }
  }
  throw lastError;
}

/**
 * Attempts (including the first) before we settle for the least repetitive one.
 * Kept at 2: every retry is another full generation against a small daily free
 * allocation, and one re-roll already breaks the overwhelming majority of loops.
 */
const VARIED_ATTEMPTS = 2;
/** At or above this, the "fresh" pick is still effectively the same sentence. */
const HARD_REPEAT_SCORE = 0.9;

/**
 * `generate`, but refusing to hand back something kawaiko just said.
 *
 * The channel transcript in the prompt contains kawaiko's own lines, and small
 * models happily lock onto that as a template — which is how a channel ends up
 * receiving the same sentence skeleton forever. Retry with an explicit nudge,
 * keep the least repetitive candidate, and bail out to a canned break line if
 * even that is a verbatim repeat. Cost is summed across attempts so the budget
 * tracker still sees the real spend.
 */
export async function generateVaried(
  env: Env,
  options: GenerateOptions,
  avoid: readonly string[],
): Promise<GenerateResult> {
  if (avoid.length === 0) return generate(env, options);

  let best: GenerateResult | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let costUsd = 0;

  for (let attempt = 0; attempt < VARIED_ATTEMPTS; attempt++) {
    let result: GenerateResult;
    try {
      result = await generate(
        env,
        attempt === 0 ? options : { ...options, prompt: `${options.prompt}\n\n${RETRY_NUDGE}` },
      );
    } catch (err) {
      // A re-roll is a nice-to-have: never drop a usable answer to get one.
      if (!best) throw err;
      console.warn(`generate: re-roll ${attempt + 1} failed, keeping the earlier line`);
      break;
    }
    costUsd += result.costUsd;
    const score = repetitionScore(result.text, avoid);
    if (score < bestScore) {
      best = result;
      bestScore = score;
    }
    if (!isRepetitive(result.text, avoid)) return { ...result, costUsd };
    console.warn(
      `generate: attempt ${attempt + 1} repeated a recent line (score ${score.toFixed(2)})`,
    );
  }

  const fallback = best!;
  if (bestScore >= HARD_REPEAT_SCORE) {
    console.warn("generate: every attempt was a verbatim repeat, breaking the loop");
    return { ...fallback, text: pickLine(REPETITION_BREAK_LINES), costUsd };
  }
  return { ...fallback, costUsd };
}

/** Workers AI chat models (OpenAI-compatible response; older ones use `response`). */
async function generateWithWorkersAi(
  env: Env,
  model: string,
  options: GenerateOptions,
): Promise<GenerateResult> {
  interface ChatResult {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }
  // env.AI.run is typed against the built-in model catalog; widen for arbitrary ids.
  const run = env.AI.run.bind(env.AI) as (
    model: string,
    inputs: Record<string, unknown>,
  ) => Promise<ChatResult>;

  const res = await run(model, {
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.prompt },
    ],
    max_completion_tokens: options.maxTokens ?? 1024,
    // GLM-family models read enable_thinking from chat_template_kwargs;
    // others honor reasoning_effort (wired to the caller's effort option).
    reasoning_effort: options.effort ?? "low",
    chat_template_kwargs: { enable_thinking: false },
  });

  const costUsd = estimateCostUsd(model, {
    total_input_tokens: res.usage?.prompt_tokens ?? 0,
    total_output_tokens: res.usage?.completion_tokens ?? 0,
  });
  // Strip any leaked reasoning block just in case the toggle is ignored.
  const raw = res.choices?.[0]?.message?.content ?? res.response ?? "";
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return { text: text || pickLine(EMPTY_RESPONSE_LINES), costUsd, model };
}

async function generateWithGemini(
  client: GoogleGenAI,
  model: string,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const interaction = await client.interactions.create({
    model,
    input: options.prompt,
    system_instruction: options.system,
    tools: (options.maxSearches ?? 0) > 0 ? [{ type: "google_search" }] : undefined,
    generation_config: {
      max_output_tokens: options.maxTokens ?? 2048,
      thinking_level: options.effort ?? "low",
    },
    // No need to persist interactions on Google's side.
    store: false,
  });

  const costUsd = estimateCostUsd(model, interaction.usage ?? {});

  if (interaction.status === "failed" || interaction.status === "incomplete") {
    return { text: pickLine(REFUSAL_LINES), costUsd, model };
  }

  const text = interaction.output_text?.trim() ?? "";
  return { text: text || pickLine(EMPTY_RESPONSE_LINES), costUsd, model };
}
