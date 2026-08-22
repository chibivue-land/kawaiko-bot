import {
  joinSections,
  memoryBlock,
  researchBlock,
  transcriptBlock,
  avoidBlock,
  varietySection,
} from "./prompt";
import type { Fact } from "./memory";
import conversationRules from "./conversation-rules.md?raw";
import bargeInRules from "./conversation-barge-in.md?raw";

/**
 * How kawaiko is asked to hold a conversation: the two prompts behind an
 * answered @mention and an uninvited reply. Everything shared between them
 * (transcript, memory, avoid list, delivery dials) comes from domain-prompt.ts;
 * what lives here is the instruction that distinguishes the two situations.
 */

export interface ConversationContext {
  nowLabel: string;
  displayName: string;
  transcript: string;
  facts: readonly Fact[];
  ownLines: readonly string[];
  random?: () => number;
}

const CONVERSATION_RULES = conversationRules.trim();

/** Someone spoke to kawaiko directly. */
export function buildMentionPrompt(
  context: ConversationContext & { question: string; research: string },
): string {
  return joinSections(
    `今は ${context.nowLabel}。`,
    transcriptBlock(context.transcript),
    [
      `この流れで、${context.displayName} さんが kawaiko に言った:`,
      "",
      context.question || "(本文なし、メンションだけ)",
    ].join("\n"),
    researchBlock(context.research),
    memoryBlock(context.facts),
    avoidBlock(context.ownLines),
    CONVERSATION_RULES,
    varietySection(context.random),
  );
}

/** Nobody asked; kawaiko barges into someone's message anyway. */
export function buildUninvitedReplyPrompt(
  context: ConversationContext & { target: string },
): string {
  return joinSections(
    `今は ${context.nowLabel}。`,
    context.transcript ? `チャンネルの直近の流れ:\n${context.transcript}` : "",
    [`この中で ${context.displayName} さんのこの発言に注目した:`, "", context.target].join("\n"),
    bargeInRules.trim(),
    memoryBlock(context.facts),
    avoidBlock(context.ownLines),
    varietySection(context.random),
  );
}
