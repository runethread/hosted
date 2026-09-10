import { env } from "cloudflare:workers";
import { RepositoryRuntime } from "../src/repository_runtime";
import { R2SafetyJournal } from "../src/r2_safety_journal";
import type { JournalStore } from "../src/safety_journal";
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
  #createGate: {
    wait: Promise<void>; release: () => void;
    entered: Promise<void>; notifyEntered: () => void;
    released: boolean; attempts: number; completed: number; attemptedEntry: string | null;
  } | null = null;

  armJournalCreateGate() {
    if (this.#createGate) throw new Error("create gate already armed");
    let release!: () => void;
    let notifyEntered!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { notifyEntered = resolve; });
    this.#createGate = { wait, release, entered, notifyEntered,
      released: false, attempts: 0, completed: 0, attemptedEntry: null };
  }

  async waitForJournalCreate() {
    const gate = this.#createGate;
    if (!gate) throw new Error("create gate not armed");
    await gate.entered;
    return gate.attempts > 0;
  }

  releaseJournalCreateGate() {
    const gate = this.#createGate;
    if (!gate) return;
    gate.released = true;
    gate.release();
    gate.notifyEntered(); // Also settle an observer if the driver failed before create.
  }

  disarmJournalCreateGate() {
    const gate = this.#createGate;
    if (gate && (!gate.released || gate.completed !== gate.attempts)) {
      throw new Error("create gate still has unfinished work");
    }
    this.#createGate = null;
  }

  override journalStore(): JournalStore {
    const store = new R2SafetyJournal(env.TEST_JOURNAL);
    const gate = this.#createGate;
    if (!gate) return store;
    return {
      readExact: key => store.readExact(key),
      listPage: (prefix, cursor) => store.listPage(prefix, cursor),
      createExact: async entry => {
        gate.attempts++;
        if (gate.attempts === 1) {
          gate.attemptedEntry = JSON.stringify(entry);
          gate.notifyEntered();
        }
        await gate.wait;
        await store.createExact(entry);
        gate.completed++;
      }
    };
  }

  // Passive test-only RPC: never drives work or repairs the alarm.
  async inspectJournalFoundation() {
    const row = this.ctx.storage.sql.exec<{ state: string }>(
      "SELECT state FROM repository_runtime WHERE singleton = 1").one();
    const alarm = await this.ctx.storage.getAlarm();
    const gate = this.#createGate;
    return { state: row.state, alarm, gate: gate ? {
      armed: true, entered: gate.attempts > 0, released: gate.released,
      attempts: gate.attempts, completed: gate.completed, attemptedEntry: gate.attemptedEntry
    } : null };
  }
}
