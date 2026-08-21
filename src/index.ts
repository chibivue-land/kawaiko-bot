import type { Env } from "./env";
import { postScheduledMutter } from "./mutter";
import { postRandomReply } from "./replier";

export { UserRateLimiter, BudgetTracker } from "./do";
export { DiscordGateway } from "./gateway";

/** Cron used purely as the gateway-connection watchdog. */
const WATCHDOG_CRON = "*/5 * * * *";
/** Cron for uninvited replies to random recent messages. */
const REPLY_CRON = "0 */2 * * *";

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

    if (controller.cron === REPLY_CRON) {
      ctx.waitUntil(postRandomReply(env));
    } else if (controller.cron !== WATCHDOG_CRON) {
      ctx.waitUntil(postScheduledMutter(env));
    }
  },
} satisfies ExportedHandler<Env>;

async function ensureGateway(env: Env): Promise<void> {
  const gateway = env.DISCORD_GATEWAY.get(env.DISCORD_GATEWAY.idFromName("global"));
  await gateway.ensure();
}
