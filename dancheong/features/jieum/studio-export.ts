import { compileCanonDesign } from './canon-design';
import { CORTEX_TARGET_VERSION, CORTEX_INTEGRATION_TARGET, cortexCompatibility, cortexRoutes } from "./cortex-engine-contract";
import { CORTEX_PACKAGE_FORMAT, CORTEX_TARGET_LABEL } from './cortex-target';
import { archiveProjectSchedules } from "./event-schedule-retirement";
import {
  normalizeProtectedTerms,
  restoreDisclosure,
} from "./disclosure-contract";
import {
  assertCortexExportReviewed,
  cortexExportReview,
  type CortexExportAcknowledgements,
} from "./cortex-export-review";
import {
  retireLocationGraph,
  omitRetiredLocationFields,
} from "./location-retirement";
import JSZip from "jszip";
import { inspectInstantContext, type InstantContextPreflight } from './instant-context-preflight';
import { instantWorldProse, privateWorldProse } from './world-prose';
import { appearanceProse, characterProse, updateCharacterProse } from './character-prose';
import { strToU8, Unzip, UnzipInflate, Zip, ZipDeflate } from "fflate";
import {
  characterInvariantsForRuntime,
  validateProject,
  type Character,
  type ImageTrigger,
  type Project,
} from "./studio-model";
import {
  instantContextIndex,
  instantEndingSchedule,
  instantKeywordIndex,
  instantMediaLookup,
  instantStoryRuntime,
  instantStoryRuntimeSchema,
  instantStoryTestVectors,
  INSTANT_STORY_COMPILER_VERSION,
  INSTANT_STORY_FEATURE_ID,
} from "./instant-story-contract";
import {
  compileCortexEvent,
  compileCortexEvents,
  orderedEvents,
  cortexAuthoringGuidance,
} from "./cortex-event-design";
import { lintCortexPackage } from "./cortex-package-lint";
import {
  prepareProjectImages,
  type ImageExportMode,
  type ImageOptimizationProgress,
  type ImageOptimizationReport,
} from "./image-optimization";

const LEGACY_PACKAGE_VERSION = "1.4";
const PACKAGE_VERSION = LEGACY_PACKAGE_VERSION;
const ENGINE_VERSION = "2.4";
import { JIEUM_AUTHORING_METADATA } from './jieum-version';
// Compatibility version is not the authoring product version. Studio's importer
// uses its major number to choose the legacy migration path.
export const STUDIO_VERSION = "2.3.2";
export const STATUS_RELATIONSHIP_FEATURE_ID = "status_relationship_display_v1";
export { CORTEX_PACKAGE_FORMAT } from './cortex-target';
export const CORTEX_PACKAGE_FEATURE_ID = "protagonist_invariants_v1";
export const CORTEX_MIN_VERSION = CORTEX_TARGET_VERSION;
const runtimeStyle = (project: Project) => {
  if (project.packageTarget !== 'cortex') return project.style;
  const { cortexAuthoringGuidance: _reservedCanonGuidance, ...authoredStyle } = project.style;
  return project.runtimeMode === 'instant_story' ? authoredStyle : { ...authoredStyle, cortexAuthoringGuidance };
};
export const CORTEX_V136_PACKAGE_FEATURE_ID = "cortex_prose_contract_v1416";
export const CORTEX_TYPED_REQUIREMENTS_FEATURE_ID =
  "natural_language_event_conditions_v2";
export const CORTEX_DISCLOSURE_FEATURE_ID = "disclosure_terms_v1";
export const PROJECT_SNAPSHOT_FORMAT_V1 =
  "RELAY_NOVEL_STUDIO_PROJECT_SNAPSHOT_V1";
export const PROJECT_SNAPSHOT_FORMAT = "RELAY_NOVEL_STUDIO_PROJECT_SNAPSHOT_V2";
export const EMBEDDED_PROJECT_SNAPSHOT_PATH = "studio/project-snapshot.json";
export const EMBEDDED_PROJECT_FEATURE_ID = "embedded_studio_project_v2";
export const packageVersionFor = (project: Project) =>
  project.runtimeMode === "instant_story" || project.package15.enabled
    ? "1.5"
    : LEGACY_PACKAGE_VERSION;
const safe = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "_").trim() || "Scenario";
const safeId = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, "_") || "CHAR";

export type PackageAsset = {
  assetPath: string;
  assetRef: string;
  byteLength: number;
  bytes: Uint8Array;
  sourceBlob?: Blob;
  dataUrlHeader: string;
  mimeType: string;
  sha256: string;
};

export type PackageAssetIndex = {
  byDataUrl: Map<string | Blob, PackageAsset>;
  logicalAssetCount: number;
  originalAssetBytes: number;
  uniqueAssets: PackageAsset[];
};

const bytesFromDataUrl = (dataUrl: string) => {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("이미지 Data URL 형식을 확인할 수 없습니다.");
  const dataUrlHeader = dataUrl.slice(0, comma);
  if (!/;base64$/i.test(dataUrlHeader))
    throw new Error("Base64 이미지 형식만 패키지에 포함할 수 있습니다.");
  const encoded = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return { bytes, dataUrlHeader };
};

const sha256Hex = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "이 브라우저에서는 SHA-256 무결성 검사를 사용할 수 없습니다.",
    );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
};

export const instantSourceFingerprint = async (
  project: Project,
  packageProject?: ReturnType<typeof buildPackageProject>,
) => {
  const source = {
    packageVersion: packageVersionFor(project),
    engineVersion: ENGINE_VERSION,
    project: packageProject ?? project,
    runtimeMode: project.runtimeMode,
    narrativeRuntime:
      project.runtimeMode === "instant_story"
        ? null
        : narrativeRuntimeContract(project),
    package15:
      project.runtimeMode === "instant_story"
        ? null
        : project.package15.enabled
          ? package15Documents(project)
          : null,
    instantStory:
      project.runtimeMode === "instant_story" ? project.instantStory : null,
  };
  return sha256Hex(new TextEncoder().encode(stableJson(source)));
};

const characterAssetPath = (
  character: Character,
  index: number,
  fileName: string,
) =>
  `assets/characters/${safeId(character.id)}/${String(index + 1).padStart(2, "0")}_${safe(fileName)}`;
const triggerAssetPath = (
  trigger: ImageTrigger,
  index: number,
  fileName: string,
) =>
  `assets/triggers/${safeId(trigger.id)}/${String(index + 1).padStart(2, "0")}_${safe(fileName)}`;
const triggerMediaAssetId = (trigger: ImageTrigger) => {
  const primaryIndex = trigger.attachedImages.findIndex(
    (image) => image.isPrimary,
  );
  return `TRGIMG_${safeId(trigger.id)}_${String((primaryIndex >= 0 ? primaryIndex : 0) + 1).padStart(2, "0")}`;
};

export async function buildPackageAssetIndex(
  project: Project,
): Promise<PackageAssetIndex> {
  const occurrences = [
    ...[project.player, ...project.npcs].flatMap((character) =>
      character.images.map((image, index) => ({
        image,
        fallbackPath: characterAssetPath(character, index, image.fileName),
      })),
    ),
    ...project.imageTriggers.flatMap((trigger) =>
      trigger.attachedImages.map((image, index) => ({
        image,
        fallbackPath: triggerAssetPath(trigger, index, image.fileName),
      })),
    ),
  ];
  const byDataUrl = new Map<string | Blob, PackageAsset>();
  const byIntegrity = new Map<string, PackageAsset[]>();
  const usedPaths = new Set<string>();
  let originalAssetBytes = 0;

  const uniquePath = (fallbackPath: string, sha256: string) => {
    if (!usedPaths.has(fallbackPath)) return fallbackPath;
    const dot = fallbackPath.lastIndexOf(".");
    const suffix = `__${sha256.slice(0, 12)}`;
    const extensionIndex =
      dot > fallbackPath.lastIndexOf("/") ? dot : fallbackPath.length;
    let candidate = `${fallbackPath.slice(0, extensionIndex)}${suffix}${fallbackPath.slice(extensionIndex)}`;
    let collision = 2;
    while (usedPaths.has(candidate)) {
      candidate = `${fallbackPath.slice(0, extensionIndex)}${suffix}_${collision}${fallbackPath.slice(extensionIndex)}`;
      collision += 1;
    }
    return candidate;
  };

  for (const occurrence of occurrences) {
    const imageKey = occurrence.image.sourceBlob ?? occurrence.image.dataUrl;
    const cached = byDataUrl.get(imageKey);
    if (cached) {
      originalAssetBytes += cached.byteLength;
      continue;
    }
    const sourceBlob =
      occurrence.image.sourceBlob instanceof Blob
        ? occurrence.image.sourceBlob
        : undefined;
    const dataUrlHeader = sourceBlob
      ? occurrence.image.dataUrlHeader ||
        `data:${occurrence.image.mimeType || sourceBlob.type || "application/octet-stream"};base64`
      : bytesFromDataUrl(occurrence.image.dataUrl).dataUrlHeader;
    const bytes = sourceBlob
      ? new Uint8Array(await sourceBlob.arrayBuffer())
      : bytesFromDataUrl(occurrence.image.dataUrl).bytes;
    const sha256 = await sha256Hex(bytes);
    const mimeType =
      occurrence.image.mimeType ||
      dataUrlHeader.slice(5).split(";", 1)[0] ||
      "application/octet-stream";
    const integrityKey = `${sha256}:${mimeType.toLowerCase()}`;
    const sameIntegrityAssets = byIntegrity.get(integrityKey) ?? [];
    // SHA-256 plus MIME type is the package's content-addressed identity.
    const existing = sameIntegrityAssets[0];
    const assetPath = uniquePath(occurrence.fallbackPath, sha256);
    const asset = existing ?? {
      assetPath,
      assetRef: `sha256:${sha256}`,
      byteLength: bytes.byteLength,
      bytes: sourceBlob ? new Uint8Array(0) : bytes,
      ...(sourceBlob ? { sourceBlob } : {}),
      dataUrlHeader,
      mimeType,
      sha256,
    };
    if (!existing) {
      usedPaths.add(assetPath);
      byIntegrity.set(integrityKey, [...sameIntegrityAssets, asset]);
    }
    byDataUrl.set(imageKey, asset);
    originalAssetBytes += bytes.byteLength;
  }

  return {
    byDataUrl,
    logicalAssetCount: occurrences.length,
    originalAssetBytes,
    uniqueAssets: [...byIntegrity.values()].flat(),
  };
}

const packagedImage = <
  T extends { dataUrl: string; fileName: string; mimeType: string },
>(
  image: T,
  fallbackPath: string,
  assets?: PackageAssetIndex,
) => {
  const metadata = Object.fromEntries(
    Object.entries(image).filter(
      ([key]) => key !== "dataUrl" && key !== "sourceBlob",
    ),
  ) as Omit<T, "dataUrl">;
  const asset = assets?.byDataUrl.get(
    (image as T & { sourceBlob?: Blob }).sourceBlob ?? image.dataUrl,
  );
  const dataUrlHeader =
    asset?.dataUrlHeader || image.dataUrl.slice(0, image.dataUrl.indexOf(","));
  return {
    ...metadata,
    assetPath: asset?.assetPath ?? fallbackPath,
    ...(asset
      ? {
          assetRef: asset.assetRef,
          byteLength: asset.byteLength,
          dataUrlHeader,
          sha256: asset.sha256,
        }
      : {}),
  };
};

const cleanCharacter = (character: Character, assets?: PackageAssetIndex) => ({
  ...character,
  images: character.images.map((image, index) =>
    packagedImage(
      image,
      characterAssetPath(character, index, image.fileName),
      assets,
    ),
  ),
});
const instantPackageCharacter = (character: Character, assets?: PackageAssetIndex) => {
  const appearance = appearanceProse(character);
  const publicInfo = [characterProse(character), appearance ? `[외형 특징]\n${appearance}` : ""].filter(Boolean).join("\n\n");
  const compact = updateCharacterProse(cleanCharacter(character, assets), publicInfo);
  return { ...compact, publicProfile: publicInfo, appearance, visualAnchor: appearance };
};

export const withAutomaticInstantContextBudget = (project: Project): Project => {
  if (project.runtimeMode !== "instant_story") return project;
  const profiles = project.instantStory.startProfiles.map(({ recommendedReplies: _recommendedReplies, ...profile }) => profile);
  const largestProfile = profiles.sort((left, right) => JSON.stringify(right).length - JSON.stringify(left).length)[0] ?? null;
  const characters = [project.player, ...project.npcs].map((character) => {
    const appearance = appearanceProse(character);
    return {
      id: character.id,
      name: character.name,
      publicProfile: [characterProse(character), appearance ? `[외형 특징]\n${appearance}` : ""].filter(Boolean).join("\n\n"),
      aliases: character.aliases,
    };
  }).sort((left, right) => JSON.stringify(right).length - JSON.stringify(left).length).slice(0, project.instantStory.contextBudget.activeCharacters);
  const authoredContext = {
    corePrompt: project.instantStory.corePrompt,
    preset: project.instantStory.promptPreset,
    worldRules: { overview: instantWorldProse(project.world) },
    privateContext: {
      world: privateWorldProse(project.gmData),
      characters: [project.player, ...project.npcs].filter((character) => character.hiddenInfo.trim()).map((character) => ({ id: character.id, name: character.name, hiddenInfo: character.hiddenInfo })),
    },
    invariants: characterInvariantsForRuntime(project),
    style: runtimeStyle(project),
    opening: project.opening,
    startProfile: largestProfile,
    exampleScenes: project.instantStory.exampleScenes.slice(0, 3),
    characters,
    activeKeywordNotes: project.instantStory.keywordNotes.slice().sort((left, right) => JSON.stringify(right).length - JSON.stringify(left).length).slice(0, project.instantStory.contextBudget.activeKeywordNotes),
    stats: project.instantStory.statRules,
    relationships: project.statusWindow.relationshipDisplays,
  };
  const current = project.instantStory.contextBudget.maxDynamicPromptChars;
  const managed = Math.min(24_000, Math.ceil((JSON.stringify(authoredContext).length + 1_200) / 1_000) * 1_000);
  if (managed <= current) return project;
  return { ...project, instantStory: { ...project.instantStory, contextBudget: { ...project.instantStory.contextBudget, maxDynamicPromptChars: managed } } };
};
const cleanImageTrigger = (
  trigger: ImageTrigger,
  assets?: PackageAssetIndex,
) => ({
  ...trigger,
  attachedImages: trigger.attachedImages.map((image, index) =>
    packagedImage(
      image,
      triggerAssetPath(trigger, index, image.fileName),
      assets,
    ),
  ),
  ...(trigger.attachedImages.length
    ? { mediaAssetId: triggerMediaAssetId(trigger) }
    : {}),
});
const terminalEventIds = (project: Project) =>
  new Set(
    project.package15.branchEnding.enabled
      ? project.package15.endings
          .filter(ending => (ending.exclusiveGroupId || 'primary') === project.package15.branchEnding.primaryEndingGroupId)
          .map((ending) => ending.terminalEventId || "")
          .filter(Boolean)
      : [],
  );
const isTerminalEvent = (project: Project, id: string) =>
  terminalEventIds(project).has(id);
const followingEventId = (project: Project, id: string) => {
  if (isTerminalEvent(project, id)) return "";
  const list = orderedEvents(project),
    index = list.findIndex((e) => e.id === id);
  return index >= 0 ? list[index + 1]?.id || "" : "";
};
const cleanStoryEvent = (
  event: Project["events"][number],
  isCortex = false,
  nextId = "",
  terminal = false,
) =>
  isCortex
    ? compileCortexEvent(
        terminal ? { ...event, nextEventId: "" } : event,
        terminal ? "" : nextId,
      )
    : {
        ...event,
        appliesTo:
          event.kind === "constraint"
            ? [
                ...new Set(
                  event.appliesTo.map((id) => id.trim()).filter(Boolean),
                ),
              ]
            : [],
        rules:
          event.kind === "constraint"
            ? event.rules.map((rule) => rule.trim()).filter(Boolean)
            : [],
        beats:
          isCortex || event.kind === "compound"
            ? event.beats.map((beat) => ({
                id: beat.id.trim(),
                viewpoint: beat.viewpoint.trim(),
                content: beat.content.trim(),
                ...(isCortex ? { goal: beat.content.trim() } : {}),
              }))
            : [],
        alternateBeats: event.alternateBeats,
        sceneMarkers: event.sceneMarkers,
        ...(isCortex
          ? {
              title: event.name,
              act: event.act || undefined,
              storyDay: event.storyDay,
              startTime: event.startTime,
              endTime: event.endTime,
              nextEventId: event.nextEventId || undefined,
              failureConditions: event.failureConditions || undefined,
              requiredFunctions: event.requiredFunctions,
              revealTerms: event.revealTerms,
              transitionLocationRefs: event.transitionLocationRefs,
              observationLocationRefs: event.observationLocationRefs,
              recoveryAlternatives: undefined,
            }
          : {}),
        ...(event.multiroute ?? {}),
      };

