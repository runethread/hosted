## Summary

<!-- What changes, and why? -->

## Change classification

Check every class that applies.

- [ ] Development infrastructure / CI / engineering policy
- [ ] Dependency / TypeScript / Node / Cloudflare toolchain
- [ ] Licensing / commercial model / source-use boundary
- [ ] Documentation-only / non-normative
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
- Core invariant-authority commit verified: `...`
- Core architecture/current ADR state verified: `...`
- Active Hosted ruleset / required checks + expected status-check source: `...`
- Current provider/toolchain documentation verified where relevant: `...`

## Invariant impact

<!-- Consume the canonical Core registry; do not copy invariant statements here. -->

- Applicable invariant IDs: `...`
- [ ] Each applicable invariant is unchanged, strengthened, or explicitly reopened under its owning governance process.
- [ ] Provider/toolchain/version choices were not promoted into project invariants merely because they matter to this implementation.
- [ ] Scope means applicability, not proof: Hosted-local evidence is provided where Core CI cannot prove the Hosted property.

## Scope-boundary decision

- [ ] Every changed file belongs to the declared purpose.
- [ ] Hosted code does not reimplement Core memory semantics.
- [ ] No provider resource, permission, secret, deployment, release, or production capability was added implicitly.
- [ ] Temporary construction/evidence workflows or write credentials are absent from the final candidate.
- [ ] If scope changed materially, exploratory work was preserved and final work restarted/reviewed from a clean verified boundary rather than hidden by force-push.

## Impact matrix

| Surface | Impact / evidence |
| --- | --- |
| Development pipeline / required checks | |
| Dependency classification / lockfile | |
| Licensing / commercial model | |
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

For material pipeline/repository-policy/dependency/toolchain/CI-self-protection changes and architecture/protocol/security/state/release/licensing changes, confirm the full exact-head attack was completed and **all material findings were enumerated before corrections**.

## Licensing / commercial-model gate

- [ ] ADR-026 and `LICENSING.md` were checked; prospective Runethread-owned Hosted material remains under PolyForm Perimeter 1.0.1 unless an explicit reviewed exception applies.
- [ ] This change does not create a prospective Hosted MIT exception or import Core's MIT interoperability boundary unless an explicit reviewed licensing decision does so.
- [ ] Historical MIT grants remain intact; this change does not claim to revoke, narrow, or rewrite rights already granted for previously distributed bytes.
- [ ] User-authored memories, projects, imports, attachments, and other user-owned data are not treated as Runethread-licensed software merely because Hosted processes them.
- [ ] No material third-party Hosted source is merged without the explicit inbound-rights policy required by ADR-026 and `LICENSING.md`.
- [ ] Third-party dependencies are classified as development-only, metadata, bundled/deployed, vendored, or actually distributed; notice/rights obligations are evaluated for the real surface.
- [ ] No Hosted release/artifact is distributed, or packaging is verified to deliver the applicable Perimeter terms or URL + every `Required Notice:` and all notices required by actually bundled/distributed Core/third-party material.
- [ ] Commercial-use / redistribution implications were reviewed when this change affects licensing or source distribution.

## Dependency/toolchain gate

- [ ] No dependency/toolchain change, or authoritative current support docs were rechecked.
- [ ] `package.json` + `package-lock.json` are updated together when dependencies exist.
- [ ] Direct versions are exact, Node/npm identities are explicit, and the package is non-publishable.
- [ ] Clean install disables lifecycle scripts in required CI.
- [ ] Dependency advisory/license/platform implications were reviewed.
- [ ] Generated Worker Env types exclude unnecessary runtime declarations and drift checking passes.

## Mandatory pipeline on exact head

- [ ] `git diff --check`
- [ ] policy guard compiles
- [ ] policy guard self-tests pass
- [ ] policy guard passes
- [ ] Linux/macOS/Windows clean install + generated-type check + TypeScript + Workers-runtime tests pass
- [ ] aggregate `validate` passes on exact head

Evidence / exact SHA:

## Review hygiene

- [ ] Canonical changed-file list and patch reviewed.
- [ ] Actions are full-SHA pinned; required validation is read-only.
- [ ] For workflow/guard/policy changes, green CI was not treated as self-attestation; the exact-head workflow/guard patch was independently reviewed.
- [ ] Comments/reviews/threads checked.
- [ ] Base movement rechecked.
- [ ] No unexplained file or temporary workflow remains.

## Release / deployment plan

<!-- Explicitly state none, or the exact separate release/deployment gate. -->

## Remaining concerns / uncertainty
