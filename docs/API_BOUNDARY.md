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
- `status` — read the bounded public status of one Hosted operation within an authorized repository binding;
- `cancel` — attempt cancellation of one Hosted operation within an authorized repository binding and return its authoritative current public status.

Concrete HTTP paths, methods, headers, media types, OAuth flows, MCP mapping, and provider-specific authentication are not frozen by this source boundary. A later adapter may map those transports onto the same logical contract without changing memory semantics.

## 3. Authentication and authorization separation

A transport adapter authenticates a caller and resolves the credential/provider-specific identity into an opaque canonical Runethread `principalId` before entering this boundary. Raw external subject claims are not treated as globally unique authorization identities merely because two providers use a field named `sub` or `subject`; any provider/issuer namespace binding belongs to the trusted authentication adapter.

The boundary does not define bearer-token syntax, GitHub user-token syntax, OAuth/OIDC claim layout, or any other credential format.

Authorization is action-scoped (`submit`, `status`, `cancel`) and targets an opaque Hosted repository binding ID. Supplying, guessing, or learning a GitHub repository ID is never sufficient authorization.

`status` and `cancel` are binding-scoped commands: they carry both `bindingId` and `operationId`. A future operational implementation must preserve this order:

1. validate the bounded opaque binding/operation selectors;
2. authorize the authenticated principal for the requested action on the binding;
3. only after authorization succeeds, look up the operation inside that exact authorized binding/binding epoch;
4. map missing and cross-binding operation lookups without revealing whether an operation exists elsewhere.

The internal authorized binding identity may bind the opaque selector to:

- immutable GitHub repository identity;
- GitHub App installation identity;
- repository-binding epoch;
- explicit canonical branch ref.

The canonical ref is stored as one normalized full Git branch ref such as `refs/heads/main`, not as a mutable default-branch pointer or an adapter-specific shorthand. Provider/onboarding code owns normalization and must not silently follow a later default-branch change.

A successful caller-authorization decision means only that the principal may address that binding for the requested action. It is not, by itself, proof that current App installation/access, repository privacy, canonical-ref health, or publication eligibility remains valid. Provider/control-plane code remains responsible for the direct current checks required by ADR-014/017 at their owning admission/finalization/publication gates. The public command does not get to choose or silently rewrite those identities.

## 4. Boundary validation

`validateSubmission` is deliberately transport-only. It checks:

- the opaque binding selector has a bounded safe representation;
- the configured maximum request size is a valid positive limit;
- the request is non-empty and within that limit;
- the bytes are valid UTF-8;
- the bytes contain a syntactically valid JSON object.

It does **not** inspect mutation operation names, target IDs, memory fields, expected revision, mutation time, idempotency semantics, lifecycle rules, relationship rules, or any other Core-owned meaning.

The returned validated bytes are copied byte-for-byte. JSON whitespace, key order, and other byte distinctions are not normalized away at this layer.

`validateOperationSelector` checks only the bounded safe representation of the binding and operation IDs used by `status`/`cancel`. It does not perform authorization or operation lookup; those remain separate ordered steps so syntax validation never becomes evidence that a repository or operation exists.

## 5. Durable acceptance and exact resubmission

A successful live `submit` response is an `AcceptedOperationReceipt`. `accepted: true` is a historical durability receipt, not a claim that the operation's **current** state is still `accepted`; callers use `status` for the current state.

A future operational implementation MUST NOT return that receipt until all acceptance prerequisites in the accepted Phase 2.6 architecture are satisfied. In particular, the exact sealed request reference/digest and operation metadata must be durably recoverable, required wakeup/alarm state must be established, and rollback-independent acceptance evidence must exist before client-visible durable acceptance is returned.

Exact resubmission of the same preserved request bytes under the same resolved repository binding epoch must map back to the same hosted operation identity while that attempt remains recoverable. It must not create a second hosted attempt merely because the first response was lost or the operation has since advanced. The receipt may therefore be replayed with the same `operationId`; the caller obtains the current state through `status`.

Byte-different request envelopes do not alias the same hosted attempt merely because Core may later observe the same Core idempotency key. Hosted exact-byte attempt identity and Core semantic idempotency remain distinct, as required by ADR-014. The exact digest/key construction belongs to the sealed-persistence gate rather than this source-only contract.

Until the persistence/coordinator gate implements those prerequisites, the Worker remains non-operational and cannot return an `AcceptedOperationReceipt` to real callers.

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

Authorization failure must not turn repository or operation identifiers into an enumeration oracle. The binding-first authorization/lookup order above is part of that guarantee. Concrete transport error mapping is deferred to the authentication/edge implementation, but it must preserve the same non-disclosure property.

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
