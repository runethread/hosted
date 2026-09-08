# Current milestone — Hosted pre-runtime licensing gate

Status: **In progress**

## Goal

Complete the protected ADR-026 licensing transition for `runethread/hosted` without admitting runtime/provider source, then move to the separately reviewed TypeScript/Cloudflare toolchain and non-operational Worker shell.

Architecture authority remains the accepted Phase 2.6 design in `runethread/core`. The original Hosted bootstrap pin is Core commit `22995a7cf7d1c6c0f4ce548fd83667468b356f42` / tree `ef1d3c6a4e8a783cc0657b15a61703a5fa52d6d9` and ADR-012 through ADR-025. ADR-026 was accepted later and governs the licensing/commercial-model transition.

## Completed prerequisite

The initial Hosted repository/bootstrap is complete and merged on protected `main`:

- Hosted bootstrap `main`: `ca2282eafca03573ac9c88277125cc6973234959`;
- tree: `1e64bf1c3cf9d264adc227e421f016e4ed5d6c11`;
- active protected-main ruleset requires PR + strict `validate` from GitHub Actions and blocks destructive ref updates;
- no Worker/runtime/provider resources, secrets, deployment, GitHub App, or publication capability exist.

Core's ADR-026 transition and the protected public-memory-template scoped MIT notice gate are also complete.

## This slice — ADR-026 Hosted transition

This change must:

1. replace the root bootstrap MIT default with the exact reviewed PolyForm Perimeter 1.0.1 terms and Required Notice for prospective Runethread-owned Hosted work;
2. preserve the exact historical Hosted MIT root license as `LICENSE-MIT`;
3. add a concise Hosted licensing authority explaining the prospective Perimeter default, historical MIT boundary, absence of any prospective Hosted MIT exception, user-data boundary, commercial flexibility, and inbound-rights prerequisite;
4. update process/PR/agent documentation so ADR-026 is the settled licensing decision rather than a pending choice;
5. mechanically require the exact legal texts and licensing authority through the development-policy guard and negative tests;
6. keep the existing dependency-free validation workflow unchanged;
7. preserve the bootstrap tracked-file allowlist except for the explicit licensing files admitted by this transition;
8. pass exact-head CI and a complete zero-correction adversarial review before protected merge.

## Explicit non-goals

This licensing slice does NOT:

- add a Worker or hosted runtime source;
- add TypeScript/Node/Cloudflare dependencies;
- create `package.json`, `package-lock.json`, or `wrangler.jsonc`;
- create a Durable Object namespace/schema;
- create R2/evidence storage;
- create a GitHub App/webhook;
- store a secret;
- expose an authenticated mutation API;
- implement the safety journal;
- implement finalizer/auditor/verifier/publisher code;
- implement or duplicate Core memory semantics;
- publish a Hosted release;
- deploy anything.

## Licensing invariants

- Post-transition Runethread-owned Hosted material is PolyForm Perimeter 1.0.1 by default to the extent the applicable licensor controls the necessary rights.
- Hosted has **no prospective MIT exception** unless a later explicit reviewed decision creates one.
- Core's exact MIT interoperability boundary does not automatically extend into Hosted.
- Historical Hosted MIT grants remain intact; the transition does not revoke or rewrite previously granted rights.
- User-authored memories/projects/imports/attachments/data remain outside Runethread's software-license grants.
- Material third-party source contributions require an explicit inbound-rights policy before merge if Runethread intends to preserve separate commercial licensing flexibility.
- GitHub organization/repository ownership is not treated as automatic copyright ownership.

## Exit criteria

- exact licensing PR passes `validate`;
- canonical diff contains only declared licensing/governance/policy files;
- exact PolyForm Perimeter and historical MIT texts are mechanically locked;
- the policy guard rejects missing/drifted licensing authority and stale current-MIT claims;
- no runtime/provider/toolchain file is admitted;
- a fresh complete attack review of the exact final head requires zero corrections;
- exact reviewed head is merged with expected-head protection;
- post-merge `main` validation passes;
- Core tracking issue records the Hosted licensing-transition boundary;
- no provider resource or production deployment was created.

## Next gates after this merge

1. introduce the reproducibly locked TypeScript/Cloudflare developer toolchain and a fail-closed non-operational Worker shell using current authoritative provider guidance;
2. establish the independently reviewed Hosted release-identity/release-pipeline baseline while deployment remains disabled;
3. only then begin auth/API and the accepted Phase 2.6 runtime implementation sequence.

The licensing merge by itself authorizes none of those later implementation steps.
