import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * キャッシュの指紋に入れるもの．
 *
 * 基本は自動追跡 — 手で書いたグロブは必ずどこかでずれる．ただし
 * `node_modules/.modules.yaml` は除く．pnpm が install のたびに書き直す
 * メタデータで，中身が毎回変わるので，これが混ざっていると CI では**永久に
 * ヒットしない** (実際に一度そうなった)．依存そのものの変化は，同じ自動追跡が
 * 拾う依存のソースと，鍵に入れてある pnpm-lock.yaml が見ている．
 */
const 読んだもの = [{ auto: true }, "!node_modules/.modules.yaml"] as const;

export default defineConfig(({ mode }) => ({
  // vitest のときは workerd を挟まない — 単体テストは Node 上の純粋な関数を叩く．
  plugins: mode === "test" ? [] : [cloudflare()],
  build: {
    // 出力先．wrangler は Cloudflare プラグインが吐く設定を見て，ここから配る．
    outDir: "成果物",
  },
  test: {
    include: ["源/**/*.test.ts"],
    // 約束の `.んで` は組み込みのプロトタイプに足しているので，どの試験より
    // 先に一度読み込ませる．
    setupFiles: ["源/共通/約束.ts"],
  },
  // Vite Task の定義 (`vp run <名前>` で呼ぶ)．このリポジトリに npm scripts は無い．
  //
  // 結果はタスクキャッシュに入る (node_modules/.vite/task-cache)．鍵になるのは
  // 読んだファイルの中身なので，触っていないところは CI でも手元でも 2 度は
  // 走らない．input を書かずに任せているのは，自動追跡のほうが正確だから．
  run: {
    tasks: {
      確認: {
        command: "vp check",
        input: 読んだもの,
        // 何も書き出さない．通ったという事実だけがキャッシュに残る．
        output: [],
      },

      試験: {
        command: "vp test",
        input: 読んだもの,
        output: [],
      },

      組み立て: {
        command: "vp build",
        input: 読んだもの,
        // キャッシュから戻すのはここ．戻したものは実ビルドと 1 バイトも違わない．
        output: ["成果物/**"],
      },

      // 外へ出す 2 つは副作用があるので，結果を使い回さない．
      // 配る が組み立てを自分でやらないのは，そこはキャッシュに任せたいため．
      配る: {
        command: "wrangler deploy",
        dependsOn: ["組み立て"],
        cache: false,
      },

      アイコン同期: {
        command: "node 道具/アイコン同期.ts",
        cache: false,
      },
    },
  },
}));
