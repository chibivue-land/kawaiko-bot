import type { 調査係 } from "../振る舞い/接続口";
/**
 * Lightweight, key-free research for question-like mentions.
 * Workers AI models cannot browse, so we gather context ourselves from
 * sources that reliably answer to datacenter IPs without API keys:
 * Japanese Wikipedia, Google News RSS (ja), the GitHub API, and HN Algolia.
 * Everything is best-effort — failures degrade to an unassisted answer.
 */
const FETCH_TIMEOUT_MS = 4000;
const UA = "kawaiko-bot/1.0 (+https://github.com/chibivue-land/kawaiko-bot)";

export interface ResearchItem {
  title: string;
  snippet: string;
}

/** Heuristic: does this message look like a question / info request? */
/** Signals that a message is asking something rather than just chatting. */
const QUESTION_MARKERS = [
  "[?？]",
  "とは",
  "教えて",
  "どう(いう|やって|なる|思)",
  "何(が|を|で|の)",
  "なに",
  "最新",
  "最近",
  "リリース",
  "バージョン",
  "いつ",
  "どこ",
  "誰",
  "だれ",
  "何者",
  "調べ",
  "比較",
  "おすすめ",
  "どんな",
];

const QUESTION_PATTERN = new RegExp(QUESTION_MARKERS.join("|"));

export function needsResearch(content: string): boolean {
  return QUESTION_PATTERN.test(content);
}

/** Crude HTML/XML-to-text: strip tags and decode the common entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x?\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Refine "do you know X?" style questions into a searchable term:
 * the raw question ("からころのこと知ってる？") is a terrible search query,
 * the bare subject ("からころ") is a decent one.
 */
const HONORIFIC = "(?:さん|氏|くん|ちゃん)?";
const TOPIC_PARTICLE = "(?:のこと|のことを|って|とは)?";
const ASKING = "(?:知って(?:る|ますか|います)?|しってる|誰|だれ|何者)";
const DO_YOU_KNOW = new RegExp(`^(.+?)${HONORIFIC}${TOPIC_PARTICLE}${ASKING}`);

export function extractSearchQuery(question: string): string {
  const subject = DO_YOU_KNOW.exec(question)?.[1]
    ?.replace(/[はがのをも]\s*$/, "")
    .trim();
  return subject && subject.length >= 2 ? subject : question;
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function searchWikipedia(query: string): Promise<ResearchItem[]> {
  const res = await fetchWithTimeout(
    `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2&utf8=1`,
  );
  if (!res) return [];
  try {
    const data = (await res.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };
    return (data.query?.search ?? []).map((s) => ({
      title: `Wikipedia: ${s.title}`,
      snippet: stripHtml(s.snippet).slice(0, 180),
    }));
  } catch {
    return [];
  }
}

/** Google News RSS answers reliably from Workers and covers Japanese news. */
async function searchGoogleNews(query: string): Promise<ResearchItem[]> {
  const res = await fetchWithTimeout(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`,
  );
  if (!res) return [];
  const xml = await res.text();
  const items: ResearchItem[] = [];
  // Skip the first <title> (the feed's own name).
  for (const m of [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)].slice(
    1,
    4,
  )) {
    const t = stripHtml(m[1]!);
    if (t) items.push({ title: `News: ${t}`, snippet: "" });
  }
  return items;
}

/** GitHub user lookup for handle-like queries (this is a dev community, after all). */
async function searchGitHubUser(query: string, token?: string): Promise<ResearchItem[]> {
  if (!/^[a-zA-Z0-9-]{2,39}$/.test(query)) return [];
  const res = await fetchWithTimeout(
    `https://api.github.com/users/${encodeURIComponent(query)}`,
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  if (!res) return [];
  try {
    const u = (await res.json()) as {
      login?: string;
      name?: string | null;
      bio?: string | null;
      followers?: number;
      public_repos?: number;
    };
    if (!u.login) return [];
    const bits = [
      u.name && u.name !== u.login ? `name: ${u.name}` : "",
      u.bio ? `bio: ${u.bio}` : "",
      `repos: ${u.public_repos}, followers: ${u.followers}`,
    ].filter(Boolean);
    return [{ title: `GitHub: ${u.login}`, snippet: bits.join(" / ").slice(0, 220) }];
  } catch {
    return [];
  }
}

/** HN Algolia for English tech topics. */
async function searchHackerNews(query: string): Promise<ResearchItem[]> {
  const res = await fetchWithTimeout(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=3&tags=story`,
  );
  if (!res) return [];
  try {
    const data = (await res.json()) as { hits?: Array<{ title?: string; points?: number }> };
    return (data.hits ?? [])
      .filter((h) => h.title)
      .map((h) => ({ title: `HN: ${h.title!}`, snippet: `${h.points ?? 0} points` }));
  } catch {
    return [];
  }
}

/** Gather a compact research block for the prompt; "" when nothing useful. */
export async function gatherResearch(
  rawQuery: string,
  opts?: { githubToken?: string },
): Promise<string> {
  const query = extractSearchQuery(rawQuery);
  const results = await Promise.all([
    searchWikipedia(query),
    searchGoogleNews(query),
    searchGitHubUser(query, opts?.githubToken),
    searchHackerNews(query),
  ]);
  const items = results.flat().slice(0, 8);
  if (items.length === 0) return "";
  return items.map((i) => (i.snippet ? `- ${i.title}: ${i.snippet}` : `- ${i.title}`)).join("\n");
}

/**
 * 調査係のポート。調べるまでもない問いかけには空文字を返すので、呼び出し側が
 * 二度判定しなくて済む。
 */
export function webの調査係(設定: { GitHubのトークン?: string }): 調査係 {
  return {
    async 調べる(問いかけ: string): Promise<string> {
      if (!問いかけ || !needsResearch(問いかけ)) return "";

      return gatherResearch(問いかけ, { githubToken: 設定.GitHubのトークン }).catch(() => "");
    },
  };
}
