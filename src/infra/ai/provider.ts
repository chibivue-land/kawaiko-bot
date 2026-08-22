import type { GenerationRequest, Generated } from "../../app/ports";

/**
 * What an AI provider has to offer to be usable as a backend.
 *
 * Providers return raw text and say nothing about whether kawaiko should
 * actually post it — leak checks, empty answers and repetition are handled once
 * in app-generation.ts, so a new provider inherits every guard by existing.
 */
export interface ModelProvider {
  /** Human-readable, for logs. */
  readonly name: string;
  /** True when this provider serves the given model id. */
  handles(model: string): boolean;
  run(model: string, request: GenerationRequest): Promise<Generated>;
}
