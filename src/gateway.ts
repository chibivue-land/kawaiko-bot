import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { generate } from "./ai/generate";
import { postChannelMessage, withTyping } from "./discord/api";
import { isExplicitMention, stripBotMention } from "./discord/mention";
import { buildSystemPrompt, jstNowLabel } from "./persona";
import { BUDGET_EXCEEDED_LINES, ERROR_LINES, RATE_LIMITED_LINES, pickLine } from "./lines";

/**
 * Discord Gateway client living in a Durable Object.
 *
 * MESSAGE_CREATE (needed for @kawaiko mentions) is only delivered over the
 * gateway WebSocket, never over the HTTP interactions endpoint. This DO keeps
 * one outbound WebSocket to the gateway; a storage alarm plus a 5-minute cron
 * act as watchdogs that reconnect after evictions or deploys.
 */

const GATEWAY_URL = "https://gateway.discord.gg/?v=10&encoding=json";

// https://discord.com/developers/docs/events/gateway#gateway-opcodes
const Op = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

// GUILD_MESSAGES (1 << 9) | MESSAGE_CONTENT (1 << 15).
// MESSAGE_CONTENT is privileged: enable it in the Developer Portal (see README).
const INTENTS = (1 << 9) | (1 << 15);

/** Minimum spacing between IDENTIFY calls (Discord caps identifies per day). */
const IDENTIFY_COOLDOWN_MS = 30_000;

interface GatewayPayload {
  op: number;
  t?: string | null;
  s?: number | null;
  d?: unknown;
}

interface GatewayStatus {
  connected: boolean;
  readyAt?: string;
  botUser?: { id: string; username: string };
  guildCount?: number;
  lastClose?: { code: number; reason: string; at: string };
  /** Outcome of the most recent mention handling, for debugging. */
  lastMention?: { at: string; ok: boolean; error?: string };
}

interface MessageCreate {
  id: string;
  channel_id: string;
  guild_id?: string;
  content?: string;
  author?: { id: string; bot?: boolean; username?: string; global_name?: string | null };
  member?: { nick?: string | null };
  mentions?: Array<{ id: string }>;
}

