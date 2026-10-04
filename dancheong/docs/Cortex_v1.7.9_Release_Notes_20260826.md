# Cortex 1.7.9 Release Notes

Date: 2026-08-26  
Target: independent Cortex HTML

## Cortex image capsule

- Every committed turn now prepares a private scene-image capsule immediately after the final prose, chronology, location, canon ledger, and first-appearance cues are fixed.
- Capsule preparation is deterministic and local. It makes no image API request and therefore adds no image-generation charge while the reader is reading.
- Every committed turn displays its own `이미지 추가` control directly beneath the prose.
- Pressing the control sends exactly one GPT-Image-2 request using the quality selected at click time (`low` or `medium`).
- Scene-image generation and storage are fixed at `1088x608`, JPEG, opaque background, and output compression 82. The previous 360p/480p resize path is not part of the independent Cortex HTML.
- If an applicable package character image exists, the same single request uses at most two canonical character references through the image-edit endpoint. Otherwise it uses the image-generation endpoint.
- Generated scene bytes are retained in IndexedDB instead of inflating the turn-state localStorage record. Turn metadata keeps a stable asset key and restores the image after reload.

## Compatibility and safety

- Cortex 1.7.8 story, turn, device API-key, imported-package, canon, and continuity-capsule state migrates into the 1.7.9 store.
- API keys remain device-local and are excluded from exports.
- Failed and streaming turns never expose an image-generation control.
- A failed image request preserves the prepared capsule and exposes a retry control without changing prose or canon state.
- Package first-appearance images remain unchanged and continue to take priority.

## Verification

- The stable `/cortex.html` and legacy Cortex redirect now target 1.7.9.
- The rendered Cortex regression suite passes all 57 tests.
- Production build, unit tests, and the deterministic replay are required before deployment.
- No paid image request or 100/200-run simulation is performed during automated validation.
