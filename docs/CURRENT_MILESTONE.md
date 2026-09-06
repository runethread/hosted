# Current milestone — hosted repository preflight

Status: **In progress**

## Goal

Establish `runethread/hosted` as a safe, independently reviewable provider-specific repository before hosted runtime implementation begins.

Architecture authority is the accepted Phase 2.6 design in `runethread/core`, bootstrapped from exact Core commit `22995a7cf7d1c6c0f4ce548fd83667468b356f42` / tree `ef1d3c6a4e8a783cc0657b15a61703a5fa52d6d9` and ADR-012 through ADR-025.

## This slice

1. repository identity and the currently published MIT bootstrap-license state, without treating the long-term licensing/commercial model as frozen;
2. agent/process/development-pipeline policy;
3. CODEOWNERS, PR review template, Dependabot for Actions, LF-stable text;
4. read-only SHA-pinned validation workflow with policy self-tests;
5. active `main` ruleset requiring PR + strict `validate` and blocking destructive ref updates **before** bootstrap merge;
6. exact-head merge/post-merge verification.

## Explicit non-goals

This bootstrap slice does NOT:

- choose the long-term Runethread licensing/commercial model;
- deploy a Worker;
- create a Durable Object namespace or schema;
- create R2/evidence storage;
- create a GitHub App/webhook;
- store any secret;
- expose an authenticated mutation API;
- implement the safety journal;
- implement finalizer/auditor/verifier/publisher code;
- implement or duplicate Core memory semantics.

## Exit criteria

- exact bootstrap PR passes `validate`;
- canonical diff contains only declared repository/process/pipeline files;
- repository ruleset is active before merge with required PR/strict-`validate`/no destructive ref update/no ordinary bypass behavior;
- exact reviewed head is merged with expected-head protection;
- post-merge `main` validation passes;
- Core tracking issue records the hosted repository/bootstrap boundary;
- no provider resource or production deployment was created.

If the intended ruleset cannot be activated before merge, the bootstrap remains blocked rather than accepting an avoidable unprotected-`main` window.

## Gated work after bootstrap

Before the first hosted runtime source/Worker shell is merged, make and record the dedicated Runethread licensing/commercial-model decision. The repository was initially published under MIT, but that is not a settled long-term project invariant. Future licensing must be chosen deliberately rather than inherited accidentally from repository creation.

After that decision, introduce the reproducibly locked TypeScript/Cloudflare developer toolchain and a fail-closed non-operational Worker shell using current authoritative Cloudflare guidance. That dependency/toolchain PR must add lockfile-based install, generated Worker type verification, runtime tests, cross-platform developer-toolchain CI, and npm Dependabot.

Core implementation-sequence step 3 is not complete merely because development CI exists. Before auth/API implementation begins, establish an independently reviewed hosted release-identity/release-pipeline baseline that pins what can become a hosted release while keeping deployment disabled until its later security/deployment gate.

Only after those gates pass proceed to the accepted implementation sequence: authenticated transport-neutral request/status/cancel boundary, caller-to-App-installation repository authorization, immutable repository/canonical-ref/private-visibility binding, and sealed request persistence.
