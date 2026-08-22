import { describe, expect, it, vi } from "vitest";
import { fallbackGenerator, parseModelList, DEFAULT_MODELS } from "./generator";
import type { ModelProvider } from "./provider";

const OPTIONS = { system: "system", prompt: "prompt" };

/** A provider that serves every model id, delegating to `run`. */
function provider(run: (model: string) => Promise<string>): ModelProvider {
  return {
    name: "fake",
    handles: () => true,
    async run(model) {
      return { text: await run(model), costUsd: 0.001, model };
    },
  };
}

describe("fallbackGenerator", () => {
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
      return "二番目のモデルが答えた";
    });
    const result = await fallbackGenerator([provider(run)], ["@cf/first", "@cf/second"]).generate(
      OPTIONS,
    );

    expect(result.text).toBe("二番目のモデルが答えた");
    expect(result.model).toBe("@cf/second");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("falls through on an entirely unrecognized failure too", async () => {
    const run = vi.fn(async (model: string) => {
      if (model === "a") throw new Error("something nobody enumerated");
      return "生き残り";
    });
    const result = await fallbackGenerator([provider(run)], ["a", "b"]).generate(OPTIONS);
    expect(result.text).toBe("生き残り");
  });

  it("propagates the last failure once every model is exhausted", async () => {
    const run = vi.fn(async (model: string) => {
      throw new Error(`${model} is down`);
    });
    await expect(fallbackGenerator([provider(run)], ["a", "b"]).generate(OPTIONS)).rejects.toThrow(
      "b is down",
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stops at the first model that works", async () => {
    const run = vi.fn(async () => "一番目で足りた");
    const result = await fallbackGenerator([provider(run)], ["a", "b"]).generate(OPTIONS);
    expect(result.model).toBe("a");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("routes each model to the provider that claims it", async () => {
    const cf: ModelProvider = {
      name: "cf",
      handles: (m) => m.startsWith("@cf/"),
      async run(model) {
        throw new Error(`${model} unavailable`);
      },
    };
    const gemini: ModelProvider = {
      name: "gemini",
      handles: (m) => m.startsWith("gemini-"),
      async run(model) {
        return { text: "gemini answered", costUsd: 0, model };
      },
    };
    const result = await fallbackGenerator([cf, gemini], ["@cf/x", "gemini-y"]).generate(OPTIONS);
    expect(result.text).toBe("gemini answered");
  });

  it("skips a model no provider handles rather than dying on it", async () => {
    const gemini: ModelProvider = {
      name: "gemini",
      handles: (m) => m.startsWith("gemini-"),
      async run(model) {
        return { text: "ok", costUsd: 0, model };
      },
    };
    const result = await fallbackGenerator([gemini], ["mystery-model", "gemini-y"]).generate(
      OPTIONS,
    );
    expect(result.model).toBe("gemini-y");
  });

  it("throws when nothing is configured", async () => {
    await expect(fallbackGenerator([], []).generate(OPTIONS)).rejects.toThrow("no models");
  });
});

describe("parseModelList", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseModelList(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("falls back to the default list", () => {
    expect(parseModelList(undefined)).toEqual(DEFAULT_MODELS.split(","));
    expect(parseModelList("")).toEqual(DEFAULT_MODELS.split(","));
  });

  it("keeps Workers AI ahead of Gemini by default", () => {
    // The free daily allocation should be spent before the metered API.
    const [first] = parseModelList(undefined);
    expect(first?.startsWith("@cf/")).toBe(true);
  });
});
