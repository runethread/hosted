# Runethread Hosted development pipeline

Status: **Active project policy**

## 1. Current toolchain/shell gate

The repository has crossed the dependency-free bootstrap gate. It now contains a reproducibly locked TypeScript/Cloudflare development toolchain, a deliberately non-operational Worker shell, and a non-publishing release-identity baseline.

The admitted identities for this baseline are Node `24.20.0`, npm `11.19.0`, Wrangler `4.129.1`, TypeScript `5.8.3`, Vitest `4.1.11`, and `@cloudflare/vitest-plugin` `1.1.5`. `package.json` is `private: true`; exact direct versions and the exact generated lockfile are review surfaces, not floating inputs.

The shell has no deploy/dev script, provider binding, route, secret, storage, mutation authority, publication authority, published release, or production deployment.

Required validation is:

```text
git diff --check
python3 -m py_compile scripts/check_development_policy.py scripts/check_development_policy_test.py
python3 scripts/check_development_policy_test.py
python3 scripts/check_development_policy.py
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The Node/npm install and `npm run check` path runs on Linux, macOS, and Windows. The GitHub workflow must run on both `push` and `pull_request` and finish with a fail-closed aggregate job named exactly `validate`.

`npm run check` includes generated Worker type drift, TypeScript, Workers-runtime tests, and release-identity verification. The release verifier performs two clean credential-stripped Wrangler dry-run builds and requires their executable Worker payload to equal the exact reviewed digest in `release/identity-policy.json`.

## 2. CI self-protection

Validation MUST:

- match the exact reviewed workflow contract/digest; any workflow edit requires a deliberate policy-digest update in the same reviewed change;
- use repository-level `permissions: contents: read` only;
- never use `pull_request_target` for ordinary validation;
- never commit or push repairs;
- keep every checkout at full history (`fetch-depth: 0`) and `persist-credentials: false`;
- pin every admitted external `uses:` Action to an immutable 40-hex commit SHA;
- admit only the exact reviewed `actions/checkout` and `actions/setup-node` identities in the required workflow until policy is deliberately extended;
- clean-install the exact lockfile with install lifecycle scripts disabled;
- verify exact Node and npm identities before executing toolchain checks;
- run Wrangler generated-type drift checking over committed environment plus compatibility-locked runtime declarations, TypeScript checks, Workers-runtime tests, and release-identity verification;
- retain the Python policy guard compilation, negative/self-tests, and enforcement invocation;
- retain the `quality + toolchain -> validate` dependency and require both to be exactly successful under `if: always()`.

The policy intentionally hashes the complete reviewed workflow rather than implementing a partial YAML interpreter. Byte-level LF/UTF-8 checks separately preserve text stability.

**Self-protection limitation:** the required workflow and the guard/digest/tests that define its expected shape are PR-controlled. A same-PR change can alter both. Green CI therefore cannot attest to its own integrity for a workflow/guard/policy change; canonical exact-head patch inspection, adversarial review, and live ruleset verification remain mandatory.

## 3. Invariant impact gate

Before a substantive Hosted change, live-fetch the current protected `runethread/core/RUNETHREAD_INVARIANTS.json`, record the exact Core authority commit, and classify the impact on every applicable invariant ID.

Hosted consumes the canonical registry; it does not maintain a competing copy. Scope means applicability, not proof strength: Core CI does not mechanically prove Hosted source, so Hosted must provide its own local evidence where useful.

Provider/toolchain choices are implementation decisions unless a separately reviewed Core governance change promotes a deeper durable truth. Routine changes should not manufacture new invariants merely because the registry exists.

## 4. Licensing/commercial-model and dependency gate

ADR-026 is the accepted project licensing/commercial-model decision. **PolyForm Perimeter 1.0.1** is the prospective default for Runethread-owned Hosted material to the extent the applicable licensor controls the necessary rights. The exact historical Hosted MIT root license remains preserved as `LICENSE-MIT`; Hosted has **no prospective MIT exception** and Core's scoped MIT boundary does not automatically extend here.

User-authored memories/projects/imports/attachments/data remain outside Runethread's software-license grants. Material third-party source contributions require the explicit inbound-rights policy required by ADR-026.

For dependency changes:

- re-check current authoritative provider/toolchain support before selecting versions;
- update `package.json` and `package-lock.json` together;
- keep direct versions exact and the package non-publishable;
- keep the current shell free of runtime dependencies unless a later reviewed gate explicitly admits them;
- classify third-party material as development-only, referenced metadata, bundled/deployed code, vendored source, or downloadable-release content;
- review advisory and license metadata at admission/update time;
- do not infer that a dependency's license changes Runethread's source license merely because the dependency is used as a development tool;
- do not distribute or vendor third-party material without satisfying the obligations attached to that actual distribution surface.

`package-lock.json` is dependency metadata, not Hosted licensing authority. `node_modules` is not a repository/distribution surface and remains ignored.

## 5. Hosted release-identity baseline

Before auth/API code starts, Hosted MUST maintain the reviewed non-publishing release-identity baseline in `release/identity-policy.json` and `scripts/release_identity.mjs`.

The static policy records the immutable compatibility inputs that a release instance may rely on. The generated release-instance manifest records the exact source commit/tree and explicit Hosted version supplied at verification time, avoiding a circular attempt to embed a commit's own SHA inside committed policy bytes.

The baseline MUST bind and verify:

- exact Hosted source commit/tree in the generated manifest;
- explicit semver input, with `v0.0.0-ci` reserved only for CI proof;
- immutable Core runtime release/tag commit rather than Core `main`;
- contract/repository/schema/index/trust/bootstrap compatibility identities actually relied on;
- exact Node/npm/Wrangler, package-lock, Worker compatibility date/flags, Wrangler configuration, and generated runtime-type identities;
- exact expected executable Worker payload produced by two clean `wrangler deploy --dry-run` builds;
- the exact allowed dry-run output path set so newly emitted files fail closed;
- exact required distribution-notice file identities;
- explicit `not_implemented` protocol slots and false capability flags for authority that does not exist yet.

The current build path executes the lockfile-installed Wrangler CLI directly through the pinned Node runtime, strips Cloudflare credential environment variables, sets `NODE_ENV=production`, disables Wrangler metrics, and passes `--x-provision=false` plus `--x-auto-create=false`. `wrangler.jsonc` explicitly disables source-map upload, extra-module discovery, minification, dependency instrumentation, and metrics rather than relying on provider defaults.

The release verifier is a **builder/verifier only**. `publication_enabled` remains false. It creates no tag, GitHub Release, Cloudflare version, route, binding, resource, credential, or deployment.

A generated release-instance manifest is evidence about its recorded source/build/component identities. It is not evidence that GitHub branch/ruleset/status-check state was live and acceptable at publication time. A future publication mechanism must independently prove the candidate is the intended current protected `main` commit and that required `validate` belongs to that exact commit before publication.

Protocol/capability identities must not be invented before the corresponding component exists and is reviewed. When later Phase 2.6 slices add an API, repository runtime, journal/evidence protocol, candidate envelope, verification role, terminalization, publication, or reconciliation behavior, this compatibility baseline must advance in the same owning change or fail closed.

No Hosted release artifact may be published until its applicable notice/rights packaging is proven. Producing/verifying release identity remains distinct from publishing and from deployment.

## 6. Durable Object/provider implementation gate

Before journal-dependent coordinator code lands, executable provider spikes must prove the exact primitives relied on by ADR-024/025, including conditional-create races/lost responses, complete listing/pagination behavior, DO SQLite/PITR/recovery behavior, and remote publication/quiescence assumptions.

Spikes are evidence, not production shortcuts. A failed premise reopens the owning design before implementation continues.

## 7. Draft PR and adversarial gate

Before readiness:

1. verify exact PR base/head and mergeability;
2. inspect the canonical changed-file list and patch;
3. confirm scope/classification and invariant impact for every material surface;
4. require exact-head `validate` success;
5. inspect comments, reviews, and review threads;
6. re-check base movement and time-sensitive provider premises;
7. perform the required complete adversarial review, enumerating all material findings before corrections;
8. if the head changes, restart the full review from scratch;
9. verify the required `main` ruleset remains active before authorizing merge.

## 8. Repository ruleset target

Before every safety-sensitive merge, live-verify protected `main` requires a pull request and strict/up-to-date `validate` from the expected GitHub Actions source, blocks deletion and non-fast-forward updates, and exposes no ordinary bypass.

If that protection is absent or weakened, do not merge.

## 9. Merge/post-merge gate

Merge only the exact reviewed head, preferably squash for iterative branches. After merge verify PR state, exact `main` merge SHA/tree, merged-main `validate`, required policy/ownership/dependency files, and the active ruleset.

Do not start the next milestone slice until post-merge verification passes.
