import { describe, expect, it } from "vitest";
import {
  人格指示書を組み立てる,
  口調の規則,
  返しの型を選ぶ,
  返しの型一覧,
  返しの長さを選ぶ,
  返しの長さ一覧,
} from "./人格";

describe("人格指示書を組み立てる", () => {
  const 指示書 = 人格指示書を組み立てる();

  it("一人称の絶対ルールを載せる", () => {
    expect(指示書).toContain("一人称は必ず「kawaiko」");
  });

  it("語彙集をひな型へ実際に差し込む", () => {
    expect(指示書).toContain("文体の特徴");
    expect(指示書).toContain("口癖");
    // 差し込み口が文字のまま出ていないこと。
    expect(指示書).not.toContain("{{語彙集}}");
  });

  it("人間嫌いを架空のものに留め、誰にも向けさせない", () => {
    expect(指示書).toContain("人類");
    expect(指示書).toContain("攻撃や差別");
  });

  it("長さを意図的にばらつかせるよう頼む", () => {
    expect(指示書).toContain("毎回同じ分量に収束させない");
  });
});

describe("抑揚のダイヤル", () => {
  it("型は一覧の端から端まで選ばれる", () => {
    expect(返しの型を選ぶ(() => 0)).toBe(返しの型一覧[0]);
    expect(返しの型を選ぶ(() => 0.999_999)).toBe(返しの型一覧[返しの型一覧.length - 1]);
  });

  it("長さは短い側に寄りつつ、長い側にも届く", () => {
    expect(返しの長さを選ぶ(() => 0)).toBe(返しの長さ一覧[0]!.指示);
    expect(返しの長さを選ぶ(() => 0.999_999)).toBe(返しの長さ一覧[返しの長さ一覧.length - 1]!.指示);
  });

  it("チャンネルが一つの型に落ち着けないだけの数がある", () => {
    expect(返しの型一覧.length).toBeGreaterThanOrEqual(10);
    expect(new Set(返しの型一覧).size).toBe(返しの型一覧.length);
  });

  it("短い側が出やすく、長い側は稀である", () => {
    const 重み = (指示: string) => 返しの長さ一覧.find((項) => 項.指示 === 指示)!.重み;

    expect(重み(返しの長さ一覧[0]!.指示)).toBeGreaterThan(
      重み(返しの長さ一覧[返しの長さ一覧.length - 1]!.指示),
    );
  });
});

describe("口調の規則", () => {
  it("変えてよいのは伝え方だけで、人格ではないと明言する", () => {
    expect(口調の規則).toContain("キャラは絶対に変えない");
    expect(口調の規則).toContain("書き出し");
  });
});
