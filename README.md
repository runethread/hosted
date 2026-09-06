# Runethread Hosted

Cloud-hosted Runethread memory-delivery control plane for Phase 2.6.

**Status:** repository bootstrap and provider/toolchain preflight. No production hosted mutation endpoint, Cloudflare deployment, Durable Object namespace, R2 bucket, GitHub App credential, or publication capability is implemented or authorized by this repository state.

## Responsibility

`runethread/hosted` owns provider-specific delivery and control-plane code. It must not become a second semantic memory engine.

The user-owned private GitHub repository remains canonical semantic state. `runethread/core` remains the sole implementation of deterministic memory mutation, repository validation, index generation, and mutation commit construction. Hosted code is limited to authentication, authorization, delivery, serialization, evidence, recovery, independent verification, publication, and provider lifecycle responsibilities defined by the accepted Phase 2.6 architecture.

The bootstrap architecture baseline is the accepted `runethread/core` tree at commit [`22995a7cf7d1c6c0f4ce548fd83667468b356f42`](https://github.com/runethread/core/commit/22995a7cf7d1c6c0f4ce548fd83667468b356f42), including the governing ADR-012 through ADR-025 safety sequence. See [`docs/ARCHITECTURE_BASELINE.md`](docs/ARCHITECTURE_BASELINE.md).

## Development

Before changing this repository, read [`AGENTS.md`](AGENTS.md), [`docs/ENGINEERING_PROCESS.md`](docs/ENGINEERING_PROCESS.md), [`docs/DEVELOPMENT_PIPELINE.md`](docs/DEVELOPMENT_PIPELINE.md), and [`docs/CURRENT_MILESTONE.md`](docs/CURRENT_MILESTONE.md).

The current bootstrap validation is intentionally dependency-free. The repository was initially published under MIT, but that is not the settled long-term licensing/commercial model. A dedicated reviewed licensing decision must land before the first hosted runtime source or Worker shell is merged. After that gate, the TypeScript/Cloudflare dependency lock and non-operational runtime shell proceed as a separate reviewed preflight so this repository does not begin with an unreviewed or non-reproducible dependency graph.
