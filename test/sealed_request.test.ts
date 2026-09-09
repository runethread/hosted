import { describe, expect, it, vi } from "vitest";

import { R2SealedRequestObjectStore } from "../src/r2_sealed_request_store";
import {
  SEALED_REQUEST_OBJECT_CLASS,
  SEALED_REQUEST_PROTOCOL_VERSION,
  SealedRequestIntegrityError,
  SealedRequestStorageUnprovenError,
  persistSealedRequest,
  planSealedRequest,
  sealedRequestKey,
  type CreateIfAbsentResult,
  type CreateSealedRequestObject,
  type SealedRequestObjectStore,
  type StoredSealedRequestObject,
} from "../src/sealed_request";

const encoder = new TextEncoder();
const BINDING = { githubRepositoryId: "1358994027", bindingEpoch: "epoch_01" } as const;

class MemorySealedRequestStore implements SealedRequestObjectStore {
  object: StoredSealedRequestObject | null = null;
  createResult: CreateIfAbsentResult = "created";
  createError: Error | null = null;
  readError: Error | null = null;
  storeBeforeCreateError = false;

  async createIfAbsent(input: CreateSealedRequestObject): Promise<CreateIfAbsentResult> {
    if (this.createError !== null) {
      if (this.storeBeforeCreateError) this.object = storedFromCreate(input);
      throw this.createError;
    }
    if (this.createResult === "created") this.object = storedFromCreate(input);
    return this.createResult;
  }

  async readExact(_key: string): Promise<StoredSealedRequestObject | null> {
    if (this.readError !== null) throw this.readError;
    return this.object;
  }
}

describe("sealed request protocol", () => {
  it("derives a deterministic repository/epoch scoped identity over exact bytes", async () => {
    const bytes = encoder.encode('{"x":1}');
    const planned = await planSealedRequest(BINDING, bytes);

    expect(planned.sha256Hex).toBe(
      "5041bf1f713df204784353e82f6a4a535931cb64f1f4b4a5aeaffcb720918b22",
    );
    expect(planned.key).toBe(
      "sealed-requests/v1/repositories/1358994027/epochs/epoch_01/sha256/5041bf1f713df204784353e82f6a4a535931cb64f1f4b4a5aeaffcb720918b22.json",
    );
    expect(planned.reference).toEqual({
      protocolVersion: SEALED_REQUEST_PROTOCOL_VERSION,
      objectClass: SEALED_REQUEST_OBJECT_CLASS,
      key: planned.key,
      githubRepositoryId: "1358994027",
      bindingEpoch: "epoch_01",
      sha256: planned.sha256Hex,
      size: bytes.byteLength,
    });
    expect(planned.customMetadata).toEqual({
      "rt-protocol": "sealed-request-v1",
      "rt-object-class": "core-request-json-bytes",
      "rt-github-repository-id": "1358994027",
      "rt-binding-epoch": "epoch_01",
      "rt-sha256": planned.sha256Hex,
      "rt-size": String(bytes.byteLength),
    });
    expect(planned.bytes).not.toBe(bytes);
    expect(Array.from(planned.bytes)).toEqual(Array.from(bytes));
  });

  it("rejects malformed storage scope and digest identifiers", async () => {
    await expect(
      planSealedRequest({ githubRepositoryId: "repo-name", bindingEpoch: "epoch_1" }, encoder.encode("{}")),
    ).rejects.toThrow(RangeError);
    await expect(
      planSealedRequest({ githubRepositoryId: "123", bindingEpoch: "contains space" }, encoder.encode("{}")),
    ).rejects.toThrow(RangeError);
    await expect(planSealedRequest(BINDING, new Uint8Array())).rejects.toThrow(RangeError);
    expect(() => sealedRequestKey(BINDING, "A".repeat(64))).toThrow(RangeError);
  });

  it("creates then re-reads and proves exact immutable storage", async () => {
    const store = new MemorySealedRequestStore();
    const proof = await persistSealedRequest(store, BINDING, encoder.encode('{"x":1}'));

    expect(proof.disposition).toBe("created");
    expect(proof.reference.sha256).toBe(
      "5041bf1f713df204784353e82f6a4a535931cb64f1f4b4a5aeaffcb720918b22",
    );
  });

  it("treats an exact pre-existing object as idempotent success", async () => {
    const bytes = encoder.encode('{"x":1}');
    const planned = await planSealedRequest(BINDING, bytes);
    const store = new MemorySealedRequestStore();
    store.createResult = "already_exists";
    store.object = storedFromPlan(planned);

    const proof = await persistSealedRequest(store, BINDING, bytes);
    expect(proof.disposition).toBe("existing_identical");
    expect(proof.reference).toEqual(planned.reference);
  });

  it("recovers a committed write whose response is lost", async () => {
    const store = new MemorySealedRequestStore();
    store.createError = new Error("simulated lost response");
    store.storeBeforeCreateError = true;

    const proof = await persistSealedRequest(store, BINDING, encoder.encode('{"x":1}'));
    expect(proof.disposition).toBe("recovered_after_ambiguous_write");
  });

  it("fails closed when an ambiguous write cannot be proven by exact read", async () => {
    const store = new MemorySealedRequestStore();
    store.createError = new Error("simulated unavailable write");

    await expect(
      persistSealedRequest(store, BINDING, encoder.encode('{"x":1}')),
    ).rejects.toBeInstanceOf(SealedRequestStorageUnprovenError);
  });

  it("fails closed when exact-key read is unavailable", async () => {
    const store = new MemorySealedRequestStore();
    store.readError = new Error("simulated unavailable read");

    await expect(
      persistSealedRequest(store, BINDING, encoder.encode('{"x":1}')),
    ).rejects.toBeInstanceOf(SealedRequestStorageUnprovenError);
  });

  it("rejects byte-different content at the deterministic identity", async () => {
    const bytes = encoder.encode('{"x":1}');
    const planned = await planSealedRequest(BINDING, bytes);
    const store = new MemorySealedRequestStore();
    store.createResult = "already_exists";
    store.object = {
      ...storedFromPlan(planned),
      bytes: encoder.encode('{"x":2}'),
    };

    await expect(persistSealedRequest(store, BINDING, bytes)).rejects.toBeInstanceOf(
      SealedRequestIntegrityError,
    );
  });

  it("rejects scope metadata or provider checksum drift", async () => {
    const bytes = encoder.encode('{"x":1}');
    const planned = await planSealedRequest(BINDING, bytes);

    const metadataStore = new MemorySealedRequestStore();
    metadataStore.createResult = "already_exists";
    metadataStore.object = {
      ...storedFromPlan(planned),
      customMetadata: { ...planned.customMetadata, "rt-binding-epoch": "epoch_02" },
    };
    await expect(persistSealedRequest(metadataStore, BINDING, bytes)).rejects.toBeInstanceOf(
      SealedRequestIntegrityError,
    );

    const checksumStore = new MemorySealedRequestStore();
    checksumStore.createResult = "already_exists";
    checksumStore.object = { ...storedFromPlan(planned), providerSha256Hex: null };
    await expect(persistSealedRequest(checksumStore, BINDING, bytes)).rejects.toBeInstanceOf(
      SealedRequestIntegrityError,
    );
  });
});

