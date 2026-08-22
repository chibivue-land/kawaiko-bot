import type { 利用制限帳 } from "./永続体/利用制限";
import type { 予算帳 } from "./永続体/予算";
// 振る舞い/接続口.ts の「チャンネル記録」ポートと同じ意味だが，こちらはそれを実装する
// Durable Object．両方を同時に import する場所は無い．
import type { チャンネル記録帳 } from "./永続体/チャンネル記録";
import type { Discord接続 } from "./Discord/接続";
import { 数値, 文字列 } from "../共通/型";
import type { 省略可 } from "../共通/型";

/**
 * Worker のバインディング．wrangler.jsonc の宣言そのまま．
 *
 * ここがいちばん外側．名指ししてよいのは 外界/ と 入口.ts だけ．ユースケースは
 * 代わりに部品一式 (振る舞い/接続口.ts) を受け取る．だから Cloudflare のランタイム
 * 抜きで試験できる．
 *
 * 項目名が英語なのは，これが identifier ではなく wrangler.jsonc と握手している
 * 名前だから．
 */
export interface 環境 {
  // vars
  モデル一覧: 文字列;

  独言の確率: 文字列;

  横槍の確率: 文字列;

  時あたりの上限: 文字列;

  日あたりの上限: 文字列;

  月の予算ドル: 文字列;

  kawaikoのid: 文字列;

  住処のチャンネルid: 文字列;

  /** "false" で観測ログの書き込みを止める． */
  観測するか?: 省略可<文字列>;

  // secrets (wrangler secret put)
  DISCORD_BOT_TOKEN: 文字列;

  GEMINI_API_KEY: 文字列;

  TRIGGER_TOKEN: 文字列;

  /** 権限なしの PAT．共有 Workers IP からの未認証 GitHub API は死んでいるため． */
  GITHUB_API_TOKEN?: 省略可<文字列>;

  // bindings
  推論: Ai;

  利用制限帳: DurableObjectNamespace<利用制限帳>;

  予算帳: DurableObjectNamespace<予算帳>;

  Discord接続: DurableObjectNamespace<Discord接続>;

  /** チャンネルごとに 1 つ．「このチャンネルを忘れる」をそこに閉じ込める． */
  チャンネル記録帳: DurableObjectNamespace<チャンネル記録帳>;

  /**
   * サーバー単位の長期記憶．省略可: D1 を用意して繋ぐまで kawaiko は単に
   * 覚えないだけで，他は何も変わらずに動く．
   */
  記憶のD1?: 省略可<D1Database>;
}

/** 月の上限 (既定つき)． */
export function 月の予算ドル(環境: 環境): 数値 {
  return 数値(環境.月の予算ドル) || 100;
}
