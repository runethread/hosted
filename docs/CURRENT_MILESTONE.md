# Current milestone — Hosted release-identity baseline

Status: **Next gate after the toolchain/shell merge**

## Verified baseline after this slice

The protected Hosted baseline now includes the reviewed developer toolchain and a fail-closed non-operational Worker shell:

- Node `24.20.0` and npm `11.19.0` are the exact admitted developer/CI identities;
- direct development dependencies are exact: Wrangler `4.129.1`, TypeScript `5.8.3`, Vitest `4.1.11`, and `@cloudflare/vitest-plugin` `1.1.5`;
- `package.json` and `package-lock.json` are committed together and the package is non-publishable;
- generated Worker environment and runtime types are committed from `wrangler types`, compatibility-locked by the Worker date/flags, and checked for drift;
- CI clean-installs with lifecycle scripts disabled and runs the supported Workers-runtime test integration on Linux, macOS, and Windows;
- the Worker shell returns HTTP 503 / `not_operational` and has no provider binding, route, secret, persistence, mutation authority, publication authority, deploy script, or production resource;
- validation remains read-only and the protected `validate` aggregate remains the merge check;
- no Hosted release or deployment is authorized by the toolchain/shell merge.

Architecture authority remains the accepted Phase 2.6 design in `runethread/core`. The historical Hosted bootstrap pin remains documented in `ARCHITECTURE_BASELINE.md`, while current substantive work must also consume the protected Core invariant registry and later accepted ADRs from freshly verified live state.

## Applicable Runethread invariants

The toolchain/shell baseline consumes, without copying, the canonical Core invariant authority. The directly relevant active IDs are:

- `RT-ARCH-001` — provider-specific execution and dependencies stay outside Core;
- `RT-ARCH-002` — correctness-relevant component coupling uses explicit contracts or immutable identities rather than hidden internals;
- `RT-GOV-001` — material choices are objective/evidence-driven and simpler alternatives are considered;
- `RT-REL-001` — hosted/released execution must eventually bind every correctness-relevant component/contract/protocol identity immutably;
- `RT-SEM-001` — Hosted does not become a second memory-mutation semantics implementation.

The Node/TypeScript/Wrangler/Cloudflare choices are current Hosted implementation decisions, not permanent project invariants.

ADR-026 remains the licensing authority for this work: Hosted has no prospective MIT exception, Core's exact MIT interoperability boundary does not automatically extend into Hosted, historical grants remain intact, and user-owned data remains outside Runethread's software-license grants.

## Immediate milestone — release identity and release pipeline

Before auth/API implementation begins, define and independently review the Hosted release-identity baseline. It must establish at least:

1. what exact source/ref/tree can become a Hosted release;
2. how Hosted version identity is represented and verified;
3. which exact Core runtime, memory contract, candidate/protocol, journal/evidence, and provider/configuration identities a release relies on;
4. how build inputs and produced artifacts are reproducibly identified;
5. how applicable source/build notices are proven for any artifact that is actually distributed;
6. how producing/verifying a release is kept distinct from deploying it;
7. how unsupported or floating identity combinations fail closed.

That gate must remain non-deploying. It does not authorize a production route, secret, Durable Object, R2 bucket, GitHub App, mutation endpoint, publication capability, or user traffic.

## Dependency/distribution classification

The current npm graph is development-only. `node_modules` is ignored and is not copied into the repository. The lockfile records exact third-party package identities/metadata but does not vendor those package contents.

Future dependency work must classify each relevant dependency as development-only, referenced metadata, bundled/deployed code, vendored source, or material included in a downloadable release artifact. A change that moves third-party material into a bundled, vendored, or distributed surface must pass the corresponding notice/rights gate before release.

## Next gates

1. Hosted release identity/release pipeline;
2. authenticated transport-neutral request/status/cancel boundary and caller/repository authorization;
3. sealed request persistence and the accepted ADR-014 through ADR-025 coordinator/evidence/publication sequence;
4. private-repository rollout/recovery/security exit criteria;
5. only then Phase 3 MCP integration work.

Do not skip directly from this shell to auth/API or production deployment.
