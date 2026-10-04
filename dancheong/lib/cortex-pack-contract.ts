export const CORTEX_NATIVE_PACK_FORMAT =
  "RELAY_CORTEX_NATIVE_PACK_V1" as const;
export const CORTEX_RUNTIME_MODEL_FORMAT =
  "CORTEX_RUNTIME_MODEL_V1" as const;
export const CORTEX_NATIVE_PACK_VERSION = "1.0" as const;
export const CORTEX_MINIMUM_NATIVE_ENGINE_VERSION = "1.4.0" as const;
export const CORTEX_IMPLEMENTED_ENGINE_VERSION = "1.4.0" as const;

export type CortexRuntimeProfile = "canonical_story" | "instant_story";

export type CortexNativeFeatureId =
  | "cortex_native_runtime_v1"
  | "cortex_canon_memory_v1"
  | "cortex_chronology_v1"
  | "cortex_disclosure_guard_v1"
  | "asset_once_storage"
  | "status_relationship_display_v1"
  | "character_images"
  | "image_on_first_appearance_v1"
  | "embedded_studio_project_v1";

export const SUPPORTED_CORTEX_NATIVE_FEATURES:
  readonly CortexNativeFeatureId[] = [
    "cortex_native_runtime_v1",
    "cortex_canon_memory_v1",
    "cortex_chronology_v1",
    "cortex_disclosure_guard_v1",
    "asset_once_storage",
    "status_relationship_display_v1",
    "character_images",
    "image_on_first_appearance_v1",
    "embedded_studio_project_v1",
  ] as const;

export const REQUIRED_CORTEX_NATIVE_FEATURES:
  readonly CortexNativeFeatureId[] = [
    "cortex_native_runtime_v1",
    "cortex_canon_memory_v1",
    "cortex_chronology_v1",
    "cortex_disclosure_guard_v1",
    "asset_once_storage",
  ] as const;

export const REQUIRED_CORTEX_NATIVE_DOCUMENTS = [
  "manifest.json",
  "project.json",
  "cortex/runtime.json",
  "cortex/canon_graph.json",
  "cortex/chronology.json",
  "cortex/disclosure.json",
  "cortex/memory_contract.json",
  "characters/player.json",
  "characters/npcs.json",
  "world/world.json",
  "start/opening.json",
  "rules/style.json",
  "rules/status_window.json",
  "assets/manifest.json",
] as const;

export type CortexPackageKind =
  | "native_v1"
  | "legacy_scenario_1_4"
  | "legacy_scenario_1_5"
  | "unsupported";

export type CortexCompatibilityReport = {
  sourceFormat: string;
  packageKind: CortexPackageKind;
  runtimeProfile: CortexRuntimeProfile;
  mappedFeatures: string[];
  defaultedFeatures: string[];
  disabledOptionalFeatures: string[];
  warnings: string[];
  lossless: boolean;
  native: boolean;
};

export type CortexRuntimeModel = {
  format: typeof CORTEX_RUNTIME_MODEL_FORMAT;
  identity: {
    projectId: string;
    title: string;
    sourceFormat: string;
    sourcePackageVersion: string;
  };
  runtimeProfile: CortexRuntimeProfile;
  publicWorld: Record<string, unknown>;
  privateCanon: Record<string, unknown>;
  characters: unknown[];
  factions: unknown[];
  relationships: unknown[];
  eventGraph: Record<string, unknown>;
  chronology: Record<string, unknown>;
  disclosure: Record<string, unknown>;
  memoryContract: Record<string, unknown>;
  absorptionAnchors: unknown[];
  statusPresentation: Record<string, unknown>;
  media: Record<string, unknown>;
  compatibility: CortexCompatibilityReport;
};

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
      .map((item) => item.trim()).filter(Boolean)
    : [];

const records = (value: unknown, key?: string): JsonRecord[] => {
  const source = Array.isArray(value)
    ? value
    : key && Array.isArray(record(value)[key])
      ? record(value)[key] as unknown[]
      : [];
  return source.map(record).filter((item) => Object.keys(item).length > 0);
};

const semverParts = (value: string): [number, number, number] | undefined => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/u);
  return match ? [+match[1], +match[2], +match[3]] : undefined;
};

