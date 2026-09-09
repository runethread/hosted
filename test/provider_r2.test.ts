import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { R2SealedRequestObjectStore } from "../src/r2_sealed_request_store";
import {
  SealedRequestIntegrityError,
  persistSealedRequest,
  planSealedRequest,
  verifyStoredSealedRequest,
  type CreateSealedRequestObject,
  type SealedRequestObjectStore,
} from "../src/sealed_request";

const encoder = new TextEncoder();
const LIMITS = { maxCoreRequestBytes: 1024 } as const;
const GITHUB_REPOSITORY_ID = "1358994027";

const bucket = (env as unknown as { PROVIDER_PROOF_BUCKET: R2Bucket }).PROVIDER_PROOF_BUCKET;
const store = new R2SealedRequestObjectStore(bucket);

describe("real R2 sealed request provider proof", () => {
  it("proves atomic create-if-absent race and immediate exact read-back", async () => {
    const binding = proofBinding("race");
    const bytes = encoder.encode('{"proof":"race"}');
    const planned = await planSealedRequest(binding, bytes, LIMITS);

    await bucket.delete(planned.key);
    try {
      expect(await bucket.get(planned.key)).toBeNull();

      const input = createInput(planned);
      const results = await Promise.all([
        store.createIfAbsent(createInput(planned)),
        store.createIfAbsent(createInput(planned)),
      ]);

      expect(results.sort()).toEqual(["already_exists", "created"]);

      const stored = await store.readExact(planned.key);
      expect(stored).not.toBeNull();
      if (stored === null) return;
      await verifyStoredSealedRequest(planned, stored);

      const direct = await bucket.get(planned.key);
      expect(direct).not.toBeNull();
      expect(direct?.customMetadata).toEqual(planned.customMetadata);
      expect(direct?.checksums.sha256).not.toBeNull();
      expect(input.bytes.byteLength).toBe(planned.size);

      console.log(`PROVIDER_PROOF race key=${planned.key} results=${results.join(",")}`);
    } finally {
      await bucket.delete(planned.key);
    }
  });

  it("proves exact repeated persistence is idempotent with checksum and metadata round-trip", async () => {
    const binding = proofBinding("idempotent");
    const bytes = encoder.encode('{"proof":"idempotent"}');
    const planned = await planSealedRequest(binding, bytes, LIMITS);

    await bucket.delete(planned.key);
    try {
      const first = await persistSealedRequest(store, binding, bytes, LIMITS);
      const second = await persistSealedRequest(store, binding, bytes, LIMITS);

      expect(first.disposition).toBe("created");
      expect(second.disposition).toBe("existing_identical");
      expect(second.reference).toEqual(first.reference);

      const stored = await store.readExact(planned.key);
      expect(stored).not.toBeNull();
      if (stored === null) return;
      await verifyStoredSealedRequest(planned, stored);
      expect(stored.customMetadata).toEqual(planned.customMetadata);
      expect(stored.providerSha256Hex).toBe(planned.sha256Hex);

      console.log(`PROVIDER_PROOF idempotent key=${planned.key}`);
    } finally {
      await bucket.delete(planned.key);
    }
  });

  it("rejects corrupt content pre-existing at the deterministic identity", async () => {
    const binding = proofBinding("corrupt");
    const desiredBytes = encoder.encode('{"proof":"desired"}');
    const corruptBytes = encoder.encode('{"proof":"corrupt"}');
    const planned = await planSealedRequest(binding, desiredBytes, LIMITS);

    await bucket.delete(planned.key);
    try {
      await bucket.put(planned.key, corruptBytes, {
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: { ...planned.customMetadata },
      });

      await expect(
        persistSealedRequest(store, binding, desiredBytes, LIMITS),
      ).rejects.toBeInstanceOf(SealedRequestIntegrityError);

      console.log(`PROVIDER_PROOF corrupt-rejected key=${planned.key}`);
    } finally {
      await bucket.delete(planned.key);
    }
  });

  it("recovers a real committed create after the application discards its result", async () => {
    const binding = proofBinding("lost-response");
    const bytes = encoder.encode('{"proof":"lost-response"}');
    const planned = await planSealedRequest(binding, bytes, LIMITS);

    await bucket.delete(planned.key);
    try {
      const discardSuccessfulCreateResult: SealedRequestObjectStore = {
        async createIfAbsent(input) {
          const result = await store.createIfAbsent(input);
          expect(result).toBe("created");
          throw new Error("provider proof intentionally discarded successful create result");
        },
        readExact(key) {
          return store.readExact(key);
        },
      };

      const proof = await persistSealedRequest(
        discardSuccessfulCreateResult,
        binding,
        bytes,
        LIMITS,
      );

      expect(proof.disposition).toBe("recovered_after_ambiguous_write");
      expect(proof.reference).toEqual(planned.reference);

      const stored = await store.readExact(planned.key);
      expect(stored).not.toBeNull();
      if (stored === null) return;
      await verifyStoredSealedRequest(planned, stored);

      console.log(`PROVIDER_PROOF lost-response-recovered key=${planned.key}`);
    } finally {
      await bucket.delete(planned.key);
    }
  });
});

function proofBinding(label: string): { githubRepositoryId: string; bindingEpoch: string } {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  return {
    githubRepositoryId: GITHUB_REPOSITORY_ID,
    bindingEpoch: `proof_${label}_${Date.now()}_${nonce}`,
  };
}

function createInput(
  planned: Awaited<ReturnType<typeof planSealedRequest>>,
): CreateSealedRequestObject {
  return {
    key: planned.key,
    bytes: new Uint8Array(planned.bytes),
    sha256Bytes: planned.sha256Bytes.slice(0),
    customMetadata: { ...planned.customMetadata },
  };
}
