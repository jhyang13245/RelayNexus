# Cortex private-wire repair — Nexus 1.16.2

## Failure and scope

An author response used `⟦CORTEX_ST_V1 {...}-->` rather than the contracted HTML-comment envelope. The old decoder did not recognize that opener; malformed JSON was published and persisted as prose. Quote recovery subsequently annotated JSON field names as quotations. This was a transport/publication defect, not a reason to remove persistent identity keys.

The inner transport decoder and outer JSON filter now share reserved envelope boundaries. Mixed bracket/comment and HTML-escaped envelopes are quarantined across arbitrary stream chunks. Complete valid JSON can supply existing metadata; broken JSON is discarded as private transport, never inferred or promoted to prose. Missing terminators keep the unfinished control private. Ordinary bracketed prose, story JSON and numbered narration retain existing behavior.

Saved-state migration uses that same parser. It archives original prose and dialogue annotations in the turn's diagnostic repair log, removes leaked controls from active text and derived prompt strings, and relocates only literal dialogue quotes that survive the cleanup. JSON-derived quotes are removed, not assigned to a character. Original diagnostic adjudication logs and media remain unchanged. Migration is idempotent and does not replay event judgments or rewrite world state.

## Bounded unused-code removal

Removed `writerCommitGraphCatalogV210` and `publicCommitContextV190` from `parts/08.part`. A reference search across source parts, runtime extensions, host, application, scripts and tests found only their definitions; neither was exported. These were obsolete writer-context constructors. Current catalog storage, entity/privacy guards, `characterId`, `storyId`, package media keys, session keys and compatibility code remain in use and were retained. The active speaker contract is not removed by this cleanup.

## Verification

- Protocol tests exercise mixed/escaped envelopes, invalid and incomplete JSON, and 1/2/7/29/512-character chunking without releasing any private prefix.
- Saved-state tests preserve original text/annotations and media, remove false quote annotations, and verify stable quote offsets and idempotence.
- The supplied private backup was replayed locally only: three leaked envelopes were removed, 72 annotations became the one actual spoken quote, and world state/media stayed unchanged. The backup is not included in the source archive.
- Live model behavior is not guaranteed by mocked transport tests; the deterministic reader guard is tested against the actual failing saved output.
