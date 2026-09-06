# Runethread Hosted engineering process

Status: **Active project policy**

This repository implements a security- and correctness-sensitive hosted control plane. Passing tests is necessary but not sufficient.

## 1. Verify before writing

Before substantive work:

1. fetch exact hosted `main`, branch/base, active PRs, rulesets, and required checks;
2. read `AGENTS.md`, this document, `DEVELOPMENT_PIPELINE.md`, `CURRENT_MILESTONE.md`, and `ARCHITECTURE_BASELINE.md`;
3. live-fetch the relevant accepted ADRs/current milestone from `runethread/core`;
4. verify current provider documentation for any Cloudflare/GitHub behavior the change relies on;
5. inspect the existing implementation/tests at the owning layer;
6. classify the full impact surface before editing, including licensing/commercial-model impact when source distribution or license terms may change.

Unexpected movement of an exact reviewed head/base or a material provider premise is a stop condition.

## 2. Ownership and scope

Hosted owns transport/control-plane behavior, not memory semantics. If a proposed hosted fix needs a second interpretation of mutation equivalence, canonical memory bytes, Index semantics, contract acceptance, or mutation history, stop and change Core/architecture instead.

A provider convenience must not silently become semantic authority. Evidence services, finalizers, auditors, publishers, webhooks, and object storage do not become a second queue/lane state machine.

## 3. Branch/write discipline

- Dedicated branch from an exact verified `main` SHA.
- Draft PR before substantive work is treated as reviewable.
- No direct `main` writes, force-push, blind replacement, or unrelated refactor.
- Re-read a file immediately before full replacement when it may have moved.
- Every success claim belongs to one exact committed SHA.
- CI is observational and read-only.

## 4. Required analysis

For every material change, record:

- intended behavior and explicit non-goals;
- state owner and transition authority;
- inputs/outputs and immutable identities/digests;
- crash points and ambiguous-response behavior;
- retry/idempotency rules;
- stale generation/version behavior;
- authorization/capability boundary;
- private data/logging/retention impact;
- licensing/commercial-use/redistribution impact and whether previously published terms remain unaffected;
- backward/forward compatibility;
- deployment/recovery/rollback effect;
- Core/release identity impact;
- provider assumptions that need integration proof.

## 5. Adversarial review method

For material development-pipeline, repository-policy, CI-self-protection/validation-guard changes, and for architecture, protocol, state-machine, authentication/authorization, journal/evidence, publication, recovery, trust-boundary, or licensing/commercial-model changes:

1. freeze one exact head/base;
2. attack the complete relevant design and enumerate **all material findings before editing**;
3. classify severity and whether each finding changes architecture or implementation only;
4. apply the complete correction set together;
5. run the full mechanical pipeline on the new exact head;
6. perform a fresh complete adversarial review from scratch;
7. repeat until a full pass requires zero corrections.

Finding #1 can fail the gate, but it does not end the investigation. Stop-first review is prohibited because it hides interacting defects and produces serial patch churn.

Low-risk documentation or mechanical changes do not automatically enter this cycle merely because they touch repository files; the requirement follows the material impact classification above.

## 6. Licensing boundary

The repository was initially published under MIT, but that bootstrap state is not the settled long-term commercial model. Before the first hosted runtime source or Worker shell is merged, the dedicated reviewed Runethread licensing/commercial-model decision must be recorded. A later license change is prospective; never claim that it retroactively withdraws rights already granted for bytes published under an earlier license.

## 7. Provider/security changes

Changes involving Cloudflare account boundaries, R2/DO consistency, PITR, secrets, Service Bindings, Containers, GitHub App permissions/tokens, webhooks, Git transport, GraphQL/REST ref publication, or remote-completion fencing require current authoritative documentation plus executable integration evidence before production claims are made.

Documentation evidence alone may establish a preflight premise; it does not prove runtime behavior under races/lost responses.

## 8. Release/deployment gate

No production deployment is authorized by a development merge alone. A hosted release must identify exact source, protocol/schema, exact Core/runtime/container identity, configuration/bindings, evidence/journal version, and deployment/recovery compatibility. Breaking control-path changes drain/maintain or use explicit compatible version isolation; an operation never crosses incompatible generations.

Secrets and provider resources are configured outside Git. Deployment automation must use least privilege and must not expose long-lived App/publication credentials to public validation jobs.

## 9. Failure behavior

When a gate fails, stop unrelated writes, diagnose exact evidence, fix the owning layer, and rerun the complete required pipeline. Never make a failing safety check advisory, broaden permissions, remove a platform/test, or weaken fail-closed behavior merely to obtain green CI.
