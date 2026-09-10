import { describe, expect, it } from "vitest";
import { appendExact, checkJournalBudget, journalKey, journalPrefix, prepareRecord,
  readCompleteTail, verifyRecord, JournalIntegrityError, JournalLimitError,
  JournalUnavailableError, JOURNAL_MAX_BYTES, JOURNAL_MAX_RECORDS,
  type JournalEntry, type JournalScope, type JournalStore } from "../src/safety_journal";

export const SCOPE: JournalScope = { repositoryId: "123", bindingEpoch: "12345678-1234-4123-8123-123456789012",
  hostedReleaseSha256: "a".repeat(64) };
export const BINDING = { kind: "EPOCH_OPEN", installationId: "456", canonicalRef: "refs/heads/memory" } as const;
const encoder = new TextEncoder();
class MemoryJournal implements JournalStore {
  objects = new Map<string, Uint8Array>();
  creates: string[] = [];
  pages = 0;
  lostResponse = false;
  unavailable = false;
  async createExact(entry: JournalEntry) {
    this.creates.push(entry.key);
    if (!this.objects.has(entry.key)) this.objects.set(entry.key, encoder.encode(entry.text));
    if (this.lostResponse) throw new Error("private provider detail");
  }
  async readExact(key: string) {
    if (this.unavailable) throw new Error("private provider detail");
    return this.objects.get(key) ?? null;
  }
  async listPage(prefix: string, cursor?: string) {
    this.pages++;
    const keys = [...this.objects.keys()].filter(key => key.startsWith(prefix)).sort();
    const offset = Number(cursor ?? 0);
    return { keys: keys.slice(offset, offset + 2), cursor: offset + 2 < keys.length ? String(offset + 2) : undefined };
  }
}
async function chain(count: number) {
  const store = new MemoryJournal();
  const entries: JournalEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entry = await prepareRecord(SCOPE, i, entries.at(-1)?.sha256 ?? null,
      i === 0 ? BINDING : { kind: "RECOVERY_BARRIER", recoveryId: crypto.randomUUID() });
    entries.push(entry);
    await store.createExact(entry);
  }
  return { store, entries };
}

describe("strict safety journal", () => {
  it("has fixed-width keys, exact canonical bytes and verified hash linkage", async () => {
    const { store, entries } = await chain(5);
    expect(entries[0].key).toBe(`${journalPrefix(SCOPE)}0000000000.json`);
    expect(entries[1].record.previousRecordSha256).toBe(entries[0].sha256);
    expect(await readCompleteTail(store, SCOPE)).toEqual({ entries,
      totalBytes: entries.reduce((n, entry) => n + entry.size, 0) });
    expect(store.pages).toBe(3);
  });

  it("recovers a lost create response at exactly the same key and bytes", async () => {
    const { store, entries } = await chain(1);
    store.lostResponse = true;
    await appendExact(store, entries[0]);
    await appendExact(store, entries[0]);
    expect(new Set(store.creates).size).toBe(1);
    expect(store.objects.size).toBe(1);
    store.unavailable = true;
    await expect(appendExact(store, entries[0])).rejects.toThrow(JournalUnavailableError);
  });

  it("never skips a byte-different collision", async () => {
    const { store, entries } = await chain(2);
    const rival = await prepareRecord(SCOPE, 1, entries[0].sha256,
      { kind: "RECOVERY_BARRIER", recoveryId: crypto.randomUUID() });
    await expect(appendExact(store, rival)).rejects.toThrow(JournalIntegrityError);
    expect(store.objects.size).toBe(2);
    expect(store.objects.get(rival.key)).toEqual(encoder.encode(entries[1].text));
  });

  it.each([
    (text: string) => " " + text,
    (text: string) => text.replace('"version":1', '"version":2'),
    (text: string) => text.replace('"version":1', '"version":1,"extra":"private body"'),
    (text: string) => text.replace('"version":1', '"version":1,"version":1'),
    (text: string) => text.replace('"contractVersion":9', '"contractVersion":8'),
    (text: string) => text.replace('"EPOCH_OPEN"', '"ACCEPTED"'),
    (text: string) => text.replace('"repositoryId":"123"', '"repositoryId":"999"'),
    (text: string) => text.replace('"sequence":0', '"sequence":0.0'),
    (text: string) => "\uFEFF" + text,
    (text: string) => text.trimEnd(),
  ])("rejects noncanonical/unknown/misbound records", async mutate => {
    const entry = await prepareRecord(SCOPE, 0, null, BINDING);
    await expect(verifyRecord(SCOPE, entry.key, encoder.encode(mutate(entry.text))))
      .rejects.toThrow(JournalIntegrityError);
  });

  it.each(["gap", "wrong_predecessor", "bad_key", "duplicate", "cursor_loop", "missing_body"])(
    "fails closed on %s", async fault => {
      const { store, entries } = await chain(4);
      if (fault === "gap") store.objects.delete(entries[1].key);
      if (fault === "bad_key") store.objects.set(`${journalPrefix(SCOPE)}0000000004.txt`, encoder.encode("{}"));
      if (fault === "wrong_predecessor") {
        const wrong = await prepareRecord(SCOPE, 2, "b".repeat(64), entries[2].record.event);
        store.objects.set(wrong.key, encoder.encode(wrong.text));
      }
      if (fault === "duplicate") store.listPage = async () => ({ keys: [entries[0].key, entries[0].key], cursor: undefined });
      if (fault === "cursor_loop") store.listPage = async () => ({ keys: [], cursor: "loop" });
      if (fault === "missing_body") store.readExact = async () => null;
      await expect(readCompleteTail(store, SCOPE)).rejects.toThrow(JournalIntegrityError);
    });

  it("rejects overflow, quota exhaustion, invalid refs and oversized records", async () => {
    expect(() => journalKey(SCOPE, 10 ** 10)).toThrow(JournalIntegrityError);
    expect(() => journalKey(SCOPE, -1)).toThrow(JournalIntegrityError);
    expect(() => checkJournalBudget(JOURNAL_MAX_RECORDS + 1, 1)).toThrow(JournalLimitError);
    expect(() => checkJournalBudget(1, JOURNAL_MAX_BYTES + 1)).toThrow(JournalLimitError);
    const entry = await prepareRecord(SCOPE, 0, null, BINDING);
    await expect(verifyRecord(SCOPE, entry.key, new Uint8Array(4097))).rejects.toThrow(JournalLimitError);
    for (const canonicalRef of ["main", "refs/heads/a..b", "refs/heads/.a", "refs/heads/a.lock", "refs/heads/a\nb"]) {
      await expect(prepareRecord(SCOPE, 0, null, { ...BINDING, canonicalRef })).rejects.toThrow(JournalIntegrityError);
    }
  });
});
