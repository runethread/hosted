import { isValidOpaqueId, type AuthorizedRepositoryBinding } from "./api";

export const SEALED_REQUEST_PROTOCOL_VERSION = 1 as const;
export const SEALED_REQUEST_OBJECT_CLASS = "core-request-json-bytes" as const;

const GITHUB_REPOSITORY_ID_RE = /^[1-9][0-9]{0,19}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const KEY_PREFIX = "sealed-requests/v1";

export type SealedRequestBinding = Pick<
  AuthorizedRepositoryBinding,
  "githubRepositoryId" | "bindingEpoch"
>;

export interface PlannedSealedRequest {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
  readonly sha256Bytes: ArrayBuffer;
  readonly size: number;
  readonly customMetadata: Readonly<Record<string, string>>;
  readonly reference: SealedRequestReference;
}

export interface SealedRequestReference {
  readonly protocolVersion: typeof SEALED_REQUEST_PROTOCOL_VERSION;
  readonly objectClass: typeof SEALED_REQUEST_OBJECT_CLASS;
  readonly key: string;
  readonly githubRepositoryId: string;
  readonly bindingEpoch: string;
  readonly sha256: string;
  readonly size: number;
}

export interface CreateSealedRequestObject {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly sha256Bytes: ArrayBuffer;
  readonly customMetadata: Readonly<Record<string, string>>;
}

export type CreateIfAbsentResult = "created" | "already_exists";

export interface StoredSealedRequestObject {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly customMetadata: Readonly<Record<string, string>>;
  readonly providerSha256Hex: string | null;
}

export interface SealedRequestObjectStore {
  createIfAbsent(input: CreateSealedRequestObject): Promise<CreateIfAbsentResult>;
  readExact(key: string): Promise<StoredSealedRequestObject | null>;
}

export type SealedRequestPersistenceDisposition =
  | "created"
  | "existing_identical"
  | "recovered_after_ambiguous_write";

export interface SealedRequestPersistenceProof {
  readonly reference: SealedRequestReference;
  readonly disposition: SealedRequestPersistenceDisposition;
}

export class SealedRequestIntegrityError extends Error {
  constructor(message = "sealed request storage integrity verification failed") {
    super(message);
    this.name = "SealedRequestIntegrityError";
  }
}

export class SealedRequestStorageUnprovenError extends Error {
  constructor(message = "sealed request storage outcome is not proven") {
    super(message);
    this.name = "SealedRequestStorageUnprovenError";
  }
}

export async function planSealedRequest(
  binding: SealedRequestBinding,
  requestBytes: Uint8Array,
): Promise<PlannedSealedRequest> {
  validateBinding(binding);
  if (requestBytes.byteLength === 0) {
    throw new RangeError("sealed request bytes must be non-empty");
  }

  const bytes = new Uint8Array(requestBytes);
  const sha256Bytes = await crypto.subtle.digest("SHA-256", bytes);
  const sha256Hex = hexFromArrayBuffer(sha256Bytes);
  const key = sealedRequestKey(binding, sha256Hex);
  const size = bytes.byteLength;
  const customMetadata = expectedMetadata(binding, sha256Hex, size);

  return {
    key,
    bytes,
    sha256Hex,
    sha256Bytes,
    size,
    customMetadata,
    reference: {
      protocolVersion: SEALED_REQUEST_PROTOCOL_VERSION,
      objectClass: SEALED_REQUEST_OBJECT_CLASS,
      key,
      githubRepositoryId: binding.githubRepositoryId,
      bindingEpoch: binding.bindingEpoch,
      sha256: sha256Hex,
      size,
    },
  };
}

