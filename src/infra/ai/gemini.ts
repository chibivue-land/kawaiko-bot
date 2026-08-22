import { GoogleGenAI } from "@google/genai";
import type { GenerationRequest, Generated } from "../../app/ports";
import type { ModelProvider } from "./provider";
import { estimateCostUsd } from "./cost";

/**
 * The Gemini Interactions API. Browsing comes from the built-in google_search
 * tool (grounding) when the caller asks for it.
 */
export function geminiProvider(apiKey: string): ModelProvider {
  const client = new GoogleGenAI({ apiKey });
  return {
    name: "gemini",
    handles: (model) => model.startsWith("gemini-"),
    async run(model: string, request: GenerationRequest): Promise<Generated> {
      const interaction = await client.interactions.create({
        model,
        input: request.prompt,
        system_instruction: request.system,
        tools: request.search ? [{ type: "google_search" }] : undefined,
        generation_config: {
          max_output_tokens: request.maxTokens ?? 2048,
          thinking_level: request.effort ?? "low",
        },
        // No need to persist interactions on Google's side.
        store: false,
      });

      const costUsd = estimateCostUsd(model, interaction.usage ?? {});
      const refused = interaction.status === "failed" || interaction.status === "incomplete";
      return {
        text: refused ? "" : (interaction.output_text?.trim() ?? ""),
        costUsd,
        model,
        refused,
      };
    },
  };
}
