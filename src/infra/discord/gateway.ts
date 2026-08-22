import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { describeFailure } from "../../app/ports";
import { kawaikoFrom } from "../context";
import { replyToMention } from "../../app/reply-to-mention";
import { displayNameOf } from "./api";
import { isExplicitMention, stripBotMention } from "../../domain/message";
import { ERROR_LINES, pickLine } from "../../domain/lines";
import { epochMillis, isoStamp, nowInstant } from "../../domain/time";

/**
 * Discord Gateway client living in a Durable Object.
 *
 * MESSAGE_CREATE (needed for @kawaiko mentions) is only delivered over the
 * gateway WebSocket, never over the HTTP interactions endpoint. This DO keeps
 * one outbound WebSocket; a storage alarm plus a 5-minute cron act as watchdogs
 * that reconnect after evictions or deploys.
 *
 * Transport only. Deciding what kawaiko says lives in app-reply-to-mention.ts;
 * this file's job is to turn a socket frame into a normalized message and hand
 * it inward.
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

export interface GatewayStatus {
  connected: boolean;
  readyAt?: string;
  botUser?: { id: string; username: string };
  guildCount?: number;
  lastClose?: { code: number; reason: string; at: string };
  /** Outcome of the most recent mention handling, for debugging. */
  lastMention?: { at: string; ok: boolean; error?: string; model?: string };
}

interface MessageCreate {
  id: string;
  channel_id: string;
  timestamp?: string;
  guild_id?: string;
  content?: string;
  author?: { id: string; bot?: boolean; username?: string; global_name?: string | null };
  member?: { nick?: string | null };
  mentions?: Array<{ id: string }>;
  /** Present when the message is a reply; used to react to replies to kawaiko. */
  referenced_message?: { author?: { id: string } } | null;
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

  /** Idempotent: ensure a connection exists and the watchdog alarm is armed. */
  async ensure(): Promise<string> {
    await this.ctx.storage.setAlarm(nowInstant().epochMilliseconds + 60_000);
    if (this.open) return "connected";
    await this.openGateway();
    return "connecting";
  }

  async alarm(): Promise<void> {
    await this.ensure();
  }

  // Named openGateway because DurableObject already declares `connect`.
  private async openGateway(): Promise<void> {
    if (nowInstant().epochMilliseconds - this.lastIdentifyAt < IDENTIFY_COOLDOWN_MS) return;
    this.lastIdentifyAt = nowInstant().epochMilliseconds;
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
        lastClose: { code: event.code, reason: event.reason, at: isoStamp() },
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
        // Keep it simple: drop the session and re-identify on the next tick.
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
            readyAt: isoStamp(),
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
    const kawaiko = kawaikoFrom(this.env);
    const botId = kawaiko.botId;
    const content = msg.content ?? "";
    if (!msg.author) return;
    const guildId = msg.guild_id;
    if (!guildId) return; // Guild messages only (no DMs).

    // Observe before deciding whether to answer: kawaiko learns about the whole
    // server, not just the messages aimed at it. Its own lines belong in the
    // record too; every other bot is noise.
    const authorId = msg.author.id;
    const isSelf = authorId === botId;
    if (msg.author.bot && !isSelf) return;
    if (kawaiko.observeMessages && kawaiko.memory.available && content.trim()) {
      // Discord's own timestamp when it parses; the local clock otherwise.
      const at =
        (msg.timestamp ? epochMillis(msg.timestamp) : undefined) ?? nowInstant().epochMilliseconds;
      await kawaiko.memory.observe([
        {
          guildId,
          channelId: msg.channel_id,
          messageId: msg.id,
          authorId,
          authorLabel: displayNameOf(msg.author, msg.member?.nick),
          isKawaiko: isSelf,
          content: content.trim().slice(0, 2000),
          at,
        },
      ]);
    }
    if (isSelf) return;

    // React to explicit @mentions and to replies to kawaiko's own messages.
    const isReplyToBot = msg.referenced_message?.author?.id === botId;
    const mentionedIds = msg.mentions?.map((m) => m.id);
    if (!isReplyToBot && !isExplicitMention(botId, content, mentionedIds)) return;

    try {
      const result = await replyToMention(kawaiko, {
        messageId: msg.id,
        channelId: msg.channel_id,
        guildId,
        authorId,
        displayName: displayNameOf(msg.author, msg.member?.nick),
        body: stripBotMention(botId, content),
      });
      await this.recordStatus({
        lastMention: {
          at: isoStamp(),
          ok: true,
          model: result.kind === "answered" ? result.model : undefined,
        },
      });
    } catch (err) {
      console.error("gateway: mention reply failed:", err);
      await this.recordStatus({
        lastMention: { at: isoStamp(), ok: false, error: describeFailure(err) },
      });
      try {
        await kawaiko.chat.post(msg.channel_id, pickLine(ERROR_LINES), msg.id);
      } catch {
        // Give up quietly.
      }
    }
  }
}
