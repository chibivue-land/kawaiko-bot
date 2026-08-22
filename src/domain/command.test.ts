import { describe, expect, it } from "vitest";
import { isResetCommand } from "./command";

describe("isResetCommand", () => {
  it("matches the documented commands", () => {
    for (const command of ["reset", "/reset", "RESET", "リセット", "忘れて", "記憶リセット"]) {
      expect(isResetCommand(command), command).toBe(true);
    }
  });

  it("tolerates trailing punctuation and quotes", () => {
    expect(isResetCommand("  リセット！ ")).toBe(true);
    expect(isResetCommand("「reset」")).toBe(true);
  });

  it("does not swallow ordinary chat", () => {
    for (const text of [
      "さっきの話は忘れてもらっていいですか",
      "reset ってどういう意味ですか",
      "リセットしたほうがいい?",
      "",
    ]) {
      expect(isResetCommand(text), text).toBe(false);
    }
  });
});
