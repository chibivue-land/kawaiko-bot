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

/**
 * Generate one kawaiko utterance with the Gemini Interactions API.
 * Browsing is provided by the built-in google_search tool (grounding);
 * grounded prompts have a free monthly allowance on Gemini 3.x models.
 */
export async function generate(env: Env, options: GenerateOptions): Promise<GenerateResult> {
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const model = env.KAWAIKO_MODEL || "gemini-3.7-flash";

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
