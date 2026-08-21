import type { Env } from "./env";
import { postScheduledMutter } from "./mutter";
import { postRandomReply } from "./replier";
import { dispatchForHour, jstHour } from "./schedule";

export { UserRateLimiter, BudgetTracker } from "./do";
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
      const status = await gateway.status();
      ctx.waitUntil(ensureGateway(env));
      return new Response(JSON.stringify(status, null, 2), {
        headers: { "Content-Type": "application/json" },
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
      if (kind === "mutter") {
        ctx.waitUntil(postScheduledMutter(env, { force: true }));
        return new Response("mutter triggered\n", { status: 202 });
      }
      if (kind === "reply") {
        ctx.waitUntil(postRandomReply(env, { force: true }));
        return new Response("reply triggered\n", { status: 202 });
      }
      return new Response("unknown trigger", { status: 400 });
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
