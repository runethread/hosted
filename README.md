# Runethread Hosted

Cloud-hosted Runethread memory-delivery control plane for Phase 2.6.

**Status:** the locked developer toolchain, fail-closed non-operational Worker shell, non-publishing release-identity baseline, and source-only Hosted API boundary are established. No production hosted mutation endpoint, Cloudflare deployment, Durable Object namespace, R2 bucket, GitHub App credential, publication capability, production route, or release is implemented or authorized by this repository state.

## Responsibility

`runethread/hosted` owns provider-specific delivery and control-plane code. It must not become a second semantic memory engine.

The user-owned private GitHub repository remains canonical semantic state. `runethread/core` remains the sole implementation of deterministic memory mutation, repository validation, index generation, and mutation commit construction. Hosted code is limited to the control-plane responsibilities defined by the accepted Phase 2.6 architecture.

The historical bootstrap architecture pin is documented in [`docs/ARCHITECTURE_BASELINE.md`](docs/ARCHITECTURE_BASELINE.md). Before substantive work, live-fetch the current accepted Core ADRs and `RUNETHREAD_INVARIANTS.json`; the bootstrap pin is orientation, not authority over later accepted Core decisions.

## Development

Before changing this repository, read [`AGENTS.md`](AGENTS.md), [`docs/ENGINEERING_PROCESS.md`](docs/ENGINEERING_PROCESS.md), [`docs/DEVELOPMENT_PIPELINE.md`](docs/DEVELOPMENT_PIPELINE.md), and [`docs/CURRENT_MILESTONE.md`](docs/CURRENT_MILESTONE.md).

The admitted developer toolchain is exact and lockfile-based. Validation runs the policy guard plus the supported Worker runtime test integration on Linux, macOS, and Windows. The shell intentionally returns HTTP 503 and has no bindings, secrets, storage, publication authority, deploy script, or provider resource.

ADR-026 establishes **PolyForm Perimeter 1.0.1 as the prospective Hosted implementation default**; the repository's earlier MIT grants remain historical and are preserved in [`LICENSE-MIT`](LICENSE-MIT). Hosted has no prospective MIT interoperability exception of its own. See [`LICENSING.md`](LICENSING.md).

The non-publishing release-identity baseline is established in [`release/identity-policy.json`](release/identity-policy.json) and consumes the project-wide ADR-028/Core versioning authority. The source-only logical request/status/cancel contract and authorization/binding boundary are defined in [`docs/API_BOUNDARY.md`](docs/API_BOUNDARY.md); they do not make the Worker operational or change the release capability flags. The next implementation gate is sealed-request persistence plus the provider primitive proof needed before durable acceptance/coordinator work. This repository state does not authorize release publication or production deployment.
