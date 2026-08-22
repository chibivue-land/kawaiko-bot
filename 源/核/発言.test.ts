import { describe, expect, it } from "vitest";
import { メンションを取り除く, 名指しされたか } from "./発言";

const 自分のid = "1540328713248440390";

describe("名指しされたか", () => {
  it("mentions の一覧を見る", () => {
    expect(名指しされたか(自分のid, "やあ", [自分のid])).toBe(true);
    expect(名指しされたか(自分のid, "やあ", ["999"])).toBe(false);
  });

  it("生のメンションタグ (ニックネーム形も) を拾う", () => {
    expect(名指しされたか(自分のid, `<@${自分のid}> やあ`, undefined)).toBe(true);
    expect(名指しされたか(自分のid, `<@!${自分のid}> やあ`, undefined)).toBe(true);
  });

  it("@everyone と他人へのメンションは無視する", () => {
    expect(名指しされたか(自分のid, "@everyone やあ", [])).toBe(false);
    expect(名指しされたか(自分のid, "<@999> やあ", [])).toBe(false);
  });
});

describe("メンションを取り除く", () => {
  it("自分のタグだけ消して空白を詰める", () => {
    expect(メンションを取り除く(自分のid, `<@${自分のid}>  こんにちは   kawaiko `)).toBe(
      "こんにちは kawaiko",
    );
    expect(メンションを取り除く(自分のid, `<@!${自分のid}>元気?`)).toBe("元気?");
  });

  it("他人へのメンションは残す", () => {
    expect(メンションを取り除く(自分のid, `<@${自分のid}> <@999> みて`)).toBe("<@999> みて");
  });
});
