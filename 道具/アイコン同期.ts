/**
 * Syncs the bot's avatar and the application icon from the canonical artwork:
 * https://github.com/chibivue-land/art/blob/main/kawaiko_funny.png
 *
 * Run via Vite Task: `vp run sync-avatar` (requires DISCORD_BOT_TOKEN).
 * Kept out of the deploy pipeline because Discord rate-limits avatar changes hard.
 * Runs on plain Node (>= 22.18) using native type stripping.
 */

export {}; // Make this file a module so top-level await is allowed.

const ART_URL = "https://raw.githubusercontent.com/chibivue-land/art/main/kawaiko_funny.png";

const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
  console.error("DISCORD_BOT_TOKEN must be set");
  process.exit(1);
}

const artRes = await fetch(ART_URL);
if (!artRes.ok) {
  console.error(`Failed to download artwork: ${artRes.status}`);
  process.exit(1);
}
const dataUri = `data:image/png;base64,${Buffer.from(await artRes.arrayBuffer()).toString("base64")}`;

async function patch(path: string, body: Record<string, string>): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`PATCH ${path} failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`PATCH ${path} ok`);
}

// Bot user avatar (shown in chat) and application icon (shown in the app directory).
await patch("/users/@me", { avatar: dataUri });
await patch("/applications/@me", { icon: dataUri });
console.log("Avatar synced from kawaiko_funny.png");
