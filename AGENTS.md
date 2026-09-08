# Runethread Hosted agent instructions

This file applies to every automated coding agent, AI assistant, scripted developer agent, and future autonomous worker modifying `runethread/hosted`.

## Mandatory entry condition

Before any substantive write, an agent MUST read and follow:

1. `docs/ENGINEERING_PROCESS.md`;
2. `docs/DEVELOPMENT_PIPELINE.md`;
3. `docs/CURRENT_MILESTONE.md`;
4. `docs/ARCHITECTURE_BASELINE.md`;
5. `LICENSING.md`;
6. the current protected `runethread/core/RUNETHREAD_INVARIANTS.json` and relevant accepted Core ADRs from freshly verified live state;
7. the current PR template and active repository ruleset/check surface;
8. current authoritative provider/toolchain documentation when the change relies on provider behavior or version support.

Record the exact Core invariant-authority commit used for a substantive change. Scope means applicability, not proof: Hosted must evaluate its own source against applicable invariant IDs and must not copy a competing project registry.

Conversation history and handoffs are orientation only. If live GitHub state, current Core authority, or provider documentation contradicts the plan, stop writes and resolve the discrepancy first.

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
- The admitted shell has no deploy/dev script, provider binding, route, secret, persistence, mutation authority, or publication authority. Expanding those surfaces is a later reviewed gate.
- Treat provider assumptions as time-sensitive and re-check authoritative documentation at the implementation decision point.
- A green CI run proves only its exact SHA and tested assertions. For workflow/guard/policy or other safety-sensitive changes, perform the complete exact-head adversarial cycle; enumerate all material findings before correcting any.
- Merge only the exact reviewed head and verify merged-main CI before starting the next gated phase.

When required evidence cannot be proved, fail closed and report the uncertainty rather than silently substituting a weaker process.
