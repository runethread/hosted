# Runethread Hosted development pipeline

Status: **Active project policy**

## 1. Current bootstrap gate

The initial repository bootstrap intentionally carries no Node/Cloudflare dependency graph or deployable hosted runtime. Until the dependency/toolchain PR lands, required validation is:

```text
git diff --check
python3 -m py_compile scripts/check_development_policy.py scripts/check_development_policy_test.py
python3 scripts/check_development_policy_test.py
python3 scripts/check_development_policy.py
```

The GitHub workflow must finish with a job named exactly `validate`.

## 2. CI self-protection

Required validation workflows MUST:

- use repository-level `permissions: contents: read` unless a separately reviewed job proves why narrower explicit additional permission is required;
- never use `pull_request_target` for ordinary validation;
- never commit/push repairs;
- pin every `uses:` Action to an immutable 40-hex commit SHA;
- reject `persist-credentials: true` in checkout;
- retain a final aggregate job named `validate`;
- run the development-policy guard and its negative self-tests.

## 3. Dependency/toolchain admission gate

When the TypeScript/Cloudflare toolchain is introduced, that same PR MUST:

- re-check current Cloudflare and Node support documentation;
- commit `package.json` and `package-lock.json` together;
- keep the package `private: true`;
- pin direct dependency/devDependency versions exactly rather than `latest`, wildcard, caret, or tilde ranges;
- use lockfile-based clean installation in CI;
- add generated Worker types and `wrangler types --check`;
- add TypeScript type checking;
- add Workers-runtime tests using the current supported Cloudflare testing integration;
- add Linux, macOS, and Windows validation where the selected developer toolchain is expected to work;
- update Dependabot for npm;
- review transitive dependency/advisory/license exposure;
- keep deployment disabled until a separate deployment/security gate is approved.

No unlocked dependency graph is accepted merely to bootstrap faster.

## 4. Durable Object/provider implementation gate

Before journal-dependent coordinator code lands, executable provider spikes must prove the exact primitives relied on by ADR-024/025, including real conditional-create races/lost responses, complete listing/pagination behavior, DO SQLite/PITR/recovery behavior, and any remote publication/quiescence assumptions needed by that implementation slice.

Spikes are evidence, not production shortcuts. A failed premise reopens the owning design before implementation continues.

## 5. Draft PR gate

Before readiness:

1. verify exact PR base/head and mergeability;
2. inspect the canonical changed-file list and patch;
3. confirm scope/classification for every file;
4. require exact-head `validate` success;
5. inspect comments, reviews, and review threads;
6. re-check base movement and provider premises;
7. perform required backward/forward/negative/security review.

## 6. Merge/post-merge gate

Merge only the exact reviewed head, preferably squash for iterative branches. After merge verify:

- PR closed/merged;
- `main` exact merge SHA/tree;
- merged-main `validate` success;
- required policy/ownership/dependency files still present;
- active repository ruleset still requires the intended checks.

Do not start the next milestone slice until post-merge verification passes.

## 7. Repository ruleset target

After the bootstrap workflow has landed on `main`, the repository must acquire an active ruleset equivalent to the Core safety posture:

- pull request required for `main`;
- strict required `validate` check;
- branch deletion blocked;
- non-fast-forward updates blocked;
- no ordinary bypass.

The current connector cannot create organization repository rulesets, so this external configuration is an explicit bootstrap exit criterion rather than something CI may pretend exists.
