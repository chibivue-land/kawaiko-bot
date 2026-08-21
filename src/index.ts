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
