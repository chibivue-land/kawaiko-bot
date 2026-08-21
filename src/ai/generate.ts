import { GoogleGenAI } from "@google/genai";
import type { Env } from "../env";
import { estimateCostUsd } from "./cost";
import { EMPTY_RESPONSE_LINES, REFUSAL_LINES, pickLine } from "../lines";

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
}

const DEFAULT_MODELS =
  "gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite";

/** Errors worth falling back to the next model for (quota / availability). */
function isFallbackError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = `${err.name} ${err.message}`;
  return /\b(429|404|403|RESOURCE_EXHAUSTED|NOT_FOUND|PERMISSION_DENIED|quota)\b/i.test(text);
}

/**
 * Generate one kawaiko utterance with the Gemini Interactions API.
 * Browsing is provided by the built-in google_search tool (grounding).
 * KAWAIKO_MODEL is a comma-separated preference list; models that reject the
 * request with quota/availability errors (e.g. no free-tier quota) are
 * skipped in favor of the next entry.
 */
export async function generate(env: Env, options: GenerateOptions): Promise<GenerateResult> {
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const models = (env.KAWAIKO_MODEL || DEFAULT_MODELS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  let lastError: unknown;
  for (const model of models) {
    try {
      return await generateWith(client, model, options);
    } catch (err) {
      lastError = err;
      if (isFallbackError(err)) {
        console.warn(`generate: ${model} unavailable, trying next:`, String(err));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function generateWith(
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
    return { text: pickLine(REFUSAL_LINES), costUsd };
  }

  const text = interaction.output_text?.trim() ?? "";
  return { text: text || pickLine(EMPTY_RESPONSE_LINES), costUsd };
}
