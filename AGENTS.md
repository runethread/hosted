# Runethread Hosted agent instructions

This file applies to every automated coding agent, AI assistant, scripted developer agent, and future autonomous worker modifying `runethread/hosted`.

## Mandatory entry condition

Before any substantive write, an agent MUST read and follow:

1. `docs/ENGINEERING_PROCESS.md`;
2. `docs/DEVELOPMENT_PIPELINE.md`;
3. `docs/CURRENT_MILESTONE.md`;
4. `docs/ARCHITECTURE_BASELINE.md`;
5. `LICENSING.md`;
6. the relevant accepted ADRs in `runethread/core` from a freshly verified live repository state;
7. the current PR template and active repository ruleset/check surface.

Conversation history and handoffs are orientation only. If live GitHub state, the accepted Core architecture, or provider documentation contradicts the plan, stop writes and resolve the discrepancy first.

## Non-negotiable rules

- Verify exact `main`, intended branch/base, active PR, rulesets, and the files that own the behavior before editing.
- Never write directly to `main`. Use a dedicated branch and draft PR.
- Do not force-push or rewrite ordinary development history.
- Keep one logical writer per branch and make small coherent commits.
- Classify changes before editing: development pipeline, dependency/toolchain, hosted protocol/API, provider configuration, Durable Object state/schema, journal/evidence, authentication/authorization, GitHub App permissions, finalizer/auditor/publisher, release/deployment, licensing/commercial-model governance, security/privacy, or Core architecture.
- Hosted code MUST NOT reimplement Core memory semantics. If a task requires changing semantic mutation rules, stop hosted work and move the design/change to `runethread/core` under its contract/version gates.
- No plaintext private memory, GitHub tokens, App private keys, Cloudflare secrets, or unrestricted provider error payloads belong in Git, ordinary logs, client-visible status, or rollback journal records.
- Do not create/deploy Cloudflare resources, GitHub Apps, credentials, publication capabilities, or production routes as a side effect of unrelated implementation.
- Validation workflows are read-only. They do not repair or push source.
- All `uses:` references in required GitHub Actions workflows are pinned to immutable full commit SHAs.
- Do not use `pull_request_target` for ordinary validation.
- ADR-026 is the settled licensing decision: after the protected Hosted transition, PolyForm Perimeter 1.0.1 is the prospective Hosted default, Hosted has no prospective MIT exception, historical MIT grants remain intact, and Core's MIT interoperability boundary does not spill into Hosted.
- If dependencies are introduced, commit the package lock in the same change, keep the service package non-publishable, and review current authoritative provider/toolchain support before selecting versions.
- Treat license changes as prospective governance changes: existing grants remain governed by the terms under which those bytes were published; user-owned data is outside Runethread's software-license grants.
- Treat provider assumptions as time-sensitive. Re-check Cloudflare/GitHub documentation at the implementation decision point instead of relying on old notes.
- A green CI run proves only its exact SHA and tested assertions. Perform the negative/failure review required by the engineering process.
- For adversarial review, enumerate ALL material findings against one exact head before making corrections. Apply the complete correction set together, then perform a fresh full review from scratch. Finding one issue does not terminate the attack pass.
- Merge only the exact reviewed head and verify merged-main CI before starting the next gated phase.

When required evidence cannot be proved, fail closed and report the uncertainty rather than silently substituting a weaker process.
