# Local face landmark runtime

- Library: Google MediaPipe `@mediapipe/tasks-vision` **1.0.1**, npm registry distribution; Apache License 2.0, included in `LICENSE`.
- Files: `vision_bundle.mjs`, `wasm/vision_wasm_module_internal.js`, `wasm/vision_wasm_module_internal.wasm` (unchanged upstream files).
- Model: Google's Face Landmarker float16 **version 1** task bundle, unchanged, downloaded from https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Upstream: https://github.com/google-ai-edge/mediapipe and https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker

The VN loads these files only when optional eye/mouth animation needs measurement. Inference runs in a dedicated local worker. Character pictures and landmark coordinates are not uploaded to a detection service. This is landmark measurement, not facial recognition or identity matching. It does not work reliably on every anime illustration; uncertain results retain the static original. Runtime/model assets are self-hosted so no CDN is required during play.