export const narrativeRuntimeContract = (project: Project) =>
  project.packageTarget === "cortex"
    ? {
        format: "CORTEX_PROSE_RUNTIME_V1416",
        packageCompatibility: ["1.4", "1.5"],
        events: project.events.map((event) => ({
          eventId: event.id,
          alternateBeats: event.alternateBeats,
          sceneMarkers: event.sceneMarkers,
        })),
        guidance: cortexAuthoringGuidance,
        mainBeats: 3,
        earlyClosureMinBeats: 2,
        extensionBeats: 2,
        authority: "PUBLIC_PROSE",
        summary: "RECENT_THREE_EVENTS_PLUS_OLDER_SUMMARIES",
        judgeEvidence: "CURRENT_AND_PREVIOUS_TWO_EVENTS_PUBLIC_PROSE",
        eventPolicyAdapter: "CORTEX_STUDIO_EVENT_POLICY_V2",
      }
    : {
        format: "RELAY_NOVEL_NARRATIVE_RUNTIME_EXTENSION_V1",
        packageCompatibility: ["1.4", "1.5"],
        mergeRules: {
          alternateBeats:
            "사건의 핵심 인과를 보존하면서 현재 상태에 맞는 우회 연출을 선택한다.",
          sceneMarkers:
            "저자가 선언한 관측 표식이며 런타임 달성 여부는 구조화 EventLedger에 기록한다.",
          preRevealAlias: "공개 조건 전에는 진짜 이름 대신 이 별칭만 사용한다.",
          revealCondition:
            "RevealPolicy보다 공개 범위를 넓힐 수 없으며 더 제한적인 규칙이 우선한다.",
        },
        characterDisclosure: [project.player, ...project.npcs]
          .filter(
            (character) =>
              character.preRevealAlias || character.revealCondition,
          )
          .map((character) => ({
            characterId: character.id,
            preRevealAlias: character.preRevealAlias,
            revealCondition: character.revealCondition,
          })),
        events: project.events
          .filter(
            (event) => event.alternateBeats.length || event.sceneMarkers.length,
          )
          .map((event) => ({
            eventId: event.id,
            alternateBeats: event.alternateBeats,
            sceneMarkers: event.sceneMarkers,
          })),
      };

export const package15Documents = (project: Project) => {
  const design = project.package15;
  return {
    routeGraph: {
      format: "RELAY_NOVEL_ROUTE_GRAPH_V1",
      storyMode: design.storyMode,
      defaultUnlockMode: design.defaultUnlockMode,
      allowAllOpenOverride: design.allowAllOpenOverride,
      commonArc: design.commonArc,
      routes: project.packageTarget === "cortex" ? cortexRoutes(project) : design.routes,
    },
    chapters: { format: "RELAY_NOVEL_CHAPTERS_V1", chapters: design.chapters },
    routeLenses: {
      format: "RELAY_NOVEL_ROUTE_LENSES_V1",
      lenses: design.routeLenses,
    },
    revealFacts: {
      format: "RELAY_NOVEL_REVEAL_FACTS_V1",
      facts: design.revealFacts,
    },
    revealPolicies: {
      format: "RELAY_NOVEL_REVEAL_POLICIES_V1",
      mergePrecedence: ["forbidden", "hint_only", "partial", "full"],
      policies: design.revealPolicies,
    },
    endings: { format: "RELAY_NOVEL_ENDINGS_V1", endings: design.endings },
    choiceRecords: {
      format: "CORTEX_CHOICE_RECORDS_V1",
      authority: "PUBLIC_PROSE",
      records: design.branchEnding.choiceRecords,
    },
    branchDecisions: {
      format: "CORTEX_BRANCH_DECISIONS_V1",
      semantics: "ENDING_SELECTION_NOT_PROGRESS_PERMISSION",
      decisions: design.branchEnding.decisions,
    },
    endingConvergence: {
      format: "CORTEX_ENDING_CONVERGENCE_V1",
      enabled: design.branchEnding.enabled,
      primaryEndingGroupId: design.branchEnding.primaryEndingGroupId,
      terminalEvents: design.endings.filter((ending) => project.packageTarget !== "cortex" || (ending.exclusiveGroupId || "primary") === design.branchEnding.primaryEndingGroupId).map((ending) => ({
        endingId: ending.id,
        terminalEventId: ending.terminalEventId || "",
        exclusiveGroupId: ending.exclusiveGroupId || "primary",
        returnPolicy: ending.returnPolicy,
      })),
      unresolvedRule: "KEEP_UNEVALUATED_AND_FOLLOW_AUTHORED_FALLBACK",
      apiFailureGuarantee: false,
    },
    flags: { format: "RELAY_NOVEL_FLAGS_V1", flags: design.flags },
    galleries: {
      format: "RELAY_NOVEL_GALLERIES_V1",
      galleries: design.galleries,
    },
    epilogues: {
      format: "RELAY_NOVEL_EPILOGUES_V1",
      epilogues: design.epilogues,
    },
    checkpoints: {
      format: "RELAY_NOVEL_CHECKPOINTS_V1",
      checkpoints: design.checkpoints,
    },
    clues: { format: "RELAY_NOVEL_CLUES_V1", clues: design.clues },
    loopPolicy: design.loopPolicy,
    items: { format: "RELAY_NOVEL_ITEM_DEFINITIONS_V1", items: design.items },
    zones: { format: "RELAY_NOVEL_ZONE_DEFINITIONS_V1", zones: design.zones },
    worldFacts: {
      format: "RELAY_NOVEL_WORLD_FACT_DEFINITIONS_V1",
      worldFacts: design.worldFacts,
    },
  };
};
const cleanPublicClock = (clock: Project["eventClocks"][number]) => ({
  id: clock.id,
  name: clock.name,
  visibility: clock.visibility,
  status: clock.status,
  current: clock.current,
  maximum: clock.maximum,
  relatedEventId: clock.relatedEventId,
  publicHint: clock.publicHint,
});

export function difficultyProfile(project: Project) {
  if (project.difficulty === "EASY")
    return {
      difficulty: "EASY",
      protagonistProtection: "strong",
      resourceTracking: "simplified",
      hiddenInformation: "guided",
      retroactivePreparation: "limited_allowance",
      npcAutonomy: "moderate",
      failureMitigation: "strong",
      deathEnabled: false,
      warningLevel: "explicit",
      relationVolatility: "low",
      clockAdvanceSeverity: "soft",
    };
  if (project.difficulty === "NORMAL")
    return {
      difficulty: "NORMAL",
      protagonistProtection: "limited",
      resourceTracking: "standard",
      hiddenInformation: "standard",
      retroactivePreparation: "rare_exception",
      npcAutonomy: "high",
      failureMitigation: "limited",
      deathEnabled: true,
      warningLevel: "indirect",
      relationVolatility: "standard",
      clockAdvanceSeverity: "standard",
    };
  return {
    difficulty: "HARD",
    protagonistProtection: "none",
    resourceTracking: "strict",
    hiddenInformation: "strict",
    retroactivePreparation: "forbidden",
    npcAutonomy: "full",
    failureMitigation: "none",
    deathEnabled: true,
    warningLevel: "observational_only",
    relationVolatility: "realistic",
    clockAdvanceSeverity: "strict",
  };
}

export function visualManifest(project: Project, assets?: PackageAssetIndex) {
  const characters = [project.player, ...project.npcs].map((character) => {
    const clean = cleanCharacter(character, assets);
    return {
      id: clean.id,
      name: clean.name,
      importance: clean.importance,
      imageOnFirstAppearance: clean.imageOnFirstAppearance,
      visualLock: clean.visualLock,
      visualAnchor: clean.visualAnchor,
      imageFallback: clean.imageFallback,
      images: clean.images,
    };
  });
  return {
    format: "RELAY_NOVEL_CHARACTER_VISUAL_BIBLE_V1",
    enabled: project.visualBible.enabled,
    globalStyle: project.visualBible.globalStyle,
    consistencyRules: project.visualBible.consistencyRules,
    introductionRule: project.visualBible.introductionRule,
    priorityOrder: [
      "package_primary_reference",
      "package_secondary_reference",
      "first_ai_generated_reference",
      "text_visual_anchor",
    ],
    characters,
  };
}

export function mediaAssetManifest(
  project: Project,
  assets?: PackageAssetIndex,
) {
  const characterAssets = [project.player, ...project.npcs].flatMap(
    (character) => {
      const clean = cleanCharacter(character, assets);
      return clean.images.map((image, index) => ({
        id: `CHARIMG_${safeId(character.id)}_${String(index + 1).padStart(2, "0")}`,
        path: image.assetPath,
        kind: "character",
        characterId: character.id,
        characterName: character.name,
        label: image.label || `${character.name} 기준 이미지 ${index + 1}`,
        emotionTags: image.isPrimary ? ["canonical", "default"] : ["reference"],
        sceneTags: [],
        placement: "after_block",
        priority: image.isPrimary ? 100 : Math.max(1, 90 - index),
        alt: `${character.name} 캐릭터 기준 이미지`,
        caption: character.name,
        source: "package",
        canonical: image.isPrimary,
        triggerId: "",
        triggerSourceId: "",
        assetRef: image.assetRef,
        byteLength: image.byteLength,
        dataUrlHeader: image.dataUrlHeader,
        sha256: image.sha256,
      }));
    },
  );
  const triggerAssets = project.imageTriggers.flatMap((trigger) => {
    const clean = cleanImageTrigger(trigger, assets);
    const characterNames = trigger.characterIds
      .map(
        (id) =>
          [project.player, ...project.npcs].find(
            (character) => character.id === id,
          )?.name,
      )
      .filter(Boolean)
      .join(" · ");
    return clean.attachedImages.map((image, index) => ({
      id: `TRGIMG_${safeId(trigger.id)}_${String(index + 1).padStart(2, "0")}`,
      path: image.assetPath,
      kind: "scene",
      characterId:
        trigger.characterIds.length === 1 ? trigger.characterIds[0] : "",
      characterName: trigger.characterIds.length === 1 ? characterNames : "",
      label: trigger.name,
      emotionTags: [],
      sceneTags: [
        trigger.id,
        trigger.sourceId,
        trigger.triggerType,
        trigger.name,
        trigger.storyProgress,
        trigger.customCondition,
      ].filter(Boolean),
      placement:
        trigger.outputPosition === "turn_bottom" ? "turn_end" : "after_block",
      priority: trigger.priority + (image.isPrimary ? 1000 : 0),
      alt: `${trigger.name} 전개 이미지`,
      caption: characterNames || trigger.name,
      source: "package",
      canonical: false,
      triggerId: trigger.id,
      triggerSourceId: trigger.sourceId,
      assetRef: image.assetRef,
      byteLength: image.byteLength,
      dataUrlHeader: image.dataUrlHeader,
      sha256: image.sha256,
    }));
  });
  return {
    format: "RELAY_NOVEL_MEDIA_ASSET_MANIFEST_V2",
    storage: assets
      ? {
          format: "RELAY_NOVEL_ASSET_ONCE_V1",
          integrity: "SHA-256",
          inlineDataUrls: false,
          logicalAssetCount: assets.logicalAssetCount,
          originalAssetBytes: assets.originalAssetBytes,
          storedAssetCount: assets.uniqueAssets.length,
          storedAssetBytes: assets.uniqueAssets.reduce(
            (sum, asset) => sum + asset.byteLength,
            0,
          ),
        }
      : undefined,
    assets: [...characterAssets, ...triggerAssets],
  };
}

export function imageTriggerRuntime() {
  return {
    format: "RELAY_NOVEL_IMAGE_TRIGGER_RUNTIME_V1",
    evaluationTiming: "after_state_update_before_turn_output",
    stateLedger: {
      firedTriggerIds: [],
      instruction: "once=true인 트리거의 ID를 기록하고 다시 실행하지 않는다.",
    },
    ordering: "같은 턴에 여러 조건이 충족되면 priority 내림차순으로 평가한다.",
    triggerSemantics: {
      event_start: "연결 사건의 상태가 Active로 처음 바뀌는 턴",
      event_condition_met:
        "연결 사건의 conditions가 실제 서사 상태에서 충족되는 턴",
      event_success: "연결 사건이 성공 결과로 확정되는 턴",
      event_failure: "연결 사건이 실패 결과로 확정되는 턴",
      clock_value: "연결 사건 시계가 threshold 이상에 처음 도달하는 턴",
      clock_completed: "연결 사건 시계가 maximum에 도달하는 턴",
      foreshadow_revealed: "연결 복선 상태가 Revealed로 바뀌는 턴",
      story_progress: "storyProgress에 적힌 장·막·날짜·서사 단계에 도달하는 턴",
      custom_condition:
        "customCondition을 현재 공개/비공개 상태 장부에 대조해 충족하는 턴",
    },
    modeSemantics: {
      show_trigger_image:
        "트리거에 직접 첨부된 대표 이미지를 원본 그대로 출력한다. 새 이미지를 생성하거나 외형을 변형하지 않는다.",
      show_package_image:
        "선택 인물의 패키지 기준 이미지를 그대로 출력한다. 새 이미지를 생성하지 않는다.",
      generate_character_variant:
        "선택 인물의 기준 이미지를 참조해 포즈·표정·의상·배경만 바꾼 변형 컷을 생성한다.",
      generate_scene:
        "선택 인물과 현재 장면의 정사를 반영한 장면 이미지를 생성한다.",
    },
    hardRules: [
      "트리거 조건을 임의로 앞당기거나 서사를 조건에 맞게 조작하지 않는다.",
      "show_trigger_image이면 attachedImages에서 isPrimary=true인 assetPath를 우선 출력하고, 없으면 첫 번째 첨부 이미지를 사용한다.",
      "useCharacterReferences=true이면 패키지 기준 이미지를 최우선 참조한다.",
      "preserveFaces=true이면 얼굴형·눈·머리·체형·고유 액세서리와 visualAnchor를 유지한다.",
      "spoilerProtection=true이면 이미지와 프롬프트에 아직 공개되지 않은 인물·정체·장소·결과를 넣지 않는다.",
      "이미지 생성 기능이 없으면 생성했다고 주장하지 말고 완성된 [IMAGE TRIGGER PROMPT]를 출력한다.",
    ],
  };
}

export function statusWindowRuntime(project: Project) {
  const status = project.statusWindow;
  const sections = [
    {
      id: "ability",
      label: "ABILITY",
      icon: "zap",
      order: 10,
      enabled: status.sections.skills,
    },
    {
      id: "core_stats",
      label: "CORE STATS",
      icon: "gauge",
      order: 20,
      enabled: status.sections.stats,
    },
    {
      id: "resources",
      label: "RESOURCES",
      icon: "resource",
      order: 30,
      enabled: status.sections.resources,
    },
    {
      id: "condition",
      label: "CONDITION",
      icon: "heart",
      order: 40,
      enabled: status.sections.condition,
    },
    {
      id: "funds",
      label: "FUNDS",
      icon: "wallet",
      order: 50,
      enabled: status.sections.funds,
    },
    {
      id: "relationships",
      label: "CHARACTER · FACTION RELATIONSHIPS",
      icon: "relation",
      order: 60,
      enabled: status.sections.relationships,
    },
  ];
  const relationshipDisplay = status.relationshipDisplays.map(
    (relation, index) => ({
      id: relation.id,
      entityType: relation.entityType,
      entityId: relation.entityId || null,
      label: relation.label,
      order: (index + 1) * 10,
      visibility: relation.visibility,
      revealRule: relation.revealRule,
      displayParts: [
        relation.showSentence ? "sentence" : null,
        relation.showStat ? "stat" : null,
        relation.showSymbol ? "symbol" : null,
      ].filter(Boolean),
      sentence: relation.showSentence ? relation.sentence : null,
      stat: relation.showStat
        ? {
            label: relation.statLabel,
            current: relation.current,
            minimum: relation.minimum,
            maximum: relation.maximum,
            showDelta: status.showDeltas,
          }
        : null,
      symbol: relation.showSymbol ? relation.symbol : null,
      updateRule: relation.updateRule,
    }),
  );
  const fields = [
    ...(status.sections.skills
      ? [
          {
            id: "ability_summary",
            label: "Ability",
            sectionId: "ability",
            sectionLabel: "ABILITY",
            kind: "text",
            visibility: "public",
            icon: "zap",
            order: 10,
            showDelta: false,
            summary: true,
            initialValue: status.abilitySummary,
            updateRule:
              "플레이어가 현재 이해하고 공개할 수 있는 능력만 한두 줄의 쉬운 문장으로 갱신",
          },
        ]
      : []),
    ...(status.sections.stats
      ? status.stats.map((stat, index) => ({
          id: stat.id,
          label: stat.name,
          sectionId: "core_stats",
          sectionLabel: "CORE STATS",
          kind: "number",
          visibility: "public",
          icon: stat.icon,
          order: (index + 1) * 10,
          minimum: 0,
          maximum: Math.max(1, stat.max),
          maxDelta: Math.max(1, stat.max),
          showDelta: status.showDeltas,
          summary: true,
          initialValue: stat.current,
          grade: stat.rank,
          updateRule: "이번 턴에 관측 가능한 서사적 원인이 있을 때만 변경",
        }))
      : []),
    ...(status.sections.resources
      ? status.resources.map((resource, index) => ({
          id: resource.id,
          label: resource.name,
          sectionId: "resources",
          sectionLabel: "RESOURCES",
          kind: "number",
          visibility: resource.visibility,
          revealed: resource.visibility === "public",
          icon: resource.icon,
          order: (index + 1) * 10,
          minimum: 0,
          maxDelta: Math.max(3, resource.current),
          showDelta: status.showDeltas,
          summary: true,
          initialValue: resource.current,
          unit: resource.unit,
          updateRule: resource.revealRule,
        }))
      : []),
    ...(status.sections.condition
      ? [
          {
            id: "condition_summary",
            label: "Condition",
            sectionId: "condition",
            sectionLabel: "CONDITION",
            kind: "text",
            visibility: "public",
            icon: "heart",
            order: 10,
            showDelta: false,
            summary: true,
            initialValue: status.conditionSummary,
            updateRule:
              "현재 관측 가능한 몸과 정신 상태만 한두 줄로 갱신하고 숨은 원인이나 미래 결과는 쓰지 않음",
          },
        ]
      : []),
    ...(status.sections.funds
      ? [
          {
            id: "funds",
            label: status.funds.name,
            sectionId: "funds",
            sectionLabel: "FUNDS",
            kind: "number",
            visibility: "public",
            icon: status.funds.icon,
            order: 10,
            minimum: 0,
            maxDelta: 100000000,
            showDelta: status.showDeltas,
            summary: true,
            initialValue: status.funds.current,
            unit: status.funds.unit,
            updateRule:
              "확인된 수입과 지출이 발생한 경우에만 현재 보유 자금을 갱신",
          },
        ]
      : []),
  ];
  const initialLedger = fields.map((field) => ({
    fieldId: field.id,
    value: field.initialValue,
    grade: "grade" in field ? field.grade : "",
    visibility: field.visibility,
    revealed: field.visibility === "public",
  }));
  return {
    format: "RELAY_NOVEL_STATUS_WINDOW_RUNTIME_V3",
    enabled: status.enabled,
    title: status.title,
    displayMode:
      status.displayMode === "always_compact"
        ? "summary"
        : status.displayMode === "changes_only"
          ? "changes"
          : "full",
    defaultExpanded: true,
    showTurnDelta: status.showDeltas,
    sections,
    fields,
    relationshipDisplay: {
      format: "RELAY_NOVEL_RELATIONSHIP_DISPLAY_V1",
      enabled: status.sections.relationships,
      allowCombinedParts: true,
      supportedParts: ["sentence", "stat", "symbol"],
      entries: relationshipDisplay,
      updatePolicy:
        "update_only_from_observable_interaction_or_public_event_result",
    },
    initialLedger,
    disclosureRules: [
      "Ability와 Condition은 현재 확인된 정보만 한두 줄로 표시한다.",
      ...status.resources.map(
        (resource) => `${resource.name}: ${resource.revealRule}`,
      ),
      "미공개 정체·계약·비밀 세력·미래 사건을 상태창에 노출하지 않는다.",
    ],
    configuration: {
      title: status.title,
      displayMode: status.displayMode,
      theme: status.theme,
      placement: status.placement,
      showDeltas: status.showDeltas,
      collapseOnMobile: status.collapseOnMobile,
      highlightChanges: status.highlightChanges,
      sections: status.sections,
    },
    turnOrder:
      project.runtimeMode === "instant_story"
        ? [
            "date_time_weather_location_header",
            "instant_observable_narrative_and_dialogue",
            "relationship_display_update_from_observable_interaction",
            "character_or_scene_image_when_triggered",
            "public_state_filter",
            "status_window_render",
            "recommended_replies_with_risk",
          ]
        : [
            "date_time_weather_location_header",
            "observable_narrative_and_dialogue",
            "autonomous_actor_selection_and_resolution",
            "hidden_world_ledger_update",
            "relationship_memory_append_and_score_recalculation",
            "character_or_scene_image_when_triggered",
            "public_state_filter",
            "status_window_render",
            "recommended_replies_with_risk",
          ],
    renderTiming: "after_turn_state_update_before_recommended_replies",
    initialState: {
      profile: {
        characterId: project.player.id,
        name: project.player.name,
        role: project.player.role || project.player.occupation,
        affiliation: project.player.affiliation,
        location: project.startLocation,
      },
      skills: status.abilitySummary,
      stats: status.stats,
      resources: status.resources,
      condition: status.conditionSummary,
      funds: status.funds,
      relationships: relationshipDisplay,
    },
    deltaLedger: {
      previousTurnSnapshot: null,
      currentTurnChanges: [],
      instruction:
        "각 변화에 field, before, after, delta, observableCause를 기록하고 출력 후 현재 스냅샷을 다음 턴 기준으로 보존한다.",
    },
    updateRules: status.updateRules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean),
    hardRules: [
      "displayMode=always_full이면 변화가 없어도 매 턴 전체 상태창을 출력한다.",
      "상태 변화는 이번 턴의 관측 가능한 실제 장면 변화 또는 장부에 기록된 원인으로만 발생한다.",
      "Ability와 Condition은 한두 줄을 넘기지 않고 현재 확인된 내용만 쉽게 설명한다.",
      ...status.resources.map(
        (resource) => `${resource.name}: ${resource.revealRule}`,
      ),
      "자금은 플레이어가 실제로 확인한 수입·지출만 반영하고 작품에 설정된 화폐 단위를 유지한다.",
      "인물·세력 관계는 sentence·stat·symbol 중 설정된 조합을 한 항목 안에 함께 표시한다.",
      "관계 문장·수치·기호는 동일한 공개 사건을 근거로 함께 갱신하고 한 원인을 중복 계산하지 않는다.",
      "met_only 관계는 플레이어가 해당 인물 또는 세력을 직접 확인한 뒤에만 표시한다.",
      "미등장 인물·진명·비밀 진영·숨은 관계·비공개 사건 시계는 공개 조건 전까지 렌더링하지 않는다.",
      "플레이어의 행동·대사·감정을 임의로 확정하지 않는다.",
      "없던 아이템·자원·능력·준비를 소급해 만들지 않는다.",
      "표시 값과 내부 장부가 충돌하면 내부 장부를 검증한 뒤 공개 필터를 다시 적용하고, 숨은 정보 자체는 설명하지 않는다.",
    ],
  };
}

