# Reader media — 1.14.1

## Fixes

- A legacy `첫 등장 뒤 공개:` gate can release the public name and primary portrait after the name occurs in committed narration. Explicit secret/reveal conditions still require their original receipts. This is a presentation-only surface receipt, not a canon/secret-identity unlock; mixed legacy public/private profiles are not exposed by it.
- Unique short names such as a multi-part name's first token participate in public matching. Ambiguous names and partial-word matches fail closed. Imported and rewound histories recompute appearance receipts.
- Host portrait reads, primary aliases and generated portrait writes use the engine's active backup media generation. They no longer bypass restored-media namespaces. Declared but unavailable images still do not trigger paid replacements.
- Writer-supplied dialogue remains authoritative. Missing annotations in new committed beats get one writer sidecar completion; existing beats have an explicit `대사 카드 복구` action. This uses the configured writer model, costs an API call, preserves prose byte-for-byte and rejects unknown/private IDs and unsupported evidence. Unclear speakers remain unresolved; there is no claim of universal 100% semantic attribution.
- Per-beat image controls directly call the generation handler. Errors retain safe status/code/parameter/request-ID diagnostics across saves and are readable on mobile. A fallback image records and displays its actual model.
- Removed `input_fidelity` from Flare reference edits in both hosted and standalone paths. The live API returned HTTP 400 / `invalid_input_fidelity_model` for that field; the same synthetic request succeeded as `gpt-image-2.5-flare` after omission. References, quality and dimensions were retained. Safety errors are not automatically retried.

## Verification

- Unit suite: 662 passing. Runtime/host suite: 47 passing, two optional private fixtures skipped in the general run. Rendered/parity suite: 61 passing. Twenty-turn replay passing.
- The supplied private ZIP was replayed separately through the real backup decoder/importer: the target portrait mounted with the embedded asset, no image API call occurred, and hashes confirmed all 11 prose turns unchanged. No private backup data is included in source or deployment artifacts.
- Live non-private checks: one successful Flare reference edit; one configured-writer dialogue recovery identified a registered short-name speaker and an extra, with unchanged prose. These synthetic checks do not validate the user's API project's billing/model permissions or every historical quote.
- No physical iPhone/Safari or browser-interaction QA in this release. Existing automated manual-scroll/commit-anchor checks remain passing. No database migration or change to Studio package format.
- Official image API guidance: https://developers.openai.com/api/docs/guides/image-generation . The model-specific fidelity behavior above was confirmed against the live API rather than inferred from the generic parameter listing.

## Using existing saves

Refresh/reopen the session after deployment. Embedded public portraits restore automatically. Where an older beat lacks author annotations, use `대사 카드 복구` once (API usage applies); its story text is not rewritten. For failed scene images, use `이미지 재시도`.
