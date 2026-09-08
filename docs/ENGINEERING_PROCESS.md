# Runethread Hosted engineering process

Status: **Active project policy**

This repository implements a security- and correctness-sensitive hosted control plane. Passing tests is necessary but not sufficient.

## 1. Verify before writing

Before substantive work:

1. fetch exact Hosted `main`, branch/base, active PRs, rulesets, and required checks;
2. read `AGENTS.md`, this document, `DEVELOPMENT_PIPELINE.md`, `CURRENT_MILESTONE.md`, `ARCHITECTURE_BASELINE.md`, and `../LICENSING.md`;
3. live-fetch the current protected `runethread/core/RUNETHREAD_INVARIANTS.json`, relevant accepted ADRs, and current milestone/tracker state;
4. record the exact Core invariant-authority commit consumed by the change;
5. verify current provider/toolchain documentation for any Cloudflare/GitHub/Node behavior or version support the change relies on;
6. inspect the existing implementation/tests at the owning layer;
7. classify the full impact surface before editing, including invariant, dependency, security, release/deployment, and licensing/commercial-model impact.

Unexpected movement of an exact reviewed head/base or a material provider premise is a stop condition.

## 2. Decision discipline and invariant use

For every material recommendation or implementation choice, identify the actual project objective, determine whether the proposal materially advances it, distinguish evidence from agreement-seeking or novelty, state meaningful cost/coupling/lock-in/attack-surface implications, consider simpler alternatives, and preserve accepted constraints. If unresolved material ambiguity could change the decision, seek clarification rather than silently choosing.

The canonical project invariant registry lives in Core. Hosted consumes its active IDs and records impact; it does not copy or redefine project-wide invariant statements. A provider/toolchain/version choice remains an implementation or milestone decision unless a separately reviewed governance change establishes a deeper durable invariant.

`No change` is an acceptable engineering outcome when additional machinery would not advance the objective.

## 3. Ownership and scope

Hosted owns transport/control-plane behavior, not memory semantics. If a proposed Hosted fix needs a second interpretation of mutation equivalence, canonical memory bytes, Index semantics, contract acceptance, or mutation history, stop and change Core/architecture instead.

A provider convenience must not silently become semantic authority. Evidence services, finalizers, auditors, publishers, webhooks, and object storage do not become a second queue/lane state machine.

The current toolchain/shell baseline is intentionally non-operational. Adding provider bindings, routes, secrets, storage, release/deploy automation, authentication, mutation authority, or publication authority is a scope expansion requiring the owning later gate.

## 4. Branch/write discipline

- Dedicated branch from an exact verified `main` SHA.
- Draft PR before substantive work is treated as reviewable.
- No direct `main` writes, force-push, blind replacement, or unrelated refactor.
- Re-read a file immediately before full replacement when it may have moved.
- Every success claim belongs to one exact committed SHA.
- Required validation is observational and read-only.
- Temporary construction/evidence machinery must be absent from the final review candidate unless it is itself intentionally part of the product/process baseline.

## 5. Required analysis

For every material change, record:

- intended behavior and explicit non-goals;
- applicable invariant IDs and impact;
- state owner and transition authority;
- inputs/outputs and immutable identities/digests;
- crash points and ambiguous-response behavior;
- retry/idempotency rules;
- stale generation/version behavior;
- authorization/capability boundary;
- private data/logging/retention impact;
- dependency classification and whether third-party material is development-only, metadata, bundled/deployed, vendored, or actually distributed;
- licensing/commercial-use/redistribution impact and whether previously published terms remain unaffected;
- backward/forward compatibility;
- deployment/recovery/rollback effect;
- Core/release identity impact;
- provider assumptions that need executable proof.

## 6. Adversarial review method

For material development-pipeline, dependency/toolchain, repository-policy, CI-self-protection/validation-guard changes, and for architecture, protocol, state-machine, authentication/authorization, journal/evidence, publication, recovery, trust-boundary, release, or licensing/commercial-model changes:

1. freeze one exact head/base;
2. attack the complete relevant design and enumerate **all material findings before editing**;
3. classify severity and whether each finding changes architecture, policy, or implementation only;
4. apply the complete correction set together;
5. run the full mechanical pipeline on the new exact head;
6. perform a fresh complete adversarial review from scratch;
7. repeat until a full pass requires zero corrections.

Finding #1 can fail the gate, but it does not end the investigation. Stop-first review is prohibited because it hides interacting defects and produces serial patch churn.

## 7. Licensing boundary

ADR-026 settles the Hosted licensing/commercial model. **PolyForm Perimeter 1.0.1 is the prospective default** for Runethread-owned Hosted material to the extent the applicable licensor controls the necessary rights. Hosted has no prospective MIT exception unless a later explicit reviewed decision creates one; Core's exact MIT interoperability boundary does not automatically extend here.

The repository was initially published under MIT. `LICENSE-MIT` preserves that historical root license, and previously granted MIT rights remain intact. `LICENSING.md` is the current Hosted licensing authority.

User-authored memories/projects/imports/attachments/data remain outside Runethread's software-license grants. Before material third-party source contributions are merged, adopt the explicit inbound-rights policy required by ADR-026 rather than assuming repository ownership or commit metadata transfers relicensing rights.

Development-tool dependencies do not automatically change the license of Runethread-authored source. Actual bundling, vendoring, or redistribution of third-party material is a separate surface and must satisfy the applicable obligations before release.

## 8. Provider/security changes

Changes involving Cloudflare account boundaries, R2/DO consistency, PITR, secrets, Service Bindings, Containers, GitHub App permissions/tokens, webhooks, Git transport, GraphQL/REST ref publication, or remote-completion fencing require current authoritative documentation plus executable integration evidence before production claims are made.

Documentation evidence may establish a preflight premise; it does not prove runtime behavior under races or lost responses.

## 9. Release/deployment gate

No production deployment is authorized by a development merge alone. Before auth/API implementation, Hosted must establish a separately reviewed release-identity/release-pipeline baseline defining exact source/build identities, correctness-relevant Core/protocol/configuration identities, artifact provenance, notice/rights packaging, and the boundary between release production and deployment.

Secrets and provider resources are configured outside Git. Deployment automation must use least privilege and must not expose long-lived App/publication credentials to public validation jobs.

## 10. Failure behavior

When a gate fails, stop unrelated writes, diagnose exact evidence, fix the owning layer, and rerun the complete required pipeline. Never make a failing safety check advisory, broaden permissions, remove a platform/test, or weaken fail-closed behavior merely to obtain green CI.