export function autonomyRuntime(project: Project) {
  const { rules, ...configuration } = project.autonomySettings;
  return {
    format: "RELAY_NOVEL_AUTONOMY_RUNTIME_V1",
    enabled: project.autonomySettings.enabled,
    configuration,
    actorIds: project.autonomyActors
      .filter((actor) => actor.enabled)
      .map((actor) => actor.id),
    evaluationTiming:
      "after_player_action_and_elapsed_time_before_public_output",
    selectionOrder: [
      "discard_disabled_or_ineligible_actors",
      "check_activity_tier_and_action_cadence",
      "check_location_travel_time_knowledge_resources_and_constraints",
      "rank_by_goal_priority_urgency_and_world_pressure",
      "select_up_to_max_actions_per_turn_without_forcing_every_actor",
      "resolve_success_partial_success_or_failure_with_seeded_variance",
    ],
    deterministicResolution: {
      seedSource:
        "package.randomSeed + turnIndex + stable actor.id hash + action attempt count",
      instruction:
        "같은 입력 상태와 시드에서는 같은 후보 선별과 판정이 재현되어야 한다. 결과를 맞추기 위해 시드를 다시 굴리지 않는다.",
    },
    hiddenLedger: {
      actorStates: [],
      resolvedActions: [],
      discoveredTraces: [],
      instruction:
        "각 자율 행동에 actorId, turn, locationBefore, intent, evidenceUsed, resourcesSpent, rollOrReason, outcome, locationAfter, worldMutations, trace를 기록한다.",
    },
    updateTargets: [
      "actor_location",
      "actor_resources",
      "actor_plan",
      "events",
      "event_clocks",
      "foreshadowings",
      "relationship_memories",
      "observable_traces",
    ],
    authorRules: rules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean),
    hardRules: [
      "활성 배우 모두를 매 턴 움직이지 않는다. 활동 범위·행동 주기·긴급도·우선도를 평가하고 maxActionsPerTurn 이하만 실행한다.",
      "배우는 knowledge에 적힌 사실과 런타임에서 정당하게 획득한 정보만 사용할 수 있다. 플레이어 또는 다른 NPC의 숨은 정보를 전지적으로 알지 못한다.",
      "requireTravelTime=true이면 배우가 현재 위치에서 행동 장소까지 이동할 현실적 시간이 없을 때 해당 행동을 실행하지 않는다.",
      "enforceResourceBounds=true이면 등록되지 않은 돈·도구·권한·인맥·능력을 편의를 위해 소급 생성하지 않는다.",
      "목표와 계획은 성공을 보장하지 않는다. 방해·제약·위험·자원과 시드 판정에 따라 부분 성공 또는 실패할 수 있다.",
      "오프스크린 행동은 먼저 HIDDEN_GM_DATA 장부에 기록한다. 플레이어에게는 tracePolicy와 revealTraces에 맞는 관측 가능한 흔적만 공개한다.",
      "자율 행동의 결과는 다음 턴의 세계 상태에 실제로 반영하며, 필요하면 사건 시계와 관계 이유 기억을 함께 갱신한다.",
      "플레이어가 개입하지 않았다는 이유로 NPC의 갈등·공모·계획을 정지시키거나 자동 성공시키지 않는다.",
    ],
  };
}

export function relationshipMemoryRuntime(project: Project) {
  const { rules, ...configuration } = project.relationshipMemorySettings;
  return {
    format: "RELAY_NOVEL_RELATIONSHIP_MEMORY_RUNTIME_V1",
    enabled: project.relationshipMemorySettings.enabled,
    configuration,
    evaluationTiming: "after_world_mutation_before_public_state_filter",
    scoreFormula:
      "clamp(-100, 100, relation.baselineScore + sum(activeMemory.effects[dimension]))",
    dimensions: [
      "trust",
      "favor",
      "fear",
      "respect",
      "suspicion",
      "hostility",
      "dependency",
    ],
    directionality: "A→B 기억은 B→A 관계나 기억에 자동 복제하지 않는다.",
    memoryLifecycle: {
      temporary:
        "짧은 상황이 해소되면 비활성화할 수 있으나 기록 자체는 삭제하지 않는다.",
      decaying: "중요도·최근성·후속 사건에 따라 효과가 서서히 약해질 수 있다.",
      permanent:
        "정사 수정 또는 명시적 해결 사건 없이는 효과를 자동 감쇠하지 않는다.",
      unresolved:
        "해결 조건이 충족될 때까지 NPC의 판단·대사·자율 행동 후보에 지속적으로 반영한다.",
    },
    appendProtocol: [
      "identify_directional_relation",
      "record_observed_or_hidden_cause",
      "append_memory_before_score_change",
      "apply_effects_and_clamp_each_dimension",
      "retain_contradictory_memories",
      "filter_public_reason_for_hud_and_narrative",
    ],
    initialLedgerInstruction:
      "relations/relationship_memories.json을 원장으로 불러오고 id를 유지한다. 수정·해결 시 원본을 지우지 말고 상태 변화 또는 후속 기억을 남긴다.",
    authorRules: rules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean),
    hardRules: [
      "관계 점수를 임의로 조정하지 않는다. 점수 변화보다 먼저 원인·방향·효과가 있는 RelationshipMemory를 추가한다.",
      "기억은 sourceId가 targetId에게 느끼는 방향성 기록이며 반대 방향을 자동 대칭 처리하지 않는다.",
      "배신·약속·빚·구조·공유한 비밀·모욕·공동 성공과 실패는 후속 행동의 이유로 재사용한다.",
      "keepContradictoryMemories=true이면 호감과 의심처럼 모순되는 감정을 함께 보존하고 한쪽을 임의로 삭제하지 않는다.",
      "Hidden 기억의 제목·원인·효과는 플레이어에게 직접 공개하거나 추론 결과처럼 단정하지 않는다.",
      "상태창에는 직접 만난 인물만 표시하고 displayPublicReasonsInHud=true일 때도 Public 기억의 공개 가능한 요약만 보여준다.",
      "미해결 기억은 resolutionConditions가 실제 사건으로 충족될 때만 해결하며 편의를 위해 턴 경과만으로 소거하지 않는다.",
    ],
  };
}

export function aiWorldContextRuntime(project: Project) {
  const context = project.aiWorldContext;
  const research = context.referenceCharacterResearch;
  const evaluationMoments = Object.entries(context.evaluationMoments)
    .filter(([, enabled]) => enabled)
    .map(([moment]) => moment);
  const referenceCharacters = research.characterNames
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    format: "RELAY_NOVEL_AI_WORLD_CONTEXT_RUNTIME_V1",
    enabled: context.enabled,
    liveEvaluation: context.liveEvaluation,
    execution: {
      mode: "inject_into_simulator_api_context",
      evaluationMoments,
      everyRequestInstruction: context.evaluationMoments.everyTurn
        ? "각 API 응답을 만들기 전에 현재 장부와 아래 worldContext를 짧게 재대조한다."
        : "선택된 주요 시점에만 worldContext를 깊게 재평가한다.",
      updateDepth: context.updateDepth,
      knowledgePolicy: context.knowledgePolicy,
      knowledgePolicySemantics: {
        package_only:
          "패키지에 명시된 정보만 사용하고 외부 작품·역사 지식을 보완하지 않는다.",
        model_knowledge:
          "모델이 알고 있는 참고 세계관과 지역·시대 지식을 적극 활용하되 정사 우선순위를 지킨다.",
        hybrid:
          "패키지를 기준으로 삼고 모델 지식은 빈틈의 보강과 개연성 검토에만 사용한다.",
      },
    },
    worldContext: {
      premise: context.premise,
      referenceFramework: context.referenceFramework,
      referenceUsage: context.referenceUsage,
      localContext: context.localContext,
      enrichmentPriorities: context.enrichmentPriorities,
      protectedCanon: context.protectedCanon,
      avoidElements: context.avoidElements,
      originalityRule: context.originalityRule,
      spoilerRule: context.spoilerRule,
    },
    referenceCharacterResearch: {
      enabled: research.enabled,
      lookupMode: research.allowWebSearch
        ? "simulator_web_search_tool"
        : "model_knowledge_only",
      characters: referenceCharacters,
      researchScope: research.researchScope,
      sourcePriority: research.sourcePriority,
      canonCutoff: research.canonCutoff,
      cacheMode: research.cacheMode,
      lookupTiming: {
        sessionStart: true,
        beforeFirstAppearance: research.verifyOnFirstAppearance,
        onCanonConflict: research.verifyOnCanonConflict,
        everyTurn: false,
      },
      recordSourcesInLedger: research.recordSourcesInLedger,
      ledgerSchema: [
        "characterName",
        "franchiseAndTimeline",
        "sourceTitle",
        "sourceUrl",
        "checkedAt",
        "verifiedFacts",
        "conflicts",
        "adoptedInterpretation",
      ],
      applyInstruction:
        "검증·캐시된 인물 프로필을 매 턴 해당 인물의 목표, 판단, 말투, 호칭, 능력 한계와 관계 반응에 반영한다. 검색 자체는 매 턴 반복하지 않는다.",
    },
    reasoningPipeline: [
      "현재 WORLD_CANON, 사건·시계, 관계 기억, NPC·세력 위치와 지식 장부를 먼저 읽는다.",
      "referenceFramework의 작동 규칙과 장르적 기대 중 현재 장면에 관련된 항목만 추린다.",
      "localContext를 적용해 장소·역사·기관·일상·사회 반응이 실제 배경에 맞는지 검토한다.",
      "후보 사건·NPC 판단·세계관 세부를 enrichmentPriorities에 맞게 보강한다.",
      "protectedCanon, avoidElements, originalityRule, spoilerRule을 통과한 내용만 현재 장면과 숨은 장부에 반영한다.",
    ],
    canonPriority: [
      "현재 패키지의 fixedCanon과 명시된 인물·사건",
      "현재 시뮬레이터 장부와 플레이어가 만든 확정 사실",
      "참고 작품·세계관의 일반 규칙",
      "모델 지식과 창작적 보완",
    ],
    hardRules: [
      "참고 작품의 설정이 현재 패키지 정사와 충돌하면 현재 패키지를 따른다.",
      "모델 지식은 정사처럼 단정하지 않고, 현재 프로젝트와 모순되지 않는 보강 재료로만 사용한다.",
      "기존 작품의 사건·대사·캐릭터 역할을 그대로 복제하지 않고 현재 인물의 목표와 지역 맥락에서 새 원인과 결과를 만든다.",
      "플레이어가 알 수 없는 진명·배후·비밀 규칙은 spoilerRule과 공개 범위를 통과하기 전까지 서술하지 않는다.",
      "세계관 보강은 설정 설명문으로 한꺼번에 쏟지 말고 장면·행동·소문·기록·사건 결과를 통해 자연스럽게 드러낸다.",
      "새 설정이 이후 사건에 영향을 주면 HIDDEN_GM_DATA의 worldTruthLedger 또는 continuityNotes에 근거와 함께 기록한다.",
      "기존 작품 캐릭터 조사가 활성화되면 공식 자료를 우선하고 서로 다른 작품·시간대·동명이인·번역 표기를 구분한다.",
      "검색 도구를 실제로 호출할 수 없는 환경에서는 검색했다고 주장하거나 출처 URL을 꾸며내지 말고, 패키지 정보와 모델 지식만 사용했음을 장부에 표시한다.",
      "원작 인물 정보는 긴 원문을 복사하지 않고 성격·말투·목표·능력 한계·관계 사실을 간결하게 요약한다.",
      "원작 인물의 검색 결과와 현재 패키지의 각색 설정이 충돌하면 패키지 설정을 유지하고 차이를 referenceCharacterLedger에 기록한다.",
    ],
    routeContexts: context.routeContexts,
    knowledgeScopes: context.knowledgeScopes,
  };
}

