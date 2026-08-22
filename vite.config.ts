import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

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
  // どちらも副作用があるので，Vite Task の結果キャッシュから外す．
  run: {
    tasks: {
      deploy: {
        command: "vp build && wrangler deploy",
        cache: false,
      },
      アイコン同期: {
        command: "node 道具/アイコン同期.ts",
        cache: false,
      },
    },
  },
}));
