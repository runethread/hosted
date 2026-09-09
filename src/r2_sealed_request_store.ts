import {
  hexFromArrayBuffer,
  type CreateIfAbsentResult,
  type CreateSealedRequestObject,
  type SealedRequestObjectStore,
  type StoredSealedRequestObject,
} from "./sealed_request";

export class R2SealedRequestObjectStore implements SealedRequestObjectStore {
  readonly #bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.#bucket = bucket;
  }

  async createIfAbsent(input: CreateSealedRequestObject): Promise<CreateIfAbsentResult> {
    const conditions = new Headers();
    conditions.set("If-None-Match", "*");

    const stored = await this.#bucket.put(input.key, input.bytes, {
      onlyIf: conditions,
      sha256: input.sha256Bytes,
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: { ...input.customMetadata },
    });

    return stored === null ? "already_exists" : "created";
  }

  async readExact(key: string): Promise<StoredSealedRequestObject | null> {
    const object = await this.#bucket.get(key);
    if (object === null) return null;
    if (!("body" in object)) {
      throw new Error("R2 read unexpectedly returned metadata without an object body");
    }

    const bytes = new Uint8Array(await object.arrayBuffer());
    const providerSha256Hex = object.checksums.sha256
      ? hexFromArrayBuffer(object.checksums.sha256)
      : null;

    return {
      key: object.key,
      bytes,
      size: object.size,
      customMetadata: { ...object.customMetadata },
      providerSha256Hex,
    };
  }
}