export function buildImportObject(
  project: Project,
  assets?: PackageAssetIndex,
) {
  project = retireLocationGraph(project);
  const packageVersion = packageVersionFor(project);
  const isCortex = project.packageTarget === "cortex";
  const runtimeInvariants = characterInvariantsForRuntime(project);
  const publicNpcs = project.npcs.map((character) => {
    const { hiddenInfo: _hidden, ...rest } = cleanCharacter(character, assets);
    return rest;
  });
  const npcSecrets = project.npcs
    .filter((character) => character.hiddenInfo.trim())
    .map((character) => ({
      id: character.id,
      name: character.name,
      hiddenInfo: character.hiddenInfo,
    }));
  const publicFactions = project.factions.map((faction) => {
    const { hiddenGoal: _goal, currentPlan: _plan, ...rest } = faction;
    return rest;
  });
  const factionSecrets = project.factions
    .filter(
      (faction) => faction.hiddenGoal.trim() || faction.currentPlan.trim(),
    )
    .map((faction) => ({
      id: faction.id,
      name: faction.name,
      hiddenGoal: faction.hiddenGoal,
      currentPlan: faction.currentPlan,
    }));
  const publicCharacterRelations = project.characterRelations.map(
    (relation) => {
      const { hiddenNotes: _hidden, ...rest } = relation;
      return rest;
    },
  );
  const hiddenCharacterRelations = project.characterRelations
    .filter((relation) => relation.hiddenNotes.trim())
    .map((relation) => ({
      id: relation.id,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      hiddenNotes: relation.hiddenNotes,
    }));
  const publicFactionRelations = project.factionRelations.map((relation) => {
    const { hiddenNotes: _hidden, ...rest } = relation;
    return rest;
  });
  const hiddenFactionRelations = project.factionRelations
    .filter((relation) => relation.hiddenNotes.trim())
    .map((relation) => ({
      id: relation.id,
      sourceFactionId: relation.sourceFactionId,
      targetFactionId: relation.targetFactionId,
      hiddenNotes: relation.hiddenNotes,
    }));
  const publicImageTriggers = project.imageTriggers
    .filter((trigger) => trigger.enabled && trigger.visibility === "Public")
    .map((trigger) => cleanImageTrigger(trigger, assets));
  const hiddenImageTriggers = project.imageTriggers
    .filter((trigger) => trigger.enabled && trigger.visibility === "Hidden")
    .map((trigger) => cleanImageTrigger(trigger, assets));
  const publicRelationshipMemories = project.relationshipMemories.filter(
    (memory) => memory.visibility === "Public",
  );
  const hiddenRelationshipMemories = project.relationshipMemories.filter(
    (memory) => memory.visibility === "Hidden",
  );
  const { hiddenRisks: _hiddenRisks, ...publicOpening } = project.opening;
  return {
    package: {
      packageVersion,
      engineVersion: ENGINE_VERSION,
      projectId: project.projectId,
      title: project.title,
      difficulty: project.difficulty,
      randomSeed: project.randomSeed,
      generatedAt: new Date().toISOString(),
      ...(project.packageTarget === "cortex"
        ? {
            packageTarget: "cortex",
            format: CORTEX_PACKAGE_FORMAT,
            minimumTargetVersion: CORTEX_MIN_VERSION,
            integrationTarget: cortexCompatibility(project).integrationTarget,
            protagonistInvariants: runtimeInvariants,
          }
        : {}),
    },
    ...(project.packageTarget === "cortex"
      ? {
          protagonistInvariants: runtimeInvariants,
          disclosure: project.disclosure,
        }
      : {}),
    importInstruction: {
      command: "/패키지불러오기",
      rules: isCortex
        ? [
            project.runtimeMode === 'instant_story' ? 'Instant 전용 실행 경로에서 입력·키워드·수치와 작가 전용 비공개 설정을 사용하고 고정 정사 비트나 자동 엔딩 검사를 적용하지 않는다.' : cortexAuthoringGuidance,
            "비공개 GM 설정과 아직 공개되지 않은 정보는 산문에 직접 노출하지 않는다.",
            "장소·인물·사건 참조는 패키지 연결용이며 산문 안의 모든 실체를 별도 장부에 등록하도록 강제하지 않는다.",
          ]
        : [
            ...(project.package15.enabled
              ? [
                  "Package 1.5 requiredFeatures를 먼저 협상하며 하나라도 미지원이면 1.4 축소 실행이나 추측 폴백 없이 호환 오류로 중단한다.",
                  "루트 상태는 targeting → locked → ending → completed 순서로만 전이하고 route_graph의 진입·확정 사건 양방향 참조를 지킨다.",
                  "사건 완료의 권위 원본은 completionScope·status·actualLoopOrdinal·fulfillmentId를 가진 EventLedgerRecord이며 completedEventIds 배열로 대체하지 않는다.",
                  "RevealPolicy는 beforeMode와 afterMode를 transitionWhen으로 전환하며 동시 정책은 forbidden > hint_only > partial > full 순서로 더 제한적인 값을 채택한다.",
                  "루프 조건 RuntimePredicate와 기억 전이 대상 ActorSelector를 혼용하지 않고 resetPrecedence를 고정 순서로 적용한다.",
                  "플레이어 메타·주인공 기억·NPC 지식은 knowledgeScopes에 따라 분리하고 routeContexts의 정사·공개 정책을 매 장면에 적용한다.",
                ]
              : []),
            "범용 릴레이 소설 시뮬레이터 엔진 2.0 이상을 활성화한다.",
            "CANON/PUBLIC/HIDDEN을 분리하고 HIDDEN_GM_DATA는 플레이어에게 직접 노출하지 않는다.",
            "플레이어 캐릭터의 행동·대사·감정을 예측하거나 대신 서술하지 않는다.",
            "AI_WORLD_CONTEXT_RUNTIME이 활성화되어 있으면 각 API 응답과 선택된 주요 시점에 현재 장부·참고 세계관·지역 맥락을 재대조하고, 패키지 정사를 우선한 보강만 반영한다.",
            "인물 및 세력 관계는 방향성이 있으며 반대 방향을 자동 대칭 처리하지 않는다.",
            "매 턴 플레이어 행동과 경과 시간을 처리한 뒤 AUTONOMY_RUNTIME에 따라 위치·정보·자원·주기·목표 우선도가 맞는 NPC와 세력만 선별하여 자율 행동을 판정한다.",
            "자율 행동은 성공을 보장하지 않으며 부분 성공·실패할 수 있다. 결과를 비공개 세계 장부와 사건 시계에 반영하고 관측 가능한 흔적만 공개한다.",
            "관계 점수를 임의로 바꾸지 않는다. RELATIONSHIP_MEMORY_RUNTIME에 따라 방향성 기억을 먼저 기록한 뒤 초기 기준값과 기억 효과를 합산한다.",
            "약속·배신·빚·구조·공유한 비밀·모욕과 미해결 감정은 이유와 함께 장기 보존하고 이후 NPC 판단의 근거로 사용한다.",
            "사건 시계는 조건이 충족될 때만 전진·후퇴시키고 최대치 결과를 적용한다.",
            "required=true인 사건은 priority 숫자와 별개인 서사 계약이다. sequence 순서, completionSignals, requiredItems, requiredDialogue를 지키며 플레이어의 회피·거절로 삭제하거나 무기한 보류하지 않는다.",
            project.packageTarget === "cortex"
              ? "필수 사건은 preservePlayerChoice에 따라 플레이어가 만든 사실을 유지한다. Cortex v1.36에서는 3비트와 최대 2회 연장 뒤 미충족 요건을 서사적으로 봉합하고 SUCCESS로 봉인하므로, 실패 분기는 명시적 failureConditions와 onFailure로만 설계한다. endSceneAfterCompletion=true이면 같은 턴에 다음 필수 사건을 시작하지 않는다."
              : "필수 사건의 원래 방식이 막히면 preservePlayerChoice에 따라 첫 선택을 사실로 유지하고 recoveryAlternatives 중 현재 세계관에 맞는 경로로 핵심 인과를 회수한다. endSceneAfterCompletion=true이면 같은 턴에 다음 필수 사건을 시작하지 않는다.",
            "kind=constraint인 항목은 독립 사건으로 진행하거나 봉인하지 않는다. appliesTo에 연결된 사건 동안 rules를 항상 적용하며, 규칙을 어긴 출력은 폐기하고 재생성한다.",
            "kind=compound인 사건은 beats 배열의 순서대로 한 번에 한 비트만 진행한다. 현재 비트가 본문에서 실제로 끝나기 전에는 다음 비트 내용을 앞당기지 않는다.",
            "장기 복선은 심기·강화·회수 상태를 추적하며 근거 없는 반전을 금지한다.",
            "주요 캐릭터 첫 등장 시 CHARACTER_VISUAL_BIBLE의 이미지 정책을 반드시 적용한다.",
            "패키지의 기준 이미지가 있으면 최우선 참조한다. 없으면 지정 방식으로 애니풍 이미지를 만들고 그 최초 결과를 외형 정사로 고정한다.",
            "이후 이미지 생성에서는 얼굴형·눈·머리·체형·고유 액세서리와 visualAnchor를 일관되게 유지한다.",
            "매 턴 상태 갱신 직후 IMAGE_TRIGGER_RUNTIME에 따라 이미지 트리거를 우선순위 순서로 평가한다.",
            "이미지 트리거가 충족되면 공개 범위·스포일러 방지·1회 실행 규칙을 지켜 트리거 전용 이미지 또는 캐릭터 기준 이미지를 표시하거나 장면 이미지를 생성한다.",
            "매 턴 서술과 이미지 처리가 끝나면 STATUS_WINDOW_RUNTIME에 따라 비공개 장부를 갱신하고 공개 필터를 적용한 상태창을 렌더링한다.",
            "상태창은 추천 행동 직전에 출력하고, 바뀐 값에는 이전 턴 대비 증감과 관측 가능한 원인을 표시한다.",
            "관계에는 플레이어가 직접 만난 인물만 표시하고 미등장 인물·진명·비밀 진영·숨은 관계는 공개하지 않는다.",
            "매 턴 끝에 설정된 수만큼 추천 행동을 제시하되 숨은 정보를 사용하거나 성공을 보장하지 않는다.",
            "검증 후 공개 초기 상태표와 제1턴을 시작한다.",
          ],
    },
    scenario: {
      title: project.title,
      genre: project.genre,
      worldType: project.worldType,
      startDate: project.startDate,
      startLocation: project.startLocation,
      tone: project.tone,
      playStyle: project.playStyle,
      author: project.author,
      notes: project.notes,
      difficultyProfile: difficultyProfile(project),
    },
    worldCanon: project.world,
    player: cleanCharacter(project.player, assets),
    publicNpcs,
    publicFactions,
    publicCharacterRelations,
    publicRelationshipMemories,
    publicFactionRelations,
    publicEvents: isCortex ? compileCortexEvents(project).filter(event => event.visibility === 'Public') : project.events.filter(event => event.visibility === 'Public').map(event => cleanStoryEvent(event)),
    publicEventClocks: project.eventClocks
      .filter((clock) => clock.visibility === "Public")
      .map(cleanPublicClock),
    publicForeshadowings: project.foreshadowings.filter(
      (item) => item.visibility === "Public",
    ),
    publicImageTriggers,
    aiWorldContextRuntime: aiWorldContextRuntime(project),
    package15: project.package15.enabled ? project.package15 : undefined,
    imageTriggerRuntime: imageTriggerRuntime(),
    autonomyRuntime: autonomyRuntime(project),
    relationshipMemoryRuntime: relationshipMemoryRuntime(project),
    statusWindowRuntime: statusWindowRuntime(project),
    characterVisualBible: visualManifest(project, assets),
    style: runtimeStyle(project),
    turnPresentation: isCortex
      ? {
          ...project.turnPresentation,
          recommendedReplies: {
            ...project.turnPresentation.recommendedReplies,
            enabled: project.runtimeMode === "instant_story",
            count: project.runtimeMode === "instant_story" ? 3 : project.turnPresentation.recommendedReplies.count,
          },
        }
      : project.turnPresentation,
    opening: publicOpening,
    hiddenGmData: {
      npcSecrets,
      factionSecrets,
      hiddenCharacterRelations,
      autonomyActors: project.autonomyActors,
      hiddenRelationshipMemories,
      hiddenFactionRelations,
      hiddenEvents: isCortex ? compileCortexEvents(project).filter(event => event.visibility === 'Hidden') : project.events.filter(event => event.visibility === 'Hidden').map(event => cleanStoryEvent(event)),
      hiddenEventClocks: project.eventClocks.filter(
        (clock) => clock.visibility === "Hidden" || clock.hiddenNotes.trim(),
      ),
      hiddenForeshadowings: project.foreshadowings.filter(
        (item) => item.visibility === "Hidden",
      ),
      hiddenImageTriggers,
      hiddenRisks: project.opening.hiddenRisks,
      gmLedger: project.gmData,
    },
  };
}

const section = (title: string, value: unknown) =>
  `## ${title}\n\n~~~json\n${JSON.stringify(value, null, 2)}\n~~~\n\n`;
function buildMarkdownLegacy(project: Project, assets?: PackageAssetIndex) {
  const value = buildImportObject(project, assets);
  if (project.packageTarget === "cortex")
    return `# ${project.title} Cortex 작품\n\n${cortexAuthoringGuidance}\n\n~~~json\n${JSON.stringify(value, null, 2)}\n~~~`;
  return `# RELAY NOVEL SCENARIO PACKAGE\n\nPACKAGE_VERSION: ${PACKAGE_VERSION}\nENGINE_VERSION: ${ENGINE_VERSION}\nPACKAGE_ID: ${project.projectId}\nTITLE: ${project.title}\nDIFFICULTY: ${project.difficulty}\nRANDOM_SEED: ${project.randomSeed}\n\n## IMPORT INSTRUCTION\n\n이 파일은 Relay Novel Studio v${PACKAGE_VERSION} 실행 패키지다.\n1. 세계관·인물·세력·사건을 정사 우선순위에 따라 검증한다.\n2. HIDDEN_GM_DATA는 감독자 전용이며 플레이어에게 직접 공개하거나 요약하지 않는다.\n3. 플레이어 캐릭터의 행동·대사·감정을 예측하거나 대신 서술하지 않는다.\n4. 매 턴 플레이어 행동과 경과 시간을 처리한 뒤 AUTONOMY_RUNTIME으로 행동 가능한 NPC·세력만 선별한다.\n5. 자율 배우는 위치·정보·자원·제약을 지키며 화면 밖에서도 공모·이동·부분 성공·실패할 수 있다.\n6. 관계 점수보다 먼저 RELATIONSHIP_MEMORY_RUNTIME에 방향성 원인 기억을 기록하고, 기준값과 기억 효과를 합산한다.\n7. 약속·배신·빚·구조·비밀·모욕·미해결 감정은 장기 기억으로 보존해 이후 판단에 사용한다.\n8. 사건 시계와 복선 장부를 실제 세계 변화에 따라 갱신하되 공개 범위를 준수한다.\n9. kind=constraint는 독립 사건이나 진행 단계가 아니다. appliesTo 대상 사건 동안 rules를 계속 지키고 위반 출력은 폐기한다.\n10. kind=compound는 beats 순서대로 한 번에 한 비트만 진행하며 뒤 비트를 앞당기지 않는다.\n11. 비중 높은 캐릭터가 처음 등장하면 CHARACTER_VISUAL_BIBLE에 따라 인물 이미지를 반드시 출력한다.\n12. 패키지 기준 이미지가 없으면 애니풍 이미지를 생성하고 그 최초 이미지를 해당 인물의 외형 정사로 고정한다.\n13. 이후 장면 이미지에서 얼굴·머리·눈·체형·고유 액세서리와 visualAnchor를 유지한다.\n14. 세계·관계 장부 갱신 뒤 IMAGE_TRIGGER_RUNTIME에 따라 특정 전개 이미지 트리거를 평가한다.\n15. 충족된 트리거는 우선순위·공개 범위·스포일러 방지·1회 실행 규칙을 지켜 실행하며, show_trigger_image는 첨부된 대표 이미지를 원본 그대로 출력한다.\n16. 장면 출력 뒤 STATUS_WINDOW_RUNTIME에 따라 공개 상태창을 매 턴 렌더링하고, 변화량과 관측 가능한 관계 이유를 표시한다.\n17. 관계에는 직접 만난 인물만 표시하고 미등장 인물·진명·비밀 진영·숨은 관계·비공개 시계를 차단한다.\n18. 상태창은 추천 행동 직전에 배치하며 추천 행동은 숨은 정보를 사용하거나 성공을 보장하지 않는다.\n19. 이미지 생성 기능이 없으면 생성했다고 주장하지 말고 [CHARACTER IMAGE PROMPT], [SCENE IMAGE PROMPT] 또는 [IMAGE TRIGGER PROMPT]를 출력한다.\n20. 검증 완료 후 공개 초기 상태표를 만들고 제1턴을 시작한다.\n\n사용자 명령: /패키지불러오기\n\n${section("SCENARIO", value.scenario)}${section("WORLD_CANON", value.worldCanon)}${section("PLAYER_CHARACTER", value.player)}${section("PUBLIC_NPCS", value.publicNpcs)}${section("CHARACTER_VISUAL_BIBLE", value.characterVisualBible)}${section("PUBLIC_FACTIONS", value.publicFactions)}${section("PUBLIC_CHARACTER_RELATIONS", value.publicCharacterRelations)}${section("PUBLIC_RELATIONSHIP_MEMORIES", value.publicRelationshipMemories)}${section("RELATIONSHIP_MEMORY_RUNTIME", value.relationshipMemoryRuntime)}${section("AUTONOMY_RUNTIME", value.autonomyRuntime)}${section("PUBLIC_FACTION_RELATIONS", value.publicFactionRelations)}${section("PUBLIC_EVENTS", value.publicEvents)}${section("PUBLIC_EVENT_CLOCKS", value.publicEventClocks)}${section("PUBLIC_FORESHADOWINGS", value.publicForeshadowings)}${section("IMAGE_TRIGGER_RUNTIME", value.imageTriggerRuntime)}${section("PUBLIC_IMAGE_TRIGGERS", value.publicImageTriggers)}${section("STATUS_WINDOW_RUNTIME", value.statusWindowRuntime)}${section("STYLE_PROFILE", value.style)}${section("TURN_PRESENTATION", value.turnPresentation)}${section("OPENING_SCENE", value.opening)}## HIDDEN_GM_DATA\n\n> 아래 블록은 감독자 전용이다. 플레이어에게 직접 공개하거나 요약하지 않는다.\n\n~~~json\n${JSON.stringify(value.hiddenGmData, null, 2)}\n~~~\n\n## START COMMAND\n\n/패키지불러오기\n`;
}

