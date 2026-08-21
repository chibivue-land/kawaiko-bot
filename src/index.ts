import type { Env } from "./env";
import { postScheduledMutter } from "./mutter";
import { postRandomReply } from "./replier";
import { dispatchForHour, jstHour } from "./schedule";

export { UserRateLimiter, BudgetTracker, ChannelMemory } from "./do";
export { DiscordGateway } from "./gateway";

/** Cron used purely as the gateway-connection watchdog. */
const WATCHDOG_CRON = "*/5 * * * *";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      // Health check; also a handy manual way to kick the gateway connection.
      ctx.waitUntil(ensureGateway(env));
      return new Response("kawaiko-bot is alive", { status: 200 });
    }
    if (request.method === "GET" && url.pathname === "/status") {
      const gateway = env.DISCORD_GATEWAY.get(env.DISCORD_GATEWAY.idFromName("global"));
      const budgetUsd = Number(env.MONTHLY_BUDGET_USD) || 100;
      const budget = env.BUDGET_TRACKER.get(env.BUDGET_TRACKER.idFromName("global"));
      const { spentUsd } = await budget.checkBudget(budgetUsd);
      const status = {
        ...(await gateway.status()),
        lastOutcomes: await budget.lastOutcomes(),
        // Estimated spend this month vs the soft cap (code-side guard).
        budget: { spentUsd: Number(spentUsd.toFixed(4)), budgetUsd },
        // Presence booleans only — never the values.
        secrets: {
          DISCORD_BOT_TOKEN: Boolean(env.DISCORD_BOT_TOKEN),
          GEMINI_API_KEY: Boolean(env.GEMINI_API_KEY),
          TRIGGER_TOKEN: Boolean(env.TRIGGER_TOKEN),
        },
      };
      ctx.waitUntil(ensureGateway(env));
      return new Response(JSON.stringify(status, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
    // Debug: inspect what the research pipeline returns for a query.
    if (request.method === "GET" && url.pathname === "/research") {
      const q = url.searchParams.get("q") ?? "";
      if (!q) return new Response("missing q", { status: 400 });
      const { gatherResearch } = await import("./research");
      const block = await gatherResearch(q, { githubToken: env.GITHUB_API_TOKEN });
      return new Response(block || "(no results)", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    // Manual triggers (GitHub Actions "Mutter" workflow). Bypasses the
    // probability gate; the budget guard still applies.
    if (request.method === "POST" && url.pathname.startsWith("/trigger/")) {
      const auth = request.headers.get("Authorization");
      if (!env.TRIGGER_TOKEN || auth !== `Bearer ${env.TRIGGER_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const kind = url.pathname.slice("/trigger/".length);
      const wait = url.searchParams.get("wait") === "1";
      const fn =
        kind === "mutter" ? postScheduledMutter : kind === "reply" ? postRandomReply : null;
      if (!fn) return new Response("unknown trigger", { status: 400 });
      if (wait) {
        // Synchronous mode: surface the outcome in the response for debugging.
        const outcome = await fn(env, { force: true });
        return new Response(JSON.stringify(outcome), {
          status: outcome.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      ctx.waitUntil(fn(env, { force: true }));
      return new Response(`${kind} triggered\n`, { status: 202 });
    }
    return new Response("not found", { status: 404 });
  },

  async scheduled(controller, env, ctx): Promise<void> {
    // Every tick doubles as a watchdog for the gateway WebSocket.
    ctx.waitUntil(ensureGateway(env));
    if (controller.cron === WATCHDOG_CRON) return;

    // Hourly dispatcher: route by JST hour (see src/schedule.ts).
    switch (dispatchForHour(jstHour())) {
      case "mutter":
        ctx.waitUntil(postScheduledMutter(env));
        break;
      case "reply":
        ctx.waitUntil(postRandomReply(env));
        break;
    }
  },
} satisfies ExportedHandler<Env>;

async function ensureGateway(env: Env): Promise<void> {
  const gateway = env.DISCORD_GATEWAY.get(env.DISCORD_GATEWAY.idFromName("global"));
  await gateway.ensure();
}
