import { describe, expect, it } from "vitest";
import {
  MAX_FACT_LENGTH,
  type Fact,
  type LearnedFact,
  normalizeFactBody,
  planFactMerge,
} from "./memory";

const known = (over: Partial<Fact> = {}): Fact => ({
  seq: 7,
  subjectKind: "user",
  subjectId: "user-1",
  subjectLabel: "ubugeeei",
  body: "Vapor Mode のランタイム担当",
  at: 0,
  ...over,
});

const candidate = (over: Partial<LearnedFact> = {}): LearnedFact => ({
  subjectKind: "user",
  subjectId: "user-1",
  subjectLabel: "ubugeeei",
  body: "Vapor Mode のランタイム担当",
  ...over,
});

describe("normalizeFactBody", () => {
  it("trims and caps, so a fact stays prompt-sized", () => {
    expect(normalizeFactBody("  はい  ")).toBe("はい");
    expect(normalizeFactBody("あ".repeat(500))).toHaveLength(MAX_FACT_LENGTH);
  });
});

describe("planFactMerge", () => {
  it("skips something already believed", () => {
    expect(planFactMerge(candidate(), [known()])).toEqual({ action: "skip" });
  });

  it("stores a restatement as a revision of the original", () => {
    const merge = planFactMerge(candidate({ body: "Vapor Mode のランタイムを担当している" }), [
      known(),
    ]);
    expect(merge).toEqual({ action: "refine", supersedes: 7 });
  });

  it("learns something genuinely new about the same person", () => {
    expect(planFactMerge(candidate({ body: "コーヒーが嫌い" }), [known()])).toEqual({
      action: "learn",
    });
  });

  it("never merges across subjects, however similar the sentence", () => {
    // The same claim about two people must stay two facts, or one person's
    // traits get quietly attributed to another.
    const merge = planFactMerge(candidate({ subjectId: "user-2", subjectLabel: "kazupon" }), [
      known(),
    ]);
    expect(merge).toEqual({ action: "learn" });
  });

  it("matches subject-less facts on their label", () => {
    const topic = { subjectKind: "topic", subjectLabel: "chibivue" } as const;
    const existing = known({ subjectKind: "topic", subjectId: null, subjectLabel: "chibivue" });
    expect(planFactMerge({ ...topic, body: existing.body }, [existing])).toEqual({
      action: "skip",
    });
  });

  it("refuses an empty candidate", () => {
    expect(planFactMerge(candidate({ body: "   " }), [])).toEqual({ action: "skip" });
  });

  it("learns when nothing is known yet", () => {
    expect(planFactMerge(candidate(), [])).toEqual({ action: "learn" });
  });
});
