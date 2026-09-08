# Runethread Hosted licensing

`runethread/hosted` follows ADR-026's **PolyForm Perimeter 1.0.1 implementation default**. This repository has no prospective MIT interoperability exception of its own.

## Current default

Runethread-authored Hosted material for which the applicable licensor controls the necessary rights is offered under the **PolyForm Perimeter License 1.0.1** in public repository snapshots whose root `LICENSE` is that Perimeter license, and on protected `main` after the reviewed Hosted transition merges, unless a later explicit reviewed file or boundary says otherwise. See [`LICENSE`](LICENSE).

The current stated licensor for that newly offered Runethread-owned material is **George Karageorgiou**. GitHub repository or organization ownership is not itself proof of copyright ownership or a relicensing grant.

Core's exact MIT interoperability boundary does **not** automatically extend into `runethread/hosted`. A future Hosted MIT exception would require an explicit reviewed licensing decision; none exists today.

## Historical MIT grant

This repository was initially published under MIT. [`LICENSE-MIT`](LICENSE-MIT) preserves the exact historical root license text that applied before the Perimeter transition.

The transition is prospective. It does not revoke, narrow, or rewrite rights already granted for Hosted bytes distributed under MIT. In particular, unchanged historical material may still carry rights recipients previously received under MIT. New Runethread-authored Hosted changes are not automatically MIT merely because they descend from an earlier MIT revision.

`LICENSE-MIT` is a historical-license record, **not** a prospective MIT grant for new Hosted work.

## User data

Runethread's software licenses do not grant Runethread ownership or software-license rights in user-authored memories, project content, imports, attachments, or other user-owned data merely because Hosted transports, stores, verifies, indexes, or processes that data.

## Distribution notices

Any post-transition Hosted source or build artifact distributed under Perimeter must provide recipients the applicable Perimeter terms or URL and every `Required Notice:` supplied with the software. Bundled Core or third-party material retains its own applicable notice obligations; satisfying those obligations does not create a prospective MIT exception for Hosted source. A Hosted release/distribution pipeline must prove the required notice material is delivered before publishing an artifact.

## Commercial model

Perimeter-covered Hosted implementation is source-available, not OSI-approved open source. The applicable rightsholder may monetize Runethread through hosted services, subscriptions, advertising, sponsorship, support, partnerships, separate commercial licenses, or other models.

The software licenses govern licensed Runethread material; they do not create copyright protection for ideas, facts, functionality, or independently created compatible implementations.

## Contributions and rights

Before material third-party Hosted source contributions are merged, Runethread must adopt an explicit inbound-rights policy appropriate to the intended licensing and commercial model. Repository ownership, merge access, commit metadata, or a DCO-style origin statement alone must not be treated as an automatic relicensing grant.

## Transition scope

This licensing transition changes repository governance and the default license for future Runethread-owned Hosted work. It does **not** add or authorize a Worker, Durable Object, R2 bucket, GitHub App, provider credential, deployment, publication capability, runtime source, or production route.

The public development-branch boundary is explicit: commit `fd4928859aaa0ff7105330686daa10217f2952f2` is the first Hosted branch snapshot whose root `LICENSE` is PolyForm Perimeter 1.0.1. Its parent, protected-main commit `ca2282eafca03573ac9c88277125cc6973234959`, still has the historical MIT root license. Earlier public snapshots remain governed by the terms under which they were distributed. From `fd4928859aaa0ff7105330686daa10217f2952f2` onward, newly offered Runethread-owned Hosted material in those branch snapshots follows the Perimeter root to the extent the applicable licensor controls the necessary rights.

The protected `main` merge of the reviewed transition is the canonical Hosted default-license boundary for `main`.

## Legal review

ADR-026 and this file are engineering/product-governance decisions, not legal advice. Material commercial contracts, corporate rights transfers, enforcement, or other high-consequence legal action should receive qualified legal review for the applicable jurisdiction.
