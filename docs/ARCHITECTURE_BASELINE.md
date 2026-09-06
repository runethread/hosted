# Hosted architecture baseline

Status: **Pinned bootstrap reference — non-authoritative**

## Normative authority

The normative Phase 2.6 architecture authority lives in `runethread/core` and its accepted ADRs. This hosted file is only a pinned bootstrap reference. It MUST NOT compete with, override, or silently reinterpret a later accepted Core decision.

Before substantive hosted work, live-fetch the current Core state. If current accepted Core architecture materially differs from this reference, stop hosted implementation and reconcile this file through review before proceeding.

## Exact accepted source

This repository was created after the renewed Phase 2.6 architecture freeze passed and merged in `runethread/core`.

Bootstrap source:

- repository: `runethread/core`
- exact commit: `22995a7cf7d1c6c0f4ce548fd83667468b356f42`
- exact tree: `ef1d3c6a4e8a783cc0657b15a61703a5fa52d6d9`
- governing decisions: ADR-012 through ADR-025
- tracking issue: `runethread/core#20`
- released Core prerequisite: Runethread v0.9.0 / contract v9

This pin records the architecture adopted when `runethread/hosted` was bootstrapped. It is not permission to ignore later accepted Core architecture changes.

## Required boundaries

The hosted implementation MUST preserve at least these accepted invariants:

- user-owned private GitHub repository is canonical semantic state;
- Core/MemoryService is the sole deterministic semantic mutation implementation;
- provider code stays outside `runethread/core`;
- one repository-runtime Durable Object per immutable repository identity is the sole live hosted lane/operation/publication-authorization owner;
- Durable Object transactional SQLite plus alarms owns bounded queue/state/retry/recovery; no Cloudflare Workflow is a second live state machine in v1;
- normal hosted write eligibility requires an explicitly supported contract-v9-or-later repository, supported managed/bootstrap state, directly observed private visibility, explicit App installation authorization, and explicit canonical-ref binding;
- private request/evidence bodies are stored in private no-overwrite object storage while ordinary DO state/log/status contain only bounded opaque references/digests/metadata;
- rollback-sensitive acceptance, cancellation, anchors, publication intents/outcomes, required receipt references, and terminal dispositions use ADR-024's exact sequential hash-linked conditional-create safety journal;
- destructive DO recovery proves the complete journal tail and wins a `RECOVERY_BARRIER` before normal work reopens;
- active binding epochs are not compacted/rotated in v1; limits fail availability closed;
- candidate construction stays in Core while remote canonical ref remains H0;
- candidate success requires fresh independent ADR-020 semantic conformance plus ADR-022 raw deterministic commit-envelope/exact-C/object-closure proof;
- `NO_OP` and `ALREADY_COMMITTED` require fresh ADR-021 independent verification before terminal success;
- every lane-releasing terminal outcome is rollback-durably terminalized under ADR-023 before client-visible completion/lane release;
- only the repository DO may authorize PUBLISHING;
- publication uses true expected-old H0 -> exact audited C and only the verified exact-C object closure;
- ADR-025 publication quiescence covers delayed issuance and every possibly admitted remote update. Token expiry, process termination, current ref, timeout, or journal barrier alone do not prove remote completion;
- every proven/possibly published candidate remains protected history under ADR-018 until resolved;
- Cloudflare account/provider execution, secrets, DO storage, R2 evidence/journal storage, and enforcement of relied-on provider primitives are inside the Phase 2.6 v1 TCB;
- v1 is not zero-knowledge and does not claim survival of malicious full Cloudflare account/provider compromise;
- hosted releases pin exact Worker/DO protocol/schema, Core/runtime/container identities, evidence/journal protocol, verifier/auditor, publication/fencing, reconciliation, privacy, and supported contract identities. Production never executes floating Core `main`.

## Provider preflight observations

Re-verified on 2026-09-06 from current Cloudflare documentation before repository bootstrap:

- TypeScript is first-class for Workers and Cloudflare recommends generated Worker types via `wrangler types`;
- Cloudflare recommends `wrangler.jsonc` for new projects;
- `wrangler types --check` can verify committed generated types in CI;
- Cloudflare recommends SQLite for all new Durable Objects. As of this bootstrap, accounts without an existing legacy KV-backed Durable Object namespace can no longer create new KV-backed namespaces, while accounts with an existing legacy KV-backed namespace retain a temporary legacy exception. Runethread independently requires SQLite for every new hosted Durable Object namespace;
- Cloudflare's current recommended Workers Vitest integration is `@cloudflare/vitest-plugin`.

These are provider/tooling observations, not new architecture. Exact dependency versions and configuration are selected in a separate dependency/toolchain change with a lockfile and CI evidence.
