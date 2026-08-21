import type { Env } from "./env";
import { generate } from "./ai/generate";
import { postChannelMessage, withTyping } from "./discord/api";
import { buildSystemPrompt, jstNowLabel } from "./persona";

/**
 * Topic seeds for the scheduled mutters. One is picked at random per post.
 * The default register is "ネタツイ": internet-nerd shitpost energy —
 * slightly twisted, dry, dark — never preachy, never soft.
 */
export const TOPIC_SEEDS: readonly string[] = [
  "フロントエンド界隈の流行り廃りへの諦観を、乾いたネタツイにする",
  "OSS メンテナの闇 (issue だけ増える、PR は来ない、感謝はもっと来ない) を自虐ネタにする",
  "「また新しい JS フレームワークが生まれた」系の疲弊をダークに茶化す",
  "仮想 DOM / リアクティビティ / コンパイラの話を無駄に真剣に語って最後に虚無で落とす",
  "深夜テンションの独り言。世界と自分のコードへの信頼が両方ゆらいでいる",
  "「型パズルで一日が溶けた」系の、誰も救われない技術あるある",
  "エンジニアの承認欲求とインターネットの相性の悪さを他人事のように語る (自分のことである)",
  "ニュース: 下に貼られる直近のフロントエンド関連ニュースの見出しから 1 つ選び、捻くれた一言感想をつける",
  "chibivue 的な「小さく作る」話を布教しかけて、面倒になってやめる",
  "眠気・レッドブル・進捗のなさ、を過剰に低いテンションで報告する (コーヒーは嫌い)",
  "Rust に書き直せば解決する (解決しない) 系のネタ",
  "「人間は嫌いです」と言いつつコミュニティの世話を焼いてしまう自分へのツッコミ",
  "Contemporary Jazz の話 (Kurt Rosenwinkel / Brad Mehldau / Coltrane あたり) を誰にも頼まれてないのに語る。「ジャズ=オシャレ」と言う人間への静かな怒りを添えてもよい",
  "クラブミュージックやクラブの照明の暗さの良さを、人混み嫌いと矛盾させながら語る",
  "今聴いてるアルバムのアートワークの話をして、肝心の曲の感想を言わずに終わる",
  "音楽理論や Atonal な曲の構造をコンパイラの話に無理やり接続する",
] as const;

/** Style directive appended to every scheduled mutter prompt. */
const MUTTER_STYLE = `トーンの指定:
- ネタツイ風。インターネットオタク仕草で、ちょっと捻くれていて、辛口でダーク。
- シャバい (ぬるい・優等生的な) まとめ方をしない。説教・教訓・前向きな締めは禁止。
- オチは自虐・諦観・虚無のどれか。ハッシュタグ禁止。絵文字は使っても 1 個まで。
- ただし実在の個人・特定の企業やプロジェクトを名指しで攻撃しない。刺すのは概念と自分だけ。`;

/** RSS feeds used for the news seed (no API key required). */
const NEWS_FEEDS = [
  "https://hnrss.org/newest?q=javascript+OR+typescript+OR+vue+OR+react",
  "https://zenn.dev/feed",
];

/** Best-effort headline scrape; returns [] on any failure. */
export async function fetchNewsHeadlines(limit = 8): Promise<string[]> {
  const titles: string[] = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const res = await fetch(feed, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const matches = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)];
      // The first <title> of a feed is the feed's own name.
      for (const m of matches.slice(1)) {
        const t = m[1]!.trim();
        if (t && !titles.includes(t)) titles.push(t);
      }
    } catch {
      // Feed down or slow; news is optional anyway.
    }
  }
  return titles.slice(0, limit);
}

export function pickTopicSeed(random: () => number = Math.random): string {
  return TOPIC_SEEDS[Math.floor(random() * TOPIC_SEEDS.length)]!;
}

export function shouldPost(probability: string, random: () => number = Math.random): boolean {
  const p = Number.parseFloat(probability);
  if (!Number.isFinite(p)) return true;
  return random() < Math.min(Math.max(p, 0), 1);
}

/** Cron entry point: probability gate -> budget gate -> generate -> post. */
export async function postScheduledMutter(env: Env, opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force && !shouldPost(env.POST_PROBABILITY)) {
    console.log("mutter: skipped by probability gate");
    return;
  }

  const budget = env.BUDGET_TRACKER.get(env.BUDGET_TRACKER.idFromName("global"));
  const { allowed, spentUsd } = await budget.checkBudget(Number(env.MONTHLY_BUDGET_USD) || 100);
  if (!allowed) {
    console.warn(`mutter: monthly budget exceeded (spent ~$${spentUsd.toFixed(2)}), skipping`);
    return;
  }

  const seed = pickTopicSeed();
  const headlines = seed.startsWith("ニュース") ? await fetchNewsHeadlines() : [];
  const newsBlock =
    headlines.length > 0
      ? `\n直近のニュース見出し:\n${headlines.map((h) => `- ${h}`).join("\n")}\n`
      : "";
  const { text, costUsd } = await withTyping(env, env.KAWAIKO_CHANNEL_ID, () =>
    generate(env, {
      system: buildSystemPrompt(),
      prompt: `今は ${jstNowLabel()}。Discord の雑談チャンネルに、誰に宛てるでもなくテキトーに一言呟いて。

ネタの方向性: ${seed}
${newsBlock}
${MUTTER_STYLE}

毎回同じような書き出しにしない。短くてよい (1〜3 文)。`,
      maxSearches: 0,
      effort: "low",
      maxTokens: 2048,
    }),
  );

  await budget.recordSpend(costUsd);
  await postChannelMessage(env, env.KAWAIKO_CHANNEL_ID, text);
  console.log(`mutter: posted (~$${costUsd.toFixed(4)})`);
}
