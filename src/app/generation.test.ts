import { describe, expect, it } from "vitest";
import { speak, speakFreshly } from "./generation";
import type { Generated, TextGenerator } from "./ports";
import {
  EMPTY_RESPONSE_LINES,
  LEAK_DEFLECTION_LINES,
  REFUSAL_LINES,
  REPETITION_BREAK_LINES,
} from "../domain/lines";
import { buildSystemPrompt } from "../domain/persona";

const SYSTEM = "system prompt";

function generator(...replies: (Partial<Generated> | Error)[]): TextGenerator & { calls: number } {
  let index = 0;
  const self = {
    calls: 0,
    async generate(): Promise<Generated> {
      self.calls++;
      const reply = replies[Math.min(index, replies.length - 1)];
      index++;
      if (reply instanceof Error) throw reply;
      return { text: "", costUsd: 0.001, model: "fake", ...reply };
    },
  };
  return self;
}

describe("speak", () => {
  it("passes ordinary text straight through", async () => {
    const result = await speak(generator({ text: "はい．" }), { system: SYSTEM, prompt: "p" });
    expect(result.text).toBe("はい．");
  });

  it("swaps in a deflection when the answer quotes the system prompt", async () => {
    // The prompt-side secrecy rule is weak on small models; this is the guard.
    const system = buildSystemPrompt();
    const leaked = system.split("\n").find((line) => line.length > 40)!;
    const result = await speak(generator({ text: leaked }), { system, prompt: "p" });
    expect(LEAK_DEFLECTION_LINES).toContain(result.text);
  });

  it("uses a refusal line when the provider declined", async () => {
    const result = await speak(generator({ text: "", refused: true }), {
      system: SYSTEM,
      prompt: "p",
    });
    expect(REFUSAL_LINES).toContain(result.text);
  });

  it("uses an empty-response line when nothing came back", async () => {
    const result = await speak(generator({ text: "   " }), { system: SYSTEM, prompt: "p" });
    expect(EMPTY_RESPONSE_LINES).toContain(result.text);
  });
});

describe("speakFreshly", () => {
  const avoid = ["ubugeeei さん，それはあまりに雑な質問ですね"];

  it("generates once when there is nothing to avoid", async () => {
    const gen = generator({ text: "何でもよい" });
    await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, []);
    expect(gen.calls).toBe(1);
  });

  it("accepts a fresh answer without re-rolling", async () => {
    const gen = generator({ text: "眠いです．レッドブルが切れました．" });
    const result = await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid);
    expect(gen.calls).toBe(1);
    expect(result.text).toBe("眠いです．レッドブルが切れました．");
  });

  it("re-rolls a repeat and bills both attempts", async () => {
    const gen = generator(
      { text: "kazupon さん，それはあまりに筋が悪いです" },
      { text: "Vapor Mode の話なら朝まで喋れます" },
    );
    const result = await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid);
    expect(gen.calls).toBe(2);
    expect(result.text).toBe("Vapor Mode の話なら朝まで喋れます");
    expect(result.costUsd).toBeCloseTo(0.002, 6);
  });

  it("nudges the model on the re-roll instead of asking again identically", async () => {
    const prompts: string[] = [];
    const gen: TextGenerator = {
      async generate(request) {
        prompts.push(request.prompt);
        return { text: avoid[0]!, costUsd: 0, model: "fake" };
      },
    };
    await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid);
    expect(prompts[0]).toBe("p");
    expect(prompts[1]).toContain("同じ型だった");
  });

  it("breaks the loop out loud when every attempt is the same line", async () => {
    const gen = generator({ text: avoid[0]! });
    const result = await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid);
    expect(REPETITION_BREAK_LINES).toContain(result.text);
  });

  it("keeps the least repetitive candidate when none is clean", async () => {
    // A verbatim repeat, then something merely sharing the opening: neither is
    // clean, so the closer-to-fresh one is what gets posted.
    const gen = generator(
      { text: avoid[0]! },
      { text: "yamanoku さん，それはあまりに、と言いかけて眠くなりました" },
    );
    const result = await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid);
    expect(result.text).toContain("yamanoku");
  });

  it("never drops a usable first answer because the re-roll failed", async () => {
    const gen = generator({ text: avoid[0]! }, new Error("provider died"));
    const result = await speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid);
    expect(result.text).toBeTruthy();
  });

  it("propagates a failure when there is no answer at all", async () => {
    const gen = generator(new Error("provider died"));
    await expect(speakFreshly(gen, { system: SYSTEM, prompt: "p" }, avoid)).rejects.toThrow(
      "provider died",
    );
  });
});