const semverAtLeast = (actual: string, minimum: string): boolean => {
  const a = semverParts(actual);
  const b = semverParts(minimum);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return true;
};

const featureSet = (manifest: JsonRecord): Set<string> => new Set([
  ...strings(manifest.features),
  ...strings(manifest.requiredFeatures),
  ...strings(manifest.optionalFeatures),
]);

const manifestRoot = (value: unknown): JsonRecord => {
  const envelope = record(value);
  const nested = record(envelope.manifest);
  return Object.keys(nested).length ? { ...envelope, ...nested } : envelope;
};

const runtimeProfileForLegacy = (manifest: JsonRecord): CortexRuntimeProfile => {
  const features = featureSet(manifest);
  return text(manifest.runtimeMode) === "instant_story" ||
      features.has("instant_story_runtime_v1") ||
      features.has("instant_story_runtime_v2")
    ? "instant_story"
    : "canonical_story";
};

export const detectCortexPackageKind = (value: unknown): CortexPackageKind => {
  const manifest = manifestRoot(value);
  if (text(manifest.packageFormat) === CORTEX_NATIVE_PACK_FORMAT) {
    return "native_v1";
  }
  if (text(manifest.packageVersion) === "1.4") return "legacy_scenario_1_4";
  if (text(manifest.packageVersion) === "1.5") return "legacy_scenario_1_5";
  return "unsupported";
};

export const validateCortexNativeDocumentPaths = (
  paths: Iterable<string>,
): string[] => {
  const normalized = new Set(
    [...paths].map((path) => path.replaceAll("\\", "/").replace(/^\/+/, "")),
  );
  return REQUIRED_CORTEX_NATIVE_DOCUMENTS.filter((path) => !normalized.has(path));
};

export const negotiateCortexPackage = (
  value: unknown,
): CortexCompatibilityReport => {
  const manifest = manifestRoot(value);
  const packageKind = detectCortexPackageKind(manifest);
  if (packageKind === "unsupported") {
    throw new Error("Cortex가 지원하는 Native Pack 또는 Legacy Package 1.4/1.5가 아닙니다.");
  }

  if (packageKind === "native_v1") {
    if (text(manifest.packageVersion) !== CORTEX_NATIVE_PACK_VERSION) {
      throw new Error(
        `지원하지 않는 Cortex Native Pack 버전입니다: ${text(manifest.packageVersion) || "없음"}`,
      );
    }
    const runtimeEngine = record(manifest.runtimeEngine);
    if (text(runtimeEngine.id) !== "cortex") {
      throw new Error("Cortex Native Pack의 runtimeEngine.id는 cortex여야 합니다.");
    }
    const minimumVersion = text(runtimeEngine.minimumVersion);
    if (!semverAtLeast(CORTEX_IMPLEMENTED_ENGINE_VERSION, minimumVersion)) {
      throw new Error(
        `이 Native Pack은 Cortex ${minimumVersion || "미상"} 이상이 필요합니다.`,
      );
    }
    const runtimeProfile = text(manifest.runtimeProfile);
    if (runtimeProfile !== "canonical_story" && runtimeProfile !== "instant_story") {
      throw new Error("runtimeProfile은 canonical_story 또는 instant_story여야 합니다.");
    }
    const supported = new Set<string>(SUPPORTED_CORTEX_NATIVE_FEATURES);
    const required = strings(manifest.requiredFeatures);
    const optional = strings(manifest.optionalFeatures);
    const unsupportedRequired = required.filter((feature) => !supported.has(feature));
    if (unsupportedRequired.length) {
      throw new Error(
        `Cortex가 지원하지 않는 Native Pack 필수 기능입니다: ${unsupportedRequired.join(", ")}`,
      );
    }
    const missingCoreFeatures = REQUIRED_CORTEX_NATIVE_FEATURES.filter(
      (feature) => !required.includes(feature),
    );
    if (missingCoreFeatures.length) {
      throw new Error(
        `Cortex Native Pack 핵심 필수 기능 선언이 없습니다: ${missingCoreFeatures.join(", ")}`,
      );
    }
    if (text(manifest.unsupportedBehavior) !== "reject_package") {
      throw new Error("Cortex Native Pack은 미지원 필수 기능을 축소 실행할 수 없습니다.");
    }
    const disabledOptionalFeatures = optional.filter((feature) => !supported.has(feature));
    return {
      sourceFormat: CORTEX_NATIVE_PACK_FORMAT,
      packageKind,
      runtimeProfile,
      mappedFeatures: [...new Set([...required, ...optional.filter((item) => supported.has(item))])],
      defaultedFeatures: [],
      disabledOptionalFeatures,
      warnings: disabledOptionalFeatures.map((feature) =>
        `지원하지 않는 선택 기능을 비활성화했습니다: ${feature}`
      ),
      lossless: true,
      native: true,
    };
  }

  const features = featureSet(manifest);
  const required = strings(manifest.requiredFeatures);
  const runtimeProfile = runtimeProfileForLegacy(manifest);
  const instantV2 = features.has("instant_story_runtime_v2");
  if (instantV2 && (
    text(manifest.runtimeMode) !== "instant_story" ||
    manifest.exclusiveRuntime !== true ||
    text(manifest.unsupportedBehavior) !== "reject_package"
  )) {
    throw new Error(
      "Instant Story Runtime v2 전용 Legacy Pack의 독립 실행·거부 정책이 올바르지 않습니다.",
    );
  }
  return {
    sourceFormat: packageKind === "legacy_scenario_1_5"
      ? "RELAY_NOVEL_PACKAGE_1_5"
      : "RELAY_NOVEL_PACKAGE_1_4",
    packageKind,
    runtimeProfile,
    mappedFeatures: [...features],
    defaultedFeatures: [
      "cortex_local_context_selection",
      "cortex_same_response_canon_sidecar",
      "cortex_atomic_turn_commit",
    ],
    disabledOptionalFeatures: [],
    warnings: required.length === 0 && packageKind === "legacy_scenario_1_5"
      ? ["Package 1.5 필수 기능 협상 목록이 비어 있습니다."]
      : [],
    lossless: true,
    native: false,
  };
};

