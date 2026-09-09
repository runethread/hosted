import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const bucket = (env as unknown as { PROVIDER_PROOF_BUCKET: R2Bucket }).PROVIDER_PROOF_BUCKET;
const REPOSITORY_ID = "1358994027";
const PAGE_LIMIT = 3;
const RECORD_COUNT = 17;
const MAX_PAGES = 100;

describe("real R2 ADR-024 journal listing provider proof", () => {
  it("proves complete cursor pagination plus immediate write/delete listing visibility", async () => {
    const epoch = `proof_listing_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`;
    const prefix = `safety-journal/v1/repositories/${REPOSITORY_ID}/epochs/${epoch}/records/`;
    const initialKeys = Array.from({ length: RECORD_COUNT }, (_, sequence) =>
      `${prefix}${String(sequence).padStart(20, "0")}.json`,
    );
    const appendedKey = `${prefix}${String(RECORD_COUNT).padStart(20, "0")}.json`;
    const cleanupKeys = [...initialKeys, appendedKey];

    await bucket.delete(cleanupKeys);
    try {
      await Promise.all(
        initialKeys.map((key, sequence) =>
          bucket.put(key, JSON.stringify({ sequence, proof: "journal-listing" })),
        ),
      );

      const first = await listCompletePrefix(prefix);
      expect(first.pages).toBeGreaterThan(1);
      expect(first.keys).toEqual(initialKeys);

      const deletedKey = initialKeys[5];
      await bucket.delete(deletedKey);
      const afterDelete = await listCompletePrefix(prefix);
      expect(afterDelete.keys).toEqual(initialKeys.filter((key) => key !== deletedKey));

      await bucket.put(
        appendedKey,
        JSON.stringify({ sequence: RECORD_COUNT, proof: "journal-listing-appended" }),
      );
      const afterAppend = await listCompletePrefix(prefix);
      expect(afterAppend.keys).toEqual(
        [...initialKeys.filter((key) => key !== deletedKey), appendedKey].sort(),
      );

      console.log(
        `PROVIDER_PROOF journal-listing prefix=${prefix} pages=${first.pages} initial=${initialKeys.length} after_delete=${afterDelete.keys.length} after_append=${afterAppend.keys.length}`,
      );
    } finally {
      await bucket.delete(cleanupKeys);
    }
  });
});

async function listCompletePrefix(prefix: string): Promise<{ keys: string[]; pages: number }> {
  const keys: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;

  for (;;) {
    const page = await bucket.list({
      prefix,
      limit: PAGE_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    pages += 1;
    if (pages > MAX_PAGES) {
      throw new Error("R2 pagination exceeded provider-proof page bound");
    }

    keys.push(...page.objects.map((object) => object.key));

    if (!page.truncated) break;
    if (page.cursor === undefined || page.cursor.length === 0) {
      throw new Error("R2 returned a truncated listing without a cursor");
    }
    if (seenCursors.has(page.cursor)) {
      throw new Error("R2 pagination cursor repeated without completing the listing");
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  expect(keys).toEqual([...keys].sort());
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys.every((key) => key.startsWith(prefix))).toBe(true);
  return { keys, pages };
}
