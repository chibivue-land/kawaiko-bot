import { repetitionScore } from "./repetition";

/**
 * The shape of kawaiko's long-term memory and the rules for changing it.
 *
 * Pure domain: no storage, no bindings. The store that persists this lives
 * behind the MemoryStore port (see app-ports.ts); how it is written to SQLite
 * is infra-d1-memory.ts's problem.
 *
 * Memory is scoped to a Discord server (guild) and shaped as an append-only
 * log, so "forget that" is a new event rather than a mutation. See
 * migrations/0001_memory_log.sql for the fold that turns events into beliefs.
 */

export type SubjectKind = "user" | "topic" | "channel" | "server";

/** A message as it was actually said. Never interpreted, never edited. */
export interface ObservationInput {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorLabel: string;
  isKawaiko: boolean;
  content: string;
  at: number;
}

export interface Observation {
  seq: number;
  channelId: string;
  authorId: string;
  authorLabel: string;
  isKawaiko: boolean;
  content: string;
  at: number;
}

/** Something kawaiko currently believes about a server. */
export interface Fact {
  seq: number;
  subjectKind: SubjectKind;
  subjectId: string | null;
  subjectLabel: string | null;
  body: string;
  at: number;
}

/** A candidate fact, before it has been reconciled with what is already known. */
export interface LearnedFact {
  subjectKind: SubjectKind;
  subjectId?: string;
  subjectLabel?: string;
  body: string;
  sourceChannelId?: string;
  sourceMessageId?: string;
}

export interface AppendResult {
  learned: number;
  refined: number;
  skipped: number;
}

/** One learning pass, as offered to whoever is deciding what to undo. */
export interface BatchSummary {
  batch: string;
  at: number;
  facts: number;
  observedThrough: number | null;
  live: number;
}

/** A restatement this close to a live fact adds nothing; drop it. */
export const DUPLICATE_SCORE = 0.85;
/** This close means "the same thing, said better": keep it as a revision. */
export const REFINEMENT_SCORE = 0.55;
/** Facts are prompt context, not essays. */
export const MAX_FACT_LENGTH = 120;
/** Never let remembered facts crowd out the actual conversation. */
export const MAX_FACTS_IN_PROMPT = 10;

/** What appending this candidate should do to the log. */
export type FactMerge =
  | { action: "skip" }
  | { action: "learn" }
  | { action: "refine"; supersedes: number };

/** Trim a candidate to something worth storing; empty means "not worth it". */
export function normalizeFactBody(body: string): string {
  return body.trim().slice(0, MAX_FACT_LENGTH);
}

/**
 * Reconcile a candidate fact with what is already believed.
 *
 * Only facts about the same subject are compared: the same sentence can be
 * true of two different people, and collapsing those would quietly attribute
 * one person's traits to another.
 */
export function planFactMerge(candidate: LearnedFact, known: readonly Fact[]): FactMerge {
  const body = normalizeFactBody(candidate.body);
  if (!body) return { action: "skip" };

  let closest: Fact | undefined;
  let closestScore = 0;
  for (const fact of known) {
    if (!isSameSubject(fact, candidate)) continue;
    const score = repetitionScore(body, [fact.body]);
    if (score > closestScore) {
      closest = fact;
      closestScore = score;
    }
  }

  if (closestScore >= DUPLICATE_SCORE) return { action: "skip" };
  if (closestScore >= REFINEMENT_SCORE && closest) {
    return { action: "refine", supersedes: closest.seq };
  }
  return { action: "learn" };
}

function isSameSubject(fact: Fact, candidate: LearnedFact): boolean {
  if (fact.subjectKind !== candidate.subjectKind) return false;
  // A resolved Discord id is authoritative; fall back to the label only for
  // subjects that never had one (topics, the server itself).
  if (fact.subjectId !== null || candidate.subjectId !== undefined) {
    return fact.subjectId === (candidate.subjectId ?? null);
  }
  return (fact.subjectLabel ?? "") === (candidate.subjectLabel ?? "");
}
