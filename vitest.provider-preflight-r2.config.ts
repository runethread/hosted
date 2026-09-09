import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.provider-preflight-r2.jsonc" },
    }),
  ],
  test: {
    include: ["provider-proof/journal_r2.proof.ts"],
    sequence: { concurrent: false },
  },
});
