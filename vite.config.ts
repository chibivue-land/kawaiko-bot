import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => ({
  // Skip workerd during vitest runs — unit tests exercise pure functions in Node.
  plugins: mode === "test" ? [] : [cloudflare()],
  test: {
    include: ["test/**/*.test.ts"],
  },
  // Vite Task definitions (invoked via `vp run <task>`); no npm scripts in this repo.
  run: {
    tasks: {
      deploy: {
        command: "vp build && wrangler deploy",
      },
      "sync-avatar": {
        command: "node scripts/sync-avatar.ts",
        envs: ["DISCORD_BOT_TOKEN"],
      },
    },
  },
}));
