import type { Env } from "./infra/env";
import { monthlyBudgetUsd } from "./infra/env";
import { kawaikoFrom } from "./infra/context";
import { postScheduledMutter } from "./app/post-mutter";
import { postRandomReply } from "./app/post-reply";
import { runLearningPass } from "./app/learn";
import { runMemoryAdmin } from "./app/memory-admin";
import { authorized, json, parseMemoryQuery } from "./infra/http-routes";
import { dispatchForHour, jstHour } from "./domain/schedule";
import type { JobOutcome, Kawaiko } from "./app/ports";

export { UserRateLimiter } from "./infra/do/rate-limit";
export { BudgetTracker } from "./infra/do/budget";
export { ChannelMemory } from "./infra/do/channel-memory";
export { DiscordGateway } from "./infra/discord/gateway";

/**
 * The Worker entry point: HTTP routes and the cron dispatcher.
 *
 * Nothing here decides what kawaiko says. It resolves a request into a use case
 * (app-*) with ports built by infra-context.ts, and turns the answer back into
 * a Response.
 */

/** Cron used purely as the gateway-connection watchdog. */
const WATCHDOG_CRON = "*/5 * * * *";

type Job = (kawaiko: Kawaiko, opts?: { force?: boolean }) => Promise<JobOutcome>;

const JOBS: Record<string, Job> = {
  mutter: postScheduledMutter,
  reply: postRandomReply,
  learn: runLearningPass,
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      // Health check; also a handy manual way to kick the gateway connection.
      ctx.waitUntil(ensureGateway(env));
      return new Response("kawaiko-bot is alive", { status: 200 });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      ctx.waitUntil(ensureGateway(env));
      return json(await status(env));
    }

    // Debug: inspect what the research pipeline returns for a query.
    if (request.method === "GET" && url.pathname === "/research") {
      const question = url.searchParams.get("q") ?? "";
      if (!question) return new Response("missing q", { status: 400 });
      const block = await kawaikoFrom(env).research.lookup(question);
      return new Response(block || "(no results)", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Reading and undoing what kawaiko learned. Authenticated: it returns
    // observations about real people.
    if (url.pathname.startsWith("/memory")) {
      if (!authorized(request, env.TRIGGER_TOKEN)) {
        return new Response("unauthorized", { status: 401 });
      }
      const query = parseMemoryQuery(request.method, url);
      if (!query) return json({ error: "bad request" }, 400);
      const result = await runMemoryAdmin(kawaikoFrom(env), query);
      return json(result.body, result.status);
    }

    // Manual triggers (GitHub Actions "Mutter" workflow). Bypasses the
    // probability gate; the budget guard still applies.
    if (request.method === "POST" && url.pathname.startsWith("/trigger/")) {
      if (!authorized(request, env.TRIGGER_TOKEN)) {
        return new Response("unauthorized", { status: 401 });
      }
      const job = JOBS[url.pathname.slice("/trigger/".length)];
      if (!job) return new Response("unknown trigger", { status: 400 });
      const kawaiko = kawaikoFrom(env);
      if (url.searchParams.get("wait") === "1") {
        // Synchronous mode: surface the outcome in the response for debugging.
        const outcome = await job(kawaiko, { force: true });
        return json(outcome, outcome.ok ? 200 : 500);
      }
      ctx.waitUntil(job(kawaiko, { force: true }));
      return new Response("triggered\n", { status: 202 });
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(controller, env, ctx): Promise<void> {
    // Every tick doubles as a watchdog for the gateway WebSocket.
    ctx.waitUntil(ensureGateway(env));
    if (controller.cron === WATCHDOG_CRON) return;

    // Hourly dispatcher: route by JST hour (see domain-schedule.ts).
    const job = JOBS[dispatchForHour(jstHour())];
    if (job) ctx.waitUntil(job(kawaikoFrom(env)));
  },
} satisfies ExportedHandler<Env>;

async function status(env: Env): Promise<unknown> {
  const gateway = env.DISCORD_GATEWAY.get(env.DISCORD_GATEWAY.idFromName("global"));
  const tracker = env.BUDGET_TRACKER.get(env.BUDGET_TRACKER.idFromName("global"));
  const budgetUsd = monthlyBudgetUsd(env);
  const { spentUsd } = await tracker.checkBudget(budgetUsd);
  return {
    ...(await gateway.status()),
    lastOutcomes: await tracker.lastOutcomes(),
    // Estimated spend this month vs the soft cap (code-side guard).
    budget: { spentUsd: Number(spentUsd.toFixed(4)), budgetUsd },
    memory: { bound: Boolean(env.DB) },
    // Presence booleans only — never the values.
    secrets: {
      DISCORD_BOT_TOKEN: Boolean(env.DISCORD_BOT_TOKEN),
      GEMINI_API_KEY: Boolean(env.GEMINI_API_KEY),
      TRIGGER_TOKEN: Boolean(env.TRIGGER_TOKEN),
    },
  };
}

async function ensureGateway(env: Env): Promise<void> {
  await env.DISCORD_GATEWAY.get(env.DISCORD_GATEWAY.idFromName("global")).ensure();
}
