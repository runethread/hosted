# Hosted API boundary

Status: **Source contract only — not yet an operational API**

This document defines the first transport-neutral boundary for Phase 2.6 request submission, status lookup, cancellation, caller identity, and repository authorization. Accepted Core ADRs remain the architecture authority. If this document conflicts with an accepted Core decision, the Core decision controls.

The current Worker still fails closed with HTTP 503. Nothing in this boundary authorizes a public route, provider resource, secret, repository mutation, publication, or production traffic.

## 1. Boundary ownership

Hosted owns transport and control-plane behavior. Core owns memory mutation semantics.

The boundary therefore does **not** reproduce the fields or rules of Core `ApplyMutationRequest` in TypeScript. A semantic client submits the exact Core mutation request as bounded UTF-8 JSON-object bytes. Hosted may validate transport syntax and size, but it preserves those bytes rather than parsing fields and reserializing a second semantic request.

Later sealing, finalization, and audit bind the exact preserved bytes by digest and execute them under the pinned Core/runtime/contract identity. A transport digest is evidence for exact bytes; it never replaces Core's semantic request fingerprint or idempotency rules.

## 2. Transport-neutral operations

The source boundary exposes three logical operations:

- `submit` — submit exact Core mutation-request bytes for an authorized repository binding;
- `status` — read the bounded public status of one Hosted operation;
- `cancel` — attempt cancellation and return the authoritative current public operation status.

Concrete HTTP paths, methods, headers, OAuth flows, MCP mapping, and provider-specific authentication are not frozen by this source boundary. A later adapter may map those transports onto the same logical contract without changing memory semantics.

## 3. Authentication and authorization separation

A transport adapter authenticates a caller and supplies an `AuthenticatedPrincipal` to the boundary. The boundary does not define bearer-token syntax, GitHub user-token syntax, or any other credential format.

Authorization is action-scoped (`submit`, `status`, `cancel`) and targets an opaque Hosted repository binding ID. Supplying, guessing, or learning a GitHub repository ID is never sufficient authorization.

The internal authorized binding identity may bind the opaque selector to:

- immutable GitHub repository identity;
- GitHub App installation identity;
- repository-binding epoch;
- explicit canonical branch ref.

Provider code remains responsible for the direct App-installation/access and private-visibility checks required by ADR-014/017. The public command does not get to choose or silently rewrite those identities.

## 4. Submission validation

`validateSubmission` is deliberately transport-only. It checks:

- the opaque binding selector has a bounded safe representation;
- the configured maximum request size is a valid positive limit;
- the request is non-empty and within that limit;
- the bytes are valid UTF-8;
- the bytes contain a syntactically valid JSON object.

It does **not** inspect mutation operation names, target IDs, memory fields, expected revision, mutation time, idempotency semantics, lifecycle rules, relationship rules, or any other Core-owned meaning.

The returned validated bytes are copied byte-for-byte. JSON whitespace, key order, and other byte distinctions are not normalized away at this layer.

## 5. Durable acceptance boundary

A successful live `submit` response is intentionally named `AcceptedOperation` because `accepted` is a durability promise, not merely an HTTP acknowledgement.

A future operational implementation MUST NOT return that result until all acceptance prerequisites in the accepted Phase 2.6 architecture are satisfied. In particular, the exact sealed request reference/digest and operation metadata must be durably recoverable, required wakeup/alarm state must be established, and rollback-independent acceptance evidence must exist before client-visible durable `accepted` is returned.

Until the persistence/coordinator gate implements those prerequisites, the Worker remains non-operational and cannot return `AcceptedOperation` to real callers.

## 6. Public status model

The public status is intentionally coarser than the internal Durable Object phase machine.

Live states are:

- `accepted`;
- `queued`;
- `processing`;
- `blocked`.

`blocked` is nonterminal. It may represent maintenance, reconciliation, publication uncertainty, provider recovery, or another condition where the caller should wait rather than assume success or failure.

Terminal results are:

- `committed`;
- `already_committed`;
- `no_op`;
- `needs_reprepare`;
- `failed`;
- `cancelled`.

Successful Git-backed terminal results include the authoritative revision. `needs_reprepare` may include the currently observed revision. The initial public `failed` result carries no unrestricted provider error text.

This public compression avoids coupling clients to every internal finalization/audit/publication phase while preserving the distinctions that materially change caller behavior.

## 7. Cancellation boundary

`cancel` returns the authoritative current public operation status rather than a separate optimistic `cancel_requested` promise.

A future implementation may report terminal `cancelled` only after cancellation has won the accepted cancellation/publication race and the rollback-independent terminalization required by ADR-019/023 is durable. If cancellation cannot safely win or is still unresolved, the returned status remains the actual live/blocked/terminal state.

## 8. Privacy and disclosure

Public status and validation results must remain bounded. They do not expose:

- Core request bodies or memory content;
- object-store/evidence bytes;
- GitHub tokens or App private keys;
- internal provider request/response payloads;
- unrestricted exception, stack, or log text.

Authorization failure must not turn repository or operation identifiers into an enumeration oracle. Concrete transport error mapping is deferred to the authentication/edge implementation, but it must preserve that non-disclosure property.

## 9. Compatibility and release identity

`HOSTED_API_BOUNDARY_VERSION = 1` identifies this source-level contract baseline. It does not claim that the Hosted API runtime exists.

The current release compatibility policy therefore continues to mark `hosted_api` as `not_implemented` and `authenticated_api`, `repository_binding`, and `durable_state` as false. Those release identities advance only when the corresponding executable boundary actually exists and is independently reviewed.

A later operational API may refine transport encoding without changing this logical boundary. A breaking change to the logical request/status/cancel contract requires a deliberate compatibility/version review rather than silent reinterpretation.

## 10. Explicit non-goals of this slice

This boundary does not add:

- a live HTTP or MCP API;
- an authentication provider or credential format;
- GitHub App registration, private key, webhook, or installation-token minting;
- repository onboarding/adoption implementation;
- R2 or Durable Object storage/bindings;
- queueing, alarms, or rollback journal implementation;
- Core mutation execution;
- finalizer/auditor runtime;
- canonical Git write authority;
- release publication or deployment.

Those capabilities remain behind their owning Phase 2.6 gates.
