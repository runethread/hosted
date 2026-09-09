# Runethread Hosted agent instructions

This file applies to every automated coding agent, AI assistant, scripted developer agent, and future autonomous worker modifying `runethread/hosted`.

## Mandatory entry condition

Before any substantive write, an agent MUST read and follow:

1. `docs/ENGINEERING_PROCESS.md`;
2. `docs/DEVELOPMENT_PIPELINE.md`;
3. `docs/CURRENT_MILESTONE.md`;
4. `docs/ARCHITECTURE_BASELINE.md`;
5. `LICENSING.md`;
6. `release/identity-policy.json` when the change can affect build/release/runtime compatibility identity;
7. the current protected `runethread/core/RUNETHREAD_INVARIANTS.json` and relevant accepted Core ADRs from freshly verified live state;
8. the current PR template and active repository ruleset/check surface;
9. current authoritative provider/toolchain documentation when the change relies on provider behavior or version support.

Record the exact Core invariant-authority commit used for a substantive change. Scope means applicability, not proof: Hosted must evaluate its own source against applicable invariant IDs and must not copy a competing project registry.

Conversation history and handoffs are orientation only. If live GitHub state, current Core authority, release identity policy, or provider documentation contradicts the plan, stop writes and resolve the discrepancy first.

## Decision discipline

For a material recommendation or implementation choice, identify the actual project objective, test whether the proposal materially advances it, distinguish evidence from agreement-seeking or novelty, state meaningful costs/attack surface/coupling/lock-in, consider a simpler alternative, and check accepted ADRs plus active invariants. If unresolved material ambiguity could change the decision, seek clarification rather than silently choosing. `No change` is valid.

## Non-negotiable rules

- Verify exact `main`, intended branch/base, active PR, rulesets, and owning files before editing.
- Never write directly to `main`. Use a dedicated branch and draft PR. Do not force-push ordinary development history.
- Classify every material change and state invariant impact explicitly.
- Hosted code MUST NOT reimplement Core memory semantics. If semantic mutation rules must change, stop Hosted work and change Core/architecture under its gates.
- Provider/toolchain choices remain Hosted implementation decisions unless a separately reviewed Core governance change says otherwise.
- No plaintext private memory, GitHub tokens, App private keys, Cloudflare secrets, or unrestricted provider error payloads belong in Git, ordinary logs, client-visible status, or rollback journal records.
- Do not create or deploy Cloudflare resources, GitHub Apps, credentials, publication capabilities, releases, or production routes as a side effect of development.
- Validation workflows are read-only. They do not repair or push source.
- All `uses:` references in required GitHub Actions workflows are pinned to immutable full commit SHAs. Do not use `pull_request_target` for ordinary validation.
- ADR-026 is the settled licensing decision: PolyForm Perimeter 1.0.1 is the prospective Hosted default, Hosted has no prospective MIT exception, historical MIT grants remain intact, and Core's MIT interoperability boundary does not spill into Hosted.
- Treat license changes as prospective governance changes: existing grants remain governed by the terms under which those bytes were published; user-owned data is outside Runethread's software-license grants.
- Keep `package.json` and `package-lock.json` together, `private: true`, exact direct versions, clean lockfile installation, committed Wrangler-generated Env types, and cross-platform Worker-runtime tests.
- `release/identity-policy.json` is the admitted Hosted release-compatibility baseline. Correctness-relevant Core/runtime/toolchain/provider identities must be immutable values there, never floating development refs.
- `scripts/release_identity.mjs` may build only through credential-stripped Wrangler dry-run with provisioning/auto-create disabled. The admitted baseline has `publication_enabled: false`; changing that is a separate release-publication decision and must not ride with ordinary implementation.
- CI uses reserved version `v0.0.0-ci` only to prove release-identity machinery. It is not a Hosted product release.
- A generated release-instance manifest binds source commit/tree, policy identity, Core/runtime/contract identity, provider/build inputs, executable Worker digest, protocol/capability state, and required notice-file digests. It does not by itself prove protected-branch/ruleset/status-check state.
- Any future release-publication mechanism must independently prove the candidate is the intended current protected `main` commit and that required `validate` evidence belongs to that exact commit before publishing.
- Protocol/capability identities that do not exist yet remain explicitly `not_implemented`/false. Do not invent future v1 identities merely to make the release manifest look complete.
- The admitted shell has no deploy/dev script, provider binding, route, secret, persistence, mutation authority, or publication authority. Expanding those surfaces is a later reviewed gate.
- Treat provider assumptions as time-sensitive and re-check authoritative documentation at the implementation decision point.
- A green CI run proves only its exact SHA and tested assertions. For workflow/guard/policy or other safety-sensitive changes, perform the complete exact-head adversarial cycle; enumerate all material findings before correcting any.
- Merge only the exact reviewed head and verify merged-main CI before starting the next gated phase.

When required evidence cannot be proved, fail closed and report the uncertainty rather than silently substituting a weaker process.
