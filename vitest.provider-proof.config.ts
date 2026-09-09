import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.provider-proof.jsonc" },
    }),
  ],
  test: {
    include: ["test/provider_r2.test.ts"],
    sequence: { concurrent: false },
  },
});
