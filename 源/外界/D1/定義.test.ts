import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { 記憶の出来事, 観測表 } from "./定義";
import 移行のSQL from "../../../移行/0001_記憶ログ.sql?raw";

/**
 * マイグレーションを手書きにしているのは、ビュー 2 つが取り消し・置き換え・
 * ロールバックを畳み込むから。スキーマビルダーに書かせる量ではないので Drizzle 側は
 * `.existing()` にしてあり、DDL は 移行/ にある。つまり同じ表の説明が 2 つある
 * ことになる。それは静かにずれる類のもので、このテストがその継ぎ目。
 */

/** マイグレーションの中の、ある CREATE TABLE の本体。 */
function 表の定義(名前: string): string {
  const 一致 = new RegExp(`CREATE TABLE IF NOT EXISTS ${名前} \\(([\\s\\S]*?)\\n\\);`).exec(
    移行のSQL,
  );

  expect(一致, `${名前} の CREATE TABLE が無い`).toBeTruthy();

  return 一致![1]!;
}

const 表一覧 = [観測表, 記憶の出来事];

describe("Drizzle の定義とマイグレーションが同じ表を語る", () => {
  it.each(表一覧.map((表) => [getTableConfig(表).name, 表] as const))(
    "%s の列が一致する",
    (名前, 表) => {
      const 定義 = 表の定義(名前);
      const 宣言済み = getTableConfig(表).columns.map((列) => 列.name);

      for (const 列 of 宣言済み) {
        expect(定義, `${名前}.${列} がマイグレーションに無い`).toContain(列);
      }

      // 逆も。マイグレーション側にしかない列があってはいけない。
      const SQL側 = 定義
        .split("\n")
        .map((行) => /^\s{2}(\w+)\s+(INTEGER|TEXT|REAL)/.exec(行.trim() ? 行 : "")?.[1])
        .filter((列): 列 is string => Boolean(列));

      expect(new Set(SQL側)).toEqual(new Set(宣言済み));
    },
  );

  it.each(表一覧.map((表) => [getTableConfig(表).name, 表] as const))(
    "%s の索引が一致する",
    (名前, 表) => {
      for (const 索引 of getTableConfig(表).indexes) {
        expect(移行のSQL, `索引 ${索引.config.name} がマイグレーションに無い`).toContain(
          索引.config.name!,
        );
      }
    },
  );

  it("窓を読み直しても安全にする発言 id の一意制約を保つ", () => {
    expect(表の定義("observations")).toMatch(/message_id\s+TEXT\s+NOT NULL\s+UNIQUE/);
    expect(getTableConfig(観測表).columns.find((列) => 列.name === "message_id")?.isUnique).toBe(
      true,
    );
  });

  it("畳み込みが要るビューを宣言している", () => {
    expect(移行のSQL).toContain("CREATE VIEW IF NOT EXISTS memory_kept");
    expect(移行のSQL).toContain("CREATE VIEW IF NOT EXISTS memory_live");
  });
});