export function buildMarkdown(project: Project, assets?: PackageAssetIndex) {
  const value = buildImportObject(project, assets);
  const packageVersion = packageVersionFor(project);
  const renumbered = buildMarkdownLegacy(project, assets).replace(
    /^(\d+)\. /gm,
    (line, number) => (Number(number) >= 4 ? `${Number(number) + 1}. ` : line),
  );
  const withRuntimeInstruction = renumbered.replace(
    "3. 플레이어 캐릭터의 행동·대사·감정을 예측하거나 대신 서술하지 않는다.\n",
    "3. 플레이어 캐릭터의 행동·대사·감정을 예측하거나 대신 서술하지 않는다.\n4. AI_WORLD_CONTEXT_RUNTIME이 활성화되어 있으면 각 API 응답과 선택된 주요 시점에 현재 장부·참고 세계관·지역 맥락을 재대조하고, 패키지 정사를 우선한 보강만 반영한다.\n",
  );
  const document = withRuntimeInstruction
    .replace(
      `PACKAGE_VERSION: ${PACKAGE_VERSION}`,
      `PACKAGE_VERSION: ${packageVersion}`,
    )
    .replace(
      `이 파일은 Relay Novel Studio v${PACKAGE_VERSION} 실행 패키지다.`,
      `이 파일은 Relay Novel Studio v${STUDIO_VERSION} / Package ${packageVersion} 실행 패키지다.`,
    )
    .replace(
      section("SCENARIO", value.scenario),
      `${section("SCENARIO", value.scenario)}${section("AI_WORLD_CONTEXT_RUNTIME", value.aiWorldContextRuntime)}`,
    );
  const withCortexContract =
    project.packageTarget === "cortex"
      ? document.replace(
          section("SCENARIO", value.scenario),
          `${section("SCENARIO", value.scenario)}${section("PROTAGONIST_INVARIANTS", characterInvariantsForRuntime(project))}`,
        )
      : document;
  return project.package15.enabled
    ? withCortexContract.replace(
        section("AI_WORLD_CONTEXT_RUNTIME", value.aiWorldContextRuntime),
        `${section("AI_WORLD_CONTEXT_RUNTIME", value.aiWorldContextRuntime)}${section("PACKAGE_15_DEFINITIONS", value.package15)}`,
      )
    : withCortexContract;
}

function download(
  name: string,
  value: Blob | string,
  type = "application/json",
) {
  const blob = value instanceof Blob ? value : new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function projectSnapshotSummary(project: Project) {
  const characterImages = [project.player, ...project.npcs].reduce(
    (sum, character) => sum + character.images.length,
    0,
  );
  const triggerImages = project.imageTriggers.reduce(
    (sum, trigger) => sum + trigger.attachedImages.length,
    0,
  );
  return {
    characters: 1 + project.npcs.length,
    factions: project.factions.length,
    events: project.events.filter((event) => event.kind !== "constraint")
      .length,
    constraints: project.events.filter((event) => event.kind === "constraint")
      .length,
    compoundEvents: project.events.filter((event) => event.kind === "compound")
      .length,
    autonomyActors: project.autonomyActors.length,
    relationshipMemories: project.relationshipMemories.length,
    aiWorldContextEnabled: project.aiWorldContext.enabled,
    characterImages,
    triggerImages,
    embeddedImages: characterImages + triggerImages,
  };
}

const cleanEditorProject = (project: Project, assets: PackageAssetIndex) => ({
  ...project,
  player: cleanCharacter(project.player, assets),
  npcs: project.npcs.map((character) => cleanCharacter(character, assets)),
  imageTriggers: project.imageTriggers.map((trigger) =>
    cleanImageTrigger(trigger, assets),
  ),
});

export function buildProjectSnapshot(
  project: Project,
  exportedAt = new Date().toISOString(),
  assets?: PackageAssetIndex,
) {
  project = archiveProjectSchedules(retireLocationGraph(project));
  if (!assets) {
    return {
      format: PROJECT_SNAPSHOT_FORMAT_V1,
      ...JIEUM_AUTHORING_METADATA,
      studioVersion: STUDIO_VERSION,
      packageVersion: packageVersionFor(project),
      engineVersion: ENGINE_VERSION,
      exportedAt,
      imageStorage: "embedded_data_url",
      summary: projectSnapshotSummary(project),
      project:
        project.packageTarget === "cortex"
          ? omitRetiredLocationFields(project)
          : project,
    };
  }
  return {
    format: PROJECT_SNAPSHOT_FORMAT,
    ...JIEUM_AUTHORING_METADATA,
    studioVersion: STUDIO_VERSION,
    packageVersion: packageVersionFor(project),
    engineVersion: ENGINE_VERSION,
    exportedAt,
    imageStorage: "zip_asset_ref",
    summary: projectSnapshotSummary(project),
    project:
      project.packageTarget === "cortex"
        ? omitRetiredLocationFields(cleanEditorProject(project, assets))
        : cleanEditorProject(project, assets),
  };
}

const bytesToDataUrl = (
  bytes: Uint8Array,
  mimeType: string,
  dataUrlHeader?: string,
) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return `${dataUrlHeader || `data:${mimeType || "application/octet-stream"};base64`},${btoa(binary)}`;
};

type JsonRecord = Record<string, unknown>;
const isJsonRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const restorePackagedImages = async (project: JsonRecord, archive: JSZip) => {
  const restore = async (image: JsonRecord) => {
    if (typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:"))
      return image;
    const assetPath = String(image.assetPath ?? "");
    const asset = assetPath ? archive.file(assetPath) : null;
    if (!asset)
      throw new Error(
        `이미지 자산을 찾을 수 없습니다: ${assetPath || String(image.fileName ?? "경로 없음")}`,
      );
    const bytes = await asset.async("uint8array");
    const expectedSha =
      typeof image.sha256 === "string"
        ? image.sha256
        : typeof image.assetRef === "string" &&
            image.assetRef.startsWith("sha256:")
          ? image.assetRef.slice(7)
          : "";
    if (expectedSha && expectedSha !== (await sha256Hex(bytes)))
      throw new Error(`이미지 무결성 검증에 실패했습니다: ${assetPath}`);
    return {
      ...image,
      dataUrl: bytesToDataUrl(
        bytes,
        String(image.mimeType ?? "application/octet-stream"),
        typeof image.dataUrlHeader === "string"
          ? image.dataUrlHeader
          : undefined,
      ),
    };
  };
  const restoreCharacter = async (character: JsonRecord) => ({
    ...character,
    images: await Promise.all(
      (Array.isArray(character.images)
        ? character.images.filter(isJsonRecord)
        : []
      ).map(restore),
    ),
  });
  const restored: JsonRecord = { ...project };
  if (isJsonRecord(project.player))
    restored.player = await restoreCharacter(project.player);
  if (Array.isArray(project.npcs))
    restored.npcs = await Promise.all(
      project.npcs.filter(isJsonRecord).map(restoreCharacter),
    );
  if (Array.isArray(project.imageTriggers))
    restored.imageTriggers = await Promise.all(
      project.imageTriggers
        .filter(isJsonRecord)
        .map(async (trigger) => ({
          ...trigger,
          attachedImages: await Promise.all(
            (Array.isArray(trigger.attachedImages)
              ? trigger.attachedImages.filter(isJsonRecord)
              : []
            ).map(restore),
          ),
        })),
    );
  return restored;
};

export type EmbeddedProjectImport = {
  project: Record<string, unknown>;
  source:
    | "embedded_snapshot"
    | "legacy_package_project"
    | "mobile_safe_package_project";
  fullFidelity: boolean;
};

export type PackageImportProgress = {
  phase: "opening" | "settings" | "images" | "verifying";
  loadedBytes: number;
  totalBytes: number;
  currentImage: number;
  totalImages: number;
  detail: string;
};

const mimeFromPath = (path: string) => {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "heic" || extension === "heif") return "image/heic";
  return "application/octet-stream";
};

const concatChunks = (chunks: Uint8Array[]) => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const projectImages = (project: JsonRecord) => {
  const images: JsonRecord[] = [];
  const collectCharacter = (character: unknown) => {
    if (!isJsonRecord(character) || !Array.isArray(character.images)) return;
    images.push(...character.images.filter(isJsonRecord));
  };
  collectCharacter(project.player);
  if (Array.isArray(project.npcs)) project.npcs.forEach(collectCharacter);
  if (Array.isArray(project.imageTriggers)) {
    for (const trigger of project.imageTriggers.filter(isJsonRecord)) {
      if (Array.isArray(trigger.attachedImages))
        images.push(...trigger.attachedImages.filter(isJsonRecord));
    }
  }
  return images;
};

const hydrateBlobImages = async (
  project: JsonRecord,
  blobs: Map<string, Blob>,
  onProgress?: (progress: PackageImportProgress) => void,
) => {
  const images = projectImages(project);
  let currentImage = 0;
  for (const image of images) {
    if (typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:"))
      continue;
    const assetPath = String(image.assetPath ?? "");
    const blob = assetPath ? blobs.get(assetPath) : undefined;
    if (!blob)
      throw new Error(
        `이미지 자산을 찾을 수 없습니다: ${assetPath || String(image.fileName ?? "경로 없음")}`,
      );
    currentImage += 1;
    onProgress?.({
      phase: "verifying",
      loadedBytes: 0,
      totalBytes: 0,
      currentImage,
      totalImages: images.length,
      detail: String(image.fileName ?? assetPath),
    });
    const expectedSha =
      typeof image.sha256 === "string"
        ? image.sha256
        : typeof image.assetRef === "string" &&
            image.assetRef.startsWith("sha256:")
          ? image.assetRef.slice(7)
          : "";
    if (expectedSha) {
      const actualSha = await sha256Hex(
        new Uint8Array(await blob.arrayBuffer()),
      );
      if (actualSha !== expectedSha)
        throw new Error(
          `이미지 무결성 검증에 실패했습니다: ${String(image.fileName ?? assetPath)} (${assetPath}, ${expectedSha.slice(0, 12)} != ${actualSha.slice(0, 12)})`,
        );
    }
    image.sourceBlob = blob;
    image.byteLength = blob.size;
    image.mimeType = String(
      image.mimeType || blob.type || mimeFromPath(assetPath),
    );
    image.dataUrl = URL.createObjectURL(blob);
  }
  return project;
};

/**
 * Reads a File/Blob incrementally. Large V1 embedded snapshots are deliberately
 * skipped and rebuilt from project.json + assets so iOS never materializes the
 * ZIP, a 200MB JSON string, and Base64 images at the same time.
 */
async function extractStudioProjectFromBlob(
  input: Blob,
  onProgress?: (progress: PackageImportProgress) => void,
): Promise<EmbeddedProjectImport> {
  const MAX_INLINE_SNAPSHOT_BYTES = 24 * 1024 * 1024;
  let packageProject: JsonRecord | null = null;
  let snapshotProject: JsonRecord | null = null;
  let snapshotFormat = "";
  let authoritativeEditor = false;
  let manifest: JsonRecord | null = null;
  let dedicatedLocationGraph: JsonRecord | null = null;
  let dedicatedEvents: unknown[] | null = null;
  let dedicatedWorld: JsonRecord | null = null;
  const dedicatedDisclosures: JsonRecord[] = [];
  let snapshotBytes: Uint8Array | null = null;
  let skippedLargeSnapshot = false;
  const wantedAssetPaths = new Set<string>();
  const assetBlobs = new Map<string, Blob>();
  let loadedBytes = 0;
  let extractedImages = 0;

  const refreshWantedAssets = (project: JsonRecord) => {
    wantedAssetPaths.clear();
    for (const image of projectImages(project)) {
      if (
        typeof image.dataUrl === "string" &&
        image.dataUrl.startsWith("data:")
      )
        continue;
      if (typeof image.assetPath === "string" && image.assetPath)
        wantedAssetPaths.add(image.assetPath);
    }
  };

  await new Promise<void>((resolve, reject) => {
    let inputEnded = false;
    let activeFiles = 0;
    let settled = false;
    const finish = () => {
      if (!settled && inputEnded && activeFiles === 0) {
        settled = true;
        resolve();
      }
    };
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const unzip = new Unzip((entry) => {
      const name = entry.name;
      const isSnapshot = name === EMBEDDED_PROJECT_SNAPSHOT_PATH;
      const isLocationGraph = name === "cortex/location_graph.json";
      const isEvents = name === "events/events.json";
      const isWorld = name === "world/world.json";
      const isDisclosure =
        name === "disclosure.json" || name === "cortex/disclosure.json";
      const isJson =
        name === "project.json" ||
        name === "manifest.json" ||
        isSnapshot ||
        isLocationGraph ||
        isEvents ||
        isWorld ||
        isDisclosure;
      const isLargeV1Candidate =
        isSnapshot &&
        Number(entry.originalSize ?? 0) > MAX_INLINE_SNAPSHOT_BYTES;
      // Keep asset discovery independent of ZIP entry order. Third-party and
      // older packagers are allowed to place assets/ before project.json.
      const isWantedAsset =
        name.startsWith("assets/") && name !== "assets/manifest.json";
      if (isLargeV1Candidate) {
        skippedLargeSnapshot = true;
        return;
      }
      if (!isJson && !isWantedAsset) return;
      activeFiles += 1;
      const chunks: Uint8Array[] = [];
      entry.ondata = (error, data, final) => {
        if (error) {
          fail(error);
          return;
        }
        chunks.push(data);
        if (!final) return;
        try {
          const bytes = concatChunks(chunks);
          if (isWantedAsset) {
            const mimeType = mimeFromPath(name);
            assetBlobs.set(name, new Blob([bytes], { type: mimeType }));
            extractedImages += 1;
            onProgress?.({
              phase: "images",
              loadedBytes,
              totalBytes: input.size,
              currentImage: extractedImages,
              totalImages: wantedAssetPaths.size,
              detail: name.split("/").pop() ?? name,
            });
          } else {
            const parsed = JSON.parse(
              new TextDecoder().decode(bytes),
            ) as JsonRecord;
            if (name === "project.json") {
              packageProject = parsed;
              refreshWantedAssets(parsed);
            } else if (name === "manifest.json") manifest = parsed;
            else if (isLocationGraph) dedicatedLocationGraph = parsed;
            else if (isEvents && Array.isArray(parsed))
              dedicatedEvents = parsed;
            else if (isWorld) dedicatedWorld = parsed;
            else if (isDisclosure) {
              if (
                !isJsonRecord(parsed) ||
                !Array.isArray(parsed.protectedTerms)
              )
                throw new Error("보호어 파일 형식이 올바르지 않습니다.");
              dedicatedDisclosures.push(parsed);
            } else {
              snapshotFormat = String(parsed.format ?? "");
              authoritativeEditor =
                Number(String(parsed.studioVersion || "0").split(".")[0]) >= 2;
              if (
                (snapshotFormat === PROJECT_SNAPSHOT_FORMAT ||
                  snapshotFormat === PROJECT_SNAPSHOT_FORMAT_V1) &&
                isJsonRecord(parsed.project)
              ) {
                snapshotProject = parsed.project;
                snapshotBytes = bytes;
                refreshWantedAssets(parsed.project);
              }
            }
            onProgress?.({
              phase: "settings",
              loadedBytes,
              totalBytes: input.size,
              currentImage: extractedImages,
              totalImages: wantedAssetPaths.size,
              detail: name,
            });
          }
        } catch (error) {
          fail(error);
        } finally {
          activeFiles -= 1;
          finish();
        }
      };
      try {
        entry.start();
      } catch (error) {
        activeFiles -= 1;
        fail(error);
      }
    });
    unzip.register(UnzipInflate);
    const reader = input.stream().getReader();
    void (async () => {
      try {
        onProgress?.({
          phase: "opening",
          loadedBytes: 0,
          totalBytes: input.size,
          currentImage: 0,
          totalImages: 0,
          detail: "패키지 구조 확인",
        });
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            inputEnded = true;
            unzip.push(new Uint8Array(0), true);
            finish();
            break;
          }
          loadedBytes += value.byteLength;
          unzip.push(value, false);
          onProgress?.({
            phase: "opening",
            loadedBytes,
            totalBytes: input.size,
            currentImage: extractedImages,
            totalImages: wantedAssetPaths.size,
            detail: "패키지 순차 읽기",
          });
          await new Promise<void>((next) => setTimeout(next, 0));
        }
      } catch (error) {
        fail(error);
      }
    })();
  });

  // Values are assigned by the streaming unzip callback. Keep explicit aliases
  // so TypeScript does not incorrectly retain the pre-callback null narrowing.
  const resolvedPackageProject = packageProject as JsonRecord | null;
  const resolvedSnapshotProject = snapshotProject as JsonRecord | null;
  const resolvedLocationGraph = dedicatedLocationGraph as JsonRecord | null;
  const resolvedEvents = dedicatedEvents as unknown[] | null;
  const resolvedWorld = dedicatedWorld as JsonRecord | null;
  const projectSource = resolvedSnapshotProject ?? resolvedPackageProject;
  if (!projectSource)
    throw new Error("Studio 편집 원본 또는 project.json을 찾을 수 없습니다.");
  const project: JsonRecord = {
    ...projectSource,
    ...(!authoritativeEditor && resolvedLocationGraph
      ? { locationGraph: resolvedLocationGraph }
      : {}),
    ...(!authoritativeEditor && resolvedEvents
      ? { events: resolvedEvents }
      : {}),
    ...(!authoritativeEditor && resolvedWorld
      ? {
          world: {
            ...(isJsonRecord(projectSource.world) ? projectSource.world : {}),
            ...resolvedWorld,
          },
        }
      : {}),
  };
  const resolvedSnapshotBytes = snapshotBytes as Uint8Array | null;
  const resolvedManifest = manifest as JsonRecord | null;
  if (
    resolvedSnapshotProject &&
    resolvedSnapshotBytes &&
    resolvedManifest &&
    isJsonRecord(resolvedManifest.editorSource)
  ) {
    const editorSource = resolvedManifest.editorSource;
    if (
      editorSource.path &&
      editorSource.path !== EMBEDDED_PROJECT_SNAPSHOT_PATH
    )
      throw new Error("패키지 편집 원본 경로가 manifest와 일치하지 않습니다.");
    if (
      Number.isFinite(editorSource.byteLength) &&
      Number(editorSource.byteLength) !== resolvedSnapshotBytes.byteLength
    )
      throw new Error("패키지 편집 원본의 바이트 길이가 일치하지 않습니다.");
    if (
      typeof editorSource.sha256 === "string" &&
      editorSource.sha256 !== (await sha256Hex(resolvedSnapshotBytes))
    )
      throw new Error("패키지 편집 원본의 SHA-256 검증에 실패했습니다.");
  }
  const restored = restoreDisclosure(
    project,
    authoritativeEditor,
    ...dedicatedDisclosures,
    resolvedPackageProject,
    resolvedManifest,
  );
  const hydrated = await hydrateBlobImages(restored, assetBlobs, onProgress);
  const fullFidelity = Boolean(snapshotProject) && !skippedLargeSnapshot;
  return {
    project: hydrated,
    source: fullFidelity
      ? "embedded_snapshot"
      : skippedLargeSnapshot
        ? "mobile_safe_package_project"
        : "legacy_package_project",
    fullFidelity,
  };
}

