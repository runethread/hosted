# Runethread Hosted development pipeline

Status: **Active project policy**

## 1. Current bootstrap gate

The initial repository bootstrap intentionally carries no Node/Cloudflare dependency graph or deployable hosted runtime. Until a separately reviewed policy extension lands, the Git-tracked repository manifest is exactly the bootstrap surface enforced by `scripts/check_development_policy.py`, and the only admitted GitHub Actions workflow is `.github/workflows/validate.yml`. Unexpected runtime/provider/toolchain files fail closed.

Required validation is:

```text
git diff --check
python3 -m py_compile scripts/check_development_policy.py scripts/check_development_policy_test.py
python3 scripts/check_development_policy_test.py
python3 scripts/check_development_policy.py
```

The GitHub workflow must run on both `push` and `pull_request` and finish with a fail-closed aggregate job named exactly `validate`.

## 2. CI self-protection

Bootstrap validation MUST:

- match the exact reviewed bootstrap workflow contract/digest; any workflow edit requires a deliberate policy-digest update in the same reviewed change;
- use exactly repository-level `permissions: contents: read`;
- run only on the GitHub-hosted `ubuntu-latest` runner during public-repository bootstrap; self-hosted validation is not admitted;
- never use `pull_request_target` for ordinary validation;
- never commit/push repairs;
- keep checkout at full history (`fetch-depth: 0`) so base/head patch validation is meaningful;
- keep checkout credentials non-persistent with explicit `persist-credentials: false`;
- pin every admitted external `uses:` Action to an immutable 40-hex commit SHA;
- reject alternate/quoted/flow/local/reusable Action syntax unless the guard is deliberately extended in the same reviewed change;
- admit only `actions/checkout` during this dependency-free bootstrap; adding another Action or workflow requires an explicit policy change and review;
- retain the policy guard compilation, negative/self-tests, and enforcement invocation;
- retain the `quality -> validate` dependency and require `quality` to be exactly successful even when the aggregate job runs under `if: always()`.

The bootstrap policy intentionally does not implement a partial YAML interpreter. It hashes the complete reviewed workflow text, while byte-level CRLF checks separately preserve LF stability. A future workflow shape must update that exact contract and its negative tests deliberately.

## 3. Licensing/commercial-model gate

The repository was initially published under MIT. That bootstrap fact is not a frozen long-term licensing decision.

Before the first hosted runtime source or Worker shell is merged:

- make a dedicated reviewed Runethread licensing/commercial-model decision;
- compare the candidate licenses against the intended open-source/community and commercial boundaries;
- explicitly decide how future source releases may be used commercially by third parties;
- record the decision in the owning architecture/governance surface before relying on it.

Code already published under a given license remains subject to that published license; a future change must not be described as retroactively changing previously granted terms.

## 4. Dependency/toolchain admission gate

When the TypeScript/Cloudflare toolchain is introduced, that same PR MUST:

- re-check current Cloudflare and Node support documentation;
- commit and Git-track `package.json` and `package-lock.json` together; one-tracked/one-untracked states are forbidden;
- keep the package `private: true`;
- pin every direct dependency/devDependency/optionalDependency/peerDependency to an exact SemVer version; aliases, ranges, URLs, git/file/workspace specifiers, and other forms are rejected until explicitly reviewed;
- use lockfile-based clean installation in CI;
- add generated Worker types and `wrangler types --check`;
- add TypeScript type checking;
- add Workers-runtime tests using the current supported Cloudflare testing integration;
- add Linux, macOS, and Windows validation where the selected developer toolchain is expected to work;
- update Dependabot for npm;
- review transitive dependency/advisory/license exposure;
- keep deployment disabled until a separate deployment/security gate is approved.

No unlocked dependency graph is accepted merely to bootstrap faster.

## 5. Hosted release-pipeline prerequisite

Core Phase 2.6 implementation-sequence step 3 requires `runethread/hosted` to have its own development **and release** pipeline before auth/API implementation begins.

The bootstrap PR may remain dependency-free, and the toolchain may be reviewed separately. However, before auth/API code starts, a dedicated release-identity/release-pipeline baseline MUST define at least:

- the exact source/ref and immutable build identity that may become a hosted release;
- pinned Core/runtime/protocol/schema identities required by the accepted architecture;
- reproducible build/verification inputs;
- release provenance and versioning expectations;
- a clear distinction between producing/verifying a release artifact and deploying it.

That baseline must not silently create production credentials, routes, or deployment authority.

## 6. Durable Object/provider implementation gate

Before journal-dependent coordinator code lands, executable provider spikes must prove the exact primitives relied on by ADR-024/025, including real conditional-create races/lost responses, complete listing/pagination behavior, DO SQLite/PITR/recovery behavior, and any remote publication/quiescence assumptions needed by that implementation slice.

Spikes are evidence, not production shortcuts. A failed premise reopens the owning design before implementation continues.

## 7. Draft PR gate

Before readiness:

1. verify exact PR base/head and mergeability;
2. inspect the canonical changed-file list and patch;
3. confirm scope/classification for every file;
4. require exact-head `validate` success;
5. inspect comments, reviews, and review threads;
6. re-check base movement and provider premises;
7. perform required backward/forward/negative/security review;
8. for bootstrap, verify the required `main` ruleset is already active before authorizing merge.

## 8. Repository ruleset target

As soon as this repository has a successful `validate` status check that GitHub can select, and **before bootstrap merge**, activate a ruleset equivalent to the Core safety posture:

- pull request required for `main`;
- strict/up-to-date required `validate` check;
- branch deletion blocked;
- non-fast-forward/force updates blocked;
- no ordinary bypass.

If GitHub cannot establish that exact protection before merge, do not merge; report the blocker and keep the bootstrap draft.

The current connector cannot create organization repository rulesets, so this external configuration must be configured through an authorized GitHub management surface and then live-read back before readiness.

## 9. Merge/post-merge gate

Merge only the exact reviewed head, preferably squash for iterative branches. After merge verify:

- PR closed/merged;
- `main` exact merge SHA/tree;
- merged-main `validate` success;
- required policy/ownership/dependency files still present;
- active repository ruleset still requires the intended checks.

Do not start the next milestone slice until post-merge verification passes.
