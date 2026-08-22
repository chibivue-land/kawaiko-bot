import { describe, expect, it } from "vitest";
import { 認可されているか, 記憶への問いを読み取る } from "./経路";

const 場所 = (経路: string, 問い合わせ = "") =>
  new URL(`https://kawaiko.example${経路}${問い合わせ}`);

describe("記憶への問いを読み取る", () => {
  it("サーバーの指定が無ければ一覧を返す", () => {
    expect(記憶への問いを読み取る("GET", 場所("/memory"))).toEqual({ 種別: "サーバー一覧" });
  });

  it("1 つのサーバーの現状を読む", () => {
    expect(記憶への問いを読み取る("GET", 場所("/memory", "?guild=g1"))).toEqual({
      種別: "現状",
      サーバーid: "g1",
    });
  });

  it("回の取り消しは理由も一緒に運ぶ", () => {
    expect(
      記憶への問いを読み取る(
        "POST",
        場所("/memory/retract-batch", "?guild=g1&batch=b1&note=誤学習"),
      ),
    ).toEqual({ 種別: "回を取り消す", サーバーid: "g1", 識別子: "b1", 理由: "誤学習" });
  });

  it("位置を指定して巻き戻す", () => {
    expect(記憶への問いを読み取る("POST", 場所("/memory/rollback", "?guild=g1&seq=42"))).toEqual({
      種別: "巻き戻す",
      サーバーid: "g1",
      連番: 42,
      理由: undefined,
    });
  });

  it("対象の欠けた取り消しは受け取らない", () => {
    expect(
      記憶への問いを読み取る("POST", 場所("/memory/retract-batch", "?guild=g1")),
    ).toBeUndefined();
    expect(
      記憶への問いを読み取る("POST", 場所("/memory/retract-batch", "?batch=b1")),
    ).toBeUndefined();
    expect(記憶への問いを読み取る("POST", 場所("/memory/rollback", "?seq=1"))).toBeUndefined();
  });

  it("位置の書き忘れを「0 へ巻き戻す」と読まない", () => {
    // 数値(null) も 数値("") も 0 になる。読み違えると、書き損じた要求が
    // 「このサーバーを丸ごと忘れる」になってしまう。
    for (const 問い合わせ of [
      "?guild=g1",
      "?guild=g1&seq=",
      "?guild=g1&seq=abc",
      "?guild=g1&seq=-1",
    ]) {
      expect(
        記憶への問いを読み取る("POST", 場所("/memory/rollback", 問い合わせ)),
        問い合わせ,
      ).toBeUndefined();
    }
  });

  it("はっきり書かれた 0 は受け取る", () => {
    expect(
      記憶への問いを読み取る("POST", 場所("/memory/rollback", "?guild=g1&seq=0")),
    ).toMatchObject({ 種別: "巻き戻す", 連番: 0 });
  });

  it("壊す操作を GET では受け付けない", () => {
    expect(
      記憶への問いを読み取る("GET", 場所("/memory/rollback", "?guild=g1&seq=1")),
    ).toBeUndefined();
  });

  it("知らない記憶の経路は断る", () => {
    expect(記憶への問いを読み取る("POST", 場所("/memory/wipe", "?guild=g1"))).toBeUndefined();
  });
});

describe("認可されているか", () => {
  const 見出し付きの要求 = (値?: string) =>
    new Request("https://kawaiko.example/memory", {
      headers: 値 ? { Authorization: 値 } : {},
    });

  // HTTP のヘッダは ByteString なので、合言葉は ASCII に限られる (実物もそう)。
  const 合言葉 = "s3cret";

  it("設定した合言葉を受け入れる", () => {
    expect(認可されているか(見出し付きの要求(`Bearer ${合言葉}`), 合言葉)).toBe(true);
  });

  it("違う / 無い合言葉は断る", () => {
    expect(認可されているか(見出し付きの要求("Bearer wrong"), 合言葉)).toBe(false);
    expect(認可されているか(見出し付きの要求(), 合言葉)).toBe(false);
  });

  it("合言葉が設定されていなければ何も通さない", () => {
    // でないと、秘密の設定漏れがそのまま口の開放になる。
    expect(認可されているか(見出し付きの要求("Bearer "), undefined)).toBe(false);
    expect(認可されているか(見出し付きの要求("Bearer undefined"), "")).toBe(false);
  });
});
