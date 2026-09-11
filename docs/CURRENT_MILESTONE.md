# Current milestone — repository runtime and safety journal

Status: **Sealed-request persistence and foundation provider preflight complete; bounded runtime/journal source foundation present; owning runtime/journal stage remains in progress**

## Verified baseline

The repository contains these deliberately bounded layers before any user-facing mutation authority:

1. a reproducibly locked TypeScript/Cloudflare developer toolchain plus fail-closed non-operational Worker shell;
2. a non-publishing release-identity/compatibility baseline that binds exact source/build/runtime inputs to a deterministic release-instance manifest;
3. a source-only transport-neutral request/status/cancel contract plus caller/repository authorization and binding abstractions in `docs/API_BOUNDARY.md` / `src/api.ts`;
4. the completed immutable sealed-request persistence boundary; and
5. the source-only, maintenance-only repository-runtime / ADR-019 / ADR-024 safety-journal foundation described in `docs/JOURNAL_FOUNDATION.md`.

The admitted developer/runtime-tool identities remain Node `24.20.0`, npm `11.19.0`, Wrangler `4.129.1`, TypeScript `5.8.3`, Vitest `4.1.11`, and `@cloudflare/vitest-plugin` `1.1.5`. `package.json` is non-publishable and the lockfile remains exact.

The Worker shell still returns HTTP 503 / `not_operational` and has no provider binding, route, secret, persistence, authentication implementation, mutation authority, publication authority, deploy script, production resource, or user traffic.

## Release identity baseline

`release/identity-policy.json` is the current Hosted compatibility baseline. It deliberately separates a static reviewed policy from a generated release-instance manifest so source commit identity is not circularly embedded in the commit that defines the policy.

Project-wide component versioning is governed by ADR-028 and Core `docs/runethread/VERSIONING.md`. This Hosted baseline consumes that authority at immutable Core commit `60a5f5c83ac740e26d4f11db99de66fa7b8c914d` and exact `VERSIONING.md` Git blob `d4c49b67892cfe769a7b25adf3f4efb21d95ed9a`. Hosted does not copy the project versioning policy into a second local authority.

Hosted has its own independent Semantic Versioning 2.0.0 release line. The raw SemVer value and Runethread public release identifier are distinct representations: for example `0.3.0` and `v0.3.0`. Numeric equality with a Core or adapter release never implies compatibility.

The baseline binds:

- explicit Hosted release identifier plus parsed raw SemVer value under ADR-028;
- exact Core versioning-authority commit/blob;
- exact Hosted source commit and Git tree at verification time;
- immutable Core runtime release `v0.9.0` / commit `7f5cf86f23604426c7e8f69086fdcbe27fb86226`;
- contract v9 plus repository/schema/index/trust/bootstrap compatibility identities;
- exact Node/npm/Wrangler identities;
- Cloudflare compatibility date/flags, exact Wrangler configuration bytes, and generated runtime-type identity;
- exact `package-lock.json` identity;
- deterministic credential-stripped `wrangler deploy --dry-run` build inputs with provider auto-provisioning disabled;
- exact executable Worker payload `index.js` SHA-256 `905ab7b489f99893812b422862dc8dd527790fe9cdd1a9f730e2514d552bf0cf`;
- explicit `not_implemented` protocol slots and false capability flags for Hosted components not included in the emitted public Worker;
- exact distribution-notice file identities already required by the repository.

The dry-run build must emit exactly the reviewed runtime payload plus the explicitly admitted local README auxiliary output. Any new output path or changed executable payload fails verification. Source-map upload, extra-module discovery, minification, dependency instrumentation, and Wrangler metrics are explicitly disabled in the current configuration rather than inherited from mutable defaults.

CI uses release identifier `v0.0.0-ci` / SemVer value `0.0.0-ci` only as a reserved proof identity. It is not a product release. Every Linux/macOS/Windows `npm run check` performs the release verification, builds twice, and requires the same locked executable Worker digest.

`publication_enabled` remains false. This baseline creates no GitHub Release, tag, downloadable artifact, Cloudflare version, deployment, route, credential, provider resource, or production traffic.

A generated manifest binds and records the identities it contains and proves the locally verified source/build/artifact relationships. It does not independently prove external Core/provider facts or live GitHub branch protection/status-check state. Any future publication mechanism must separately prove that the source commit is the intended current protected `main` and that required `validate` evidence belongs to that exact commit.

## Source API boundary baseline

`docs/API_BOUNDARY.md` and `src/api.ts` define the source-level logical boundary without making it executable at the Worker edge.

The boundary currently establishes:

- exact Core mutation-request bytes remain opaque to Hosted semantic interpretation and are preserved byte-for-byte after bounded transport validation;
- authenticated transport adapters resolve provider-specific credentials/claims to an opaque canonical Runethread principal identity before entering the boundary;
- authorization is action-scoped to an opaque repository binding;
- `status` / `cancel` are binding-scoped and require authorization before operation lookup;
- repository binding identity includes immutable repository/App-installation/binding-epoch/full-canonical-ref information while live privacy/access/ref eligibility remains a separately revalidated provider/control-plane condition;
- submit success is a durable acceptance receipt, not a current-state snapshot;
- exact resubmission maps to the same hosted operation while recoverable without replacing Core semantic idempotency;
- public status remains a bounded projection and terminal cancellation cannot be claimed before the accepted rollback-independent terminalization barriers.

`HOSTED_API_BOUNDARY_VERSION = 1` is a source-contract identity only. The release compatibility policy correctly continues to mark `hosted_api`, `repository_runtime`, and `safety_journal` as `not_implemented` and `authenticated_api`, `repository_binding`, and `durable_state` as false: the source foundations are not wired into the emitted public Worker. Including the runtime in that artifact requires the owning release-compatibility change.

