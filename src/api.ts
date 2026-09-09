export const HOSTED_API_BOUNDARY_VERSION = 1 as const;

const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type AuthorizationAction = "submit" | "status" | "cancel";

export interface AuthenticatedPrincipal {
  readonly principalId: string;
}

export interface ApiCallContext {
  readonly principal: AuthenticatedPrincipal;
}

export interface AuthorizedRepositoryBinding {
  readonly bindingId: string;
  readonly bindingEpoch: string;
  readonly githubRepositoryId: string;
  readonly githubInstallationId: string;
  readonly canonicalRef: string;
}

export type AuthorizationDecision =
  | { readonly allowed: true; readonly binding: AuthorizedRepositoryBinding }
  | { readonly allowed: false };

export interface RepositoryAuthorizer {
  authorize(
    context: ApiCallContext,
    bindingId: string,
    action: AuthorizationAction,
  ): Promise<AuthorizationDecision>;
}

export interface SubmitMutationCommand {
  readonly bindingId: string;
  readonly coreRequestBytes: Uint8Array;
}

export interface OperationSelector {
  readonly bindingId: string;
  readonly operationId: string;
}

export type StatusCommand = OperationSelector;
export type CancelCommand = OperationSelector;

export interface BoundaryLimits {
  readonly maxCoreRequestBytes: number;
}

export type SubmissionValidationErrorCode =
  | "invalid_binding_id"
  | "empty_core_request"
  | "core_request_too_large"
  | "core_request_not_utf8"
  | "core_request_not_json_object";

export type SubmissionValidationResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly bindingId: string;
        readonly coreRequestBytes: Uint8Array;
      };
    }
  | { readonly ok: false; readonly code: SubmissionValidationErrorCode };

export type OperationSelectorValidationErrorCode = "invalid_binding_id" | "invalid_operation_id";

export type OperationSelectorValidationResult =
  | { readonly ok: true; readonly value: OperationSelector }
  | { readonly ok: false; readonly code: OperationSelectorValidationErrorCode };

export interface AcceptedOperationReceipt {
  readonly operationId: string;
  readonly accepted: true;
}

export type PublicOperationStatus =
  | {
      readonly kind: "live";
      readonly operationId: string;
      readonly state: "accepted" | "queued" | "processing" | "blocked";
    }
  | {
      readonly kind: "terminal";
      readonly operationId: string;
      readonly result: "committed" | "already_committed" | "no_op";
      readonly revision: string;
    }
  | {
      readonly kind: "terminal";
      readonly operationId: string;
      readonly result: "needs_reprepare";
      readonly currentRevision?: string;
    }
  | {
      readonly kind: "terminal";
      readonly operationId: string;
      readonly result: "failed" | "cancelled";
    };

export interface HostedApiBoundary {
  submit(
    context: ApiCallContext,
    command: SubmitMutationCommand,
  ): Promise<AcceptedOperationReceipt>;
  status(context: ApiCallContext, command: StatusCommand): Promise<PublicOperationStatus>;
  cancel(context: ApiCallContext, command: CancelCommand): Promise<PublicOperationStatus>;
}

export function isValidOpaqueId(value: string): boolean {
  return OPAQUE_ID_RE.test(value);
}

export function isTerminalOperationStatus(status: PublicOperationStatus): boolean {
  return status.kind === "terminal";
}

export function validateOperationSelector(
  command: OperationSelector,
): OperationSelectorValidationResult {
  if (!isValidOpaqueId(command.bindingId)) {
    return { ok: false, code: "invalid_binding_id" };
  }
  if (!isValidOpaqueId(command.operationId)) {
    return { ok: false, code: "invalid_operation_id" };
  }
  return {
    ok: true,
    value: {
      bindingId: command.bindingId,
      operationId: command.operationId,
    },
  };
}

export function validateSubmission(
  command: SubmitMutationCommand,
  limits: BoundaryLimits,
): SubmissionValidationResult {
  if (!Number.isSafeInteger(limits.maxCoreRequestBytes) || limits.maxCoreRequestBytes < 1) {
    throw new RangeError("maxCoreRequestBytes must be a positive safe integer");
  }
  if (!isValidOpaqueId(command.bindingId)) {
    return { ok: false, code: "invalid_binding_id" };
  }
  if (command.coreRequestBytes.byteLength === 0) {
    return { ok: false, code: "empty_core_request" };
  }
  if (command.coreRequestBytes.byteLength > limits.maxCoreRequestBytes) {
    return { ok: false, code: "core_request_too_large" };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(command.coreRequestBytes);
  } catch {
    return { ok: false, code: "core_request_not_utf8" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "core_request_not_json_object" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "core_request_not_json_object" };
  }

  return {
    ok: true,
    value: {
      bindingId: command.bindingId,
      coreRequestBytes: new Uint8Array(command.coreRequestBytes),
    },
  };
}
