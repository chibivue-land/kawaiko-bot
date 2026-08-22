import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads the schema from src/infra-d1-schema.ts and writes SQL into
 * migrations/, which is the same directory `wrangler d1 migrations apply`
 * reads. Note that the two views live in the hand-written migration: their
 * fold is more SQL than the schema builder should be asked to express, and
 * infra-d1-schema.ts declares them with `.existing()` purely for typing.
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/infra-d1-schema.ts",
  out: "./migrations",
});
