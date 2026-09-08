# Runethread Hosted development pipeline

Status: **Active project policy**

## 1. Current pre-runtime gate

The initial repository bootstrap is complete. The repository still intentionally carries no Node/Cloudflare dependency graph or deployable hosted runtime. Until a separately reviewed policy extension lands after the ADR-026 Hosted transition, the Git-tracked repository manifest is exactly the bootstrap/governance surface enforced by `scripts/check_development_policy.py`, plus the explicit licensing authority files admitted by that transition. The only admitted GitHub Actions workflow remains `.github/workflows/validate.yml`. Unexpected runtime/provider/toolchain files fail closed.

Required validation is:

```text
git diff --check
python3 -m py_compile scripts/check_development_policy.py scripts/check_development_policy_test.py
python3 scripts/check_development_policy_test.py
python3 scripts/check_development_policy.py
```

The GitHub workflow must run on both `push` and `pull_request` and finish with a fail-closed aggregate job named exactly `validate`.

## 2. CI self-protection

Pre-runtime validation MUST:

- match the exact reviewed workflow contract/digest; any workflow edit requires a deliberate policy-digest update in the same reviewed change;
- use exactly repository-level `permissions: contents: read`;
- run only on the GitHub-hosted `ubuntu-latest` runner during this dependency-free pre-runtime gate; self-hosted validation is not admitted;
- never use `pull_request_target` for ordinary validation;
- never commit/push repairs;
- keep checkout at full history (`fetch-depth: 0`) so base/head patch validation is meaningful;
- keep checkout credentials non-persistent with explicit `persist-credentials: false`;
- pin every admitted external `uses:` Action to an immutable 40-hex commit SHA;
- reject alternate/quoted/flow/local/reusable Action syntax unless the guard is deliberately extended in the same reviewed change;
- admit only `actions/checkout` during this dependency-free pre-runtime gate; adding another Action or workflow requires an explicit policy change and review;
- retain the policy guard compilation, negative/self-tests, and enforcement invocation;
- retain the `quality -> validate` dependency and require `quality` to be exactly successful even when the aggregate job runs under `if: always()`.

The pre-runtime policy intentionally does not implement a partial YAML interpreter. It hashes the complete reviewed workflow text, while byte-level CRLF checks separately preserve LF stability. A future workflow shape must update that exact contract and its negative tests deliberately.

**Self-protection limitation:** the required `validate` workflow and the guard/digest/tests that define its expected shape are all PR-controlled. A same-PR change can therefore alter both the executable workflow and its local policy expectation; green CI cannot attest to its own integrity in that case. Every workflow/guard/policy change still requires canonical exact-head patch inspection, the full adversarial review cycle, and live ruleset verification. A green `validate` result alone never authorizes such a merge.

## 3. Licensing/commercial-model gate

ADR-026 is the accepted project licensing/commercial-model decision. Before the first hosted runtime source or Worker shell is merged, `runethread/hosted` must complete its own protected transition:

- **PolyForm Perimeter 1.0.1** becomes the prospective default for Runethread-owned Hosted material to the extent the applicable licensor controls the necessary rights;
- the exact historical Hosted MIT root license is preserved as `LICENSE-MIT`;
- Hosted has **no prospective MIT exception** unless a later explicit reviewed decision creates one;
- Core's exact MIT interoperability boundary does not automatically extend into Hosted;
- user-authored memories/projects/imports/attachments/data remain outside Runethread's software-license grants;
- material third-party source contributions require an explicit inbound-rights policy appropriate to the intended commercial model;
- the policy guard mechanically locks the legal texts/current licensing authority and rejects stale current-MIT claims.

Code already published under MIT remains subject to those historical grants. Never describe the transition as retroactively withdrawing or narrowing previously granted rights.

The licensing transition itself admits no runtime/provider/toolchain/deployment state. After it merges and is post-merge verified, proceed to the separate dependency/toolchain gate below.

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
- verified delivery of the applicable Perimeter terms or URL plus every `Required Notice:` for Perimeter-covered Hosted material, together with every notice required by bundled Core or third-party material; satisfying a bundled MIT notice does not create a prospective MIT exception for Hosted source;
- a clear distinction between producing/verifying a release artifact and deploying it.

No Hosted release artifact may be published until that notice packaging is proven. That baseline must not silently create production credentials, routes, or deployment authority.

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
8. verify the required `main` ruleset remains active before authorizing merge.

## 8. Repository ruleset target

The protected-main ruleset established during bootstrap remains a continuing prerequisite. Before every safety-sensitive merge, live-verify a ruleset equivalent to the Core safety posture:

- pull request required for `main`;
- strict/up-to-date required `validate` check bound to the GitHub Actions expected source/App, not an unrestricted "any source" status context;
- branch deletion blocked;
- non-fast-forward/force updates blocked;
- no ordinary bypass.

At bootstrap review time, the live Core `Protect main` ruleset binds `validate` to GitHub Actions (`integration_id: 15368`). Treat the named expected source as the invariant and live-verify the current source/integration when configuring hosted rather than relying on an unverified historical ID. Read back the complete hosted ruleset, including the required-check source binding, before readiness.

If that exact protection is absent or weakened, do not merge; report the blocker and keep the PR draft.

If a future ruleset change cannot be performed through the active connector, use an authorized GitHub management surface and then live-read back the complete result before readiness.

## 9. Merge/post-merge gate

Merge only the exact reviewed head, preferably squash for iterative branches. After merge verify:

- PR closed/merged;
- `main` exact merge SHA/tree;
- merged-main `validate` success;
- required policy/ownership/dependency files still present;
- active repository ruleset still requires the intended checks.

Do not start the next milestone slice until post-merge verification passes.
