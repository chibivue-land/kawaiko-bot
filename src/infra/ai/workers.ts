import type { GenerationRequest, Generated } from "../../app/ports";
import type { ModelProvider } from "./provider";
import { estimateCostUsd } from "./cost";

/**
 * Cloudflare Workers AI. Model ids are prefixed "@cf/". No API key: it bills
 * against the account's own (small) daily free allocation of neurons.
 */
export function workersAiProvider(ai: Ai): ModelProvider {
  // env.AI.run is typed against the built-in model catalog; widen for arbitrary ids.
  const run = ai.run.bind(ai) as (
    model: string,
    inputs: Record<string, unknown>,
  ) => Promise<ChatResult>;

  return {
    name: "workers-ai",
    handles: (model) => model.startsWith("@cf/"),
    async run(model: string, request: GenerationRequest): Promise<Generated> {
      const res = await run(model, {
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        max_completion_tokens: request.maxTokens ?? 1024,
        // GLM-family models read enable_thinking from chat_template_kwargs;
        // others honor reasoning_effort (wired to the caller's effort option).
        reasoning_effort: request.effort ?? "low",
        chat_template_kwargs: { enable_thinking: false },
      });

      const costUsd = estimateCostUsd(model, {
        total_input_tokens: res.usage?.prompt_tokens ?? 0,
        total_output_tokens: res.usage?.completion_tokens ?? 0,
      });
      // Strip any leaked reasoning block in case the toggle was ignored.
      const raw = res.choices?.[0]?.message?.content ?? res.response ?? "";
      return { text: raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), costUsd, model };
    },
  };
}

/** OpenAI-compatible response; older Workers AI models use `response`. */
interface ChatResult {
  response?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
