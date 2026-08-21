import { describe, expect, it, vi } from "vitest";
import { generate } from "../src/ai/generate";
import type { Env } from "../src/env";

/** Minimal Env with just what `generate` touches for "@cf/" models. */
function fakeEnv(models: string, run: (model: string) => Promise<unknown>): Env {
  return {
    KAWAIKO_MODEL: models,
    GEMINI_API_KEY: "test-key",
    AI: { run: (model: string) => run(model) },
  } as unknown as Env;
}

const OPTIONS = { system: "system", prompt: "prompt", maxSearches: 0 };

const reply = (text: string) => ({
  choices: [{ message: { content: text } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

describe("generate model fallback", () => {
  it("falls through on the daily-allocation error that took kawaiko down", async () => {
    // Verbatim from production: it matched none of the codes the old
    // "is this retryable?" check looked for, so the chain aborted instead of
    // trying the next model.
    const exhausted = new Error(
      "4006: you have used up your daily free allocation of 10,000 neurons, " +
        "please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.",
    );
    exhausted.name = "AiError";

    const run = vi.fn(async (model: string) => {
      if (model === "@cf/first") throw exhausted;
      return reply("二番目のモデルが答えた");
    });
    const result = await generate(fakeEnv("@cf/first,@cf/second", run), OPTIONS);

    expect(result.text).toBe("二番目のモデルが答えた");
    expect(result.model).toBe("@cf/second");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("falls through on an entirely unrecognized failure too", async () => {
    const run = vi.fn(async (model: string) => {
      if (model === "@cf/first") throw new Error("something nobody enumerated");
      return reply("生き残り");
    });
    const result = await generate(fakeEnv("@cf/first,@cf/second", run), OPTIONS);
    expect(result.text).toBe("生き残り");
  });

  it("propagates the last failure once every model is exhausted", async () => {
    const run = vi.fn(async (model: string) => {
      throw new Error(`${model} is down`);
    });
    await expect(generate(fakeEnv("@cf/a,@cf/b", run), OPTIONS)).rejects.toThrow("@cf/b is down");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stops at the first model that works", async () => {
    const run = vi.fn(async () => reply("一番目で足りた"));
    const result = await generate(fakeEnv("@cf/a,@cf/b", run), OPTIONS);
    expect(result.model).toBe("@cf/a");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
