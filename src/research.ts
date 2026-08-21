/**
 * Lightweight, key-free research for question-like mentions.
 * Workers AI models cannot browse, so we fetch context ourselves:
 * DuckDuckGo's HTML endpoint plus the Japanese Wikipedia search API.
 * Everything is best-effort — failures degrade to an unassisted answer.
 */

const FETCH_TIMEOUT_MS = 4000;
const UA = "Mozilla/5.0 (compatible; kawaiko-bot/1.0)";

export interface ResearchItem {
  title: string;
  snippet: string;
}

/** Heuristic: does this message look like a question / info request? */
export function needsResearch(content: string): boolean {
  return /[?？]|とは|教えて|どう(いう|やって|なる|思)|何(が|を|で|の)|なに|最新|リリース|いつ|どこ|誰|だれ|調べ|比較|おすすめ/.test(
    content,
  );
}

/** Crude HTML-to-text: strip tags and decode the common entities. */
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

async function searchDuckDuckGo(query: string): Promise<ResearchItem[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=jp-jp`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];
    const html = await res.text();
    const items: ResearchItem[] = [];
    const re =
      /class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    for (const m of html.matchAll(re)) {
      items.push({ title: stripHtml(m[1]!), snippet: stripHtml(m[2]!).slice(0, 200) });
      if (items.length >= 4) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function searchWikipedia(query: string): Promise<ResearchItem[]> {
  try {
    const res = await fetch(
      `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&utf8=1`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };
    return (data.query?.search ?? []).map((s) => ({
      title: `Wikipedia: ${s.title}`,
      snippet: stripHtml(s.snippet).slice(0, 200),
    }));
  } catch {
    return [];
  }
}

/** Gather a compact research block for the prompt; "" when nothing useful. */
export async function gatherResearch(query: string): Promise<string> {
  const [ddg, wiki] = await Promise.all([searchDuckDuckGo(query), searchWikipedia(query)]);
  const items = [...ddg, ...wiki].slice(0, 6);
  if (items.length === 0) return "";
  return items.map((i) => `- ${i.title}: ${i.snippet}`).join("\n");
}
