# Current milestone — authenticated Hosted API boundary

Status: **Release-identity baseline established; auth/API is the next implementation gate**

## Verified baseline

The protected Hosted baseline now has two deliberately bounded implementation layers before any user-facing authority:

1. a reproducibly locked TypeScript/Cloudflare developer toolchain plus fail-closed non-operational Worker shell; and
2. a non-publishing release-identity/compatibility baseline that binds exact source/build/runtime inputs to a deterministic release-instance manifest.

The admitted developer/runtime-tool identities remain Node `24.20.0`, npm `11.19.0`, Wrangler `4.129.1`, TypeScript `5.8.3`, Vitest `4.1.11`, and `@cloudflare/vitest-plugin` `1.1.5`. `package.json` is non-publishable and the lockfile remains exact.

The Worker shell still returns HTTP 503 / `not_operational` and has no provider binding, route, secret, persistence, authentication, mutation authority, publication authority, deploy script, production resource, or user traffic.

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
- explicit `not_implemented` protocol slots and false capability flags for Hosted components that do not exist yet;
- exact distribution-notice file identities already required by the repository.

The dry-run build must emit exactly the reviewed runtime payload plus the explicitly admitted local README auxiliary output. Any new output path or changed executable payload fails verification. Source-map upload, extra-module discovery, minification, dependency instrumentation, and Wrangler metrics are explicitly disabled in the current configuration rather than inherited from mutable defaults.

CI uses release identifier `v0.0.0-ci` / SemVer value `0.0.0-ci` only as a reserved proof identity. It is not a product release. Every Linux/macOS/Windows `npm run check` performs the release verification, builds twice, and requires the same locked executable Worker digest.

`publication_enabled` remains false. This baseline creates no GitHub Release, tag, downloadable artifact, Cloudflare version, deployment, route, credential, provider resource, or production traffic.

A generated manifest binds and records the identities it contains and proves the locally verified source/build/artifact relationships. It does not independently prove external Core/provider facts or live GitHub branch protection/status-check state. Any future publication mechanism must separately prove that the source commit is the intended current protected `main` and that required `validate` evidence belongs to that exact commit.

## Applicable Runethread invariants

Hosted continues to consume, without copying, the canonical Core invariant authority. The directly relevant active IDs remain:

- `RT-ARCH-001` — provider-specific execution and dependencies stay outside Core;
- `RT-ARCH-002` — correctness-relevant component coupling uses explicit contracts or immutable identities rather than hidden internals;
- `RT-GOV-001` — material choices are objective/evidence-driven and simpler alternatives are considered;
- `RT-REL-001` — Hosted now has a concrete immutable compatibility/release-identity baseline for the components and policies it actually relies on;
- `RT-SEM-001` — Hosted does not become a second memory-mutation semantics implementation.

Node/TypeScript/Wrangler/Cloudflare choices remain current Hosted implementation decisions, not project invariants. ADR-028 is project-wide release governance, not a new invariant and not a reason to collapse independent compatibility dimensions.

ADR-026 remains the licensing authority for this work: Hosted has no prospective MIT exception, Core's exact MIT interoperability boundary does not automatically extend into Hosted, historical grants remain intact, and user-owned data remains outside Runethread's software-license grants.

## Immediate milestone — authenticated transport-neutral API boundary

The next implementation slice may introduce the transport-neutral request/status/cancel boundary and caller/repository authorization required by the accepted Phase 2.6 architecture, but only inside the authority limits already frozen in Core.

That work must not:

- implement canonical memory mutation semantics outside Core;
- create publication authority as a side effect of API work;
- skip private-repository eligibility/binding checks;
- convert the non-operational shell into an implicitly deployed service;
- invent protocol identities without adding them to the release compatibility baseline under review;
- weaken the existing release identity, versioning, licensing, invariant, or protected-main gates.

## Dependency/distribution classification

The current npm graph remains development-only. `node_modules` is ignored and is not copied into the repository. The lockfile records exact third-party package identities/metadata but does not vendor those package contents.

Future dependency work must classify each relevant dependency as development-only, referenced metadata, bundled/deployed code, vendored source, or material included in a downloadable release artifact. A change that moves third-party material into a bundled, vendored, or distributed surface must pass the corresponding notice/rights gate before release.

## Next gates

1. authenticated transport-neutral request/status/cancel boundary and caller/repository authorization;
2. sealed request persistence and the accepted ADR-014 through ADR-025 coordinator/evidence/publication sequence;
3. private-repository rollout/recovery/security exit criteria;
4. only then Phase 3 MCP integration work.

Do not turn the release-identity baseline into release publication or production deployment implicitly.
