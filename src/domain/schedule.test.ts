import { describe, expect, it } from "vitest";
import { MUTTER_HOURS_JST, dispatchForHour, jstHour, jstNowLabel } from "./schedule";
import { Temporal } from "./time";

const at = (iso: string) => Temporal.Instant.from(iso);

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

  it("learns on odd non-mutter hours", () => {
    expect(dispatchForHour(1)).toBe("learn");
    expect(dispatchForHour(21)).toBe("learn");
  });

  it("mutter hours win over the even-hour reply rule", () => {
    // 18 is even but designated as a mutter hour.
    expect(dispatchForHour(18)).toBe("mutter");
  });

  it("spreads the day across all three jobs", () => {
    const actions = [...Array(24).keys()].map(dispatchForHour);
    expect(actions.filter((a) => a === "mutter")).toHaveLength(4);
    expect(actions.filter((a) => a === "reply").length).toBeGreaterThanOrEqual(10);
    expect(actions.filter((a) => a === "learn").length).toBeGreaterThanOrEqual(8);
  });
});

describe("jstHour", () => {
  it("reads the hour in Tokyo, not UTC", () => {
    expect(jstHour(at("2026-08-21T00:07:00Z"))).toBe(9);
    expect(jstHour(at("2026-08-21T15:07:00Z"))).toBe(0);
  });
});

describe("jstNowLabel", () => {
  it("formats an instant as Japanese wall-clock time", () => {
    // 2026-08-21T13:50Z -> 22:50 JST the same day (Friday)
    expect(jstNowLabel(at("2026-08-21T13:50:00Z"))).toBe("8月21日(金) 22:50");
  });

  it("rolls the date over across midnight JST", () => {
    // 2026-08-21T16:30Z -> 2026-08-22 01:30 JST (Saturday)
    expect(jstNowLabel(at("2026-08-21T16:30:00Z"))).toBe("8月22日(土) 1:30");
  });

  it("names every weekday correctly", () => {
    // 2026-08-17 is a Monday; walk a full week in JST.
    const labels = [...Array(7).keys()].map((offset) =>
      jstNowLabel(at(`2026-08-${17 + offset}T03:00:00Z`)),
    );
    const weekdayOf = (label: string) => /\((.)\)/.exec(label)?.[1];
    expect(labels.map(weekdayOf)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
  });
});
