import { DurableObject } from "cloudflare:workers";
import { monthKey } from "../ai/cost";
import type { JobKind } from "../../app/ports";
import { isoStamp } from "../../domain/time";

export interface OpOutcome {
  at: string;
  ok: boolean;
  error?: string;
  /** Model that served the generation, when known. */
  model?: string;
}

/**
 * Monthly estimated-cost tracker (singleton via idFromName("global")).
 * A soft, code-side guard that stops generation once MONTHLY_BUDGET_USD is
 * exceeded, plus the last outcome of each scheduled job for /status.
 */
export class BudgetTracker extends DurableObject {
  async recordOutcome(kind: JobKind, ok: boolean, error?: string, model?: string): Promise<void> {
    await this.ctx.storage.put(`last:${kind}`, {
      at: isoStamp(),
      ok,
      error,
      model,
    } satisfies OpOutcome);
  }

  async lastOutcomes(): Promise<Partial<Record<JobKind, OpOutcome>>> {
    return {
      mutter: await this.ctx.storage.get<OpOutcome>("last:mutter"),
      reply: await this.ctx.storage.get<OpOutcome>("last:reply"),
      learn: await this.ctx.storage.get<OpOutcome>("last:learn"),
    };
  }

  async checkBudget(budgetUsd: number): Promise<{ allowed: boolean; spentUsd: number }> {
    const spentUsd = (await this.ctx.storage.get<number>(`spent:${monthKey()}`)) ?? 0;
    return { allowed: spentUsd < budgetUsd, spentUsd };
  }

  async recordSpend(costUsd: number): Promise<void> {
    const key = `spent:${monthKey()}`;
    await this.ctx.storage.put(key, ((await this.ctx.storage.get<number>(key)) ?? 0) + costUsd);
  }
}
