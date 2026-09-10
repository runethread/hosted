import { hexFromArrayBuffer } from "./sealed_request";

// Source protocol only. The public Worker does not import or expose this module.
export const JOURNAL_VERSION = 1;
export const JOURNAL_SEQUENCE_WIDTH = 10;
export const JOURNAL_MAX_RECORDS = 10_000;
export const JOURNAL_MAX_BYTES = 16 * 1024 * 1024;
export const JOURNAL_MAX_RECORD_BYTES = 4096;
export const CORE_RUNTIME_COMMIT = "7f5cf86f23604426c7e8f69086fdcbe27fb86226";

export interface JournalScope {
  readonly repositoryId: string;
  readonly bindingEpoch: string;
  readonly hostedReleaseSha256: string;
}
export type JournalEvent =
  | { readonly kind: "EPOCH_OPEN"; readonly installationId: string; readonly canonicalRef: string }
  | { readonly kind: "RECOVERY_BARRIER"; readonly recoveryId: string };
export interface JournalRecord {
  readonly version: 1;
  readonly repositoryId: string;
  readonly bindingEpoch: string;
  readonly sequence: number;
  readonly previousRecordSha256: string | null;
  readonly hostedReleaseSha256: string;
  readonly coreRuntimeCommit: typeof CORE_RUNTIME_COMMIT;
  readonly contractVersion: 9;
  readonly repositoryRuntimeVersion: 1;
  readonly event: JournalEvent;
}
export interface JournalEntry {
  readonly key: string;
  readonly text: string;
  readonly sha256: string;
  readonly size: number;
  readonly record: JournalRecord;
}
export interface JournalTail {
  readonly entries: readonly JournalEntry[];
  readonly totalBytes: number;
}
// A private capability: no delete, overwrite, sequence allocation, or collision retry.
export interface JournalStore {
  createExact(entry: JournalEntry): Promise<void>;
  readExact(key: string): Promise<Uint8Array | null>;
  listPage(prefix: string, cursor?: string): Promise<{
    readonly keys: readonly string[];
    readonly cursor?: string;
  }>;
}
export class JournalIntegrityError extends Error {
  constructor() { super("safety_journal_integrity"); }
}
export class JournalUnavailableError extends Error {
  constructor() { super("safety_journal_unproven"); }
}
export class JournalLimitError extends Error {
  constructor() { super("safety_journal_limit"); }
}
const encoder = new TextEncoder();
const digestPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const idPattern = /^[1-9][0-9]{0,19}$/;
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new JournalIntegrityError();
}
export function journalPrefix(scope: JournalScope): string {
  requireValid(typeof scope.repositoryId === "string" && idPattern.test(scope.repositoryId)
    && typeof scope.bindingEpoch === "string" && uuidPattern.test(scope.bindingEpoch)
    && typeof scope.hostedReleaseSha256 === "string" && digestPattern.test(scope.hostedReleaseSha256));
  return `safety-journal/v1/repositories/${scope.repositoryId}/epochs/${scope.bindingEpoch}/records/`;
}
export function journalKey(scope: JournalScope, sequence: number): string {
  requireValid(Number.isSafeInteger(sequence) && sequence >= 0 && sequence < 10 ** JOURNAL_SEQUENCE_WIDTH);
  return `${journalPrefix(scope)}${String(sequence).padStart(JOURNAL_SEQUENCE_WIDTH, "0")}.json`;
}
function canonicalEvent(event: JournalEvent): JournalEvent {
  requireValid(event !== null && typeof event === "object");
  if (event.kind === "EPOCH_OPEN") {
    requireValid(typeof event.installationId === "string" && idPattern.test(event.installationId) && typeof event.canonicalRef === "string"
      && event.canonicalRef.length <= 255 && event.canonicalRef.startsWith("refs/heads/")
      && event.canonicalRef.length > 11
      && !/[\x00-\x20\x7f~^:?*\[\\]/.test(event.canonicalRef)
      && !event.canonicalRef.includes("..") && !event.canonicalRef.includes("@{")
      && event.canonicalRef.split("/").every(part => part.length > 0 && !part.startsWith(".")
        && !part.endsWith(".lock") && !part.endsWith(".")));
    return { kind: "EPOCH_OPEN", installationId: event.installationId, canonicalRef: event.canonicalRef };
  }
  requireValid(event.kind === "RECOVERY_BARRIER" && typeof event.recoveryId === "string" && uuidPattern.test(event.recoveryId));
  return { kind: "RECOVERY_BARRIER", recoveryId: event.recoveryId };
}
export async function prepareRecord(
  scope: JournalScope, sequence: number, previousRecordSha256: string | null, event: JournalEvent,
): Promise<JournalEntry> {
  const key = journalKey(scope, sequence);
  requireValid(sequence === 0 ? previousRecordSha256 === null && event.kind === "EPOCH_OPEN"
    : typeof previousRecordSha256 === "string" && digestPattern.test(previousRecordSha256)
      && event.kind === "RECOVERY_BARRIER");
  const record: JournalRecord = {
    version: 1, repositoryId: scope.repositoryId, bindingEpoch: scope.bindingEpoch, sequence,
    previousRecordSha256, hostedReleaseSha256: scope.hostedReleaseSha256,
    coreRuntimeCommit: CORE_RUNTIME_COMMIT, contractVersion: 9, repositoryRuntimeVersion: 1,
    event: canonicalEvent(event),
  };
  const text = JSON.stringify(record) + "\n";
  const bytes = encoder.encode(text);
  if (bytes.byteLength > JOURNAL_MAX_RECORD_BYTES) throw new JournalLimitError();
  return { key, text, sha256: hexFromArrayBuffer(await crypto.subtle.digest("SHA-256", bytes)),
    size: bytes.byteLength, record };
}
export async function verifyRecord(scope: JournalScope, key: string, bytes: Uint8Array): Promise<JournalEntry> {
  if (bytes.byteLength > JOURNAL_MAX_RECORD_BYTES) throw new JournalLimitError();
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: JournalRecord = JSON.parse(text);
    const expected = await prepareRecord(scope, parsed.sequence, parsed.previousRecordSha256, parsed.event);
    // Exact reserialization rejects extra/missing fields, duplicate JSON keys, BOM, whitespace,
    // alternate number/string encodings, unsupported identities and property order.
    requireValid(expected.key === key && expected.text === text
      && expected.size === bytes.byteLength && encoder.encode(text).every((b, i) => b === bytes[i]));
    return expected;
  } catch (error) {
    if (error instanceof JournalLimitError) throw error;
    throw new JournalIntegrityError();
  }
}
export function checkJournalBudget(count: number, bytes: number): void {
  if (count > JOURNAL_MAX_RECORDS || bytes > JOURNAL_MAX_BYTES) throw new JournalLimitError();
}
export async function appendExact(store: JournalStore, entry: JournalEntry): Promise<void> {
  // Ambiguous creation is resolvable only by exact read-back, never a new sequence.
  try { await store.createExact(entry); } catch { /* read-back below */ }
  let bytes: Uint8Array | null;
  try { bytes = await store.readExact(entry.key); } catch (error) {
    if (error instanceof JournalIntegrityError || error instanceof JournalLimitError) throw error;
    throw new JournalUnavailableError();
  }
  if (bytes === null) throw new JournalUnavailableError();
  const actual = await verifyRecord(entry.record, entry.key, bytes);
  requireValid(actual.text === entry.text && actual.sha256 === entry.sha256);
}
export async function readCompleteTail(store: JournalStore, scope: JournalScope): Promise<JournalTail> {
  const prefix = journalPrefix(scope);
  const entries: JournalEntry[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let totalBytes = 0;
  do {
    let page: Awaited<ReturnType<JournalStore["listPage"]>>;
    try { page = await store.listPage(prefix, cursor); } catch (error) {
      if (error instanceof JournalIntegrityError || error instanceof JournalLimitError) throw error;
      throw new JournalUnavailableError();
    }
    requireValid(page.cursor === undefined || (page.cursor.length > 0 && !cursors.has(page.cursor)));
    if (page.cursor !== undefined) cursors.add(page.cursor);
    // Bound even a malicious/non-progressing provider's empty-page stream.
    if (cursors.size > JOURNAL_MAX_RECORDS) throw new JournalLimitError();
    for (const key of page.keys) {
      checkJournalBudget(entries.length + 1, totalBytes);
      requireValid(key === journalKey(scope, entries.length));
      let bytes: Uint8Array | null;
      try { bytes = await store.readExact(key); } catch (error) {
        if (error instanceof JournalIntegrityError || error instanceof JournalLimitError) throw error;
        throw new JournalUnavailableError();
      }
      requireValid(bytes !== null);
      const entry = await verifyRecord(scope, key, bytes);
      requireValid(entry.record.previousRecordSha256 === (entries.at(-1)?.sha256 ?? null));
      totalBytes += entry.size;
      checkJournalBudget(entries.length + 1, totalBytes);
      entries.push(entry);
    }
    cursor = page.cursor;
  } while (cursor !== undefined);
  return { entries, totalBytes };
}
