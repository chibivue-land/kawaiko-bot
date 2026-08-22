import type { NewsFeed } from "../app/ports";

/** RSS feeds behind the news mutter seed (no API key required). */
const NEWS_FEEDS = [
  "https://hnrss.org/newest?q=javascript+OR+typescript+OR+vue+OR+react",
  "https://zenn.dev/feed",
];

/** Best-effort headline scrape; a down or slow feed just yields fewer items. */
export const rssNewsFeed: NewsFeed = {
  async headlines(limit = 8): Promise<string[]> {
    const titles: string[] = [];
    for (const feed of NEWS_FEEDS) {
      try {
        const res = await fetch(feed, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const xml = await res.text();
        const matches = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)];
        // The first <title> of a feed is the feed's own name.
        for (const match of matches.slice(1)) {
          const title = match[1]!.trim();
          if (title && !titles.includes(title)) titles.push(title);
        }
      } catch {
        // News is optional; a mutter without headlines is still a mutter.
      }
    }
    return titles.slice(0, limit);
  },
};
