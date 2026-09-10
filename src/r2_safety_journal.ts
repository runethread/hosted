import { JOURNAL_MAX_RECORD_BYTES, JournalIntegrityError, JournalLimitError,
  type JournalEntry, type JournalStore } from "./safety_journal";

/** Internal repository-runtime capability only; never supplied to admission or executors. */
export class R2SafetyJournal implements JournalStore {
  constructor(private readonly bucket: R2Bucket) {}

  async createExact(entry: JournalEntry): Promise<void> {
    await this.bucket.put(entry.key, new TextEncoder().encode(entry.text), {
      onlyIf: new Headers({ "If-None-Match": "*" }),
      sha256: entry.sha256,
      httpMetadata: { contentType: "application/json" },
    });
  }

  async readExact(key: string): Promise<Uint8Array | null> {
    const object = await this.bucket.get(key);
    if (object === null) return null;
    if (object.key !== key) throw new JournalIntegrityError();
    if (object.size > JOURNAL_MAX_RECORD_BYTES) {
      await object.body.cancel();
      throw new JournalLimitError();
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== object.size) throw new JournalIntegrityError();
    return bytes;
  }

  async listPage(prefix: string, cursor?: string) {
    const page = await this.bucket.list({ prefix, cursor, limit: 1000 });
    if (page.delimitedPrefixes.length !== 0 || (page.truncated && !page.cursor)) {
      throw new JournalIntegrityError();
    }
    return { keys: page.objects.map(object => object.key),
      cursor: page.truncated ? page.cursor : undefined };
  }
}