export async function persistSealedRequest(
  store: SealedRequestObjectStore,
  binding: SealedRequestBinding,
  requestBytes: Uint8Array,
): Promise<SealedRequestPersistenceProof> {
  const planned = await planSealedRequest(binding, requestBytes);

  let createResult: CreateIfAbsentResult | null = null;
  let writeWasAmbiguous = false;
  try {
    createResult = await store.createIfAbsent({
      key: planned.key,
      bytes: new Uint8Array(planned.bytes),
      sha256Bytes: planned.sha256Bytes.slice(0),
      customMetadata: { ...planned.customMetadata },
    });
  } catch {
    // A provider/network failure can occur after the immutable write committed.
    // Never allocate a new key or claim failure from the write response alone.
    // The exact-key read below is the recovery/verification authority.
    writeWasAmbiguous = true;
  }

  let stored: StoredSealedRequestObject | null;
  try {
    stored = await store.readExact(planned.key);
  } catch {
    throw new SealedRequestStorageUnprovenError();
  }

  if (stored === null) {
    throw new SealedRequestStorageUnprovenError();
  }

  await verifyStoredSealedRequest(planned, stored);

  if (writeWasAmbiguous) {
    return { reference: planned.reference, disposition: "recovered_after_ambiguous_write" };
  }
  if (createResult === "already_exists") {
    return { reference: planned.reference, disposition: "existing_identical" };
  }
  if (createResult === "created") {
    return { reference: planned.reference, disposition: "created" };
  }

  throw new SealedRequestStorageUnprovenError();
}

export async function verifyStoredSealedRequest(
  planned: PlannedSealedRequest,
  stored: StoredSealedRequestObject,
): Promise<void> {
  if (stored.key !== planned.key || stored.size !== planned.size) {
    throw new SealedRequestIntegrityError();
  }
  if (!bytesEqual(stored.bytes, planned.bytes)) {
    throw new SealedRequestIntegrityError();
  }

  const actualDigest = hexFromArrayBuffer(await crypto.subtle.digest("SHA-256", stored.bytes));
  if (actualDigest !== planned.sha256Hex) {
    throw new SealedRequestIntegrityError();
  }
  if (stored.providerSha256Hex !== planned.sha256Hex) {
    throw new SealedRequestIntegrityError();
  }
  if (!metadataEqual(stored.customMetadata, planned.customMetadata)) {
    throw new SealedRequestIntegrityError();
  }
}

export function sealedRequestKey(binding: SealedRequestBinding, sha256Hex: string): string {
  validateBinding(binding);
  if (!SHA256_HEX_RE.test(sha256Hex)) {
    throw new RangeError("sha256Hex must be 64 lowercase hexadecimal characters");
  }
  return `${KEY_PREFIX}/repositories/${binding.githubRepositoryId}/epochs/${binding.bindingEpoch}/sha256/${sha256Hex}.json`;
}

function validateBinding(binding: SealedRequestBinding): void {
  if (!GITHUB_REPOSITORY_ID_RE.test(binding.githubRepositoryId)) {
    throw new RangeError("githubRepositoryId must be a bounded positive decimal identifier");
  }
  if (!isValidOpaqueId(binding.bindingEpoch)) {
    throw new RangeError("bindingEpoch must be a valid opaque identifier");
  }
}

function expectedMetadata(
  binding: SealedRequestBinding,
  sha256Hex: string,
  size: number,
): Readonly<Record<string, string>> {
  return {
    "rt-protocol": `sealed-request-v${SEALED_REQUEST_PROTOCOL_VERSION}`,
    "rt-object-class": SEALED_REQUEST_OBJECT_CLASS,
    "rt-github-repository-id": binding.githubRepositoryId,
    "rt-binding-epoch": binding.bindingEpoch,
    "rt-sha256": sha256Hex,
    "rt-size": String(size),
  };
}

function metadataEqual(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  const actualEntries = Object.entries(actual).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  if (actualEntries.length !== expectedEntries.length) return false;
  return expectedEntries.every(
    ([key, value], index) => actualEntries[index]?.[0] === key && actualEntries[index]?.[1] === value,
  );
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function hexFromArrayBuffer(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
