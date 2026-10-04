# Instant free prose — Nexus 1.17.0

## Active reader

`runInstantTurnV2` uses the same streaming protocol decoder, writer-owned speaker bindings, adaptive typewriter and ordered paragraph queue as canon. It does not construct a Commit Graph transaction, extract Turn Delta, run event occurrence/closure adjudication, or evaluate an ending schedule. The minimal transaction object carries only publication metadata.

The first complete paragraph takes the fast path after deterministic explicit-term/protocol checking. Subsequent ready paragraphs are reviewed in order (same bounded batching as canon: up to four ready paragraphs / 900 characters; no fill delay). Audit scope is limited to explicit protected terms, malformed output, and clear contradictions against authored settings or public recent/long-term memory. The writer owns KEEP/minimal EDIT decisions. Premise-changing edits regenerate only unpublished continuation. Public prose is never retrospectively rewritten.

HUD runs after publication, independently of prose. A failed/malformed/ungrounded HUD response invokes the configured prose writer once for HUD repair. A second failure retains previous state; no closure/reveal receipt is required. A committed bit and its undo snapshot are still stored. Mid-stream failures preserve approved paragraphs as a partial committed bit, show an engine notice and allow the next input to continue. An opening failure before any publication leaves state unchanged. Existing persistence safeguards remain responsible for storage failures.

Memory remains the 1.16.4 policy: ten recent bits raw, ten-bit summaries up to 1,200 characters, independent approximately 5,000-character archives per twenty summaries. Canon keeps three-event summaries, without new recompression. Originals are not deleted.

## Compatibility boundary

Existing Instant V2 ZIPs, immutable package hashes, internal image/save keys, separate revision sessions, import/export and rewind remain unchanged. Old ending metadata is retained for round trips but is not consulted by the new reader. The old client runner was removed. The server's old `/api/simulate/stream` JSON transport and old reducer remain only for already-open legacy readers; the capabilities endpoint labels that boundary explicitly. Reload an already-open reader to activate the new path. Jieum's preflight uses the free context builder.

## Validation

Model responses are deterministic fixtures, not a claim of perfect semantic accuracy. Tests cover the actual imported package path, first-paragraph display while review is pending, hidden protocol and speakers, HUD fallback order, both-HUD-failure state preservation, truncated streams, editor KEEP, explicit-term opening repair, unpublished tail regeneration, memory generation/restart and rewind. Existing canonical execution and wrapper suites are also run. Live paid model behavior still varies by model; it is not certified by fixture tests.