describe("R2 sealed request adapter", () => {
  it("uses provider create-if-absent and supplied SHA-256 without exposing overwrite semantics", async () => {
    const put = vi.fn().mockResolvedValue({ key: "stored" });
    const get = vi.fn();
    const bucket = { put, get } as unknown as R2Bucket;
    const store = new R2SealedRequestObjectStore(bucket);
    const planned = await planSealedRequest(BINDING, encoder.encode('{"x":1}'));

    await expect(
      store.createIfAbsent({
        key: planned.key,
        bytes: planned.bytes,
        sha256Bytes: planned.sha256Bytes,
        customMetadata: planned.customMetadata,
      }),
    ).resolves.toBe("created");

    expect(put).toHaveBeenCalledTimes(1);
    const [key, value, options] = put.mock.calls[0] as [string, Uint8Array, R2PutOptions];
    expect(key).toBe(planned.key);
    expect(Array.from(value)).toEqual(Array.from(planned.bytes));
    expect(options.onlyIf).toBeInstanceOf(Headers);
    expect((options.onlyIf as Headers).get("If-None-Match")).toBe("*");
    expect(options.sha256).toBe(planned.sha256Bytes);
    expect(options.httpMetadata).toEqual({ contentType: "application/octet-stream" });
    expect(options.customMetadata).toEqual(planned.customMetadata);
  });

  it("maps a failed conditional PUT to already_exists", async () => {
    const bucket = {
      put: vi.fn().mockResolvedValue(null),
      get: vi.fn(),
    } as unknown as R2Bucket;
    const store = new R2SealedRequestObjectStore(bucket);
    const planned = await planSealedRequest(BINDING, encoder.encode("{}"));

    await expect(
      store.createIfAbsent({
        key: planned.key,
        bytes: planned.bytes,
        sha256Bytes: planned.sha256Bytes,
        customMetadata: planned.customMetadata,
      }),
    ).resolves.toBe("already_exists");
  });

  it("maps exact R2 body, metadata, size, and provider checksum on read", async () => {
    const planned = await planSealedRequest(BINDING, encoder.encode('{"x":1}'));
    const object = {
      key: planned.key,
      size: planned.size,
      customMetadata: { ...planned.customMetadata },
      checksums: { sha256: planned.sha256Bytes },
      body: new ReadableStream(),
      arrayBuffer: vi.fn().mockResolvedValue(planned.bytes.buffer.slice(0)),
    } as unknown as R2ObjectBody;
    const bucket = {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue(object),
    } as unknown as R2Bucket;
    const store = new R2SealedRequestObjectStore(bucket);

    await expect(store.readExact(planned.key)).resolves.toEqual({
      key: planned.key,
      bytes: planned.bytes,
      size: planned.size,
      customMetadata: planned.customMetadata,
      providerSha256Hex: planned.sha256Hex,
    });
  });
});

function storedFromCreate(input: CreateSealedRequestObject): StoredSealedRequestObject {
  return {
    key: input.key,
    bytes: new Uint8Array(input.bytes),
    size: input.bytes.byteLength,
    customMetadata: { ...input.customMetadata },
    providerSha256Hex: hexFromMetadata(input.customMetadata),
  };
}

function storedFromPlan(planned: Awaited<ReturnType<typeof planSealedRequest>>): StoredSealedRequestObject {
  return {
    key: planned.key,
    bytes: new Uint8Array(planned.bytes),
    size: planned.size,
    customMetadata: { ...planned.customMetadata },
    providerSha256Hex: planned.sha256Hex,
  };
}

function hexFromMetadata(metadata: Readonly<Record<string, string>>): string | null {
  return metadata["rt-sha256"] ?? null;
}