export async function extractStudioProjectFromPackage(
  input: Blob | ArrayBuffer | Uint8Array,
  onProgress?: (progress: PackageImportProgress) => void,
): Promise<EmbeddedProjectImport> {
  if (input instanceof Blob && typeof input.stream === "function")
    return extractStudioProjectFromBlob(input, onProgress);
  const source = input instanceof Blob ? await input.arrayBuffer() : input;
  const archive = await JSZip.loadAsync(source);
  const disclosureSources: unknown[] = [];
  for (const path of [
    "disclosure.json",
    "cortex/disclosure.json",
    "project.json",
    "manifest.json",
  ]) {
    const entry = archive.file(path);
    if (!entry) continue;
    const parsed = JSON.parse(await entry.async("string"));
    if (
      path.endsWith("disclosure.json") &&
      (!isJsonRecord(parsed) || !Array.isArray(parsed.protectedTerms))
    )
      throw new Error("보호어 파일 형식이 올바르지 않습니다.");
    disclosureSources.push(parsed);
  }
  const embedded = archive.file(EMBEDDED_PROJECT_SNAPSHOT_PATH);
  if (embedded) {
    const bytes = await embedded.async("uint8array");
    const snapshot = JSON.parse(new TextDecoder().decode(bytes));
    if (
      ![PROJECT_SNAPSHOT_FORMAT, PROJECT_SNAPSHOT_FORMAT_V1].includes(
        snapshot?.format,
      ) ||
      !snapshot?.project
    )
      throw new Error("패키지의 Studio 편집 원본 형식이 올바르지 않습니다.");
    const manifestEntry = archive.file("manifest.json");
    if (manifestEntry) {
      const manifest = JSON.parse(await manifestEntry.async("string"));
      const editorSource = manifest?.editorSource;
      if (
        editorSource?.path &&
        editorSource.path !== EMBEDDED_PROJECT_SNAPSHOT_PATH
      )
        throw new Error(
          "패키지 편집 원본 경로가 manifest와 일치하지 않습니다.",
        );
      if (
        Number.isFinite(editorSource?.byteLength) &&
        editorSource.byteLength !== bytes.byteLength
      )
        throw new Error("패키지 편집 원본의 바이트 길이가 일치하지 않습니다.");
      if (
        editorSource?.sha256 &&
        editorSource.sha256 !== (await sha256Hex(bytes))
      )
        throw new Error("패키지 편집 원본의 SHA-256 검증에 실패했습니다.");
    }
    const locationGraphEntry = archive.file("cortex/location_graph.json");
    const eventsEntry = archive.file("events/events.json");
    const worldEntry = archive.file("world/world.json");
    const project = { ...snapshot.project };
    if (
      Number(String(snapshot.studioVersion || "0").split(".")[0]) < 2 &&
      locationGraphEntry
    )
      project.locationGraph = JSON.parse(
        await locationGraphEntry.async("string"),
      );
    if (
      Number(String(snapshot.studioVersion || "0").split(".")[0]) < 2 &&
      eventsEntry
    )
      project.events = JSON.parse(await eventsEntry.async("string"));
    if (
      Number(String(snapshot.studioVersion || "0").split(".")[0]) < 2 &&
      worldEntry
    )
      project.world = {
        ...(project.world ?? {}),
        ...JSON.parse(await worldEntry.async("string")),
      };
    return {
      project: await restorePackagedImages(
        restoreDisclosure(
          project,
          Number(String(snapshot.studioVersion || "0").split(".")[0]) >= 2,
          ...disclosureSources,
        ),
        archive,
      ),
      source: "embedded_snapshot",
      fullFidelity: true,
    };
  }
  const legacyProject = archive.file("project.json");
  if (!legacyProject)
    throw new Error(
      `Studio 편집 원본(${EMBEDDED_PROJECT_SNAPSHOT_PATH}) 또는 project.json을 찾을 수 없습니다.`,
    );
  const project = JSON.parse(await legacyProject.async("string"));
  const locationGraphEntry = archive.file("cortex/location_graph.json");
  const eventsEntry = archive.file("events/events.json");
  const worldEntry = archive.file("world/world.json");
  if (locationGraphEntry)
    project.locationGraph = JSON.parse(
      await locationGraphEntry.async("string"),
    );
  if (eventsEntry)
    project.events = JSON.parse(await eventsEntry.async("string"));
  if (worldEntry)
    project.world = {
      ...(project.world ?? {}),
      ...JSON.parse(await worldEntry.async("string")),
    };
  return {
    project: await restorePackagedImages(
      restoreDisclosure(project, false, ...disclosureSources),
      archive,
    ),
    source: "legacy_package_project",
    fullFidelity: false,
  };
}

