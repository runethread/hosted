import { env } from "cloudflare:workers";
import { runInDurableObject, runDurableObjectAlarm, evictDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { R2SafetyJournal } from "../src/r2_safety_journal";
import { prepareRecord, readCompleteTail, type JournalEntry } from "../src/safety_journal";
import type { TestRepositoryRuntime } from "./runtime_worker";

function inside<R>(stub: DurableObjectStub<TestRepositoryRuntime>, callback: (instance: TestRepositoryRuntime, ctx: DurableObjectState) => R | Promise<R>): Promise<R> {
  return runInDurableObject<TestRepositoryRuntime, R>(stub, callback);
}

const BINDING = { kind: "EPOCH_OPEN", installationId: "456", canonicalRef: "refs/heads/memory" } as const;
function fixture() {
  const scope = { repositoryId: "123", bindingEpoch: crypto.randomUUID(), hostedReleaseSha256: "a".repeat(64) };
  const stub = env.TEST_RUNTIME.getByName(`repository:${scope.bindingEpoch}`);
  return { scope, stub, store: new R2SafetyJournal(env.TEST_JOURNAL) };
}
async function finish(stub: DurableObjectStub<TestRepositoryRuntime>) {
  for (let i = 0; i < 8; i++) {
    const status = await stub.foundationStatus();
    if (status.phase === "verified" || status.phase === "blocked") return status;
    await runDurableObjectAlarm(stub);
  }
  throw new Error("foundation did not finish within bounded steps");
}

describe("repository SQLite journal foundation", () => {
  it.each(["unknown_phase", "verifying_opening", "barrier_opening", "checkpoint_zero",
    "missing_totalBytes", "wrong_retryAt_type", "wrong_scope", "wrong_binding", "wrong_key",
    "zero_generation", "unknown_version", "scanning_pending", "verified_pending", "missing_checkpoint",
    "pending_at_checkpoint", "later_generation_opening"])(
    "rejects malformed SQLite state before journal I/O: %s", async fault => {
      const { scope, stub, store } = fixture();
      await stub.initializeJournalFoundation(scope, BINDING);
      await inside(stub, async (instance, ctx) => {
        const openingState = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
        await instance.driveJournalFoundation();
        await instance.driveJournalFoundation();
        await ctx.storage.deleteAlarm();
        const original = ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state;
        const state = JSON.parse(original);
        if (fault === "unknown_phase") state.phase = "future_verification";
        if (fault === "verifying_opening" || fault === "barrier_opening") {
          state.phase = fault === "verifying_opening" ? "verifying" : "barrier";
          state.pending = openingState.pending;
          state.totalBytes = 0;
        }
        if (fault === "checkpoint_zero") {
          state.phase = "verified"; state.pending = null; state.retryAt = null;
          state.checkpoint = { sequence: 0, sha256: openingState.pending.sha256 };
        }
        if (fault === "missing_totalBytes") delete state.totalBytes;
        if (fault === "wrong_retryAt_type") state.retryAt = "tomorrow";
        if (fault === "wrong_scope") state.pending.record.repositoryId = "999";
        if (fault === "wrong_binding") state.binding.canonicalRef = "main";
        if (fault === "wrong_key") state.pending.key += ".other";
        if (fault === "zero_generation") state.generation = 0;
        if (fault === "unknown_version") state.version = 2;
        if (fault === "scanning_pending") state.phase = "scanning";
        if (fault === "verified_pending") { state.phase = "verified"; state.retryAt = null; }
        if (fault === "missing_checkpoint") delete state.checkpoint;
        if (fault === "pending_at_checkpoint") {
          state.checkpoint = { sequence: state.pending.record.sequence, sha256: state.pending.sha256 };
        }
        if (fault === "later_generation_opening") {
          Object.assign(state, openingState, { generation: 2 });
        }
        const malformed = JSON.stringify(state);
        const before = await readCompleteTail(store, scope);
        const capability = vi.spyOn(instance, "journalStore");
        ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", malformed);
        try {
          await expect(instance.driveJournalFoundation()).rejects.toThrow("safety_journal_integrity");
          await expect(instance.foundationStatus()).rejects.toThrow("safety_journal_integrity");
          expect(capability).not.toHaveBeenCalled();
          expect(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state).toBe(malformed);
          expect(await readCompleteTail(store, scope)).toEqual(before);
        } finally {
          capability.mockRestore();
          ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", original);
        }
      });
    });

  it("rejects generation overflow before writing a recovery transition", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (instance, ctx) => {
      await instance.driveJournalFoundation(); // Use a valid non-opening phase.
      await ctx.storage.deleteAlarm();
      const state = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      state.generation = Number.MAX_SAFE_INTEGER;
      const exact = JSON.stringify(state);
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", exact);
      await expect(instance.beginJournalRecovery()).rejects.toThrow("safety_journal_integrity");
      expect(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state).toBe(exact);
      expect((await readCompleteTail(store, scope)).entries).toHaveLength(1);
    });
  });

  it.each(["opening", "scanning"])("detects restored fresh %s before planning or appending in its generation", async phase => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const snapshot = await inside(stub, async (instance, ctx) => {
      if (phase === "scanning") await instance.driveJournalFoundation();
      const exact = ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state;
      expect(JSON.parse(exact)).toMatchObject({ phase, generation: 1, checkpoint: null });
      return exact;
    });
    expect((await finish(stub)).phase).toBe("verified");
    const before = await readCompleteTail(store, scope);
    expect(before.entries.map(entry => entry.record.event.kind)).toEqual(["EPOCH_OPEN", "RECOVERY_BARRIER"]);
    await inside(stub, async (instance, ctx) => {
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", snapshot);
      const capability = instance.journalStore();
      const create = vi.spyOn(capability, "createExact");
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(capability);
      try {
        await instance.driveJournalFoundation(); // No explicit recovery call.
        const detected = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
        expect(detected).toMatchObject({ phase: "scanning", generation: 2, pending: null, checkpoint: null });
        expect(await ctx.storage.getAlarm()).toBe(detected.retryAt);
        expect(create).not.toHaveBeenCalled();
        expect(await readCompleteTail(store, scope)).toEqual(before);
        await instance.driveJournalFoundation(); // Recovery scanning must not fence again.
        const planned = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
        expect(planned).toMatchObject({ phase: "barrier", generation: 2 });
        expect(planned.pending.record.sequence).toBe(2);
        expect(planned.pending.record.previousRecordSha256).toBe(before.entries[1].sha256);
        expect(create).not.toHaveBeenCalled();
      } finally { supply.mockRestore(); }
    });
    expect(await finish(stub)).toMatchObject({ phase: "verified", lane: "MAINTENANCE", generation: 2,
      checkpoint: { sequence: 2 } });
    const after = await readCompleteTail(store, scope);
    expect(after.entries).toHaveLength(3);
    expect(after.entries.slice(0, 2)).toEqual(before.entries);
  });

  it("replays sequence zero alone as the exact fresh opening without recovery", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (instance, ctx) => {
      const state = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      const pending: JournalEntry = state.pending;
      await store.createExact(pending); // Opening write succeeded; SQLite transition lost.
      const before = await readCompleteTail(store, scope);
      expect(before.entries).toEqual([pending]);
      const capability = instance.journalStore();
      const create = vi.spyOn(capability, "createExact");
      const read = vi.spyOn(capability, "readExact");
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(capability);
      try {
        await instance.driveJournalFoundation();
        expect(create).toHaveBeenCalledExactlyOnceWith(pending);
        expect(read).toHaveBeenCalledWith(pending.key);
        const replayed = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
        expect(replayed).toMatchObject({ phase: "scanning", generation: 1, pending: null, checkpoint: null });
        expect(await readCompleteTail(store, scope)).toEqual(before);
      } finally { supply.mockRestore(); }
    });
    expect(await finish(stub)).toMatchObject({ phase: "verified", generation: 1, checkpoint: { sequence: 1 } });
    expect((await readCompleteTail(store, scope)).entries).toHaveLength(2);
  });

  it("detects a successor arriving between the opening drive and fresh scanning", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (instance, ctx) => {
      await instance.driveJournalFoundation();
      const initial = await readCompleteTail(store, scope);
      expect(initial.entries).toHaveLength(1);
      await store.createExact(await prepareRecord(scope, 1, initial.entries[0].sha256,
        { kind: "RECOVERY_BARRIER", recoveryId: crypto.randomUUID() }));
      const before = await readCompleteTail(store, scope);
      const capability = instance.journalStore();
      const create = vi.spyOn(capability, "createExact");
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(capability);
      try {
        await instance.driveJournalFoundation();
        expect(JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state))
          .toMatchObject({ phase: "scanning", generation: 2, pending: null, checkpoint: null });
        expect(create).not.toHaveBeenCalled();
        expect(await readCompleteTail(store, scope)).toEqual(before);
      } finally { supply.mockRestore(); }
    });
    expect(await finish(stub)).toMatchObject({ phase: "verified", lane: "MAINTENANCE",
      generation: 2, checkpoint: { sequence: 2 } });
  });

  it("allows a structurally valid older checkpoint to reconcile a later complete tail", async () => {
    const { scope, stub } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    expect((await finish(stub)).checkpoint?.sequence).toBe(1);
    const older = await inside(stub, (_instance, ctx) =>
      ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
    await stub.beginJournalRecovery();
    expect((await finish(stub)).checkpoint?.sequence).toBe(2);
    await inside(stub, async (instance, ctx) => {
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", older);
      await instance.beginJournalRecovery();
    });
    expect((await finish(stub)).checkpoint?.sequence).toBe(3);
  });

  it("replays an already-created exact barrier after losing its local transition", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const pending = await inside(stub, async (instance, ctx) => {
      await instance.driveJournalFoundation();
      await instance.driveJournalFoundation();
      const state = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      expect(state.phase).toBe("barrier");
      const claim: JournalEntry = state.pending;
      await store.createExact(claim); // External success, local transition lost.
      await ctx.storage.deleteAlarm();
      return claim;
    });
    const before = await readCompleteTail(store, scope);
    expect(before.entries.at(-1)).toEqual(pending);
    await evictDurableObject(stub);
    await inside(stub, async (instance, ctx) => {
      const state = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      expect(state.phase).toBe("barrier");
      expect(state.pending).toEqual(pending);
      const capability = instance.journalStore();
      const create = vi.spyOn(capability, "createExact");
      const read = vi.spyOn(capability, "readExact");
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(capability);
      try {
        await instance.driveJournalFoundation();
        expect(create).toHaveBeenCalledExactlyOnceWith(pending);
        expect(read).toHaveBeenCalledExactlyOnceWith(pending.key);
        expect(await read.mock.results[0].value).toEqual(new TextEncoder().encode(pending.text));
        const after = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
        expect(after.phase).toBe("verifying");
        expect(after.pending).toEqual(pending);
        expect(after.checkpoint).toBeNull();
      } finally { supply.mockRestore(); }
    });
    expect(await readCompleteTail(store, scope)).toEqual(before);
    expect((await finish(stub)).checkpoint).toEqual({ sequence: pending.record.sequence, sha256: pending.sha256 });
    expect(await readCompleteTail(store, scope)).toEqual(before);
  });

  it("uses local R2 conditional creation and verifies its barrier while keeping maintenance", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const status = await finish(stub);
    expect(status).toMatchObject({ lane: "MAINTENANCE", phase: "verified", checkpoint: { sequence: 1 } });
    const tail = await readCompleteTail(store, scope);
    expect(tail.entries.map(entry => entry.record.event.kind)).toEqual(["EPOCH_OPEN", "RECOVERY_BARRIER"]);
    expect(status.checkpoint?.sha256).toBe(tail.entries[1].sha256);
    // An existing opening cannot be overwritten, even by another valid record.
    const rival = await prepareRecord(scope, 0, null, { ...BINDING, installationId: "789" });
    await store.createExact(rival);
    expect((await readCompleteTail(store, scope)).entries[0].record.event).toEqual(BINDING);
  });

  it("preserves verified state after ordinary eviction without another recovery barrier", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const before = await finish(stub);
    const tail = await readCompleteTail(store, scope);
    await evictDurableObject(stub);
    const status = await finish(stub);
    expect(status).toEqual(before);
    expect(status.checkpoint?.sequence).toBe(1);
    expect(await readCompleteTail(store, scope)).toEqual(tail);
    await inside(stub, async (_instance, ctx) => {
      expect(await ctx.storage.getAlarm()).toBeNull();
    });
  });

  it("preserves a pending fresh opening on activation and repairs its missing alarm", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const before = await inside(stub, async (_instance, ctx) => {
      await ctx.storage.deleteAlarm();
      return ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state;
    });
    expect(JSON.parse(before).phase).toBe("opening");
    await evictDurableObject(stub);
    await inside(stub, async (_instance, ctx) => {
      expect(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state).toBe(before);
      expect(await ctx.storage.getAlarm()).toBe(JSON.parse(before).retryAt);
    });
    expect((await finish(stub)).checkpoint?.sequence).toBe(1);
    expect((await readCompleteTail(store, scope)).entries).toHaveLength(2);
  });

  it("repairs a missing alarm without a client acceptance response", async () => {
    const { scope, stub } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (_instance, ctx) => {
      await ctx.storage.deleteAlarm();
    });
    await stub.foundationStatus();
    await inside(stub, async (_instance, ctx) => {
      expect(await ctx.storage.getAlarm()).not.toBeNull();
    });
    expect((await finish(stub)).phase).toBe("verified");
  });

  it("reconstructs the later journal tail after a simulated local SQLite rollback", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const before = await inside(stub, (_instance, ctx) =>
      ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
    await finish(stub);
    await inside(stub, async (instance, ctx) => {
      ctx.storage.transactionSync(() => ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", before));
      await instance.beginJournalRecovery();
    });
    expect((await finish(stub)).checkpoint?.sequence).toBe(2);
    expect((await readCompleteTail(store, scope)).entries).toHaveLength(3);
  });

  it("blocks a missing opening and does not recreate an empty active epoch", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await finish(stub);
    const tail = await readCompleteTail(store, scope);
    await env.TEST_JOURNAL.delete(tail.entries[0].key);
    await stub.beginJournalRecovery();
    expect(await finish(stub)).toMatchObject({ lane: "MAINTENANCE", phase: "blocked" });
    expect(await store.readExact(tail.entries[0].key)).toBeNull();
  });

  it("does not repair a missing opening beneath a suffix after rollback to a pending opening", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const before = await inside(stub, (_instance, ctx) =>
      ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
    await finish(stub);
    const tail = await readCompleteTail(store, scope);
    await env.TEST_JOURNAL.delete(tail.entries[0].key);
    await inside(stub, async (instance, ctx) => {
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", before);
      await instance.beginJournalRecovery();
    });
    expect((await finish(stub)).phase).toBe("blocked");
    expect(await store.readExact(tail.entries[0].key)).toBeNull();
  });

  it("blocks corrupted pending bytes before issuing an object write", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (instance, ctx) => {
      const state = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      state.pending.sha256 = "b".repeat(64);
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", JSON.stringify(state));
      await instance.driveJournalFoundation();
      expect((await instance.foundationStatus()).phase).toBe("blocked");
    });
    expect((await readCompleteTail(store, scope)).entries).toHaveLength(0);
  });

  it("blocks explicit recovery from restored opening when the entire active journal is missing", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const before = await inside(stub, (_instance, ctx) =>
      ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
    expect(JSON.parse(before).phase).toBe("opening");
    expect((await finish(stub)).phase).toBe("verified");
    const tail = await readCompleteTail(store, scope);
    expect(tail.entries).toHaveLength(2);
    await inside(stub, (_instance, ctx) => {
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", before);
    });
    await env.TEST_JOURNAL.delete(tail.entries.map(entry => entry.key));
    await stub.beginJournalRecovery();
    expect(await finish(stub)).toMatchObject({ lane: "MAINTENANCE", phase: "blocked" });
    expect(await store.readExact(tail.entries[0].key)).toBeNull();
    expect((await readCompleteTail(store, scope)).entries).toHaveLength(0);
  });

  it("rejects replacing a binding and blocks an incompatible release's journal", async () => {
    const { scope, stub, store } = fixture();
    const incompatible = { ...scope, hostedReleaseSha256: "b".repeat(64) };
    await store.createExact(await prepareRecord(incompatible, 0, null, BINDING));
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async instance => {
      await expect(instance.initializeJournalFoundation({ ...scope, bindingEpoch: crypto.randomUUID() }, BINDING)).rejects.toThrow();
    });
    expect((await finish(stub)).phase).toBe("blocked");
  });

  it("keeps the exact pending claim and schedules backoff when read-back is unavailable", async () => {
    const { scope, stub } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (instance, ctx) => {
      const store = instance.journalStore();
      const originalRead = store.readExact.bind(store);
      const read = vi.spyOn(store, "readExact").mockRejectedValue(new Error("private provider error"));
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(store);
      const before = ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one();
      await instance.driveJournalFoundation();
      const failed = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      expect(failed.pending).toEqual(JSON.parse(before.state).pending);
      expect(failed.phase).toBe("opening");
      expect(failed.retryAt).toBeGreaterThan(Date.now());
      expect(await ctx.storage.getAlarm()).not.toBeNull();
      read.mockImplementation(originalRead);
      supply.mockRestore();
    });
    expect((await finish(stub)).phase).toBe("verified");
  });

  it("incorporates a valid delayed writer before winning a later barrier", async () => {
    const { scope, stub } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async instance => {
      await instance.driveJournalFoundation(); // opening
      await instance.driveJournalFoundation(); // durable barrier claim
      const store = instance.journalStore();
      const create = store.createExact.bind(store);
      let raced = false;
      vi.spyOn(store, "createExact").mockImplementation(async entry => {
        if (!raced && entry.record.event.kind === "RECOVERY_BARRIER") {
          raced = true;
          await create(await prepareRecord(scope, entry.record.sequence, entry.record.previousRecordSha256,
            { kind: "RECOVERY_BARRIER", recoveryId: crypto.randomUUID() }));
        }
        await create(entry);
      });
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(store);
      await instance.driveJournalFoundation();
      expect((await instance.foundationStatus()).phase).toBe("scanning");
      supply.mockRestore();
    });
    expect((await finish(stub)).checkpoint?.sequence).toBe(2);
  });

  it("rejects any successor discovered above the winning recovery barrier", async () => {
    const { scope, stub } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async instance => {
      for (let i = 0; i < 3; i++) await instance.driveJournalFoundation();
      const store = instance.journalStore();
      const tail = await readCompleteTail(store, scope);
      const last = tail.entries.at(-1)!;
      await store.createExact(await prepareRecord(scope, last.record.sequence + 1, last.sha256,
        { kind: "RECOVERY_BARRIER", recoveryId: crypto.randomUUID() }));
      await instance.driveJournalFoundation();
      expect(await instance.foundationStatus()).toMatchObject({ lane: "MAINTENANCE", phase: "blocked" });
    });
  });

  it("persists a future wakeup when an alarm fires during an in-flight append", async () => {
    const { scope, stub, store } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    const before = await inside(stub, async (_instance, ctx) => {
      const state = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      state.retryAt = Date.now() + 60_000; // Keep automatic delivery outside the bounded manual-alarm test.
      ctx.storage.sql.exec("UPDATE repository_runtime SET state = ?", JSON.stringify(state));
      await ctx.storage.setAlarm(state.retryAt);
      return state;
    });
    expect(before.phase).toBe("opening");
    const scheduled = await stub.inspectJournalFoundation();
    expect(JSON.parse(scheduled.state)).toEqual(before);
    expect(before.retryAt).toBeGreaterThan(Date.now());
    expect(scheduled.alarm).toBe(before.retryAt);
    await stub.armJournalCreateGate();
    // Setup's inside() has returned. Hold Driver A through ordinary RPC only.
    let driverFinished = false;
    const driver = stub.driveJournalFoundation().finally(() => { driverFinished = true; });
    try {
      expect(await Promise.race([stub.waitForJournalCreate(), driver.then(() => {
        throw new Error("driver finished before the create gate");
      })])).toBe(true);
      expect(driverFinished).toBe(false);
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect(driverFinished).toBe(false);
      // Only the alarm helper uses inside(); observation is passive ordinary RPC.
      const busy = await stub.inspectJournalFoundation();
      const busyState = JSON.parse(busy.state);
      expect(busyState.retryAt).toBeGreaterThan(Date.now());
      expect(busy.alarm).not.toBeNull();
      expect(busy.alarm).toBe(busyState.retryAt);
      expect(busyState.retryAt).toBe(before.retryAt);
      expect(busy.alarm).toBe(before.retryAt);
      expect(busyState).toEqual(before);
      expect(busy.gate).toEqual({ armed: true, entered: true, released: false,
        attempts: 1, completed: 0, attemptedEntry: JSON.stringify(before.pending) });
      expect(driverFinished).toBe(false);
    } finally {
      try { await stub.releaseJournalCreateGate(); }
      finally { await driver; }
    }
    expect(driverFinished).toBe(true);
    const after = await stub.inspectJournalFoundation();
    expect(after.gate).toEqual({ armed: true, entered: true, released: true,
      attempts: 1, completed: 1, attemptedEntry: JSON.stringify(before.pending) });
    const afterState = JSON.parse(after.state);
    expect(afterState).toMatchObject({ phase: "scanning", generation: before.generation, pending: null });
    expect(after.alarm).toBe(afterState.retryAt);
    expect((await readCompleteTail(store, scope)).entries).toEqual([before.pending]);
    await stub.disarmJournalCreateGate();
    expect(await finish(stub)).toMatchObject({ phase: "verified", generation: 1, checkpoint: { sequence: 1 } });
    expect((await readCompleteTail(store, scope)).entries.map(entry => entry.record.event.kind))
      .toEqual(["EPOCH_OPEN", "RECOVERY_BARRIER"]);
    expect(await runDurableObjectAlarm(stub)).toBe(false);
  });

  it("ignores completion from a superseded generation and permits only one in-flight driver", async () => {
    const { scope, stub } = fixture();
    await stub.initializeJournalFoundation(scope, BINDING);
    await inside(stub, async (instance, ctx) => {
      const store = instance.journalStore();
      const create = store.createExact.bind(store);
      let release!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; });
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      let calls = 0;
      vi.spyOn(store, "createExact").mockImplementation(async (entry: JournalEntry) => {
        calls++; entered(); await wait; await create(entry);
      });
      const supply = vi.spyOn(instance, "journalStore").mockReturnValue(store);
      const driver = instance.driveJournalFoundation();
      await started;
      await instance.driveJournalFoundation();
      await instance.beginJournalRecovery();
      const generation = (await instance.foundationStatus()).generation;
      release();
      await driver;
      expect(calls).toBe(1);
      const persisted = JSON.parse(ctx.storage.sql.exec<{ state: string }>("SELECT state FROM repository_runtime").one().state);
      expect(persisted.generation).toBe(generation);
      expect(persisted.phase).toBe("scanning");
      expect(persisted.pending).toBeNull();
      supply.mockRestore();
    });
    expect((await finish(stub)).phase).toBe("verified");
  });
});
