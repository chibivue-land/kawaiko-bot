import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit は src/基盤/D1/定義.ts からスキーマを読み、SQL を migrations/ へ
 * 書き出す。`wrangler d1 migrations apply` が読むのと同じ場所。
 *
 * ビュー 2 つは手書きのマイグレーション側にある。あの畳み込みはスキーマビルダーに
 * 書かせる量ではないので、定義.ts では `.existing()` として型付けのためだけに
 * 宣言してある。
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./源/外界/D1/定義.ts",
  out: "./移行",
});
