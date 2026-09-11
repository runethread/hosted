import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      main: "./test/runtime_worker.ts",
      additionalExports: { TestRepositoryRuntime: "DurableObject" },
      miniflare: {
        durableObjects: { TEST_RUNTIME: { className: "TestRepositoryRuntime", useSQLite: true } },
        r2Buckets: ["TEST_JOURNAL"],
      },
    }),
  ],
});
