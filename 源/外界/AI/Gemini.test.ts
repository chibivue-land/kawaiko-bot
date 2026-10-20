import { Gemini提供者, 思考の段 } from "./Gemini";

import { 仕様, 検証, 期待 } from "../../試験/言葉";

import { 偽, 真 } from "../../共通/型";

仕様("Gemini提供者", () => {
  検証("Gemini API の Gemma 4 も受け持つ", () => {
    // AI Studio のキーなら無料で，枠も Gemini のモデルとは別に数えられる．
    const 提供者 = Gemini提供者("かぎ");

    期待(提供者.受け持つか("gemini-3.8-flash")).である(真);
    期待(提供者.受け持つか("gemma-4-31b-it")).である(真);
  });

  検証("Workers AI の Gemma は受け持たない", () => {
    期待(Gemini提供者("かぎ").受け持つか("@cf/google/gemma-4-26b-a4b-it")).である(偽);
  });
});

仕様("思考の段", () => {
  検証("Gemma には minimal か high しか渡さない", () => {
    // low を渡すと 400 で断られる．
    期待(思考の段("gemma-4-31b-it", "low")).である("minimal");
    期待(思考の段("gemma-4-31b-it", "medium")).である("high");
    期待(思考の段("gemma-4-26b-a4b-it", "high")).である("high");
  });

  検証("Gemini には頼まれた深さをそのまま渡す", () => {
    期待(思考の段("gemini-3.8-flash", "low")).である("low");
    期待(思考の段("gemini-3.5-flash-lite", "medium")).である("medium");
  });
});
