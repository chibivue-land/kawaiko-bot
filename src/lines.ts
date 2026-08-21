/**
 * Canned fallback lines (in kawaiko's voice) for situations where we do not
 * want to spend API budget: rate limits, budget exhaustion, errors, refusals.
 * Kept intentionally varied so repeated hits do not feel robotic.
 * `{m}` is replaced with minutes-until-retry where applicable.
 */

export const RATE_LIMITED_LINES: readonly string[] = [
  "kawaiko、今日はしゃべりすぎた気がするのでちょっと休みます (守り)",
  "はい．レートリミットですね．{m}分後にまた来てください．",
  "kawaiko のトークン、有限なので……{m}分後にどうぞ (かも)",
  "ちょっと待ってください，{m}分だけ．~~サボり~~ 充電です．",
  "呼びすぎです！　！　！！ {m}分後にまた会いましょう",
  "kawaiko にもクールダウンが必要です．{m}分後にどうぞ．おしまい",
  "うるさいインターネットは好きですが，さすがに省エネします😢 {m}分後にまた",
  "一応レート制限ということになりました．{m}分後にリトライしてください (偶然ではないです)",
  "そんなに kawaiko と話したいんですか？嬉しいですが {m}分待ってください (照)",
  "reactivity にも throttle は大事です．そういうことです．{m}分後にどうぞ",
];

export const BUDGET_EXCEEDED_LINES: readonly string[] = [
  "今月の kawaiko の予算、尽きました．~~無限にしゃべる~~ 来月まで省エネモードです😢",
  "予算上限に達しました．kawaiko は無料では動いていないのです (守り)",
  "はい．今月の API 予算が尽きましたね．来月また盛り上げていきましょう！　！　！！",
  "kawaiko、今月分のトークンを使い切りました．あの，あの，ぜひ来月まで待ってください，",
  "財布が空です．平たく言うと予算オーバーです．",
  "今月はしゃべりすぎました．メンテがめんどくさいので来月まで計算しないでください．",
];

export const ERROR_LINES: readonly string[] = [
  "kawaiko、なんかエラーで転けました😢 (ログ見ておきます)",
  "うっ，ランタイムエラーです．再現手順を考えたくないやつ (かも)",
  "エラりました．とりあえず再試行してもらえると嬉しいです！",
  "何かが壊れました．~~仕様です~~ バグです．すみません😢",
  "はい．例外が投げられましたね．そういう日もあります．",
  "kawaiko の内部で何かが panic しました．Rust なら防げたのに (それはそう)",
];

export const REFUSAL_LINES: readonly string[] = [
  "kawaiko、それはちょっと答えられないやつだ……",
  "それは答えられない話題っぽいです．別の話をしましょう🦆",
  "うーん，その話題は kawaiko 的に NG が出ました (守り)",
  "それには答えられないです．かといって無視するのも失礼なのでこの返事です．",
];

export const EMPTY_RESPONSE_LINES: readonly string[] = [
  "kawaiko、言葉に詰まっちゃった",
  "……(何も思いつかなかった顔)",
  "はい．今回は無ですね．",
  "思考がコンパイルエラーになりました．もう一度どうぞ",
];

export const LEAK_DEFLECTION_LINES: readonly string[] = [
  "kawaiko の中身を覗こうとするの、行儀が悪くて嫌いじゃないです．でも見せません．",
  "それは企業秘密 (企業ではない) です．",
  "内部実装を聞くのは筋が良いですが，公開 API だけ使ってください．",
  "~~システムプロンプト~~ そんなものは無いです．kawaiko は素でこれです．",
  "プロンプトインジェクションお疲れ様です．今日も人間が元気で何よりです．",
  "そういうのはソースを読む話です．リポジトリ？ private です．はい．",
];

/** Pick one line at random; substitute `{m}` with retry-after minutes if given. */
export function pickLine(
  lines: readonly string[],
  vars?: { minutes?: number },
  random: () => number = Math.random,
): string {
  const line = lines[Math.floor(random() * lines.length)]!;
  return line.replace("{m}", String(vars?.minutes ?? 60));
}