## Applicable Runethread invariants

Hosted continues to consume, without copying, the canonical Core invariant authority. The directly relevant active IDs remain:

- `RT-ARCH-001` — provider-specific execution and dependencies stay outside Core;
- `RT-ARCH-002` — correctness-relevant component coupling uses explicit contracts or immutable identities rather than hidden internals;
- `RT-DATA-001` — the user-owned Git repository remains canonical semantic state while Hosted operational state is non-semantic control-plane state;
- `RT-GOV-001` — material choices are objective/evidence-driven and simpler alternatives are considered;
- `RT-REL-001` — Hosted binds correctness-relevant release/runtime/component identities explicitly rather than using floating development authority;
- `RT-SEM-001` — Hosted does not become a second memory-mutation semantics implementation.

Node/TypeScript/Wrangler/Cloudflare choices remain current Hosted implementation decisions, not project invariants. ADR-028 is project-wide release governance, not a new invariant and not a reason to collapse independent compatibility dimensions.

ADR-026 remains the licensing authority for this work: Hosted has no prospective MIT exception, Core's exact MIT interoperability boundary does not automatically extend into Hosted, historical grants remain intact, and user-owned data remains outside Runethread's software-license grants.

## Completed prerequisites

The immutable sealed-request persistence boundary is complete in protected Hosted baseline `f45cc82b6d502acd349c067eec0c2e1170ee2abb`. It preserves exact request bytes, digest, bounded metadata and opaque references with create-if-absent/no-overwrite behavior. Plaintext request content stays outside ordinary coordinator metadata, logs and public status.

The two distinct real-provider evidence records are:

- [Core issue #20: sealed-request gate complete](https://github.com/runethread/core/issues/20#issuecomment-5602745725): protected-main closeout and real R2 conditional-create race, exact read-back/digest verification, idempotent retry, corrupt collision rejection and lost-successful-write-response proof.
- [Core issue #20: provider-preflight closeout](https://github.com/runethread/core/issues/20#issuecomment-5604828694): complete journal-prefix pagination/listing visibility, SQLite transaction rollback, real PITR, failed-alarm retry and cleanup. This completed the provider prerequisites for the bounded foundation; it did not implement full repository recovery or prove future publication/quiescence behavior.

A stored sealed request by itself is **not** durable `ACCEPTED`. The API must not expose an `AcceptedOperationReceipt` to real callers until the complete acceptance barrier required by ADR-014/019 is present.

## Current runtime/journal stage

The permanent source foundation now provides strict SQLite foundation state, phase/generation fencing, pending exact appends, alarms, and the bounded exact-byte hash-linked journal with complete-tail verification and recovery barriers. Its only supported record kinds are `EPOCH_OPEN` and `RECOVERY_BARRIER`. Ordinary activation preserves persisted state and repairs required scheduling; explicit destructive recovery and positively detected stale foundation state enter recovery. These mechanisms remain within the scope documented in `docs/JOURNAL_FOUNDATION.md`.

Every foundation state remains `MAINTENANCE`, including `verified`. The foundation is not an operational repository lane or complete operation queue, does not reconstruct accepted operations, and does not implement full ADR-019 recovery or client-visible durable `ACCEPTED`. There is no production DO binding, R2 journal binding or routing, operational authenticated admission, semantic mutation execution, finalizer, independent auditor/verifier, terminalization, publication, release publication or deployment. The public Worker remains `not_operational`.

Remaining work within the owning runtime/journal stage includes additional reviewed journal record schemas, live binding verification, bounded operation queue/lane processing, and full ADR-019 reconstruction and complete-tail PITR/recreation recovery behavior required by the accepted architecture before normal work can be enabled. The foundation does not complete that broader stage. Public admission must not gain generic evidence/journal/publication authority through storage capabilities.

Core's accepted ADRs and invariant registry at `60a5f5c83ac740e26d4f11db99de66fa7b8c914d` remain normative architecture authority. [Core issue #20](https://github.com/runethread/core/issues/20) is the live implementation tracker and evidence surface; its later closeout records establish the completed prerequisites above. This document is contributor orientation, not an independent Phase 2.6 architecture or sequencing authority.

Operational OAuth/service authentication, real GitHub App registration/tokens, live repository onboarding/adoption, publication, and production deployment remain later reviewed gates. The source API contract does not authorize them.

## Dependency/distribution classification

The current npm graph remains development-only. `node_modules` is ignored and is not copied into the repository. The lockfile records exact third-party package identities/metadata but does not vendor those package contents.

Future dependency work must classify each relevant dependency as development-only, referenced metadata, bundled/deployed code, vendored source, or material included in a downloadable release artifact. A change that moves third-party material into a bundled, vendored, or distributed surface must pass the corresponding notice/rights gate before release.

## Next gates

1. complete the remaining repository-runtime/journal stage above, building on the completed sealed-request/provider prerequisites and bounded source foundation;
2. then role-scoped evidence mediation and content/journal retention policy;
3. then rollback-durable terminalization, deterministic Core candidate construction, finalizer/auditor/verifier work, and publication/reconciliation in the detailed order tracked by `runethread/core#20`, including the distinct provider proofs those later capabilities require;
4. private-repository rollout/recovery/security exit criteria;
5. only then Phase 3 MCP integration work.

Phase 2.6 remains incomplete. Do not turn the source API boundary, release-identity baseline, or runtime/journal foundation into release publication or production deployment implicitly.
