# Repository runtime and safety-journal foundation

This source-only foundation implements the first permanent ADR-019/024 storage
mechanisms. It is not operational admission or complete repository recovery.
The production entry point and Wrangler configuration remain unchanged: public
requests still receive HTTP 503 / `not_operational`.

## Authority and classification

Core invariant/ADR authority consumed: `60a5f5c83ac740e26d4f11db99de66fa7b8c914d`.
The normative decisions are Core ADR-014, ADR-016, ADR-019, ADR-024 and ADR-025.
This document describes implementation scope; it does not replace those ADRs.

The real-provider prerequisites have two distinct evidence records:

- [Core issue #20, R2 primitive proof](https://github.com/runethread/core/issues/20#issuecomment-5602745725):
  real conditional-create race, immediate exact read-back, SHA-256/metadata
  verification, exact idempotent retry, corrupt deterministic collision rejection,
  and lost-successful-write-response proof.
- [Core issue #20, later provider closeout](https://github.com/runethread/core/issues/20#issuecomment-5604828694):
  journal-prefix pagination and listing visibility, SQLite transaction rollback,
  real PITR, failed-alarm retry, cleanup and provider-preflight closeout.

The implementation uses the installed provider declarations and the
[SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
and [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
Local rollback tests simulate an older SQLite snapshot; they do not replace the
real PITR evidence in issue #20.

This is a security-sensitive protocol, persistent-state and test-surface change.
Applicable invariant impact:

- RT-ARCH-001: provider code stays in Hosted.
- RT-ARCH-002: source schema and journal serialization are explicit and strict.
- RT-DATA-001: only operational binding/checkpoint metadata is persisted.
- RT-GOV-001: a bounded foundation avoids speculative operation/publication schemas.
- RT-REL-001: records bind an exact Hosted release-manifest SHA-256, Core runtime
  commit, contract version and runtime/journal schema versions.
- RT-SEM-001: no request interpretation or Core mutation logic is added.

There are no dependency, distribution-notice or publication changes.
No third-party code is vendored. Existing development dependencies stay unchanged.

## Concrete source protocol

Keys are
`safety-journal/v1/repositories/<repository-id>/epochs/<UUID-v4>/records/<10-digit-sequence>.json`.
Sequences start at zero and never wrap. The source protocol admits only
`EPOCH_OPEN` and `RECOVERY_BARRIER` in this slice. Acceptance, cancellation,
anchors, publication, evidence and terminal-disposition records are deliberately
unsupported and fail closed rather than being interpreted as generic payloads.

Canonical bytes are UTF-8 JSON with the exact property order emitted by
`prepareRecord`, followed by one LF. They contain no optional fields. Recovery
rejects extra/missing fields, duplicate fields, alternate encodings/order,
unsupported identities, wrong scope and wrong predecessor hashes. SHA-256 binds
the exact stored bytes, not a parsed approximation. Epoch opening contains the
immutable installation ID and full canonical ref; a barrier contains a fresh
UUID recovery identity. Neither accepts an arbitrary metadata/log/body field.

Hard source limits are 4 KiB per record, 10,000 records and 16 MiB per epoch.
The record limit may bind before the byte limit. Status surfaces 90% usage based
on verified state. A new barrier must fit the remaining budget; exhaustion leaves
the object in maintenance. There is no delete, compaction, rotation, mutable-head
or skip-a-collision API. These constants require explicit review before deployment.

`R2SafetyJournal` is a private capability adapter. It writes only the caller's
fixed key/bytes with `If-None-Match: *` and SHA-256 checksum, and never selects a
successor. Read-back verifies exact bytes even after an ambiguous create response.
Listing follows every cursor, rejects duplicates/gaps/unrecognized keys and
checks every predecessor. Object size is checked before buffering its body.

## SQLite owner and crash behavior

`RepositoryRuntime` owns one SQLite singleton containing schema version, bound
repository/epoch/release, opening identity, generation, phase, pending exact
append, verified checkpoint, byte count and retry time. It has no operational
queue or operation executor yet. Future production routing must select exactly
one DO by immutable repository ID, independent of binding epoch; this slice has
no namespace or routing configuration.

SQLite JSON is decoded synchronously before state-machine interpretation. The
decoder requires the exact v1 fields, supported phase, positive safe generation,
valid scope/binding and correctly shaped pending/checkpoint/byte-count/retry fields.
Pending metadata must agree with the runtime scope, deterministic key and binding.
Opening requires generation 1 and a sequence-zero opening claim with no checkpoint
or accumulated bytes; scanning has no pending claim; barrier/verifying require a nonzero barrier
claim; verified has a nonzero checkpoint and neither pending work nor a retry;
blocked never drives. Writes also validate before persistence, including generation
increments. Unknown or malformed states are rejected without journal I/O or a new
checkpoint. Phase dispatch explicitly names verifying and rejects other phases.

These checks establish only local structure and phase consistency. They do not
authenticate pending bytes or certify an external tail. The existing asynchronous
journal verifier checks canonical bytes and SHA-256, including agreement with the
pending record metadata, before external journal I/O. A structurally valid older
checkpoint remains admissible for explicit recovery and complete-tail reconciliation.

Initialization is an internal fresh-enrollment prerequisite, not enrollment
authority. Its caller must supply a fresh non-reused UUID epoch and independently
verified binding/release identity. It cannot replace an existing local binding.
No public adapter calls it. Existing history is verified before replaying an
opening claim so a surviving suffix cannot have a missing opening silently filled
in. A pending fresh-enrollment opening may retry idempotently after a crash.
Explicit destructive recovery always enters scanning and discards the old pending
claim, even when restored SQLite says `opening`. It requires existing exact
journal history; an empty or missing active epoch blocks without recreating
sequence zero. Fresh-enrollment retry is not a destructive-recovery fallback.

A fresh opening retry may observe an empty journal or exactly its own sequence-zero
record. Both retain exact idempotent opening behavior in generation 1. A matching
opening followed by valid successors positively identifies stale SQLite state.
Likewise, generation-1 scanning belongs to fresh initialization: successors beyond
the opening prove that state is stale, including a successor becoming visible after
the preceding opening drive. Both detections use the same transition as explicit
recovery: increment/fence generation, discard the stale pending claim, enter scanning
and schedule the existing wakeup. The detecting drive returns without appending or
planning a barrier. A subsequent recovery scan verifies the complete tail before
planning the next barrier. Scanning at a recovery generation is not classified as
fresh scanning merely because successors exist. No persistent field is added.

All external appends have exact bytes/digest persisted before I/O. One in-memory
driver suppresses concurrent execution, while persisted phase/generation and
pending-digest comparisons reject stale completions. External I/O is outside
`blockConcurrencyWhile`; that method only initializes local storage and repairs
its alarm. A lost response retries the same claim. Unproven transient outcomes
remain pending with a persisted 30-second retry and repaired alarm. Normal
foundation steps schedule the next wakeup after one second. This is recovery
scheduling, not an acceptance or publication deadline.

Recovery scans the entire external chain, persists the next barrier claim, wins
conditional create, then scans the entire chain again. A valid competing delayed
successor triggers another full scan before planning a later barrier. Invalid
collisions block. The final scan must end at the exact winning barrier, with no
successor. Ordinary isolate eviction/reactivation preserves SQLite phase,
generation, checkpoint and pending claim, repairs any required alarm and resumes
the already-pending foundation step. Activation alone never initiates another
complete-tail recovery scan or consumes another recovery barrier. Starting a new
destructive recovery requires an explicit request or positive stale-opening or
stale fresh-scanning evidence, which invoke the same recovery boundary.

`verified` means only that the journal barrier has been proved. Lane status remains
`MAINTENANCE` in every state. It does not certify current GitHub privacy/access/ref,
reconstruct operations, repair an operational queue, authorize publication or
discharge ADR-025 remote-completion obligations. A journal fence cannot fence an
already-admitted GitHub request. No timer, operator call or recovered generation
can open a lane through this foundation.

## Compatibility and next gates

The class is not exported by the production Worker, and has no configured private
capability. Only `test/runtime_worker.ts` supplies local R2 and SQLite wiring through
the Vitest configuration. Production `wrangler.jsonc`, generated types, dependency
lockfile, release identity policy and executable Worker bytes remain unchanged.
The release policy's `not_implemented` runtime/journal slots and false durable-state
capability still describe the emitted public artifact accurately. Source version
constants do not claim an operational released v1 protocol.

A later owning change must add reviewed record schemas, live binding verification,
the bounded operation queue and full ADR-019 reconstruction before enabling normal
work. It must extend the release compatibility policy when the runtime is actually
included in the emitted Worker. Incompatible release digests or protocol schemas
are rejected; no automatic upgrade/reinterpretation path exists here.

Cloudflare account/provider/storage integrity and availability remain inside the
v1 TCB. This design is neither zero-knowledge nor resistant to malicious full
provider/account compromise. Evidence retention and role-scoped wiring must remain
under the accepted ADRs when operational capabilities are added.

## Validation and review

Tests cover canonical bytes, scope/version mismatch, lost create responses,
different-byte collisions, complete pagination, gaps/duplicates/cursor loops,
limits, local R2 no-overwrite, durable SQLite claims, missing-alarm repair,
activation without an extra barrier, pending-step alarm repair, simulated rollback
with a wholly missing external epoch, stale generations, delayed-writer races and
unexpected successors above a winning barrier. Existing public-shell tests remain.
Adversarial SQLite tests cover unknown phases, opening claims in barrier/verifying,
sequence-zero checkpoints, missing fields, malformed types/identities, impossible
pending combinations and generation overflow. The lost-local-transition regression
replays an already-created exact barrier after reactivation, verifies its read-back,
and proves replay allocates no successor.
Rollback regressions restore both fresh opening and fresh scanning snapshots and
prove detection fences their generation without an append before later recovery.
Tests also cover a successor arriving between those two fresh steps, exact
sequence-zero-only replay and rejection of later-generation opening before I/O.

Full-surface adversarial review must include the test entry-point override and
the corresponding exact policy hash/allowed-file additions, not only source code.
No production binding or release guard is relaxed to make tests pass.
