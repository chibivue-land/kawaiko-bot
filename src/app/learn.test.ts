import { describe, expect, it } from "vitest";
import { runLearningPass } from "./learn";
import { MIN_OBSERVATIONS } from "../domain/learning";
import type { Observation } from "../domain/memory";
import { fakeGenerator, fakeKawaiko, fakeMemory } from "../testing/fakes";

function window(count: number): Observation[] {
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    channelId: "c1",
    authorId: "user-1",
    authorLabel: "ubugeeei",
    isKawaiko: false,
    content: `発言${i}`,
    at: 0,
  }));
}

describe("runLearningPass", () => {
  it("skips entirely when no store is bound", async () => {
    const kawaiko = fakeKawaiko({ memory: fakeMemory({ available: false }) });
    expect(await runLearningPass(kawaiko)).toEqual({ ok: true, skipped: "no-database" });
    expect(kawaiko.generator.prompts).toHaveLength(0);
  });

  it("skips when the budget is gone", async () => {
    const kawaiko = fakeKawaiko({
      budget: {
        async allows() {
          return { allowed: false, spentUsd: 200 };
        },
        async record() {},
        async finish() {},
      },
    });
    expect(await runLearningPass(kawaiko)).toEqual({ ok: true, skipped: "budget" });
  });

  it("costs nothing on a quiet server", async () => {
    // The gate is on unread messages, so an idle hour never calls a model.
    const kawaiko = fakeKawaiko();
    kawaiko.memory.unlearnedRows = window(MIN_OBSERVATIONS - 1);
    await runLearningPass(kawaiko);

    expect(kawaiko.generator.prompts).toHaveLength(0);
    expect(kawaiko.memory.appended).toHaveLength(0);
  });

  it("reads the window anyway when forced", async () => {
    const kawaiko = fakeKawaiko({ generator: fakeGenerator(["- [server] 静かなサーバー"]) });
    kawaiko.memory.unlearnedRows = window(1);
    await runLearningPass(kawaiko, { force: true });
    expect(kawaiko.memory.appended).toHaveLength(1);
  });

  it("folds a pass into one batch and records how far it read", async () => {
    const kawaiko = fakeKawaiko({
      generator: fakeGenerator(["- [ubugeeei] Vapor Mode 担当\n- [server] 深夜は過疎"]),
    });
    kawaiko.memory.unlearnedRows = window(12);
    expect(await runLearningPass(kawaiko)).toEqual({ ok: true });

    const [pass] = kawaiko.memory.appended;
    expect(pass?.batch).toBe("batch-1");
    // The batch is the unit of rollback; the cursor rides on it.
    expect(pass?.observedThrough).toBe(12);
    expect(pass?.facts.map((f) => f.body)).toEqual(["Vapor Mode 担当", "深夜は過疎"]);
    expect(pass?.facts[0]).toMatchObject({ subjectKind: "user", subjectId: "user-1" });
    expect(kawaiko.finished).toEqual([{ kind: "learn", ok: true, error: undefined }]);
  });

  it("still closes the pass when nothing was worth learning", async () => {
    // Otherwise the cursor never advances and the same window is re-read forever.
    const kawaiko = fakeKawaiko({ generator: fakeGenerator(["特にありませんでした。"]) });
    kawaiko.memory.unlearnedRows = window(12);
    await runLearningPass(kawaiko);

    expect(kawaiko.memory.appended).toHaveLength(1);
    expect(kawaiko.memory.appended[0]?.facts).toEqual([]);
    expect(kawaiko.memory.appended[0]?.observedThrough).toBe(12);
  });

  it("reports a failure rather than throwing at the cron", async () => {
    const kawaiko = fakeKawaiko();
    kawaiko.memory.unlearnedRows = window(12);
    kawaiko.generator.generate = async () => {
      throw new Error("model exploded");
    };
    const outcome = await runLearningPass(kawaiko);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("model exploded");
    expect(kawaiko.finished[0]).toMatchObject({ kind: "learn", ok: false });
  });
});
