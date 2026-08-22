import type { UserRateLimiter } from "./DO/利用制限";
import type { BudgetTracker } from "./DO/予算";
// 振る舞い/接続口.ts の「チャンネル記録」ポートと同じ意味だが、こちらはそれを実装する
// Durable Object。両方を同時に import する場所は無い。
import type { ChannelMemory } from "./DO/チャンネル記録";
import type { DiscordGateway } from "./Discord/接続";
import { 数値 } from "../共通/型";
import type { 文字列, 省略可 } from "../共通/型";

/**
 * Worker のバインディング。wrangler.jsonc の宣言そのまま。
 *
 * ここがいちばん外側。名指ししてよいのは 外界/ と 入口.ts だけ。ユースケースは
 * 代わりに部品一式 (振る舞い/接続口.ts) を受け取る。だから Cloudflare のランタイム
 * 抜きで試験できる。
 *
 * 項目名が英語なのは、これが identifier ではなく wrangler.jsonc と握手している
 * 名前だから。
 */
export interface 環境 {
  // vars
  KAWAIKO_MODEL: 文字列;

  POST_PROBABILITY: 文字列;

  REPLY_PROBABILITY: 文字列;

  RATE_LIMIT_PER_HOUR: 文字列;

  RATE_LIMIT_PER_DAY: 文字列;

  MONTHLY_BUDGET_USD: 文字列;

  DISCORD_APPLICATION_ID: 文字列;

  KAWAIKO_CHANNEL_ID: 文字列;

  /** "false" で観測ログの書き込みを止める。 */
  OBSERVE_MESSAGES?: 省略可<文字列>;

  // secrets (wrangler secret put)
  DISCORD_BOT_TOKEN: 文字列;

  GEMINI_API_KEY: 文字列;

  TRIGGER_TOKEN: 文字列;

  /** 権限なしの PAT。共有 Workers IP からの未認証 GitHub API は死んでいるため。 */
  GITHUB_API_TOKEN?: 省略可<文字列>;

  // bindings
  AI: Ai;

  USER_RATE_LIMITER: DurableObjectNamespace<UserRateLimiter>;

  BUDGET_TRACKER: DurableObjectNamespace<BudgetTracker>;

  DISCORD_GATEWAY: DurableObjectNamespace<DiscordGateway>;

  /** チャンネルごとに 1 つ。「このチャンネルを忘れる」をそこに閉じ込める。 */
  CHANNEL_MEMORY: DurableObjectNamespace<ChannelMemory>;

  /**
   * サーバー単位の長期記憶。省略可: D1 を用意して繋ぐまで kawaiko は単に
   * 覚えないだけで、他は何も変わらずに動く。
   */
  DB?: 省略可<D1Database>;
}

/** 月の上限 (既定つき)。 */
export function 月の予算ドル(環境: 環境): 数値 {
  return 数値(環境.MONTHLY_BUDGET_USD) || 100;
}
