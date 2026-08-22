/**
 * ログ出力。
 *
 * `console.log` をそのまま呼ぶと、日本語で書いた実装の中で 1 行だけ英語が残る。
 * bind した別名を通しておけば、呼び名まで日本語で揃う。実体は同じ関数なので
 * Cloudflare のダッシュボードに出るものは変わらない。
 */
import type { 無, 不明 } from "./型";

/** 普段の記録。 */
export const 記す: (...内容: 不明[]) => 無 = console.log.bind(console);
/** 気に留めてほしいこと。落ちてはいない。 */
export const 注意: (...内容: 不明[]) => 無 = console.warn.bind(console);
/** 転んだこと。 */
export const 異常: (...内容: 不明[]) => 無 = console.error.bind(console);
