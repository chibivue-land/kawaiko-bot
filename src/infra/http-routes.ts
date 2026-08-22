import type { MemoryQuery } from "../app/memory-admin";

/**
 * Request parsing for the Worker's HTTP surface.
 *
 * Separate from index.ts so it can be tested without pulling the Durable
 * Object classes (and therefore `cloudflare:workers`) into the module graph.
 * Nothing here touches bindings; it turns a URL into an intent.
 */

/**
 *   GET  /memory                               servers kawaiko has observed
 *   GET  /memory?guild=<id>                    what it believes + recent batches
 *   POST /memory/retract-batch?guild=&batch=   undo one learning pass
 *   POST /memory/rollback?guild=&seq=          restore knowledge to an offset
 *
 * Undo is POST-only: a link preview or a curious crawler must not be able to
 * make kawaiko forget things.
 */
export function parseMemoryQuery(method: string, url: URL): MemoryQuery | undefined {
  const guildId = url.searchParams.get("guild") ?? undefined;
  const note = url.searchParams.get("note") ?? undefined;

  if (method === "GET" && url.pathname === "/memory") {
    return guildId ? { kind: "state", guildId } : { kind: "guilds" };
  }
  if (method === "POST" && url.pathname === "/memory/retract-batch") {
    const batch = url.searchParams.get("batch");
    return guildId && batch ? { kind: "retract-batch", guildId, batch, note } : undefined;
  }
  if (method === "POST" && url.pathname === "/memory/rollback") {
    // Parsed strictly: Number(null) and Number("") are both 0, so a missing
    // seq would otherwise mean "roll back to offset 0" — i.e. forget the whole
    // server, from a request that simply left out a parameter.
    const seq = parseOffset(url.searchParams.get("seq"));
    return guildId && seq !== undefined ? { kind: "rollback", guildId, seq, note } : undefined;
  }
  return undefined;
}

/** A non-negative integer offset, or undefined for anything else. */
function parseOffset(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const seq = Number(raw);
  return Number.isInteger(seq) && seq >= 0 ? seq : undefined;
}

/** Bearer check for the endpoints that expose or change stored knowledge. */
export function authorized(request: Request, token: string | undefined): boolean {
  return Boolean(token) && request.headers.get("Authorization") === `Bearer ${token}`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
