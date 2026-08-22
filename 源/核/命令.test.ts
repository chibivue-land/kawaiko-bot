import { describe, expect, it } from "vitest";
import { リセット命令か } from "./命令";

describe("リセット命令か", () => {
  it("用意した言い方に反応する", () => {
    for (const 命令 of ["reset", "/reset", "RESET", "リセット", "忘れて", "記憶リセット"]) {
      expect(リセット命令か(命令), 命令).toBe(true);
    }
  });

  it("末尾の句読点や鉤括弧は無視する", () => {
    expect(リセット命令か("  リセット！ ")).toBe(true);
    expect(リセット命令か("「reset」")).toBe(true);
  });

  it("普通の雑談を飲み込まない", () => {
    for (const 本文 of [
      "さっきの話は忘れてもらっていいですか",
      "reset ってどういう意味ですか",
      "リセットしたほうがいい?",
      "",
    ]) {
      expect(リセット命令か(本文), 本文).toBe(false);
    }
  });
});
