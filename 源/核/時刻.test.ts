import { describe, expect, it } from "vitest";
import { ISO時刻, エポックミリ秒, 時刻を読む, 日本時間, Temporal } from "./時刻";

describe("時刻を読む", () => {
  it("ISO 文字列を読める", () => {
    expect(時刻を読む("2026-08-21T13:50:00Z")?.epochMilliseconds).toBe(
      Date.UTC(2026, 7, 21, 13, 50),
    );
  });

  it("壊れた入力では例外ではなく undefined を返す", () => {
    expect(時刻を読む("not-a-timestamp")).toBeUndefined();
    expect(エポックミリ秒("")).toBeUndefined();
  });
});

describe("ISO時刻", () => {
  it("ミリ秒精度に丸める", () => {
    const 時刻 = Temporal.Instant.from("2026-08-21T13:50:00.123456789Z");
    expect(ISO時刻(時刻)).toBe("2026-08-21T13:50:00.123Z");
  });
});

describe("日本時間", () => {
  it("自前の時差計算ではなく実際のタイムゾーンを使う", () => {
    const 東京 = Temporal.Instant.from("2026-08-21T13:50:00Z").toZonedDateTimeISO(日本時間);
    expect(東京.hour).toBe(22);
    expect(東京.timeZoneId).toBe("Asia/Tokyo");
  });
});
