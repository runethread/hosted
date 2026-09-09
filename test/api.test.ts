import { describe, expect, it } from "vitest";

import {
  HOSTED_API_BOUNDARY_VERSION,
  isTerminalOperationStatus,
  isValidOpaqueId,
  validateSubmission,
  type PublicOperationStatus,
} from "../src/api";

const encoder = new TextEncoder();

describe("Hosted API boundary", () => {
  it("has an explicit source-boundary version", () => {
    expect(HOSTED_API_BOUNDARY_VERSION).toBe(1);
  });

  it("accepts bounded JSON-object bytes without interpreting Core mutation semantics", () => {
    const bytes = encoder.encode('{"unknown_to_hosted":true,"nested":{"x":1}}');
    const result = validateSubmission(
      { bindingId: "binding_123", coreRequestBytes: bytes },
      { maxCoreRequestBytes: 1024 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.bindingId).toBe("binding_123");
    expect(Array.from(result.value.coreRequestBytes)).toEqual(Array.from(bytes));
    expect(result.value.coreRequestBytes).not.toBe(bytes);
  });

  it("preserves exact request bytes instead of reserializing JSON", () => {
    const bytes = encoder.encode('{  "operation" : "noop", "extra" : [1, 2] }\n');
    const result = validateSubmission(
      { bindingId: "binding:opaque", coreRequestBytes: bytes },
      { maxCoreRequestBytes: bytes.length },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new TextDecoder().decode(result.value.coreRequestBytes)).toBe(
      '{  "operation" : "noop", "extra" : [1, 2] }\n',
    );
  });

  it("rejects malformed opaque binding identifiers", () => {
    for (const bindingId of ["", " leading", "contains space", "x".repeat(129)]) {
      const result = validateSubmission(
        { bindingId, coreRequestBytes: encoder.encode("{}") },
        { maxCoreRequestBytes: 1024 },
      );
      expect(result).toEqual({ ok: false, code: "invalid_binding_id" });
    }
  });

  it("rejects empty and oversized Core request bodies", () => {
    expect(
      validateSubmission(
        { bindingId: "binding_1", coreRequestBytes: new Uint8Array() },
        { maxCoreRequestBytes: 10 },
      ),
    ).toEqual({ ok: false, code: "empty_core_request" });

    expect(
      validateSubmission(
        { bindingId: "binding_1", coreRequestBytes: encoder.encode('{"x":1}') },
        { maxCoreRequestBytes: 6 },
      ),
    ).toEqual({ ok: false, code: "core_request_too_large" });
  });

  it("rejects invalid UTF-8, invalid JSON, arrays, and scalars", () => {
    const invalidUtf8 = new Uint8Array([0xff]);
    expect(
      validateSubmission(
        { bindingId: "binding_1", coreRequestBytes: invalidUtf8 },
        { maxCoreRequestBytes: 1024 },
      ),
    ).toEqual({ ok: false, code: "core_request_not_utf8" });

    for (const payload of ["{", "[]", "null", "true", "42", '"string"']) {
      const result = validateSubmission(
        { bindingId: "binding_1", coreRequestBytes: encoder.encode(payload) },
        { maxCoreRequestBytes: 1024 },
      );
      expect(result).toEqual({ ok: false, code: "core_request_not_json_object" });
    }
  });

  it("fails configuration closed for invalid request-size limits", () => {
    for (const maxCoreRequestBytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() =>
        validateSubmission(
          { bindingId: "binding_1", coreRequestBytes: encoder.encode("{}") },
          { maxCoreRequestBytes },
        ),
      ).toThrow(RangeError);
    }
  });

  it("keeps opaque operation identifiers bounded", () => {
    expect(isValidOpaqueId("operation_123")).toBe(true);
    expect(isValidOpaqueId("operation:123-abc.def")).toBe(true);
    expect(isValidOpaqueId("contains space")).toBe(false);
    expect(isValidOpaqueId("x".repeat(129))).toBe(false);
  });

  it("distinguishes blocked live work from durable terminal outcomes", () => {
    const blocked: PublicOperationStatus = {
      kind: "live",
      operationId: "operation_1",
      state: "blocked",
    };
    const committed: PublicOperationStatus = {
      kind: "terminal",
      operationId: "operation_1",
      result: "committed",
      revision: "0123456789abcdef",
    };

    expect(isTerminalOperationStatus(blocked)).toBe(false);
    expect(isTerminalOperationStatus(committed)).toBe(true);
  });
});
