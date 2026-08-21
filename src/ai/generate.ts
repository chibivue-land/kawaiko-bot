import { GoogleGenAI } from "@google/genai";
import type { Env } from "../env";
import { estimateCostUsd } from "./cost";
import { EMPTY_RESPONSE_LINES, LEAK_DEFLECTION_LINES, REFUSAL_LINES, pickLine } from "../lines";
import { leaksSystemPrompt } from "../leakguard";

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

/** Errors worth falling back to the next model for (quota / availability). */
function isFallbackError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = `${err.name} ${err.message}`;
  return /\b(429|404|403|RESOURCE_EXHAUSTED|NOT_FOUND|PERMISSION_DENIED|quota|no such model|capacity)\b/i.test(
    text,
  );
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
    // Chat is latency-sensitive; keep reasoning off/minimal. GLM-family models
    // read enable_thinking from chat_template_kwargs; others use reasoning_effort.
    reasoning_effort: "low",
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
