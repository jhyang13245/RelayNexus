# VN cast/directing latency — 1.24.5

The performance panel's former “인물 판정 API” covers the entire paragraph's cast,
expression, wardrobe, camera, effects, event art and music decisions. Its legacy
output repeats full evidence strings and default directing fields on every beat.

## Changes

- A transport adapter shares exact evidence quotes and complete cast bindings by
  index, and emits only nondefault directing cues. Every beat and its on-stage
  list remain explicit. No identities are inferred from omitted fields.
- Decoding restores the original decision shape before the unchanged semantic
  validator checks identity, physical presence, exact evidence and beat timing.
  Unknown/ambiguous people cannot borrow a known person's sprite.
- All public inputs and semantic instructions remain available. Model, reasoning
  effort and output ceiling are unchanged. The public roster leads the request
  context; no private profiles, keys or generated assets are added.
- Validated decisions release image preparation immediately. IndexedDB persists
  them asynchronously. Existing decision keys and saved formats remain compatible;
  concurrent preparation still shares one request and cached decisions are reused.
- Performance timing ends after consuming the API response, before the separate
  local usage-ledger write. The panel label is now “인물·연출 판정 API”.
- The original standalone vendor files remain byte-identical. Integration changes
  live in the port adapter and `public/cortex-vn-cast-wire.mjs`.

## Verification and limits

The eight-beat synthetic fixture drops from 6,917 to 1,100 JSON bytes (84%). This is
an output-size measurement, **not** a measured API latency or token-cost reduction.
Actual latency includes provider queueing and inference; a live paid comparison
was not performed. First use of the new strict schema can have extra processing.

Regression fixtures cover future arrivals, departures, reported/remote speech,
unknown identities, incorrect professor/relative links, malformed proof indexes,
wardrobe/event cues, concurrent requests, saved-result reuse, slow decision writes,
and slow accounting writes. These establish deterministic decoding/validation and
storage boundaries; they do not establish a live model's accuracy on the new format.

OpenAI uses the strict JSON schema, including nested `anyOf` cue variants. Muse
keeps its existing prompt-only JSON interface without `text.format`. The schema
structure follows the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).
