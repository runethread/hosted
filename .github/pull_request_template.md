## Summary

<!-- What changes, and why? -->

## Change classification

Check every class that applies.

- [ ] Development infrastructure / CI / engineering policy
- [ ] Documentation-only / non-normative
- [ ] Dependency / TypeScript / Node / Cloudflare toolchain
- [ ] Hosted protocol / public API
- [ ] Authentication / repository authorization
- [ ] Durable Object state / SQLite schema / alarms
- [ ] R2 / evidence / safety journal
- [ ] Finalizer / auditor / terminal verifier
- [ ] GitHub App / publisher / webhook / ref publication
- [ ] Security / privacy / secrets / logging / retention
- [ ] Release / deployment / provider configuration
- [ ] Core architecture / runtime identity dependency

## Verified baseline

- Hosted base `main` SHA: `...`
- Branch/head SHA reviewed: `...`
- Core architecture SHA/tree verified: `...`
- Active hosted ruleset / required checks: `...`
- Current provider/toolchain documentation verified where relevant: `...`

## Scope-boundary decision

- [ ] Every changed file belongs to the declared purpose.
- [ ] Hosted code does not reimplement Core memory semantics.
- [ ] No provider resource, permission, secret, deployment, or production capability was added implicitly.
- [ ] If scope changed materially, exploratory work was preserved and final work restarted from a clean verified base rather than hidden by force-push.

## Impact matrix

| Surface | Impact / evidence |
| --- | --- |
| Development pipeline / required checks | |
| Hosted request/status/cancel protocol | |
| Authentication / caller authorization | |
| Repository/App/canonical-ref/private binding | |
| DO lane/queue/phase-generation/alarms | |
| R2 sealed request/evidence storage | |
| ADR-024 safety journal / recovery barrier | |
| ADR-023 terminal disposition | |
| Core/runtime/contract identity | |
| Candidate/finalizer behavior | |
| ADR-020/021/022 independent verification | |
| Publisher / GitHub App permissions / exact-CAS | |
| ADR-018/025 ambiguity/quiescence/reconciliation | |
| Security / privacy / logs / retention | |
| Release/deployment/version skew | |
| User-owned canonical Git/data | |

## Failure modes / adversarial review

<!-- Crashes, lost responses, duplicates, retries, stale generation, PITR, cancellation races, permission loss, privacy change, ref races, ambiguous publication, provider outage, version skew, etc. -->

For architecture/protocol/security/state changes, confirm the full exact-head attack was completed and **all material findings were enumerated before corrections**.

## Dependency/toolchain gate

- [ ] No dependency/toolchain change, or authoritative current support docs were rechecked.
- [ ] `package.json` + lockfile are updated together when dependencies exist.
- [ ] Direct versions are exact and the package is non-publishable.
- [ ] Dependency/advisory/license and platform implications were reviewed.

## Mandatory pipeline on exact head

- [ ] `git diff --check`
- [ ] policy guard compiles
- [ ] policy guard self-tests pass
- [ ] policy guard passes
- [ ] required TypeScript/Workers/cross-platform tests pass when applicable
- [ ] aggregate `validate` passes on exact head

Evidence / exact SHA:

## Review hygiene

- [ ] Canonical changed-file list and patch reviewed.
- [ ] Actions are full-SHA pinned; validation is read-only.
- [ ] Comments/reviews/threads checked.
- [ ] Base movement rechecked.
- [ ] No unexplained file or temporary workflow remains.

## Release / deployment plan

<!-- Explicitly state none, or the exact separate release/deployment gate. -->

## Remaining concerns / uncertainty
