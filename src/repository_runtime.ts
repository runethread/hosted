import { DurableObject } from "cloudflare:workers";
import { appendExact, checkJournalBudget, JournalIntegrityError, JournalLimitError,
  CORE_RUNTIME_COMMIT, JOURNAL_MAX_RECORD_BYTES, journalKey, journalPrefix,
  JOURNAL_MAX_BYTES, JOURNAL_MAX_RECORDS, prepareRecord, readCompleteTail, verifyRecord,
  type JournalEntry, type JournalEvent, type JournalScope, type JournalStore } from "./safety_journal";

export const REPOSITORY_RUNTIME_VERSION = 1;
const RETRY_MS = 30_000;
const WAKEUP_MS = 1000;
type Phase = "opening" | "scanning" | "barrier" | "verifying" | "verified" | "blocked";
interface RuntimeState {
  version: 1;
  scope: JournalScope;
  binding: Extract<JournalEvent, { kind: "EPOCH_OPEN" }>;
  generation: number;
  phase: Phase;
  pending: JournalEntry | null;
  checkpoint: { sequence: number; sha256: string } | null;
  totalBytes: number;
  retryAt: number | null;
}
class StaleGeneration extends Error {}

function valid(condition: unknown): asserts condition {
  if (!condition) throw new JournalIntegrityError();
}
function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  valid(value !== null && typeof value === "object" && !Array.isArray(value));
  valid(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function opening(value: unknown): asserts value is Extract<JournalEvent, { kind: "EPOCH_OPEN" }> {
  object(value, ["kind", "installationId", "canonicalRef"]);
  valid(value.kind === "EPOCH_OPEN" && typeof value.installationId === "string"
    && /^[1-9][0-9]{0,19}$/.test(value.installationId));
  const ref = value.canonicalRef;
  valid(typeof ref === "string" && ref.startsWith("refs/heads/") && ref.length > 11 && ref.length <= 255
    && !/[\x00-\x20\x7f~^:?*\[\\]/.test(ref) && !ref.includes("..") && !ref.includes("@{")
    && ref.split("/").every(part => part.length > 0 && !part.startsWith(".")
      && !part.endsWith(".lock") && !part.endsWith(".")));
}
function validateRuntimeState(value: unknown): asserts value is RuntimeState {
  object(value, ["version", "scope", "binding", "generation", "phase", "pending", "checkpoint", "totalBytes", "retryAt"]);
  valid(value.version === 1 && integer(value.generation, 1));
  valid(value.phase === "opening" || value.phase === "scanning" || value.phase === "barrier"
    || value.phase === "verifying" || value.phase === "verified" || value.phase === "blocked");
  object(value.scope, ["repositoryId", "bindingEpoch", "hostedReleaseSha256"]);
  valid(typeof value.scope.repositoryId === "string" && typeof value.scope.bindingEpoch === "string"
    && typeof value.scope.hostedReleaseSha256 === "string");
  const scope = { repositoryId: value.scope.repositoryId, bindingEpoch: value.scope.bindingEpoch,
    hostedReleaseSha256: value.scope.hostedReleaseSha256 };
  journalPrefix(scope);
  opening(value.binding);
  valid(integer(value.totalBytes, 0, JOURNAL_MAX_BYTES));
  if (value.checkpoint !== null) {
    object(value.checkpoint, ["sequence", "sha256"]);
    valid(integer(value.checkpoint.sequence, 1, JOURNAL_MAX_RECORDS - 1)
      && digest(value.checkpoint.sha256) && value.totalBytes > 0);
  }
  let pendingSequence: number | null = null;
  if (value.pending !== null) {
    object(value.pending, ["key", "text", "sha256", "size", "record"]);
    valid(typeof value.pending.text === "string" && digest(value.pending.sha256)
      && integer(value.pending.size, 1, JOURNAL_MAX_RECORD_BYTES)
      && new TextEncoder().encode(value.pending.text).byteLength === value.pending.size);
    const record = value.pending.record;
    object(record, ["version", "repositoryId", "bindingEpoch", "sequence", "previousRecordSha256",
      "hostedReleaseSha256", "coreRuntimeCommit", "contractVersion", "repositoryRuntimeVersion", "event"]);
    valid(record.version === 1 && record.repositoryId === scope.repositoryId
      && record.bindingEpoch === scope.bindingEpoch && record.hostedReleaseSha256 === scope.hostedReleaseSha256
      && record.coreRuntimeCommit === CORE_RUNTIME_COMMIT && record.contractVersion === 9
      && record.repositoryRuntimeVersion === 1 && integer(record.sequence, 0, JOURNAL_MAX_RECORDS - 1));
    valid(value.pending.key === journalKey(scope, record.sequence));
    pendingSequence = record.sequence;
    if (record.sequence === 0) {
      opening(record.event);
      valid(record.previousRecordSha256 === null && record.event.installationId === value.binding.installationId
        && record.event.canonicalRef === value.binding.canonicalRef
        && value.checkpoint === null && value.totalBytes === 0);
    } else {
      object(record.event, ["kind", "recoveryId"]);
      valid(record.event.kind === "RECOVERY_BARRIER" && typeof record.event.recoveryId === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.event.recoveryId)
        && digest(record.previousRecordSha256) && value.totalBytes > 0);
      checkJournalBudget(record.sequence + 1, value.totalBytes + value.pending.size);
      if (value.checkpoint !== null) {
        valid(integer(value.checkpoint.sequence, 1, JOURNAL_MAX_RECORDS - 1));
        valid(record.sequence > value.checkpoint.sequence);
        if (record.sequence === value.checkpoint.sequence + 1) {
          valid(record.previousRecordSha256 === value.checkpoint.sha256);
        }
      }
    }
  }
  valid(value.phase === "blocked" || value.phase === "verified"
    ? value.retryAt === null : integer(value.retryAt, 1));
  switch (value.phase) {
    case "opening":
      valid(value.generation === 1 && pendingSequence === 0
        && value.checkpoint === null && value.totalBytes === 0);
      break;
    case "scanning": valid(value.pending === null); break;
    case "barrier":
    case "verifying": valid(pendingSequence !== null && pendingSequence >= 1); break;
    case "verified": valid(value.pending === null && value.checkpoint !== null); break;
    case "blocked": break; // May retain the failed claim, but never drives it.
  }
}
function decodeRuntimeState(text: string): RuntimeState {
  try {
    const value: unknown = JSON.parse(text);
    validateRuntimeState(value);
    return value;
  } catch { throw new JournalIntegrityError(); }
}

/**
 * Permanent SQLite owner of the journal foundation. Not exported by src/index.ts.
 * No admission, OPEN lane, operation execution, PITR control, or publication method.
 * Private deployment wiring is deliberately absent; tests supply the capability.
 */
export class RepositoryRuntime extends DurableObject {
  #driving = false;

  protected journalStore(): JournalStore {
    throw new Error("repository_runtime_not_configured");
  }

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS repository_runtime (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), state TEXT NOT NULL)`);
      // Ordinary activation preserves SQLite, including an exact pending claim.
      // Resume its existing schedule; activation alone is not rollback evidence.
      await this.#repairAlarm();
    });
  }

  #read(): RuntimeState | null {
    const rows = this.ctx.storage.sql.exec<{ state: string }>(
      "SELECT state FROM repository_runtime WHERE singleton = 1").toArray();
    if (rows.length === 0) return null;
    return decodeRuntimeState(rows[0].state);
  }

  #write(state: RuntimeState): void {
    validateRuntimeState(state); // Reject an unsafe generation increment before persisting it.
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO repository_runtime VALUES (1, ?)", JSON.stringify(state));
  }

  #advance(expected: RuntimeState, changes: Partial<RuntimeState>): RuntimeState {
    return this.ctx.storage.transactionSync(() => {
      const current = this.#read();
      if (!current || current.generation !== expected.generation || current.phase !== expected.phase
        || current.pending?.sha256 !== expected.pending?.sha256) throw new StaleGeneration();
      const next = { ...current, ...changes };
      this.#write(next);
      return next;
    });
  }

  /** Internal setup only: caller must supply an independently enrolled fresh UUID epoch.
   * It never re-enrolls/replaces an existing local binding and never opens a lane. */
  async initializeJournalFoundation(scope: JournalScope,
    binding: Extract<JournalEvent, { kind: "EPOCH_OPEN" }>): Promise<void> {
    const opening = await prepareRecord(scope, 0, null, binding);
    this.ctx.storage.transactionSync(() => {
      const current = this.#read();
      if (current) {
        if (JSON.stringify(current.scope) !== JSON.stringify({ repositoryId: opening.record.repositoryId,
          bindingEpoch: opening.record.bindingEpoch, hostedReleaseSha256: opening.record.hostedReleaseSha256 })
          || JSON.stringify(current.binding) !== JSON.stringify(opening.record.event)) throw new JournalIntegrityError();
        return;
      }
      this.#write({ version: 1,
        scope: { repositoryId: opening.record.repositoryId, bindingEpoch: opening.record.bindingEpoch,
          hostedReleaseSha256: opening.record.hostedReleaseSha256 },
        binding: opening.record.event as Extract<JournalEvent, { kind: "EPOCH_OPEN" }>,
        generation: 1, phase: "opening", pending: opening, checkpoint: null,
        totalBytes: 0, retryAt: Date.now() + WAKEUP_MS });
    });
    await this.#repairAlarm();
  }

  /** Also used after explicit maintenance/PITR. No evidence can reopen the lane here. */
  async beginJournalRecovery(): Promise<void> {
    const state = this.#read();
    if (!state) throw new JournalIntegrityError();
    this.#enterJournalRecovery(state);
    await this.#repairAlarm();
  }

  #enterJournalRecovery(state: RuntimeState): RuntimeState {
    return this.#advance(state, { generation: state.generation + 1,
      phase: "scanning", pending: null, retryAt: Date.now() + WAKEUP_MS });
  }

  async foundationStatus() {
    await this.#repairAlarm();
    const state = this.#read();
    return { lane: "MAINTENANCE" as const, phase: state?.phase ?? "uninitialized",
      checkpoint: state?.checkpoint ?? null, generation: state?.generation ?? 0,
      approachingLimit: !!state && ((state.checkpoint?.sequence ?? -1) + 1 >= JOURNAL_MAX_RECORDS * 0.9
        || state.totalBytes >= JOURNAL_MAX_BYTES * 0.9) };
  }

  async #repairAlarm(): Promise<void> {
    const state = this.#read();
    if (state?.retryAt !== null && state?.retryAt !== undefined) {
      const scheduled = await this.ctx.storage.getAlarm();
      const current = this.#read();
      if (current?.retryAt !== null && current?.retryAt !== undefined
        && (scheduled === null || scheduled !== current.retryAt)) await this.ctx.storage.setAlarm(current.retryAt);
    }
  }

  async alarm(): Promise<void> {
    if (this.#driving) {
      const state = this.#read();
      if (state && state.phase !== "verified" && state.phase !== "blocked") {
        // A fired alarm is consumed even while another driver awaits I/O.
        // Persist its successor without depending on that driver's finally.
        this.#advance(state, { retryAt: Math.max(state.retryAt ?? 0, Date.now() + RETRY_MS) });
        await this.#repairAlarm();
      }
      return;
    }
    await this.driveJournalFoundation();
  }

  async driveJournalFoundation(): Promise<void> {
    if (this.#driving) return;
    this.#driving = true;
    let state: RuntimeState | null = null;
    try {
      state = this.#read();
      if (!state || state.phase === "blocked" || state.phase === "verified") return;
      const store = this.journalStore();
      if (state.pending) {
        const pending = await verifyRecord(state.scope, state.pending.key,
          new TextEncoder().encode(state.pending.text));
        if (pending.sha256 !== state.pending.sha256
          || JSON.stringify(pending.record) !== JSON.stringify(state.pending.record)) throw new JournalIntegrityError();
      }
      // One bounded step per wakeup; retries keep the exact persisted append claim.
      if (state.phase === "opening") {
        if (!state.pending) throw new JournalIntegrityError();
        // A retried fresh-epoch claim must not repair a missing opening underneath
        // a surviving suffix. Existing history is verified before any create.
        const tail = await readCompleteTail(store, state.scope);
        if (tail.entries.length && tail.entries[0].sha256 !== state.pending.sha256) {
          throw new JournalIntegrityError();
        }
        if (tail.entries.length > 1) {
          state = this.#enterJournalRecovery(state);
          return; // Successors prove this opening claim's local state is stale.
        }
        await appendExact(store, state.pending);
        state = this.#advance(state, { phase: "scanning", pending: null, retryAt: Date.now() + WAKEUP_MS });
      } else if (state.phase === "scanning") {
        const tail = await readCompleteTail(store, state.scope);
        const last = tail.entries.at(-1);
        if (!last || JSON.stringify(tail.entries[0].record.event) !== JSON.stringify(state.binding)) {
          throw new JournalIntegrityError();
        }
        if (state.generation === 1 && tail.entries.length > 1) {
          state = this.#enterJournalRecovery(state);
          return; // Fresh-path scanning cannot legitimately have a successor yet.
        }
        const barrier = await prepareRecord(state.scope, last.record.sequence + 1, last.sha256,
          { kind: "RECOVERY_BARRIER", recoveryId: crypto.randomUUID() });
        checkJournalBudget(tail.entries.length + 1, tail.totalBytes + barrier.size);
        state = this.#advance(state, { phase: "barrier", pending: barrier,
          totalBytes: tail.totalBytes, retryAt: Date.now() + WAKEUP_MS });
      } else if (state.phase === "barrier") {
        if (!state.pending) throw new JournalIntegrityError();
        try { await appendExact(store, state.pending); }
        catch (error) {
          if (!(error instanceof JournalIntegrityError)) throw error;
          // A delayed writer may have won this exact slot. Full verification must
          // incorporate a valid successor before another barrier is even planned.
          await readCompleteTail(store, state.scope);
          state = this.#advance(state, { phase: "scanning", pending: null, retryAt: Date.now() + WAKEUP_MS });
          return;
        }
        state = this.#advance(state, { phase: "verifying", retryAt: Date.now() + WAKEUP_MS });
      } else if (state.phase === "verifying") {
        const tail = await readCompleteTail(store, state.scope);
        const last = tail.entries.at(-1);
        if (!state.pending || !last || last.sha256 !== state.pending.sha256
          || last.key !== state.pending.key) throw new JournalIntegrityError();
        // Only a journal checkpoint, never a claim of completed ADR-019 recovery.
        state = this.#advance(state, { phase: "verified", pending: null,
          checkpoint: { sequence: last.record.sequence, sha256: last.sha256 },
          totalBytes: tail.totalBytes, retryAt: null });
      } else {
        const unsupported: never = state.phase;
        throw new JournalIntegrityError();
      }
    } catch (error) {
      if (error instanceof StaleGeneration || !state) return;
      try {
        this.#advance(state, { phase: error instanceof JournalIntegrityError || error instanceof JournalLimitError
          ? "blocked" : state.phase,
        retryAt: error instanceof JournalIntegrityError || error instanceof JournalLimitError ? null : Date.now() + RETRY_MS });
      } catch (stale) { if (!(stale instanceof StaleGeneration)) throw stale; }
    } finally {
      this.#driving = false;
      await this.#repairAlarm();
    }
  }
}
