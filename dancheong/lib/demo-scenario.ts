import manifest from "./default-demo-package/manifest.json";
import project from "./default-demo-package/project.json";
import instantStoryRuntimeDocument from "./default-demo-package/rules/instant_story_runtime.json";
import contextIndex from "./default-demo-package/runtime/context_index.json";
import endingSchedule from "./default-demo-package/runtime/ending_schedule.json";
import keywordIndex from "./default-demo-package/runtime/keyword_index.json";
import mediaLookup from "./default-demo-package/runtime/media_lookup.json";

import { parseInstantStoryRuntime } from "./instant-story-runtime";
import { parsePackage15Runtime } from "./package15-runtime";
import { normalizeScenarioPack } from "./scenario";

const base = normalizeScenarioPack(manifest, project);
const package15Runtime = parsePackage15Runtime({
  packageVersion: base.packageVersion,
  manifest,
  documents: {},
});
const instantStoryRuntime = parseInstantStoryRuntime(
  instantStoryRuntimeDocument,
  { contextIndex, keywordIndex, mediaLookup, endingSchedule },
  project,
);

export const demoScenario = {
  ...base,
  package15Runtime,
  instantStoryRuntime,
  compatibility: {
    studioPackage14: false,
    studioPackage15: true,
    supportedPackageVersion: true,
    mediaManifestV2: true,
    assetOnceV1: true,
    integrityVerified: true,
    aiWorldContextRuntimeV1: false,
    narrativeRuntimeExtensionV1: false,
    instantStoryRuntimeV1: instantStoryRuntime?.featureId === "instant_story_runtime_v1",
    instantStoryRuntimeV2: instantStoryRuntime?.featureId === "instant_story_runtime_v2",
    package15FeatureNegotiated: Boolean(package15Runtime),
    fullSupport: Boolean(package15Runtime && instantStoryRuntime),
    warnings: [],
  },
};