export const createCortexRuntimeModelEnvelope = ({
  manifest: value,
  documents = {},
}: {
  manifest: unknown;
  documents?: Record<string, unknown>;
}): CortexRuntimeModel => {
  const manifest = manifestRoot(value);
  const compatibility = negotiateCortexPackage(manifest);
  const project = record(documents["project.json"]);
  const native = compatibility.native;
  const document = (nativePath: string, legacyPath?: string): JsonRecord =>
    record(documents[nativePath] ?? (legacyPath ? documents[legacyPath] : undefined));
  return {
    format: CORTEX_RUNTIME_MODEL_FORMAT,
    identity: {
      projectId: text(manifest.projectId) || text(project.projectId) || text(project.id),
      title: text(manifest.title) || text(project.title),
      sourceFormat: compatibility.sourceFormat,
      sourcePackageVersion: text(manifest.packageVersion),
    },
    runtimeProfile: compatibility.runtimeProfile,
    publicWorld: document("world/world.json"),
    privateCanon: native
      ? document("cortex/canon_graph.json")
      : document("gm/gm_data.json"),
    characters: [
      document("characters/player.json"),
      ...records(documents["characters/npcs.json"], "npcs"),
    ].filter((item) => Object.keys(record(item)).length),
    factions: records(documents["characters/factions.json"], "factions"),
    relationships: records(documents["characters/relations.json"], "relations"),
    eventGraph: native
      ? document("cortex/canon_graph.json")
      : document("events/events.json", "events/event_list.json"),
    chronology: native
      ? document("cortex/chronology.json")
      : document("events/clocks.json", "world/world.json"),
    disclosure: native
      ? document("cortex/disclosure.json")
      : document("routes/reveal_policies.json"),
    memoryContract: native ? document("cortex/memory_contract.json") : {},
    absorptionAnchors: Array.isArray(documents["cortex/absorption_anchors.json"])
      ? documents["cortex/absorption_anchors.json"] as unknown[]
      : Array.isArray(record(documents["cortex/absorption_anchors.json"]).anchors)
        ? record(documents["cortex/absorption_anchors.json"]).anchors as unknown[]
        : [],
    statusPresentation: document("rules/status_window.json"),
    media: document("assets/manifest.json"),
    compatibility,
  };
};
