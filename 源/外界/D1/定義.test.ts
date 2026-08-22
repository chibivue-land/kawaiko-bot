import { 仕様, 検証, 期待 } from "../../試験/言葉";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { 記憶の出来事, 観測表 } from "./定義";
import 移行のSQL from "../../../移行/0001_記憶ログ.sql?raw";
import { 新しい型, 新しい集合 } from "../../共通/型";
import { 等しい } from "../../共通/演算";

/**
 * マイグレーションを手書きにしているのは，ビュー 2 つが取り消し・置き換え・
 * ロールバックを畳み込むから．スキーマビルダーに書かせる量ではないので Drizzle 側は
 * `.existing()` にしてあり，DDL は 移行/ にある．つまり同じ表の説明が 2 つある
 * ことになる．それは静かにずれる類のもので，このテストがその継ぎ目．
 */

/** マイグレーションの中の，ある CREATE TABLE の本体． */
function 表の定義(名前: string): string {
  const 一致 = 新しい型(`CREATE TABLE IF NOT EXISTS ${名前} \\(([\\s\\S]*?)\\n\\);`).exec(
    移行のSQL,
  );

  期待(一致, `${名前} の CREATE TABLE が無い`).が真();

  return 一致![1]!;
}

const 表一覧 = [観測表, 記憶の出来事];

仕様("Drizzle の定義とマイグレーションが同じ表を語る", () => {
  検証.each(表一覧.map((表) => [getTableConfig(表).name, 表] as const))(
    "%s の列が一致する",
    (名前, 表) => {
      const 定義 = 表の定義(名前);
      const 宣言済み = getTableConfig(表).columns.map((列) => 列.name);

      for (const 列 of 宣言済み) {
        期待(定義, `${名前}.${列} がマイグレーションに無い`).を含む(列);
      }

      // 逆も．マイグレーション側にしかない列があってはいけない．
      const SQL側 = 定義
        .split("\n")
        .map((行) => /^\s{2}(\w+)\s+(INTEGER|TEXT|REAL)/.exec(行.trim() ? 行 : "")?.[1])
        .filter((列): 列 is string => Boolean(列));

      期待(新しい集合(SQL側)).と等しい(新しい集合(宣言済み));
    },
  );

  検証.each(表一覧.map((表) => [getTableConfig(表).name, 表] as const))(
    "%s の索引が一致する",
    (名前, 表) => {
      for (const 索引 of getTableConfig(表).indexes) {
        期待(移行のSQL, `索引 ${索引.config.name} がマイグレーションに無い`).を含む(
          索引.config.name!,
        );
      }
    },
  );

  検証("窓を読み直しても安全にする発言 id の一意制約を保つ", () => {
    期待(表の定義("observations")).に一致する(/message_id\s+TEXT\s+NOT NULL\s+UNIQUE/);
    期待(
      getTableConfig(観測表).columns.find((列) => 等しい(列.name, "message_id"))?.isUnique,
    ).である(true);
  });

  検証("畳み込みが要るビューを宣言している", () => {
    期待(移行のSQL).を含む("CREATE VIEW IF NOT EXISTS memory_kept");
    期待(移行のSQL).を含む("CREATE VIEW IF NOT EXISTS memory_live");
  });
});