function localTimestamp() {
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}_${part(now.getHours())}${part(now.getMinutes())}`;
}

export function downloadProject(project: Project) {
  download(
    `${safe(project.title)}_작업프로젝트_${localTimestamp()}.json`,
    JSON.stringify(buildProjectSnapshot(project), null, 2),
  );
}
export function downloadImportJson(project: Project) {
  download(
    `${safe(project.title)}_CHATGPT_IMPORT.json`,
    JSON.stringify(buildImportObject(project), null, 2),
  );
}
export function downloadImportMd(project: Project) {
  download(
    `${safe(project.title)}_CHATGPT_IMPORT.md`,
    buildMarkdown(project),
    "text/markdown",
  );
}

export function buildPackageProject(
  project: Project,
  assets: PackageAssetIndex,
) {
  project = retireLocationGraph(project);
  const runtimeInvariants = characterInvariantsForRuntime(project);
  if (project.runtimeMode === "instant_story") {
    return {
      runtimeMode: "instant_story" as const,
      projectId: project.projectId,
      title: project.title,
      genre: project.genre,
      worldType: project.worldType,
      startDate: project.startDate,
      startLocation: project.startLocation,
      tone: project.tone,
      playStyle: project.playStyle,
      difficulty: project.difficulty,
      author: project.author,
      notes: project.notes,
      randomSeed: project.randomSeed,
      world: { overview: instantWorldProse(project.world) },
      player: instantPackageCharacter(project.player, assets),
      npcs: project.npcs.map((character) => instantPackageCharacter(character, assets)),
      opening: project.opening,
      style: runtimeStyle(project),
      statusWindow: project.statusWindow,
      instantStory: project.instantStory,
      gmData: { worldTruthLedger: privateWorldProse(project.gmData) },
      turnPresentation:
        project.packageTarget === "cortex"
          ? {
              ...project.turnPresentation,
              recommendedReplies: {
                ...project.turnPresentation.recommendedReplies,
                enabled: true,
                count: 3,
              },
            }
          : project.turnPresentation,
      visualBible: project.visualBible,
      ...(project.packageTarget === "cortex"
        ? {
            packageTarget: "cortex" as const,
            protagonistInvariants: runtimeInvariants,
            disclosure: project.disclosure,
          }
        : {}),
      packageAssetStorage: {
        format: "RELAY_NOVEL_ASSET_ONCE_V1",
        integrity: "SHA-256",
        inlineDataUrls: false,
        logicalAssetCount: assets.logicalAssetCount,
        originalAssetBytes: assets.originalAssetBytes,
        storedAssetCount: assets.uniqueAssets.length,
        storedAssetBytes: assets.uniqueAssets.reduce(
          (sum, asset) => sum + asset.byteLength,
          0,
        ),
      },
    };
  }
  const {
    packageTarget,
    protagonistInvariants: _protagonistInvariants,
    locationGraph,
    disclosure,
    ...baseProject
  } = project;
  return {
    ...baseProject,
    ...(packageTarget === "cortex"
      ? {
          events: compileCortexEvents(project),
          turnPresentation: {
            ...project.turnPresentation,
            recommendedReplies: {
              ...project.turnPresentation.recommendedReplies,
              enabled: false,
            },
          },
          style: runtimeStyle(project),
        }
      : {}),
    ...(packageTarget === "cortex"
      ? { packageTarget, protagonistInvariants: runtimeInvariants, disclosure }
      : {}),
    player: cleanCharacter(project.player, assets),
    npcs: project.npcs.map((character) => cleanCharacter(character, assets)),
    imageTriggers: project.imageTriggers.map((trigger) =>
      cleanImageTrigger(trigger, assets),
    ),
    packageAssetStorage: {
      format: "RELAY_NOVEL_ASSET_ONCE_V1",
      integrity: "SHA-256",
      inlineDataUrls: false,
      logicalAssetCount: assets.logicalAssetCount,
      originalAssetBytes: assets.originalAssetBytes,
      storedAssetCount: assets.uniqueAssets.length,
      storedAssetBytes: assets.uniqueAssets.reduce(
        (sum, asset) => sum + asset.byteLength,
        0,
      ),
    },
  };
}

export type ScenarioPackExportSummary = {
  instantContextPreflight?: InstantContextPreflight;
  imageOptimization: ImageOptimizationReport;
  blob: Blob;
  blobBytes: number;
  logicalAssetCount: number;
  originalAssetBytes: number;
  storedAssetBytes: number;
  storedAssetCount: number;
};

type StreamingZipEntry = {
  name: string;
  data: string | Uint8Array | Blob;
  store: boolean;
};

async function generateStreamingZip(
  entries: StreamingZipEntry[],
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const output: ArrayBuffer[] = [];
    let settled = false;
    const archive = new Zip((error, data, final) => {
      if (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
        return;
      }
      const chunk = new Uint8Array(data.byteLength);
      chunk.set(data);
      output.push(chunk.buffer);
      if (final && !settled) {
        settled = true;
        resolve(new Blob(output, { type: "application/zip" }));
      }
    });
    void (async () => {
      try {
        for (const entry of entries) {
          // DEFLATE level 1 keeps already-compressed images effectively unchanged in size,
          // while avoiding ambiguous streaming data descriptors on STORE entries in WebKit.
          const stream = new ZipDeflate(entry.name, {
            level: entry.store ? 1 : 6,
          });
          archive.add(stream);
          if (entry.data instanceof Blob) {
            const reader = entry.data.stream().getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                stream.push(new Uint8Array(0), true);
                break;
              }
              stream.push(value, false);
              await new Promise<void>((next) => setTimeout(next, 0));
            }
          } else {
            stream.push(
              typeof entry.data === "string" ? strToU8(entry.data) : entry.data,
              true,
            );
          }
        }
        archive.end();
      } catch (error) {
        archive.terminate();
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    })();
  });
}

export async function exportScenarioPack(
  project: Project,
  shouldDownload = true,
  options: CortexExportAcknowledgements & {
    imageMode?: ImageExportMode;
    onImageProgress?: (progress: ImageOptimizationProgress) => void;
  } = {},
): Promise<ScenarioPackExportSummary> {
  project = retireLocationGraph(project);
  project = {
    ...project,
    disclosure: {
      ...project.disclosure,
      protectedTerms: normalizeProtectedTerms(
        project.disclosure.protectedTerms,
      ),
    },
  };
  if (shouldDownload) {
    assertCortexExportReviewed(project, options);
    const blockingIssues = validateProject(project).filter(
      (issue) => issue.severity === "error",
    );
    if (blockingIssues.length)
      throw new Error(
        `설정 검증 오류 ${blockingIssues.length}건을 먼저 수정하세요.`,
      );
  }
  const zipEntries: StreamingZipEntry[] = [];
  const zip = {
    file: (
      name: string,
      data: string | Uint8Array | Blob,
      options?: { compression?: string; binary?: boolean },
    ) => {
      zipEntries.push({ name, data, store: options?.compression === "STORE" });
    },
  };
  const base = safe(project.title);
  const isInstant = project.runtimeMode === "instant_story";
  const isCortex = project.packageTarget === "cortex";
  if (isCortex && !isInstant && project.events.length) {
    const lint = lintCortexPackage(compileCanonDesign(project));
    if (lint.errors)
      throw new Error(
        `Cortex 패키지 린터 오류 ${lint.errors}건을 먼저 수정하세요.`,
      );
  }
  const cortexMinimumVersion = CORTEX_MIN_VERSION;
  const prepared = await prepareProjectImages(
    project,
    options.imageMode ?? "original",
    options.onImageProgress,
  );
  project = prepared.project;
  const assets = await buildPackageAssetIndex(project);
  if (prepared.report.mode === "original") {
    prepared.report.retained = assets.logicalAssetCount;
    prepared.report.originalBytes = assets.originalAssetBytes;
    prepared.report.outputBytes = assets.originalAssetBytes;
  }
  const editorProject = project;
  if(project.canonHud && project.runtimeMode === "intelligent_canon") {
    zip.file("runtime/jieum_canon.json",JSON.stringify({revision:1,mode:'hud_only',routes:[],stats:project.canonHud.stats,hudEffects:project.canonHud.effects,timeline:project.canonHud.timeline}));
  }
  if(project.canonDesign && project.runtimeMode === "intelligent_canon") {
    const d=project.canonDesign;
    const routes=(d.mode === "single" ? d.routes.slice(0,1) : d.routes).map(r=>{const rows=project.events.filter(e=>e.kind!=="constraint" && (d.mode==="single"||d.events[e.id]?.routeId===r.id));return {...r,eventIds:rows.map(e=>e.id),endingEventId:rows.find(e=>d.events[e.id]?.ending)?.id,authorComment:d.events[rows[0]?.id]?.authorComment||"",startSituation:rows[0]?.description||""};});
    zip.file("runtime/jieum_canon.json",JSON.stringify({revision:1,routes,stats:d.stats,openingText:d.openingText,replies:d.replies,privateWorld:project.gmData,privateCharacters:[project.player,...project.npcs].map(c=>({id:c.id,name:c.name,secret:c.hiddenInfo})),world:project.world,reference:project.aiWorldContext}));
  }
  if(project.canonDesign && project.runtimeMode === "intelligent_canon")project={...project,imageTriggers:project.imageTriggers.map(t=>t.mode==="show_package_image"?{...t,mode:"show_trigger_image",attachedImages:([project.player,...project.npcs].find(c=>c.id===t.characterIds[0])?.images||[]).filter((im,i,all)=>im.isPrimary||(!all.some(x=>x.isPrimary)&&i===0))}:t)};
  const runtimeProject = withAutomaticInstantContextBudget(compileCanonDesign(project));
  const packageProject = buildPackageProject(runtimeProject, assets);
  const storedAssetBytes = assets.uniqueAssets.reduce(
    (sum, asset) => sum + asset.byteLength,
    0,
  );
  const packageVersion = packageVersionFor(project);
  const generatedAt = new Date().toISOString();
  const projectSnapshotBytes = new TextEncoder().encode(
    JSON.stringify(buildProjectSnapshot(editorProject, generatedAt, assets), null, 2),
  );
  const projectSnapshotSha256 = await sha256Hex(projectSnapshotBytes);
  const sourcePackageSha256 = await instantSourceFingerprint(
    runtimeProject,
    packageProject,
  );
  project = runtimeProject;
  const instantCacheMeta = {
    schemaVersion: "2.0",
    compilerVersion: INSTANT_STORY_COMPILER_VERSION,
    sourcePackageSha256,
    generatedAt,
  };
  const withInstantCacheMeta = <T extends Record<string, unknown>>(
    document: T,
  ) => ({ ...document, ...instantCacheMeta });
  const assetStorage = {
    format: "RELAY_NOVEL_ASSET_ONCE_V1",
    integrity: "SHA-256",
    inlineDataUrls: false,
    logicalAssetCount: assets.logicalAssetCount,
    originalAssetBytes: assets.originalAssetBytes,
    storedAssetCount: assets.uniqueAssets.length,
    storedAssetBytes,
  };
  const manifest = {
    ...JIEUM_AUTHORING_METADATA,
    id: project.projectId,
    version: packageVersion,
    packageVersion,
    engineVersion: ENGINE_VERSION,
    projectId: project.projectId,
    title: project.title,
    runtimeMode: project.runtimeMode,
    ...(isCortex
      ? {
          packageTarget: "cortex",
          format: CORTEX_PACKAGE_FORMAT,
          targetEngine: "dancheong-cortex",
          minimumTargetVersion: cortexMinimumVersion,
          integrationTarget: cortexCompatibility(project).integrationTarget,
          cortexCompatibility: cortexCompatibility(project),
          ...(!isInstant
            ? {
                contractRevision: CORTEX_TARGET_VERSION,
                lintSchema: "CORTEX_PACKAGE_LINT_V4",
                packageContract: {
                  schema: "CORTEX_STUDIO_PACKAGE_CONTRACT_V2",
                  requiredFiles: [
                    "manifest.json",
                    "events/events.json",
                    ...(project.canonDesign||project.canonHud?["runtime/jieum_canon.json"]:[]),
                    "characters.json",
                    "invariants.json",
                    "disclosure.json",
                    ...(project.package15.branchEnding.enabled
                      ? [
                          "routes/choice_records.json",
                          "routes/branch_decisions.json",
                          "routes/ending_convergence.json",
                        ]
                      : []),
                  ],
                  eventLimit: 250,
                  mainBeatBudget: 3,
                  extensionBudget: 2,
                  unmetRequirementsOutcome:
                    "AUTHORED_ALTERNATIVE_THEN_CARRYOVER",
                  earlyClosureMinBeats: 2,
                  unmetRequirementsSealReason: "UNRESOLVED_AUTHORED_RECOVERY",
                },
              }
            : {}),
        }
      : {}),
    exclusiveRuntime: isInstant,
    difficulty: project.difficulty,
    randomSeed: project.randomSeed,
    createdAt: generatedAt,
    recommendedUpload: isInstant ? null : `${base}_CHATGPT_IMPORT.md`,
    assetStorage,
    ...(isCortex && !isInstant
      ? {
          studioEventPolicy: {
            schema: "CORTEX_STUDIO_EVENT_POLICY_V2",
            path: "cortex/event_policy.json",
            consumerStatus: cortexCompatibility(project).status,
            targetEngineVersion: CORTEX_TARGET_VERSION,
            baseEngineVersion: CORTEX_TARGET_VERSION,
          },
          ...(project.package15.branchEnding.enabled
            ? {
                branchEndingContract: {
                  feature: "branch_ending_convergence_v1",
                  semantics: "ENDING_SELECTION_NOT_PROGRESS_PERMISSION",
                  authority: "PUBLIC_PROSE",
                  unresolvedPolicy:
                    "FALLBACK_WITHOUT_ASSERTING_CONDITION",
                  apiFailureGuarantee: false,
                  consumerStatus: "PINNED_ENGINE_BRANCH_RUNTIME_VERIFIED",
                },
              }
            : {}),
        }
      : {}),
    imageOptimization: prepared.report,
    editorSource: {
      feature: EMBEDDED_PROJECT_FEATURE_ID,
      path: EMBEDDED_PROJECT_SNAPSHOT_PATH,
      format: PROJECT_SNAPSHOT_FORMAT,
      studioVersion: STUDIO_VERSION,
      byteLength: projectSnapshotBytes.byteLength,
      sha256: projectSnapshotSha256,
      standalone: false,
      imageStorage: "zip_asset_ref",
      requires: ["assets/manifest.json", "assets/"],
      runtimeIgnored: true,
    },
    features: [
      ...(isCortex
        ? [
            CORTEX_PACKAGE_FEATURE_ID,
            ...(!isInstant
              ? [
                  CORTEX_V136_PACKAGE_FEATURE_ID,
                  CORTEX_TYPED_REQUIREMENTS_FEATURE_ID,
                  CORTEX_DISCLOSURE_FEATURE_ID,
                ]
              : []),
          ]
        : []),
      ...(isInstant
        ? [
            "asset_once_storage",
            "sha256_asset_integrity",
            EMBEDDED_PROJECT_FEATURE_ID,
            "character_images",
            "character_visual_bible",
            "live_status_window",
            STATUS_RELATIONSHIP_FEATURE_ID,
            "recommended_replies",
            INSTANT_STORY_FEATURE_ID,
            "exclusive_instant_runtime",
            "safe_sentence_sse",
            "bounded_keyword_activation",
            "compiled_start_profiles",
            "derived_runtime_cache_integrity",
          ]
        : [
            "asset_once_storage",
            "sha256_asset_integrity",
            EMBEDDED_PROJECT_FEATURE_ID,
            "inline_data_url_elimination",
            "content_addressed_asset_deduplication",
            "narrative_runtime_extension_v1",
            "ai_live_world_context",
            "reference_world_framework",
            "reference_character_research",
            "official_source_priority",
            "session_research_cache",
            "localized_world_enrichment",
            "canon_priority_guard",
            "npc_autonomy",
            "faction_autonomy",
            "offscreen_world_ledger",
            "causal_relationship_memory",
            "unresolved_emotional_memory",
            "required_event_contracts",
            "required_dialogue_guarantee",
            "required_item_rerouting",
            "scene_boundary_lock",
            "scene_constraints",
            "constraint_violation_guard",
            "compound_events",
            "structured_story_beats",
            "character_images",
            "character_visual_bible",
            "character_relations",
            "faction_relations",
            "event_clocks",
            "foreshadowing_ledger",
            "progress_image_triggers",
            "trigger_image_assets",
            "live_status_window",
            STATUS_RELATIONSHIP_FEATURE_ID,
            "status_delta_ledger",
            "met_character_privacy_filter",
            "hidden_gm_data",
            "recommended_replies",
            "scene_image",
            "ai_project_import",
          ]),
    ],
    ...(isCortex || isInstant || project.package15.enabled
      ? {
          requiredFeatures: [
            ...(isCortex
              ? [
                  CORTEX_PACKAGE_FEATURE_ID,
                  ...(!isInstant
                    ? [
                        CORTEX_V136_PACKAGE_FEATURE_ID,
                        CORTEX_TYPED_REQUIREMENTS_FEATURE_ID,
                        CORTEX_DISCLOSURE_FEATURE_ID,
                      ]
                    : []),
                ]
              : []),
            ...(isInstant
              ? [INSTANT_STORY_FEATURE_ID, STATUS_RELATIONSHIP_FEATURE_ID]
              : project.package15.enabled
                ? project.package15.requiredFeatures
                : []),
          ],
          optionalFeatures: isInstant
            ? []
            : project.package15.enabled
              ? project.package15.optionalFeatures
              : [],
          ...(isInstant ? { unsupportedBehavior: "reject_package" } : {}),
        }
      : {}),
  };
  zip.file("project.json", JSON.stringify(packageProject));
  zip.file(EMBEDDED_PROJECT_SNAPSHOT_PATH, projectSnapshotBytes);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("world/world.json", JSON.stringify(isInstant ? packageProject.world : project.world, null, 2));
  zip.file(
    "characters/player.json",
    JSON.stringify(isInstant ? packageProject.player : cleanCharacter(project.player, assets), null, 2),
  );
  zip.file(
    "characters/npcs.json",
    JSON.stringify(
      isInstant ? packageProject.npcs : project.npcs.map((character) => cleanCharacter(character, assets)),
      null,
      2,
    ),
  );
  zip.file(
    "characters/character_image_manifest.json",
    JSON.stringify(visualManifest(project, assets), null, 2),
  );
  zip.file(
    "assets/manifest.json",
    JSON.stringify(mediaAssetManifest(project, assets), null, 2),
  );
  zip.file("start/opening.json", JSON.stringify(project.opening, null, 2));
  zip.file(
    "rules/style.json",
    JSON.stringify(
      runtimeStyle(project),
      null,
      2,
    ),
  );
  zip.file(
    "rules/turn_presentation.json",
    JSON.stringify(
      isCortex
        ? {
            ...project.turnPresentation,
            recommendedReplies: {
              ...project.turnPresentation.recommendedReplies,
              enabled: isInstant,
              count: isInstant ? 3 : project.turnPresentation.recommendedReplies.count,
            },
            proseOutput: "NARRATION_ONLY",
            firstParagraph: "NATURAL_SCENE",
            guidance: cortexAuthoringGuidance,
          }
        : project.turnPresentation,
      null,
      2,
    ),
  );
  if (isCortex && !isInstant)
    zip.file(
      "cortex/event_policy.json",
      JSON.stringify(
        {
          schema: "CORTEX_STUDIO_EVENT_POLICY_V2",
          baseEngine: CORTEX_TARGET_VERSION,
          engineAdapterRequired: cortexCompatibility(project).limitations.length > 0,
          baseEngineConsumesThisFile: false,
          targetEngineVersion: CORTEX_TARGET_VERSION,
          targetConsumerStatus: cortexCompatibility(project).status,
          unsupportedInBaseEngine: cortexCompatibility(project).limitations.map(item => item.code),
          guidance: cortexAuthoringGuidance,
          events: orderedEvents(project).map((event, index, list) => ({
            id: event.id,
            nextEventId: isTerminalEvent(project, event.id)
              ? ""
              : event.nextEventId || list[index + 1]?.id || "",
            terminal: isTerminalEvent(project, event.id),
            ...compileCortexEvent(
              isTerminalEvent(project, event.id)
                ? { ...event, nextEventId: "" }
                : event,
            ).eventPolicy,
          })),
        },
        null,
        2,
      ),
    );
  zip.file(
    "rules/difficulty.json",
    JSON.stringify(difficultyProfile(project), null, 2),
  );
  zip.file(
    "rules/character_visual_bible.json",
    JSON.stringify(visualManifest(project, assets), null, 2),
  );
  zip.file(
    "rules/status_window.json",
    JSON.stringify(statusWindowRuntime(project), null, 2),
  );
  if (isCortex)
    zip.file(
      "cortex/protagonist_invariants.json",
      JSON.stringify(characterInvariantsForRuntime(project), null, 2),
    );
  if (isCortex) {
    zip.file(
      "characters.json",
      JSON.stringify(
        [
          isInstant ? packageProject.player : cleanCharacter(project.player, assets),
          ...(isInstant ? packageProject.npcs : project.npcs.map((character) => cleanCharacter(character, assets))),
        ],
        null,
        2,
      ),
    );
    zip.file(
      "invariants.json",
      JSON.stringify(characterInvariantsForRuntime(project), null, 2),
    );
    zip.file("disclosure.json", JSON.stringify(project.disclosure, null, 2));
    zip.file("reports/cortex-compatibility.json", JSON.stringify(cortexCompatibility(project), null, 2));
    zip.file(
      "reports/cortex-export-review.json",
      JSON.stringify(
        {
          schema: "CORTEX_EXPORT_REVIEW_V1",
          ...cortexExportReview(project),
          baseEngine: CORTEX_MIN_VERSION,
          semanticSpoilerPreventionGuaranteed: false,
          acknowledgement: {
            emptyProtection: options.acknowledgeEmptyProtection === true,
            unsupportedPolicy: options.acknowledgeUnsupportedPolicy === true,
          },
          note: "보호어는 명시한 문자열의 보호 목록입니다. Cortex 1.42.0 공식 소스로 가져오기·분기 계약을 검사했습니다. 기능별 지원 한계는 reports/cortex-compatibility.json에 기록합니다.",
        },
        null,
        2,
      ),
    );
    if (!isInstant)
      zip.file(
        "reports/cortex-package-lint.json",
        JSON.stringify(lintCortexPackage(project), null, 2),
      );
  }
  if (!isInstant) {
    zip.file(
      "relations/character_relations.json",
      JSON.stringify(project.characterRelations, null, 2),
    );
    zip.file(
      "relations/relationship_memories.json",
      JSON.stringify(project.relationshipMemories, null, 2),
    );
    zip.file(
      "actors/autonomy_actors.json",
      JSON.stringify(project.autonomyActors, null, 2),
    );
    zip.file(
      "factions/factions.json",
      JSON.stringify(project.factions, null, 2),
    );
    zip.file(
      "relations/faction_relations.json",
      JSON.stringify(project.factionRelations, null, 2),
    );
    zip.file(
      "events/events.json",
      JSON.stringify(
        isCortex ? compileCortexEvents(project) : project.events.map(event => cleanStoryEvent(event)),
        null,
        2,
      ),
    );
    zip.file(
      "events/clocks.json",
      JSON.stringify(project.eventClocks, null, 2),
    );
    zip.file(
      "events/foreshadowings.json",
      JSON.stringify(project.foreshadowings, null, 2),
    );
    zip.file(
      "events/image_triggers.json",
      JSON.stringify(
        project.imageTriggers.map((trigger) =>
          cleanImageTrigger(trigger, assets),
        ),
        null,
        2,
      ),
    );
    zip.file("gm/gm_data.json", JSON.stringify(project.gmData, null, 2));
    zip.file(
      "rules/ai_world_context.json",
      JSON.stringify(aiWorldContextRuntime(project), null, 2),
    );
    zip.file(
      "rules/narrative_runtime.json",
      JSON.stringify(narrativeRuntimeContract(project), null, 2),
    );
    zip.file(
      "rules/image_trigger_runtime.json",
      JSON.stringify(imageTriggerRuntime(), null, 2),
    );
    zip.file(
      "rules/autonomy_runtime.json",
      JSON.stringify(autonomyRuntime(project), null, 2),
    );
    zip.file(
      "rules/relationship_memory_runtime.json",
      JSON.stringify(relationshipMemoryRuntime(project), null, 2),
    );
  }
  if (!isInstant && project.package15.enabled) {
    const package15 = package15Documents(project);
    zip.file(
      "routes/route_graph.json",
      JSON.stringify(package15.routeGraph, null, 2),
    );
    zip.file(
      "routes/chapters.json",
      JSON.stringify(package15.chapters, null, 2),
    );
    zip.file(
      "routes/route_lenses.json",
      JSON.stringify(package15.routeLenses, null, 2),
    );
    zip.file(
      "routes/reveal_facts.json",
      JSON.stringify(package15.revealFacts, null, 2),
    );
    zip.file(
      "routes/reveal_policies.json",
      JSON.stringify(package15.revealPolicies, null, 2),
    );
    zip.file("routes/endings.json", JSON.stringify(package15.endings, null, 2));
    if (project.package15.branchEnding.enabled) {
      zip.file(
        "routes/choice_records.json",
        JSON.stringify(package15.choiceRecords, null, 2),
      );
      zip.file(
        "routes/branch_decisions.json",
        JSON.stringify(package15.branchDecisions, null, 2),
      );
      zip.file(
        "routes/ending_convergence.json",
        JSON.stringify(package15.endingConvergence, null, 2),
      );
    }
    zip.file("routes/flags.json", JSON.stringify(package15.flags, null, 2));
    zip.file(
      "routes/galleries.json",
      JSON.stringify(package15.galleries, null, 2),
    );
    zip.file(
      "routes/epilogues.json",
      JSON.stringify(package15.epilogues, null, 2),
    );
    zip.file(
      "routes/checkpoints.json",
      JSON.stringify(package15.checkpoints, null, 2),
    );
    zip.file("routes/clues.json", JSON.stringify(package15.clues, null, 2));
    if(!project.canonDesign)zip.file(
      "loops/loop_policy.json",
      JSON.stringify(package15.loopPolicy, null, 2),
    );
    zip.file(
      "state/item_definitions.json",
      JSON.stringify(package15.items, null, 2),
    );
    if (!isCortex)
      zip.file(
        "state/zone_definitions.json",
        JSON.stringify(package15.zones, null, 2),
      );
    zip.file(
      "state/world_fact_definitions.json",
      JSON.stringify(package15.worldFacts, null, 2),
    );
  }
  if (isInstant) {
    zip.file(
      "rules/instant_story_runtime.json",
      JSON.stringify(
        instantStoryRuntime(project, sourcePackageSha256, generatedAt),
        null,
        2,
      ),
    );
    zip.file(
      "runtime/context_index.json",
      JSON.stringify(
        withInstantCacheMeta(instantContextIndex(project)),
        null,
        2,
      ),
    );
    zip.file(
      "runtime/keyword_index.json",
      JSON.stringify(
        withInstantCacheMeta(instantKeywordIndex(project)),
        null,
        2,
      ),
    );
    zip.file(
      "runtime/media_lookup.json",
      JSON.stringify(
        withInstantCacheMeta(instantMediaLookup(project)),
        null,
        2,
      ),
    );
    zip.file(
      "runtime/ending_schedule.json",
      JSON.stringify(
        withInstantCacheMeta(instantEndingSchedule(project)),
        null,
        2,
      ),
    );
    zip.file(
      "schemas/instant_story_runtime_v2.schema.json",
      JSON.stringify(instantStoryRuntimeSchema, null, 2),
    );
    const vectors = instantStoryTestVectors(
      project,
      sourcePackageSha256,
      generatedAt,
    );
    zip.file(
      "test-vectors/instant-story/normal.json",
      JSON.stringify(vectors.normal, null, 2),
    );
    zip.file(
      "test-vectors/instant-story/stale-cache.json",
      JSON.stringify(vectors.staleCache, null, 2),
    );
    zip.file(
      "test-vectors/instant-story/legacy-package.json",
      JSON.stringify(vectors.legacyPackage, null, 2),
    );
    zip.file(
      "test-vectors/instant-story/disclosure-abort.json",
      JSON.stringify(vectors.disclosureAbort, null, 2),
    );
    zip.file(
      "test-vectors/instant-story/malformed-stream.json",
      JSON.stringify(vectors.malformedStream, null, 2),
    );
  }
  if (isInstant) {
    zip.file(
      "INSTANT_RUNTIME_IMPORT.json",
      JSON.stringify(
        {
          runtimeMode: "instant_story",
          requiredFeature: INSTANT_STORY_FEATURE_ID,
          sourcePackageSha256,
          entrypoint: "rules/instant_story_runtime.json",
        },
        null,
        2,
      ),
    );
    zip.file(
      "README.md",
      isCortex
        ? `# ${project.title} CortexPack v${packageVersion}\n\nStudio ${STUDIO_VERSION} / ${CORTEX_TARGET_LABEL}\n\n이 패키지는 단청 확장의 Instant Story Runtime v2 전용입니다. 설정집·캐릭터·도입부·키워드·수치를 전용 자유 전개 경로로 실행하며 자동 엔딩 검사를 사용하지 않습니다. 비공개 설정은 작가의 인과 판단에만 사용하고 독자 공개 전 누설 검사를 거칩니다. 확장이 없는 독립 Cortex 1.42.0은 지원 대상이 아닙니다. 완성 응답을 검사한 뒤 본문을 표시하며 토큰 즉시 표시나 단일 호출을 보장하지 않습니다. 상세 범위는 reports/cortex-compatibility.json을 확인하세요. ${INSTANT_STORY_FEATURE_ID} 계약을 사용하며 정사 Runtime으로 폴백하거나 혼합 실행하지 않습니다.\n\nStudio 편집 원본은 ${EMBEDDED_PROJECT_SNAPSHOT_PATH}에 있으며 런타임은 project.json과 전용 실행 파일을 사용합니다.`
        : `# ${project.title} InstantStoryPack v${packageVersion}\n\nStudio ${STUDIO_VERSION} / Engine ${ENGINE_VERSION}\n\n이 패키지는 Instant Story Runtime v2 전용입니다. 지능형 정사 전개, 사건 장부, NPC 자율 세계, 관계 기억, 루트·루프 엔진으로 폴백하거나 혼합 실행하면 안 됩니다. Nexus가 ${INSTANT_STORY_FEATURE_ID}를 지원하지 않으면 패키지를 거부해야 합니다. 원시 모델 delta는 서버 내부에서만 처리하고 공개 SSE에는 검사된 narration_commit만 전송합니다.\n\nStudio와 Relay Core 편집용 원본은 ${EMBEDDED_PROJECT_SNAPSHOT_PATH}에 있으며 런타임은 이 파일을 무시합니다.`,
    );
  } else {
    const importObject = buildImportObject(project, assets);
    zip.file("CHATGPT_IMPORT.md", buildMarkdown(project, assets));
    zip.file("CHATGPT_IMPORT.json", JSON.stringify(importObject, null, 2));
    zip.file(
      "README.md",
      isCortex
        ? `# ${project.title} CortexPack v${packageVersion}\n\nStudio ${STUDIO_VERSION} / ${CORTEX_TARGET_LABEL}\n\n시간표 없는 사건 계약을 사용합니다. 기본 3비트, 최소 2비트부터 조기 종결, 연장 최대 2비트입니다. 작가가 허용한 미충족 전개를 먼저 적용하고 수습되지 않은 의무만 이월합니다. 지정 후속사건이 우선이며 미지정이면 사건 목록 순서를 따릅니다. 발생조건은 단청 확장이 첫 입력 전 공개 상태로 판정합니다. 거짓인 사건은 완료 처리 없이 건너뛰고 불확실하면 보류합니다. 가져오기·분기·엔딩·발생조건 회귀 테스트를 제공하며 실제 AI의 작품별 품질은 별도 확인이 필요합니다. 상세 범위는 reports/cortex-compatibility.json을 확인하세요.\n\nStudio 편집 원본은 ${EMBEDDED_PROJECT_SNAPSHOT_PATH}에 있으며 런타임은 이 파일을 무시합니다.`
        : `# ${project.title} ScenarioPack v${packageVersion}\n\nStudio ${STUDIO_VERSION} / Engine ${ENGINE_VERSION}\n\n이 패키지는 지능형 정사 전개 Runtime용입니다. Asset-Once 원본은 assets/manifest.json의 SHA-256으로 검증하며 Package 1.5에서는 routes/·loops/·state/ 계약을 사용합니다.\n\nStudio와 Relay Core 편집용 원본은 ${EMBEDDED_PROJECT_SNAPSHOT_PATH}에 있으며 런타임은 이 파일을 무시합니다.`,
    );
  }
  let instantContextPreflight: InstantContextPreflight | undefined;
  if (isCortex && isInstant) {
    const contextFiles = Object.fromEntries(zipEntries.filter(entry => entry.name.endsWith('.json') && typeof entry.data === 'string').map(entry => [entry.name, JSON.parse(entry.data as string)]));
    const preflight = inspectInstantContext(contextFiles);
    instantContextPreflight = preflight;
    zip.file('reports/instant-context-preflight.json', JSON.stringify(preflight, null, 2));
    if (shouldDownload && preflight.status === 'RUNTIME_INVALID') throw new Error(preflight.note);
    if (shouldDownload && preflight.status === 'BASE_CONTEXT_EXCEEDED') {
      const failed = preflight.probes.find(p => p.kind === 'base' && !p.fits)!;
      throw new Error(`Instant 기본 설정에 ${failed.requiredChars.toLocaleString()}자가 필요하지만 기본 한도는 ${failed.maximumChars.toLocaleString()}자입니다. 설정집이나 캐릭터 설명에서 중복 내용을 줄여 주세요.`);
    }
  }
  for (const asset of assets.uniqueAssets)
    zip.file(asset.assetPath, asset.sourceBlob ?? asset.bytes, {
      binary: true,
      compression: "STORE",
    });
  const blob = await generateStreamingZip(zipEntries);
  const packName = isCortex
    ? "CortexPack"
    : isInstant
      ? "InstantStoryPack"
      : "ScenarioPack";
  if (shouldDownload)
    download(
      `${base}_${packName}_v${packageVersion}${options.imageMode === "screen" ? "_Screen" : ""}.zip`,
      blob,
      "application/zip",
    );
  return {
    imageOptimization: prepared.report,
    instantContextPreflight,
    blob,
    blobBytes: blob.size,
    logicalAssetCount: assets.logicalAssetCount,
    originalAssetBytes: assets.originalAssetBytes,
    storedAssetBytes,
    storedAssetCount: assets.uniqueAssets.length,
  };
}

