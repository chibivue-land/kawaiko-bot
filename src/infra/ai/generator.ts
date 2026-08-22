import type { GenerationRequest, Generated, TextGenerator } from "../../app/ports";
import { describeFailure } from "../../app/ports";
import type { ModelProvider } from "./provider";

/**
 * A TextGenerator over an ordered preference list of models.
 *
 * Every model is tried in turn and **any** failure hands off to the next one.
 * That is deliberate and was learned the hard way: this used to match error
 * text against a list of "retryable" codes and went down the day Workers AI
 * answered "AiError: 4006: you have used up your daily free allocation of
 * 10,000 neurons" — a message containing none of them. Failure modes are not
 * enumerable in advance, so only the last model's failure is fatal.
 */
export function fallbackGenerator(
  providers: readonly ModelProvider[],
  models: readonly string[],
): TextGenerator {
  return {
    async generate(request: GenerationRequest): Promise<Generated> {
      let lastError: unknown = new Error("no models configured");
      for (const [index, model] of models.entries()) {
        const provider = providers.find((p) => p.handles(model));
        if (!provider) {
          console.warn(`generator: no provider handles "${model}", skipping`);
          continue;
        }
        try {
          return await provider.run(model, request);
        } catch (err) {
          lastError = err;
          console.warn(
            `generator: ${model} failed (${index + 1}/${models.length}): ${describeFailure(err)}`,
          );
        }
      }
      throw lastError;
    },
  };
}

/** Workers AI first (free daily allocation), Gemini as the paid-ish backstop. */
export const DEFAULT_MODELS =
  "@cf/google/gemma-4-26b-a4b-it,@cf/zai-org/glm-4.7-flash,gemini-3.5-flash-lite";

export function parseModelList(configured: string | undefined): string[] {
  return (configured || DEFAULT_MODELS)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}
