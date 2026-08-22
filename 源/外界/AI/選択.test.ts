import { describe, expect, it, vi } from "vitest";
import { モデル一覧を読む, 既定のモデル一覧, 順に試す発話器 } from "./選択";
import type { モデル提供者 } from "./提供者";

const 依頼 = { 指示書: "指示書", 指示文: "指示文" };

/** どのモデル id も受け持ち，渡された処理へ委ねる提供者． */
function 提供者を作る(実行: (モデル: string) => Promise<string>): モデル提供者 {
  return {
    名前: "偽物",
    受け持つか: () => true,
    async 実行する(モデル) {
      return { 本文: await 実行(モデル), 費用ドル: 0.001, モデル };
    },
  };
}

describe("順に試す発話器", () => {
  it("kawaiko を落とした「1 日の無料枠」のエラーでも次へ渡す", () => {
    // 本番の文面そのまま．以前の「再試行してよいか」判定の一覧のどれにも当たらず，
    // 次のモデルへ行かずに連鎖が切れた．
    const 枯渇 = new Error(
      "4006: you have used up your daily free allocation of 10,000 neurons, " +
        "please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.",
    );
    枯渇.name = "AiError";

    const 実行 = vi.fn(async (モデル: string) => {
      if (モデル === "@cf/一つ目") throw 枯渇;

      return "二番目のモデルが答えた";
    });

    return 順に試す発話器([提供者を作る(実行)], ["@cf/一つ目", "@cf/二つ目"])
      .発話する(依頼)
      .then((結果) => {
        expect(結果.本文).toBe("二番目のモデルが答えた");
        expect(結果.モデル).toBe("@cf/二つ目");
        expect(実行).toHaveBeenCalledTimes(2);
      });
  });

  it("誰も知らない失敗でも次へ渡す", async () => {
    const 実行 = vi.fn(async (モデル: string) => {
      if (モデル === "あ") throw new Error("誰も数え上げていない失敗");

      return "生き残り";
    });

    expect((await 順に試す発話器([提供者を作る(実行)], ["あ", "い"]).発話する(依頼)).本文).toBe(
      "生き残り",
    );
  });

  it("全部尽きたら最後の失敗を伝える", async () => {
    const 実行 = vi.fn(async (モデル: string) => {
      throw new Error(`${モデル} が落ちている`);
    });

    await expect(順に試す発話器([提供者を作る(実行)], ["あ", "い"]).発話する(依頼)).rejects.toThrow(
      "い が落ちている",
    );
    expect(実行).toHaveBeenCalledTimes(2);
  });

  it("最初のモデルで足りたらそこで止まる", async () => {
    const 実行 = vi.fn(async () => "一番目で足りた");

    const 結果 = await 順に試す発話器([提供者を作る(実行)], ["あ", "い"]).発話する(依頼);

    expect(結果.モデル).toBe("あ");
    expect(実行).toHaveBeenCalledTimes(1);
  });

  it("モデルごとに，名乗り出た提供者へ振り分ける", async () => {
    const cf: モデル提供者 = {
      名前: "cf",
      受け持つか: (モデル) => モデル.startsWith("@cf/"),
      async 実行する(モデル) {
        throw new Error(`${モデル} は使えない`);
      },
    };
    const gemini: モデル提供者 = {
      名前: "gemini",
      受け持つか: (モデル) => モデル.startsWith("gemini-"),
      async 実行する(モデル) {
        return { 本文: "gemini が答えた", 費用ドル: 0, モデル };
      },
    };

    const 結果 = await 順に試す発話器([cf, gemini], ["@cf/x", "gemini-y"]).発話する(依頼);

    expect(結果.本文).toBe("gemini が答えた");
  });

  it("受け持つ提供者が居ないモデルは，落ちずに飛ばす", async () => {
    const gemini: モデル提供者 = {
      名前: "gemini",
      受け持つか: (モデル) => モデル.startsWith("gemini-"),
      async 実行する(モデル) {
        return { 本文: "よい", 費用ドル: 0, モデル };
      },
    };

    const 結果 = await 順に試す発話器([gemini], ["謎のモデル", "gemini-y"]).発話する(依頼);

    expect(結果.モデル).toBe("gemini-y");
  });

  it("何も設定されていなければ投げる", async () => {
    await expect(順に試す発話器([], []).発話する(依頼)).rejects.toThrow("モデルが 1 つも");
  });
});

describe("モデル一覧を読む", () => {
  it("区切って，前後を落として，空を捨てる", () => {
    expect(モデル一覧を読む(" あ , い ,, う ")).toEqual(["あ", "い", "う"]);
  });

  it("未設定なら既定の一覧に倒れる", () => {
    expect(モデル一覧を読む(undefined)).toEqual(既定のモデル一覧.split(","));
    expect(モデル一覧を読む("")).toEqual(既定のモデル一覧.split(","));
  });

  it("既定では Workers AI が Gemini より先に来る", () => {
    // 1 日の無料枠を使い切ってから，従量課金の API へ行くべきなので．
    expect(モデル一覧を読む(undefined)[0]?.startsWith("@cf/")).toBe(true);
  });
});
