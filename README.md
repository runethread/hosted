# Runethread Hosted

Cloud-hosted Runethread memory-delivery control plane for Phase 2.6.

**Status:** repository bootstrap and provider/toolchain preflight. No production hosted mutation endpoint, Cloudflare deployment, Durable Object namespace, R2 bucket, GitHub App credential, or publication capability is implemented or authorized by this repository state.

## Responsibility

`runethread/hosted` owns provider-specific delivery and control-plane code. It must not become a second semantic memory engine.

The user-owned private GitHub repository remains canonical semantic state. `runethread/core` remains the sole implementation of deterministic memory mutation, repository validation, index generation, and mutation commit construction. Hosted code is limited to authentication, authorization, delivery, serialization, evidence, recovery, independent verification, publication, and provider lifecycle responsibilities defined by the accepted Phase 2.6 architecture.

The bootstrap architecture baseline is the accepted `runethread/core` tree at commit [`22995a7cf7d1c6c0f4ce548fd83667468b356f42`](https://github.com/runethread/core/commit/22995a7cf7d1c6c0f4ce548fd83667468b356f42), including the governing ADR-012 through ADR-025 safety sequence. See [`docs/ARCHITECTURE_BASELINE.md`](docs/ARCHITECTURE_BASELINE.md).

## Development

Before changing this repository, read [`AGENTS.md`](AGENTS.md), [`docs/ENGINEERING_PROCESS.md`](docs/ENGINEERING_PROCESS.md), [`docs/DEVELOPMENT_PIPELINE.md`](docs/DEVELOPMENT_PIPELINE.md), and [`docs/CURRENT_MILESTONE.md`](docs/CURRENT_MILESTONE.md).

The current validation remains intentionally dependency-free until the next reviewed toolchain slice. ADR-026 establishes **PolyForm Perimeter 1.0.1 as the prospective Hosted implementation default**; the repository's earlier MIT grants remain historical and are preserved in [`LICENSE-MIT`](LICENSE-MIT). Hosted has no prospective MIT interoperability exception of its own. See [`LICENSING.md`](LICENSING.md).

No runtime/Worker source is authorized by the licensing transition itself. After the protected licensing transition is complete, the next separate gate is the reproducibly locked TypeScript/Cloudflare developer toolchain plus a fail-closed non-operational Worker shell.
