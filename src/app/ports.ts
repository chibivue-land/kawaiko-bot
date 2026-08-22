import type { ChatMessage } from "../domain/message";
import type { Temporal } from "../domain/time";
import type { DispatchAction } from "../domain/schedule";
import type {
  AppendResult,
  BatchSummary,
  Fact,
  LearnedFact,
  Observation,
  ObservationInput,
} from "../domain/memory";

/**
 * The ports the application layer talks through.
 *
 * Everything here is an interface the domain and use cases can name without
 * knowing what implements it; the adapters live in the infra-* modules and are
 * wired together in index.ts. Dependencies point inward: nothing in this file
 * may import an infra-* module, and nothing in domain-* may import this one.
 */

export type Effort = "low" | "medium" | "high";

export interface GenerationRequest {
  system: string;
  prompt: string;
  effort?: Effort;
  maxTokens?: number;
  /** Allow the provider's built-in web search, where it has one. */
  search?: boolean;
}

export interface Generated {
  /** May be empty; deciding what to say instead is the application's call. */
  text: string;
  costUsd: number;
  model: string;
  /** The provider declined or truncated rather than failing outright. */
  refused?: boolean;
}

/** Anything that can turn a prompt into kawaiko's next line. */
export interface TextGenerator {
  generate(request: GenerationRequest): Promise<Generated>;
}

/** The chat platform kawaiko lives in. */
export interface ChatClient {
  post(channelId: string, text: string, replyToMessageId?: string): Promise<void>;
  recentMessages(channelId: string, limit?: number): Promise<ChatMessage[]>;
  /** The server a channel belongs to, when it can be resolved. */
  guildOf(channelId: string): Promise<string | undefined>;
  /** Keep a "typing…" indicator alive for the duration of `work`. */
  whileTyping<T>(channelId: string, work: () => Promise<T>): Promise<T>;
}

/** Long-term, server-scoped memory. See domain-memory.ts for the model. */
export interface MemoryStore {
  /** False when no store is configured; callers may skip the work entirely. */
  readonly available: boolean;
  observe(rows: readonly ObservationInput[]): Promise<void>;
  liveFacts(guildId: string, opts?: { subjectId?: string; limit?: number }): Promise<Fact[]>;
  guilds(limit?: number): Promise<string[]>;
  learnCursor(guildId: string): Promise<number>;
  unlearned(guildId: string, afterSeq: number, limit?: number): Promise<Observation[]>;
  appendLearned(args: {
    guildId: string;
    batch: string;
    facts: readonly LearnedFact[];
    observedThrough: number;
    model?: string;
  }): Promise<AppendResult>;
  batches(guildId: string, limit?: number): Promise<BatchSummary[]>;
  retractBatch(guildId: string, batch: string, note?: string): Promise<boolean>;
  rollbackTo(guildId: string, seq: number, note?: string): Promise<boolean>;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMinutes?: number;
}

/** Per-user throttle on how often kawaiko can be made to answer. */
export interface RateLimiter {
  check(userId: string): Promise<RateLimitDecision>;
}

export type JobKind = DispatchAction;

/** Spend guard plus the job bookkeeping /status reports. */
export interface BudgetGuard {
  allows(): Promise<{ allowed: boolean; spentUsd: number }>;
  record(costUsd: number): Promise<void>;
  finish(kind: JobKind, ok: boolean, error?: string, model?: string): Promise<void>;
}

/** Per-channel "ignore everything before this point". */
export interface ChannelMemory {
  resetAt(channelId: string): Promise<number>;
  reset(channelId: string, at: number): Promise<void>;
}

/** Web lookups used to ground an answer. */
export interface ResearchService {
  /** Empty string when the question does not warrant a lookup. */
  lookup(question: string): Promise<string>;
}

/** Headlines behind the news mutter seed. */
export interface NewsFeed {
  headlines(limit?: number): Promise<string[]>;
}

/**
 * Everything a use case is allowed to reach for. Assembled once in index.ts
 * (and in the gateway Durable Object) from the Worker's bindings; a test builds
 * the same shape out of fakes, which is the whole point of it existing.
 */
export interface Kawaiko {
  chat: ChatClient;
  generator: TextGenerator;
  memory: MemoryStore;
  budget: BudgetGuard;
  limiter: RateLimiter;
  channels: ChannelMemory;
  research: ResearchService;
  news: NewsFeed;
  /** kawaiko's own Discord id, and the channel it calls home. */
  botId: string;
  homeChannelId: string;
  /** Probability gates, as configured. */
  mutterProbability: string;
  replyProbability: string;
  observeMessages: boolean;
  now(): Temporal.Instant;
  random(): number;
  newBatchId(): string;
}

/** The outcome of one scheduled job, as reported to the caller and /status. */
export interface JobOutcome {
  ok: boolean;
  skipped?: string;
  error?: string;
}

/** Normalize a thrown value into something worth storing. */
export function describeFailure(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.trim();
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
