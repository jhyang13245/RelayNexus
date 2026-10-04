# Local portrait landmark runtime

- Library: Google MediaPipe `@mediapipe/tasks-vision` **1.0.1**, npm registry distribution; Apache License 2.0, included in `LICENSE`.
- Files: `vision_bundle.mjs`, `wasm/vision_wasm_module_internal.js`, `wasm/vision_wasm_module_internal.wasm` (unchanged upstream files).
- Model: Google's Face Landmarker float16 **version 1** task bundle, unchanged, downloaded from https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Body model: Google's Pose Landmarker Lite float16 **version 1**, unchanged, downloaded from https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Upstream: https://github.com/google-ai-edge/mediapipe and https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker

The VN lazily loads these files when an uncached portrait needs camera calibration or optional eye/mouth animation needs measurement. Face, shoulder and hip inference runs in a dedicated local worker. Character pictures and landmark coordinates are not uploaded to a detection service. This is landmark measurement, not facial recognition or identity matching. It does not work reliably on every anime illustration; uncertain results are identified as partial measurements and do not justify generating paid replacements automatically. Runtime/model assets are self-hosted so no CDN is required during play. The worker is released after an idle period; measured camera geometry is cached independently of the paid image.
