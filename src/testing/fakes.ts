import type { ChatClient, Generated, Kawaiko, MemoryStore, TextGenerator } from "../app/ports";
import type { ChatMessage } from "../domain/message";
import type { Fact, LearnedFact, Observation } from "../domain/memory";
import { Temporal } from "../domain/time";

/**
 * In-memory stand-ins for every port.
 *
 * The point of app-ports.ts is that a use case never names a Cloudflare
 * binding, so these fakes let the real reply/mutter/learning logic run end to
 * end in a plain unit test: no WebSocket, no Durable Object, no model.
 */

export const FIXED_NOW = Temporal.Instant.from("2026-08-21T13:50:00Z");

export function message(over: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    content: "こんにちは",
    timestamp: "2026-08-21T13:00:00Z",
    authorId: "user-1",
    authorLabel: "ubugeeei",
    isBot: false,
    ...over,
  };
}

export interface FakeChat extends ChatClient {
  readonly posted: { channelId: string; text: string; replyTo?: string }[];
  history: ChatMessage[];
}

export function fakeChat(history: ChatMessage[] = []): FakeChat {
  const posted: { channelId: string; text: string; replyTo?: string }[] = [];
  return {
    posted,
    history,
    async post(channelId, text, replyTo) {
      posted.push({ channelId, text, replyTo });
    },
    async recentMessages() {
      return this.history;
    },
    async guildOf() {
      return "guild-1";
    },
    whileTyping: (_channelId, work) => work(),
  };
}

export interface FakeGenerator extends TextGenerator {
  readonly prompts: string[];
}

/** Answers with each reply in turn, repeating the last one once exhausted. */
export function fakeGenerator(replies: string[]): FakeGenerator {
  const prompts: string[] = [];
  let index = 0;
  return {
    prompts,
    async generate(request): Promise<Generated> {
      prompts.push(request.prompt);
      const text = replies[Math.min(index, replies.length - 1)] ?? "";
      index++;
      return { text, costUsd: 0.001, model: "fake-model" };
    },
  };
}

export interface FakeMemory extends MemoryStore {
  readonly observed: Observation[];
  facts: Fact[];
  readonly appended: { batch: string; facts: readonly LearnedFact[]; observedThrough: number }[];
  unlearnedRows: Observation[];
}

export function fakeMemory(over?: Partial<{ available: boolean; facts: Fact[] }>): FakeMemory {
  const observed: Observation[] = [];
  const appended: FakeMemory["appended"] = [];
  return {
    available: over?.available ?? true,
    observed,
    appended,
    facts: over?.facts ?? [],
    unlearnedRows: [],
    async observe(rows) {
      for (const [offset, row] of rows.entries()) {
        observed.push({
          seq: observed.length + offset + 1,
          channelId: row.channelId,
          authorId: row.authorId,
          authorLabel: row.authorLabel,
          isKawaiko: row.isKawaiko,
          content: row.content,
          at: row.at,
        });
      }
    },
    async liveFacts() {
      return this.facts;
    },
    async guilds() {
      return ["guild-1"];
    },
    async learnCursor() {
      return 0;
    },
    async unlearned() {
      return this.unlearnedRows;
    },
    async appendLearned(args) {
      appended.push({
        batch: args.batch,
        facts: args.facts,
        observedThrough: args.observedThrough,
      });
      return { learned: args.facts.length, refined: 0, skipped: 0 };
    },
    async batches() {
      return [];
    },
    async retractBatch() {
      return true;
    },
    async rollbackTo() {
      return true;
    },
  };
}

export interface FakeKawaiko extends Kawaiko {
  chat: FakeChat;
  generator: FakeGenerator;
  memory: FakeMemory;
  readonly spent: number[];
  readonly finished: { kind: string; ok: boolean; error?: string }[];
  readonly resets: { channelId: string; at: number }[];
}

export function fakeKawaiko(over?: Partial<Kawaiko>): FakeKawaiko {
  const spent: number[] = [];
  const finished: FakeKawaiko["finished"] = [];
  const resets: FakeKawaiko["resets"] = [];
  const base: FakeKawaiko = {
    chat: fakeChat(),
    generator: fakeGenerator(["kawaiko の返事"]),
    memory: fakeMemory(),
    spent,
    finished,
    resets,
    budget: {
      async allows() {
        return { allowed: true, spentUsd: 0 };
      },
      async record(costUsd) {
        spent.push(costUsd);
      },
      async finish(kind, ok, error) {
        finished.push({ kind, ok, error });
      },
    },
    limiter: {
      async check() {
        return { allowed: true };
      },
    },
    channels: {
      async resetAt() {
        return 0;
      },
      async reset(channelId, at) {
        resets.push({ channelId, at });
      },
    },
    research: {
      async lookup() {
        return "";
      },
    },
    news: {
      async headlines() {
        return [];
      },
    },
    botId: "bot-1",
    homeChannelId: "home",
    mutterProbability: "1",
    replyProbability: "1",
    observeMessages: true,
    now: () => FIXED_NOW,
    // Deterministic: every dial lands on its first option.
    random: () => 0,
    newBatchId: () => "batch-1",
  };
  return Object.assign(base, over) as FakeKawaiko;
}
