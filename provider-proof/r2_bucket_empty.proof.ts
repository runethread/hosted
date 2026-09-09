import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const bucket = (env as unknown as { PROVIDER_PROOF_BUCKET: R2Bucket }).PROVIDER_PROOF_BUCKET;
const MAX_PAGES = 100;

describe("real R2 provider-proof bucket cleanup audit", () => {
  it("proves the entire retained provider-proof bucket is empty", async () => {
    const keys: string[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    for (;;) {
      const page = await bucket.list({
        limit: 1000,
        ...(cursor === undefined ? {} : { cursor }),
      });
      pages += 1;
      if (pages > MAX_PAGES) {
        throw new Error("R2 empty-bucket audit exceeded provider-proof page bound");
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

    expect(keys).toEqual([]);
    console.log(`PROVIDER_PROOF r2-cleanup bucket=runethread-provider-proof pages=${pages} objects=${keys.length}`);
  }, 30_000);
});
