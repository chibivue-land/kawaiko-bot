import { describe, expect, it } from "vitest";
import { authorized, parseMemoryQuery } from "./http-routes";

const at = (path: string, query = "") => new URL(`https://kawaiko.example${path}${query}`);

describe("parseMemoryQuery", () => {
  it("lists servers when no guild is named", () => {
    expect(parseMemoryQuery("GET", at("/memory"))).toEqual({ kind: "guilds" });
  });

  it("reads one server's state", () => {
    expect(parseMemoryQuery("GET", at("/memory", "?guild=g1"))).toEqual({
      kind: "state",
      guildId: "g1",
    });
  });

  it("undoes a batch, carrying the reason along", () => {
    expect(
      parseMemoryQuery("POST", at("/memory/retract-batch", "?guild=g1&batch=b1&note=誤学習")),
    ).toEqual({ kind: "retract-batch", guildId: "g1", batch: "b1", note: "誤学習" });
  });

  it("rolls back to an offset", () => {
    expect(parseMemoryQuery("POST", at("/memory/rollback", "?guild=g1&seq=42"))).toEqual({
      kind: "rollback",
      guildId: "g1",
      seq: 42,
      note: undefined,
    });
  });

  it("rejects an undo that is missing its target", () => {
    expect(parseMemoryQuery("POST", at("/memory/retract-batch", "?guild=g1"))).toBeUndefined();
    expect(parseMemoryQuery("POST", at("/memory/retract-batch", "?batch=b1"))).toBeUndefined();
    expect(parseMemoryQuery("POST", at("/memory/rollback", "?seq=1"))).toBeUndefined();
  });

  it("never reads a missing seq as 'roll back to zero'", () => {
    // Number(null) and Number("") are both 0, which would have turned a
    // malformed request into "forget this entire server".
    for (const query of ["?guild=g1", "?guild=g1&seq=", "?guild=g1&seq=abc", "?guild=g1&seq=-1"]) {
      expect(parseMemoryQuery("POST", at("/memory/rollback", query)), query).toBeUndefined();
    }
  });

  it("still accepts an explicit zero", () => {
    expect(parseMemoryQuery("POST", at("/memory/rollback", "?guild=g1&seq=0"))).toMatchObject({
      kind: "rollback",
      seq: 0,
    });
  });

  it("does not accept a destructive action over GET", () => {
    expect(parseMemoryQuery("GET", at("/memory/rollback", "?guild=g1&seq=1"))).toBeUndefined();
  });

  it("rejects unknown memory paths", () => {
    expect(parseMemoryQuery("POST", at("/memory/wipe", "?guild=g1"))).toBeUndefined();
  });
});

describe("authorized", () => {
  const withHeader = (value?: string) =>
    new Request("https://kawaiko.example/memory", {
      headers: value ? { Authorization: value } : {},
    });

  it("accepts the configured bearer token", () => {
    expect(authorized(withHeader("Bearer secret"), "secret")).toBe(true);
  });

  it("rejects a wrong or missing token", () => {
    expect(authorized(withHeader("Bearer wrong"), "secret")).toBe(false);
    expect(authorized(withHeader(), "secret")).toBe(false);
  });

  it("refuses everything when no token is configured", () => {
    // Otherwise an unset secret would silently open the endpoint.
    expect(authorized(withHeader("Bearer "), undefined)).toBe(false);
    expect(authorized(withHeader("Bearer undefined"), "")).toBe(false);
  });
});