export class DiscordGateway extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private open = false;
  private seq: number | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingAck = false;
  private lastIdentifyAt = 0;

  /** Connection diagnostics, served via GET /status on the Worker. */
  async status(): Promise<GatewayStatus> {
    const stored = await this.ctx.storage.get<Omit<GatewayStatus, "connected">>("status");
    return { connected: this.open, ...stored };
  }

  private async recordStatus(patch: Partial<GatewayStatus>): Promise<void> {
    const stored = (await this.ctx.storage.get<Omit<GatewayStatus, "connected">>("status")) ?? {};
    await this.ctx.storage.put("status", { ...stored, ...patch });
  }

  /** Idempotent: make sure a gateway connection exists and the watchdog alarm is armed. */
  async ensure(): Promise<string> {
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
    if (this.open) return "connected";
    await this.openGateway();
    return "connecting";
  }

  async alarm(): Promise<void> {
    await this.ensure();
  }

  // Named openGateway because the DurableObject base class already declares `connect`.
  private async openGateway(): Promise<void> {
    if (Date.now() - this.lastIdentifyAt < IDENTIFY_COOLDOWN_MS) return;
    this.lastIdentifyAt = Date.now();
    this.teardown();

    // Workers open client WebSockets through fetch + Upgrade (https, not wss).
    const res = await fetch(GATEWAY_URL, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket;
    if (!ws) {
      console.error(`gateway: upgrade failed (${res.status})`);
      return;
    }
    ws.accept();
    this.ws = ws;
    this.open = true;

    ws.addEventListener("message", (event) => {
      void this.handlePayload(String(event.data));
    });
    ws.addEventListener("close", (event) => {
      console.warn(`gateway: closed (${event.code} ${event.reason})`);
      void this.recordStatus({
        lastClose: { code: event.code, reason: event.reason, at: new Date().toISOString() },
      });
      this.teardown();
    });
    ws.addEventListener("error", () => {
      console.error("gateway: socket error");
      this.teardown();
    });
  }

  private teardown(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    try {
      this.ws?.close(1000, "reconnecting");
    } catch {
      // Already closed.
    }
    this.ws = null;
    this.open = false;
    this.awaitingAck = false;
  }

  private send(payload: GatewayPayload): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private async handlePayload(raw: string): Promise<void> {
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(raw) as GatewayPayload;
    } catch {
      return;
    }
    if (typeof payload.s === "number") this.seq = payload.s;

    switch (payload.op) {
      case Op.HELLO: {
        const interval = (payload.d as { heartbeat_interval: number }).heartbeat_interval;
        this.startHeartbeat(interval);
        this.identify();
        break;
      }
      case Op.HEARTBEAT:
        this.send({ op: Op.HEARTBEAT, d: this.seq });
        break;
      case Op.HEARTBEAT_ACK:
        this.awaitingAck = false;
        break;
      case Op.RECONNECT:
      case Op.INVALID_SESSION:
        // Keep it simple: drop the session and re-identify on the next watchdog tick.
        this.teardown();
        break;
      case Op.DISPATCH:
        if (payload.t === "READY") {
          const ready = payload.d as {
            user?: { id: string; username: string };
            guilds?: unknown[];
          };
          console.log("gateway: ready");
          await this.recordStatus({
            readyAt: new Date().toISOString(),
            botUser: ready.user ? { id: ready.user.id, username: ready.user.username } : undefined,
            guildCount: ready.guilds?.length,
          });
        } else if (payload.t === "MESSAGE_CREATE") {
          await this.onMessageCreate(payload.d as MessageCreate);
        }
        break;
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.awaitingAck = false;
    this.heartbeatTimer = setInterval(() => {
      if (this.awaitingAck) {
        // Zombie connection: no ack since the previous beat.
        console.warn("gateway: heartbeat ack missing, reconnecting");
        this.teardown();
        return;
      }
      this.awaitingAck = true;
      this.send({ op: Op.HEARTBEAT, d: this.seq });
    }, intervalMs);
  }

  private identify(): void {
    this.send({
      op: Op.IDENTIFY,
      d: {
        token: this.env.DISCORD_BOT_TOKEN,
        intents: INTENTS,
        properties: { os: "cloudflare", browser: "kawaiko-bot", device: "kawaiko-bot" },
      },
    });
  }

  private async onMessageCreate(msg: MessageCreate): Promise<void> {
    const appId = this.env.DISCORD_APPLICATION_ID;
    const content = msg.content ?? "";
    if (!msg.author || msg.author.bot) return;
    // Guild messages only (no DMs), and only when explicitly @mentioned.
    if (!msg.guild_id || !isExplicitMention(appId, content, msg.mentions)) return;

    const reply = (text: string) => postChannelMessage(this.env, msg.channel_id, text, msg.id);
    const outcome = (ok: boolean, error?: string) =>
      this.recordStatus({ lastMention: { at: new Date().toISOString(), ok, error } });

    try {
      // Same per-user limits as the slash command.
      const limiter = this.env.USER_RATE_LIMITER.get(
        this.env.USER_RATE_LIMITER.idFromName(msg.author.id),
      );
      const decision = await limiter.checkAndIncrement(
        Number(this.env.RATE_LIMIT_PER_HOUR) || 5,
        Number(this.env.RATE_LIMIT_PER_DAY) || 20,
      );
      if (!decision.allowed) {
        await reply(pickLine(RATE_LIMITED_LINES, { minutes: decision.retryAfterMinutes }));
        return;
      }

      const budget = this.env.BUDGET_TRACKER.get(this.env.BUDGET_TRACKER.idFromName("global"));
      const { allowed } = await budget.checkBudget(Number(this.env.MONTHLY_BUDGET_USD) || 100);
      if (!allowed) {
        await reply(pickLine(BUDGET_EXCEEDED_LINES));
        return;
      }

      const displayName =
        msg.member?.nick ?? msg.author.global_name ?? msg.author.username ?? "誰か";
      const { text, costUsd } = await withTyping(this.env, msg.channel_id, () =>
        generate(this.env, {
          system: buildSystemPrompt(),
          prompt: `今は ${jstNowLabel()}。Discord で ${displayName} さんからメンションでこう話しかけられた:

${stripBotMention(appId, content) || "(本文なし、メンションだけ)"}

kawaiko として返事して。最新情報が必要そうなら web_search を使ってよい。`,
          maxSearches: 3,
          effort: "medium",
          maxTokens: 4096,
        }),
      );
      await budget.recordSpend(costUsd);
      await reply(text);
      await outcome(true);
    } catch (err) {
      console.error("gateway: mention reply failed:", err);
      await outcome(false, err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      try {
        await reply(pickLine(ERROR_LINES));
      } catch {
        // Give up quietly.
      }
    }
  }
}
