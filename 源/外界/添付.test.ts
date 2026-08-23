import { 信用できる場所か } from "./添付";

import { 仕様, 検証, 期待 } from "../試験/言葉";

import { 各要素に } from "../共通/反復";
import { 偽, 真 } from "../共通/型";

仕様("信用できる場所か", () => {
  検証("Discord の CDN は取りに行く", () => {
    各要素に(
      [
        "https://cdn.discordapp.com/attachments/1/2/図.png",
        "https://media.discordapp.net/attachments/1/2/図.png",
      ],
      (場所) => {
        期待(信用できる場所か(場所)).である(真);
      },
    );
  });

  検証("他所へは取りに行かない", () => {
    各要素に(
      [
        "https://example.com/図.png",
        // 名前に紛れ込ませただけのもの．
        "https://cdn.discordapp.com.example.com/図.png",
        "https://evil.example/cdn.discordapp.com/図.png",
      ],
      (場所) => {
        期待(信用できる場所か(場所)).である(偽);
      },
    );
  });

  検証("http は受けない", () => {
    期待(信用できる場所か("http://cdn.discordapp.com/図.png")).である(偽);
  });

  検証("URL として読めないものは受けない", () => {
    期待(信用できる場所か("")).である(偽);
    期待(信用できる場所か("これは URL ではない")).である(偽);
  });
});
