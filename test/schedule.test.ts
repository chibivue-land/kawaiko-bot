import { describe, expect, it } from "vitest";
import { MUTTER_HOURS_JST, dispatchForHour, jstHour } from "../src/schedule";

describe("dispatchForHour", () => {
  it("mutters on the designated JST hours", () => {
    for (const hour of MUTTER_HOURS_JST) {
      expect(dispatchForHour(hour)).toBe("mutter");
    }
  });

  it("replies on even non-mutter hours", () => {
    expect(dispatchForHour(0)).toBe("reply");
    expect(dispatchForHour(14)).toBe("reply");
    expect(dispatchForHour(22)).toBe("reply");
  });

  it("does nothing on odd non-mutter hours", () => {
    expect(dispatchForHour(1)).toBe("none");
    expect(dispatchForHour(21)).toBe("none");
  });

  it("mutter hours win over the even-hour reply rule", () => {
    // 18 is even but designated as a mutter hour.
    expect(dispatchForHour(18)).toBe("mutter");
  });

  it("averages a few posts per day", () => {
    const actions = [...Array(24).keys()].map(dispatchForHour);
    expect(actions.filter((a) => a === "mutter")).toHaveLength(4);
    expect(actions.filter((a) => a === "reply").length).toBeGreaterThanOrEqual(10);
  });
});

describe("jstHour", () => {
  it("converts UTC to JST hours", () => {
    expect(jstHour(new Date("2026-08-21T00:07:00Z"))).toBe(9);
    expect(jstHour(new Date("2026-08-21T15:07:00Z"))).toBe(0);
  });
});
