import { describe, expect, it } from "vitest";
import {
  お題がニュースを要るか,
  お題を選ぶ,
  お題一覧,
  投稿するか,
  独り言の指示文を組み立てる,
} from "./独言";

describe("お題を選ぶ", () => {
  it("一覧から決定的に選ぶ", () => {
    expect(お題を選ぶ(() => 0)).toBe(お題一覧[0]);
    expect(お題を選ぶ(() => 0.999_999)).toBe(お題一覧[お題一覧.length - 1]);
  });

  it("チャンネルが繰り返しに陥らないだけの数がある", () => {
    expect(お題一覧.length).toBeGreaterThanOrEqual(12);
    expect(new Set(お題一覧).size).toBe(お題一覧.length);
  });
});

describe("お題がニュースを要るか", () => {
  it("見出しを取りに行くのはニュースのお題だけ", () => {
    expect(お題一覧.filter(お題がニュースを要るか)).toHaveLength(1);
    expect(お題がニュースを要るか("眠気の話")).toBe(false);
  });
});

describe("投稿するか", () => {
  it("確率ゲートを守る", () => {
    expect(投稿するか("0.75", () => 0.5)).toBe(true);
    expect(投稿するか("0.75", () => 0.9)).toBe(false);
    expect(投稿するか("0", () => 0.0001)).toBe(false);
    expect(投稿するか("1", () => 0.9999)).toBe(true);
  });

  it("数値として読めない設定なら常に投稿する", () => {
    expect(投稿するか("ばなな", () => 0.99)).toBe(true);
  });
});

describe("独り言の指示文を組み立てる", () => {
  const 素 = {
    時刻の表示: "8月21日(金) 22:50",
    お題: お題一覧[0]!,
    見出し一覧: [] as string[],
    事実一覧: [],
    自分の直近発言: [] as string[],
    乱数: () => 0,
  };

  it("お題・トーン・長さのダイヤルを載せる", () => {
    const 指示文 = 独り言の指示文を組み立てる(素);

    expect(指示文).toContain(お題一覧[0]!);
    expect(指示文).toContain("ネタツイ風");
    expect(指示文).toContain("今回の長さ");
  });

  it("見出しは，あるときだけ載せる", () => {
    expect(独り言の指示文を組み立てる(素)).not.toContain("直近のニュース見出し");
    expect(独り言の指示文を組み立てる({ ...素, 見出し一覧: ["Vue 4 released"] })).toContain(
      "- Vue 4 released",
    );
  });

  it("何を繰り返してはいけないか伝える", () => {
    const 指示文 = 独り言の指示文を組み立てる({ ...素, 自分の直近発言: ["さっき言ったこと"] });

    expect(指示文).toContain("さっき言ったこと");
    expect(指示文).toContain("コピーするのは禁止");
  });
});