export const aiGeneratorPrompt = `# Relay Novel Studio v${STUDIO_VERSION} 생성기 전용 JSON 제작 요청

아래의 간단한 아이디어를 바탕으로 릴레이 하드모드 소설 시뮬레이터용 완성 프로젝트를 구성해 주세요.

[내 아이디어]
- 제목 또는 핵심 키워드:
- 장르·시대·장소:
- 핵심 세계관 한 줄:
- 참고 작품·세계관·장르:
- 기존 작품 등장인물과 참고할 원작 시점:
- 지역·시대 현지화:
- 참고 설정 활용 방식과 금지할 복제:
- 주인공:
- 주요 캐릭터와 외형 앵커:
- 반드시 넣을 요소:
- 제외할 요소:
- 엔진 계열: Lotus 또는 Cortex (project.packageTarget 값은 각각 legacy 또는 cortex)

[출력 규칙]
1. 설명문 없이 JSON 코드 블록 하나만 출력합니다.
2. 최상위 format은 "RELAY_NOVEL_STUDIO_AI_PROJECT_V2"로 합니다.
3. project에는 Relay Novel Studio의 완성 프로젝트를 넣습니다.
3-A. project.packageTarget은 요청한 엔진 계열에 따라 Lotus는 "legacy", Cortex는 "cortex"로 작성합니다. cortex이면 protagonistInvariants에 HARD 생존 1개와 작품 완주에 꼭 필요한 SOFT 항목 2~4개를 ref·label·severity·description과 함께 작성합니다. legacy이면 protagonistInvariants는 빈 배열로 둡니다.
4. 빈칸을 남기지 말고 합리적으로 추론합니다.
5. 플레이어 1명, 주요 NPC 4~8명, 세력 3~6개, 방향성 인물·세력 관계, 사건 4개 이상, 사건 시계 3개 이상, 장기 복선 3개 이상, GM 비공개 진실과 시작 장면을 만듭니다.
6. NPC마다 importance, imageOnFirstAppearance, visualLock, visualAnchor, imageFallback을 작성합니다. images는 빈 배열로 둡니다.
7. 비중 높은 새 캐릭터 첫 등장 시 이미지 필수, 기준 이미지가 없으면 애니풍 생성 후 최초 결과를 외형 정사로 고정하는 visualBible 규칙을 포함합니다.
8. NPC·세력·사건에는 중복되지 않는 문자열 id를 부여하고 관계 참조는 실제 id와 일치시킵니다.
9. 비공개 정보는 publicInfo와 분리하고 gmData에 실제 진실을 기록합니다.
10. 중요 NPC 4~8명과 세력 2~4개에 autonomyActors를 만듭니다. 각 배우의 현재 위치, 단기·중기·장기 목표, 우선도, 현재 계획, 다음 행동, 행동 주기, 알고 있는 사실, 오해, 자원, 제약, 위험 감수, 협력·충돌·이동 규칙, 성공·부분 성공·실패 결과를 구체적으로 작성합니다.
11. autonomySettings를 활성화하고 턴당 최대 행동 수, 세력 주기, 시드 재현, 이동 시간·정보·자원 경계, 오프스크린 실패, 관측 가능한 흔적 규칙을 포함합니다.
12. 각 주요 방향성 인물 관계에 1~3개의 relationshipMemories를 만듭니다. 약속·배신·구조·빚·비밀·모욕·공동 성공/실패 또는 첫인상의 구체적 원인과 7개 관계 효과, 공개 범위, 중요도, 영구성, active 여부, 미해결 조건을 작성합니다.
13. relationshipMemorySettings를 활성화하고 초기 기준값 + 기억 효과 합산, 모순된 기억 보존, 공개 가능한 이유만 HUD 표시하는 규칙을 포함합니다.
14. 추천 답변 3개와 장면 이미지가 기본 활성화된 turnPresentation을 포함합니다.
15. statusWindow를 활성화하고 Ability와 Condition은 플레이어가 현재 이해할 수 있는 한두 줄 문장으로 작성합니다. Core Stats는 3~6개를 유지하고 Resources는 이 작품의 핵심 소모 자원 1~3개, 그 아래에는 현재 자금을 구성합니다. Fate·성배전쟁 계열에서만 령주·보석·마술무기를 사용합니다.
16. 각 Resources 항목에는 공개·증감 조건을 작성합니다. Fate 계열의 령주는 계약 성립을 직접 확인한 순간 3회로 공개하고, 보석·마술무기는 실제 보유 확인 전까지 숨깁니다. 다른 장르는 세계관에 맞는 자원명과 조건을 사용합니다. 미등장 인물·숨은 정체·비밀 진영·미래 사건은 모든 HUD 문장에서 제외합니다.
17. Cortex 필수 사건은 required=true로 지정하고, 1부터 시작하는 sequence와 인용 가능한 requiredFunctions를 1~3개 작성합니다. 각 요건은 한 문장·한 유형이며 alternatives는 두 어절 이상으로 씁니다. v1.36의 recoveryAlternatives는 휴면이므로 비웁니다. 실패 분기는 failureConditions와 onFailure로 명시하고, 요건 미충족 자체를 실패로 간주하지 않습니다. Lotus 필수 사건은 completionSignals와 recoveryAlternatives를 사용합니다. priority는 0~100이며 100이 최대입니다.
17-A. 모든 사건에 kind를 작성합니다. 일반 사건은 kind="event"입니다. 여러 사건 동안 계속 지켜야 하는 진명·관계·등장 제한은 독립 사건으로 만들지 말고 kind="constraint", appliesTo=[사건 ID], rules=[규칙]으로 작성합니다. appliesTo가 빈 배열이면 모든 사건에 적용됩니다.
17-B. 같은 시간대의 전투·시점을 교차해야 하면 복수 활성 사건을 만들지 말고 하나의 kind="compound" 사건으로 합칩니다. beats에는 id, viewpoint, content만 순서대로 작성하며, 각 content에 그 비트에서 실제로 성립해야 할 장면을 구체적으로 적고 뒤 비트 내용을 앞당기지 않습니다.
17-C. 장소는 작품 배경과 사건 설명에 자연어로 작성합니다. 위치 그래프나 장소 ID를 만들지 않습니다.
18. imageTriggers를 3개 이상 만듭니다. 결정적 필수 사건의 전용 이미지는 해당 사건 ID를 sourceId로 연결하고, 관련 캐릭터 ID를 모두 지정합니다. 사건 조건 충족, 사건 성공·실패, 시계 값, 복선 공개, 서사 단계 중 서로 다른 조건을 사용하며 이미지 프롬프트·스포일러 방지·1회 실행 여부를 구체적으로 작성합니다. attachedImages는 빈 배열로 둡니다.
19. aiWorldContext를 작성합니다. 참고 작품·세계관·장르가 있으면 활성화하고 premise, referenceFramework, referenceUsage, localContext, enrichmentPriorities, protectedCanon, avoidElements, originalityRule, spoilerRule을 구체적으로 채웁니다. 지식 정책은 hybrid, 보강 깊이는 balanced 또는 deep으로 정하고 세션 시작·장면 전환·사건 생성·NPC 판단·매 대화 재평가를 활성화합니다. 기존 작품 캐릭터가 등장하면 referenceCharacterResearch도 활성화해 이름, 조사 범위, 공식 자료 우선순위, 원작 시점·스포일러 기준, 첫 등장·정사 충돌 재검증과 세션 캐시를 구성합니다. 현재 패키지 정사를 참고 설정보다 우선하며 원작 사건·대사·인물 역할을 그대로 복제하지 않고 아직 공개되지 않은 진명·배후·비밀 규칙을 앞당기지 않습니다.
20. 결과 형식:
{
  "format":"RELAY_NOVEL_STUDIO_AI_PROJECT_V2",
  "generatorVersion":"${STUDIO_VERSION}",
  "summary":"생성 내용 요약",
  "assumptions":["추론한 전제"],
  "project": { "Relay Novel Studio 완성 프로젝트 전체" }
}`;

export function aiGeneratorPromptFor(project: Project) {
  if (project.packageTarget !== "cortex") return aiGeneratorPrompt;
  if (project.runtimeMode === 'instant_story') return `# Studio ${STUDIO_VERSION} / Cortex Instant Story 작품 설계
형식은 RELAY_NOVEL_STUDIO_AI_PROJECT_V2, project.packageTarget은 cortex, runtimeMode는 instant_story인 JSON을 작성한다.
지음 1.1.0의 간결한 구조를 사용한다. world.overview에는 공개 세계관을 자유문으로, gmData.worldTruthLedger에는 작가만 알아야 할 비공개 세계관을 작성한다. 캐릭터는 name, publicInfo, appearance, visualAnchor, hiddenInfo를 중심으로 작성하고 images는 기존 값을 보존한다. 비공개 정보는 동기와 인과에만 사용하며 독자가 장면에서 발견하기 전에 직접 확인·인용·요약하지 않는다.
instantStory.enabled=true로 두고 exampleScenes는 최대 3개, startProfiles에는 프롤로그·시작 상황과 정확히 3개의 recommendedReplies를 작성한다. 세 추천답변은 순서대로 작은 파동·중간 파동·큰 파동이며 시작 화면에 그대로 표시될 완결된 행동 문구다. statRules와 keywordNotes는 작품에 실제로 필요할 때만 작성한다. corePrompt, contextBudget, generation, deepPathTriggers, endingPolicy는 지음 내부 기본값을 변경하지 않는다.
protagonistInvariants에는 characterId를 지정해 등록된 어느 캐릭터에도 적용할 수 있다. HARD는 정말 이야기를 유지할 수 없는 결과에만 사용하고, 나머지는 SOFT로 둔다. 전역 보호어는 조기 노출을 막을 정확 문자열이 있을 때만 선택적으로 작성하며 빈 배열이어도 된다.
고정 사건·종결조건·정사 비트 예산·루트·회차 계약을 만들지 않는다. events는 빈 배열, package15.enabled=false로 둔다. 기존 원본·인물·이미지 ID를 유지한다.
사용자 입력을 현재 장면의 원인으로 삼고, 키워드 노트와 수치 구간은 필요한 때에만 문맥에 포함하도록 작성한다. 비공개 정보는 공개 조건 전에 노출하지 않는다.
실행 대상은 ${CORTEX_TARGET_LABEL}다. 확장이 없는 독립 Cortex 1.42.0과 혼동하지 않는다. 본문은 완성 응답 검사 후 표시하며 첫 표시 시간이나 단일 호출을 보장하지 않는다. 전용 미디어 자동 실행·사전 지정 엔딩·자동 엔딩 검사·루프·멀티플레이·자동 외부 조사를 설계하지 않는다. 예시는 최대 3개이며 첫 응답의 문체 참고 자료일 뿐 이야기의 사실이 아니다.
작품 아이디어: ${project.notes || project.world.overview || project.title}`;
  return `# Studio ${STUDIO_VERSION} / Cortex ${CORTEX_TARGET_VERSION} 작품 설계
형식은 RELAY_NOVEL_STUDIO_AI_PROJECT_V2, project.packageTarget은 cortex, runtimeMode는 ${project.runtimeMode}인 JSON을 작성한다.
${cortexAuthoringGuidance}
기존 패키지·사건·이미지 식별자는 유지한다. 즉흥 서사 개체 등록, 인용문 일치 증명, 사실표를 요구하지 않는다.
사건별 날짜·시각·시간창·tick을 생성하지 않는다. 사건 배열은 작가의 진행 순서이며 지정 nextEventId가 우선이다. 시간표를 설명·종결조건에 자동 복사하지 않는다.\n정사 사건은 id,name,description,required,nextEventId를 작성하고, cortexDesign에 schema=STUDIO_EVENT_DESIGN_V2, occurrenceEnabled,occurrence,otherViewpoint,viewpoint,closureConditions:[{id,text}],selectionScope,constraints,success,unmet을 작성한다.
종결조건은 현재 사건에서 도달할 결과를 한 항목씩 작성한다. 복합 의도를 임의 분해하지 않는다. 후보 수·단위·범위와 금지를 명확히 구분한다. 진짜 필수 순서는 유지하고 불필요한 다음 사건 앞조건은 제거안을 제안한다. 원격 관측·접근·시도와 실제 확보·실행을 구별한다.
필수 여부와 발생조건은 별개이며 발생조건은 선택 사항이다. 우선순위는 사용하지 않는다. 미충족 전개가 허용하는 포기·대체·생략 범위를 명확히 한다. 다음 사건이 이미 거절·상실한 대상의 확보를 가정하지 않게 한다.
${CORTEX_TARGET_LABEL}의 발생조건은 첫 입력 실행 전 이미 공개된 상태로 판정한다. 거짓인 사건은 완료·점수 반영 없이 건너뛰고 불확실하거나 통신에 실패하면 입력을 보존하고 보류한다. 미래 입력이나 사건 설명을 조건 근거로 요구하지 않는다. 분기는 branchEnding의 공개 본문 선택 기록과 choice_status·event_completed·flag_equals·flag_at_least로 설계한다. 분기 엔딩은 returnPolicy=stay_ended를 사용한다.
장소는 자연어 배경과 canonLocation에 쓴다. locationGraph·장소 ID·인접 그래프는 만들지 않는다.
문체와 보호어를 작품에 맞게 작성한다. protectedTerms는 희귀한 정확 문자열의 최소 보호 장치이며 의미적 스포일러 전체를 보장하지 않는다. 일반 단어를 자동 등록하지 않는다.
Instant Story는 instantStory의 시작 설정·문체 예시·키워드 노트를 작성하고 고정 사건을 강요하지 않는다.
원문은 사람이 결정한다. 기존 필드에 중복 계약을 다시 붙이지 않는다. Cortex UI에 표시할 추천답변·상태표를 산문 출력 지시로 넣지 않는다.
작품 아이디어: ${project.notes || project.world.overview || project.title}`;
}
