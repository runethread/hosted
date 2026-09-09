import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.provider-proof.jsonc" },
    }),
  ],
  test: {
    include: ["provider-proof/provider_r2.proof.ts"],
    sequence: { concurrent: false },
  },
});
