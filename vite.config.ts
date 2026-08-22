import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => ({
  // Skip workerd during vitest runs — unit tests exercise pure functions in Node.
  plugins: mode === "test" ? [] : [cloudflare()],
  test: {
    include: ["源/**/*.test.ts"],
  },
  // Vite Task definitions (invoked via `vp run <task>`); no npm scripts in this repo.
  // Both tasks have side effects, so opt out of Vite Task's result caching.
  run: {
    tasks: {
      deploy: {
        command: "vp build && wrangler deploy",
        cache: false,
      },
      "sync-avatar": {
        command: "node scripts/sync-avatar.ts",
        cache: false,
      },
    },
  },
}));
