import { env } from "cloudflare:workers";
import { RepositoryRuntime } from "../src/repository_runtime";
import { R2SafetyJournal } from "../src/r2_safety_journal";
export { default } from "../src/index";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_RUNTIME: DurableObjectNamespace<TestRepositoryRuntime>;
      TEST_JOURNAL: R2Bucket;
    }
  }
}

// Bindings exist only in the local test runner, never in wrangler.jsonc.
export class TestRepositoryRuntime extends RepositoryRuntime {
  override journalStore() { return new R2SafetyJournal(env.TEST_JOURNAL); }
}
