"use client";
import {setCortexAccountOwner,CORTEX_ACCOUNT_CHANGED} from "../lib/cortex-account-scope";
import { TextProviderSelector } from './text-provider-selector';
import { ImageApiSettings } from './image-api-settings';
import { OpenAIApiGuide } from './openai-api-guide';
import { applyOpenAIImageKey, resolveOpenAIImageKey } from '../lib/openai-image-key';
import { CompletionConditionsSetting } from './completion-conditions-setting';
import { deviceTextProvider, TEXT_PROVIDERS } from '../lib/text-provider';
import {
  removeCortexProject,
  useCortexCatalog,
  useRuntimeEngine,
} from "./hooks/use-runtime-engine";
import { CortexLibrary } from "./cortex-library";
import { CortexPlayer } from "./cortex-player";

import {
  Fragment,
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { demoScenario } from "../lib/demo-scenario";
import {
  applyStatePatch,
  type EngineTurnResponse,
} from "../lib/engine";
import {
  forgetRememberedApiKey,
  rememberApiKeyOnDevice,
  restoreRememberedApiKey,
} from "../lib/api-key-vault";
import {
  forgetPackageData,
  rememberPackageArchive,
  rememberPackageMedia,
  rememberPackageMediaAsset,
  requestPersistentPackageStorage,
  restorePackageArchive,
  restorePackageMedia,
} from "../lib/package-media-vault";
import {
  MAX_SCENARIO_PACKAGE_BYTES,
  SCENARIO_MEDIA_SCHEMA_VERSION,
  characterVisualAssetId,
  createInitialState,
  createId,
  createOpeningTurn,
  defaultAutonomyRuntime,
  defaultRelationshipMemoryRuntime,
  defaultStatusWindow,
  deriveEncounteredCharacterIds,
  detachScenarioMedia,
  extractScenarioMediaDataUrl,
  normalizeImageAspect,
  normalizeImageQuality,
  normalizeImageResolution,
  normalizeSceneImageInterval,
  parseScenarioPackFile,
  repairPackageCharacterVisuals,
  scenarioOpeningTime,
  selectCharacterReferenceAsset,
  selectPackageCharacterReferenceAsset,
  selectSceneCharacterReferenceIds,
  type CharacterVisualCue,
  type ImageAspect,
  type ImageQuality,
  type ImageResolution,
  type LongTermMemoryRecord,
  type PublicStatusSnapshot,
  type RuntimeState,
  type ScenarioMediaAsset,
  type ScenarioPack,
  type SceneImageInterval,
  type StoryBlock,
  type TurnRecord,
} from "../lib/scenario";
import { serializeProjectImport } from "../lib/project-import-transfer";
import {
  advanceClaudeBeatManually,
  closeClaudeEventManually,
  readClaudeRuntime,
} from "../lib/claude-runtime";
import { InspectorEvents } from "./components/inspector-events";
import {
  NexusLibraryHome,
  type HubWorkSummary,
} from "./components/nexus-library-home";
import {
  deriveRuntimeRelationsFromMemories,
  normalizeRuntimeAutonomyActors,
  normalizeRuntimeRelations,
  normalizeRuntimeRelationshipMemories,
} from "../lib/autonomy";
import {
  buildPublicStatusSnapshot,
  isPubliclyObservedMemory,
  isPubliclyObservedVariable,
  isSensitivePublicStatusText,
  normalizeRuntimeStatusLedger,
  observableClockLabel,
  sanitizeStoredPublicStatusSnapshot,
} from "../lib/status-window";
import {
  inspectSessionIntegrity,
  repairNarrativeChronologyHistory,
  repairNarrativeControlLeakHistory,
  repairNarrativeRegressionHistory,
  repairClaudeEventLedgerHistory,
  repairPrematureTriggeredMediaHistory,
  repairRequiredEventHistory,
  repairSaberSummoningHistory,
  resolveChapterTitle,
} from "../lib/session-integrity";
import { buildDetailedStatusView } from "../lib/status-presentation";
import {
  FULL_CONTEXT_TURN_LIMIT,
  GENERATED_SCENE_IMAGE_LIMIT,
  appendLongTermMemories,
  optimizeConversationSnapshot,
  retainRecentGeneratedSceneImages,
} from "../lib/conversation-memory";
import {
  buildSessionTranscriptHtml,
  sessionTranscriptFileName,
} from "../lib/session-export";
import {
  isMobileComposerDevice,
  shouldSubmitComposerOnEnter,
} from "../lib/composer-input";
import {
  attachRuntimeCheckpoints,
  cloneRuntimeCheckpoint,
  runtimeCheckpointForTurn,
} from "../lib/session-timeline";
import { BoundedLruCache } from "../lib/bounded-lru-cache";
import { APP_VERSION, APP_VERSION_LABEL } from "../lib/app-version";
import type { ImageCostBreakdown } from "../lib/api-cost";
import {
  consumeSimulationStream,
  shouldStartInitialStreamScroll,
  projectStableLiveBlocks,
  hydrateValidatedLiveBlocks,
  isDirectLiveBlockStream,
  revealNarrationCommit,
  rewindNarrationBlocks,
  validatedLiveNarrationMatches,
  validatedLiveProjectionMatches,
  validatedStoryBlocksMatch,
  type FailedTurnDiagnostic,
} from "../lib/simulation-stream";
import { useLiveStreamUi } from "./hooks/use-live-stream-ui";
import { useStoryScrollUi } from "./hooks/use-story-scroll-ui";
import {
  useNexusLibraryState,
  useNexusSettingsState,
  type ApiConnectionStatus,
  type ReadingFontSize,
  type ReadingWidth,
  type SettingsTab,
  type ThemeMode,
  type TypingSpeed,
} from "./hooks/use-nexus-shell-state";
import { MAX_PLAYER_INPUT_CHARS } from "../lib/player-input";
import { validateHubPackageBytes } from "../lib/hub-package";
import { downloadHubCoverFile } from "../lib/hub-cover-install";
import {
  costMeterEntryFromTurn,
  mergeCostMeterEntries,
  type CostMeterEntry,
} from "../lib/cost-meter";
import {
  liveReliabilityEntry,
  mergeLiveReliabilityEntries,
  persistLiveReliabilityEntry,
  type LiveReliabilityEntry,
} from "../lib/live-reliability";

type SavedSession = {
  pack: ScenarioPack;
  state: RuntimeState;
  turns: TurnRecord[];
  longTermMemories: LongTermMemoryRecord[];
  totalCostUsd: number;
  lastMode: "mock" | "luna";
};

type ProjectSummary = {
  id: string;
  sourceProjectId: string;
  title: string;
  genre: string;
  playerName: string;
  packageVersion: string;
  projectRevision: number;
  packageFingerprint: string;
  sessionCount: number;
  hasPackage: boolean;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type SessionSummary = {
  id: string;
  projectId: string;
  name: string;
  turn: number;
  day: number;
  location: string;
  preview: string;
  totalCostUsd: number;
  lastMode: "mock" | "luna";
  revision: number;
  projectRevision: number;
  packageFingerprint: string;
  lastWriterId: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
};

type LibraryResponse = {
  projects: ProjectSummary[];
  sessions: SessionSummary[];
  costMeterTurns?: CostMeterEntry[];
  liveReliabilityAttempts?: LiveReliabilityEntry[];
  error?: string;
};

type SessionEnvelope = {
  project: ProjectSummary;
  session: SessionSummary;
  snapshot: SavedSession;
  error?: string;
};

type MultiplayerCallCause = "NORMAL" | "AUTO_TIMEOUT" | "HOST_FORCE";

type MultiplayerRoomState = {
  code: string;
  name: string;
  status: "WAITING" | "ACTIVE" | "PAUSED_KEY" | "SOLO" | "CLOSED";
  currentMemberId: string | null;
  turnDeadlineAt: string | null;
  keyRecoveryDeadlineAt: string | null;
  pausedReason: string;
  revision: number;
  isHost: boolean;
  settings: {
    textModel: string;
    imageModel: string;
    baseUrl: string;
    outputContract: string;
  };
  members: Array<{
    id: string;
    displayName: string;
    status: string;
    apiKeyReady: boolean;
    isSelf: boolean;
  }>;
};

type MultiplayerStoryEnvelope = SessionEnvelope & {
  room: MultiplayerRoomState;
};

type SessionCheckpoint = {
  id: string;
  sessionId: string;
  projectId: string;
  revision: number;
  kind: "INITIAL" | "AUTO" | "MANUAL" | "CONFLICT" | "RESTORE_BACKUP";
  label: string;
  turn: number;
  sourceDeviceId: string;
  createdAt: string;
};

type UndoSnapshot = {
  state: RuntimeState;
  turns: TurnRecord[];
  longTermMemories: LongTermMemoryRecord[];
  totalCostUsd: number;
  lastMode: "mock" | "luna";
};

type InspectorImagePreview = {
  url: string;
  label: string;
  meta: string;
};

type ImportProgressState = {
  value: number;
  phase: string;
  detail: string;
  fileName: string;
  fileSize: string;
  status: "running" | "complete" | "error";
};

type ProjectImportPayload = {
  project?: ProjectSummary;
  session?: SessionSummary;
  error?: string;
};

type AccountInfo = {
  authenticated: boolean;
  id?: string;
  email?: string;
  displayName?: string;
  role?: "MASTER" | "USER";
  storageMode: "account";
  createdAt?: string;
  lastSeenAt?: string;
  signInPath?: string;
  signOutPath?: string;
  error?: string;
};

type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: string;
  actorDisplayName: string;
  actorRole: "MASTER" | "USER";
};

const BUILT_IN_DEMO_PROJECT_ID = "demo-project";
const BUILT_IN_DEMO_SESSION_ID = "demo-session";
const BUILT_IN_DEMO_TIMESTAMP = "2026-03-02T12:18:00+09:00";
const SESSION_ENVELOPE_CACHE_LIMIT = 3;
const APPEARANCE_STORAGE_KEY = "relay-nexus-appearance-v1";
const DEMO_SESSION_STORAGE_KEY = "relay-nexus-demo-session-instant-v1";
const DEVICE_ID_STORAGE_KEY = "relay-nexus-device-id-v1";
const SOURCE_EXPORT_FILE_NAME = `Dancheong_v${APP_VERSION}_Source.zip`;
const SOURCE_EXPORT_URL = `/downloads/${SOURCE_EXPORT_FILE_NAME}`;

const builtInDemoProject: ProjectSummary = {
  id: BUILT_IN_DEMO_PROJECT_ID,
  sourceProjectId: demoScenario.projectId,
  title: demoScenario.title,
  genre: `기본 데모 · ${demoScenario.genre}`,
  playerName: demoScenario.player.name,
  packageVersion: demoScenario.packageVersion,
  projectRevision: 2,
  packageFingerprint: "built-in-demo-instant-v1",
  sessionCount: 1,
  hasPackage: false,
  createdAt: BUILT_IN_DEMO_TIMESTAMP,
  updatedAt: BUILT_IN_DEMO_TIMESTAMP,
};

const builtInDemoSession: SessionSummary = {
  id: BUILT_IN_DEMO_SESSION_ID,
  projectId: BUILT_IN_DEMO_PROJECT_ID,
  name: "데모 이야기",
  turn: 0,
  day: 0,
  location: demoScenario.startLocation,
  preview: "기성학원 기본 데모를 체험합니다.",
  totalCostUsd: 0,
  lastMode: "mock",
  revision: 1,
  projectRevision: 2,
  packageFingerprint: "built-in-demo-instant-v1",
  lastWriterId: "built-in-demo-instant-v1",
  createdAt: BUILT_IN_DEMO_TIMESTAMP,
  updatedAt: BUILT_IN_DEMO_TIMESTAMP,
  lastPlayedAt: BUILT_IN_DEMO_TIMESTAMP,
};

const IMAGE_INTERVAL_OPTIONS: Array<{
  value: SceneImageInterval;
  label: string;
}> = [
  { value: 0, label: "끔" },
  { value: 2, label: "2턴" },
  { value: 5, label: "5턴" },
  { value: 10, label: "10턴" },
  { value: 20, label: "20턴" },
];

const imageQualityLabel = (quality: ImageQuality) =>
  quality === "low" ? "Low" : "Medium";

const imageAspectLabel = (aspect: ImageAspect) =>
  aspect === "portrait" ? "세로 · 3:4" : aspect === "square" ? "정사각 · 1:1" : "가로 · 16:9";

const imageAspectPrompt = (aspect: ImageAspect) =>
  aspect === "portrait"
    ? "캐릭터의 얼굴과 의상, 반신 또는 전신 구도를 안정적으로 담는 3:4 세로형 일러스트 장면"
    : aspect === "square"
      ? "균형 잡힌 1:1 정사각형 장면"
      : "시네마틱한 16:9 가로형 장면";

const playbackImageDimensions = (
  resolution: ImageResolution,
  aspect: ImageAspect,
) => {
  const shortEdge = resolution === "360p" ? 360 : 480;
  if (aspect === "portrait") {
    return { width: shortEdge, height: resolution === "360p" ? 480 : 640 };
  }
  if (aspect === "square") return { width: shortEdge, height: shortEdge };
  return { width: resolution === "360p" ? 640 : 854, height: shortEdge };
};

const resizeGeneratedImage = (
  imageUrl: string,
  resolution: ImageResolution,
  aspect: ImageAspect,
): Promise<string> => {
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(imageUrl);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const { width: targetWidth, height: targetHeight } =
        playbackImageDimensions(resolution, aspect);
      const targetRatio = targetWidth / targetHeight;
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = image.naturalWidth;
      let sourceHeight = image.naturalHeight;

      if (sourceRatio > targetRatio) {
        sourceWidth = image.naturalHeight * targetRatio;
        sourceX = (image.naturalWidth - sourceWidth) / 2;
      } else if (sourceRatio < targetRatio) {
        sourceHeight = image.naturalWidth / targetRatio;
        sourceY = (image.naturalHeight - sourceHeight) / 2;
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(imageUrl);
        return;
      }
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => resolve(imageUrl);
    image.src = imageUrl;
  });
};

const imageIntervalLabel = (interval: SceneImageInterval) =>
  interval === 0 ? "정기 생성 끔" : `${interval}턴마다`;

const formatPackageSize = (bytes: number) => {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toFixed(2)}GB`;
  }
  if (megabytes >= 1) {
    return `${megabytes >= 100 ? megabytes.toFixed(0) : megabytes.toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
};

const optimizeProjectThumbnail = (file: File): Promise<File> => {
  const supported = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!supported.has(file.type)) {
    return Promise.reject(new Error("JPG, PNG 또는 WebP 이미지를 선택해 주세요."));
  }
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(file);
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxWidth = 720;
      const maxHeight = 960;
      const scale = Math.min(
        1,
        maxWidth / image.naturalWidth,
        maxHeight / image.naturalHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("작품 이미지를 처리하지 못했습니다."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("작품 이미지를 저장용으로 변환하지 못했습니다."));
          return;
        }
        const outputType = blob.type || "image/jpeg";
        const outputExtension = outputType === "image/webp"
          ? "webp"
          : outputType === "image/png" ? "png" : "jpg";
        resolve(new File(
          [blob],
          `work-thumbnail.${outputExtension}`,
          { type: outputType },
        ));
      }, "image/webp", 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("선택한 이미지 파일을 읽지 못했습니다."));
    };
    image.src = objectUrl;
  });
};

const STORAGE_KEY = "relay-novel-simulator:session:v1";
const LAST_SESSION_KEY = "relay-novel-simulator:last-session:v2";

type ApiTestResult = {
  connected?: boolean;
  model?: string;
  error?: string;
};

const openaiKeyForLegacy = async (key: string) => {
  if(deviceTextProvider()==='openai')return key;
  const stored=await resolveOpenAIImageKey();
  if(!stored)throw new Error('이 기능에는 OpenAI API 키가 필요합니다. 설정에서 OpenAI 키를 저장해 주세요.');
  return stored;
};
const testApiConnection = async (apiKey: string, provider = deviceTextProvider()) => {
  const response = await fetch("/api/openai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, provider }),
  });
  const result = (await response.json()) as ApiTestResult;
  if (!response.ok || !result.connected) {
    throw new Error(result.error || "API 연결을 확인하지 못했습니다.");
  }
  return result;
};

const prepareDeviceOwner = async () => {
  const response = await fetch("/api/device-owner", {
    method: "POST",
    cache: "no-store",
  });
  const result = (await response.json()) as AccountInfo & { ready?: boolean };
  if (!response.ok && response.status !== 401) {
    throw new Error(result.error || "이 계정의 작품 보관함을 준비하지 못했습니다.");
  }
  return result;
};

const getOrCreateDeviceId = () => {
  const remembered = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (remembered) return remembered;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
};

const uploadScenarioProject = (
  form: FormData,
  onProgress: (ratio: number) => void,
) => new Promise<{ ok: boolean; result: ProjectImportPayload }>((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("POST", "/api/projects");
  request.responseType = "json";
  request.upload.onprogress = (event) => {
    if (event.lengthComputable && event.total > 0) {
      onProgress(event.loaded / event.total);
    }
  };
  request.onerror = () => reject(new Error("온라인 작품 보관함에 연결하지 못했습니다."));
  request.onabort = () => reject(new Error("ScenarioPack 저장이 중단되었습니다."));
  request.onload = () => {
    const fallbackError = request.status === 413
      ? "온라인 저장 요청이 한 번에 보낼 수 있는 크기를 넘었습니다. 원본과 작품 데이터를 분리해 다시 시도해 주세요."
      : "작품 보관함의 응답을 읽지 못했습니다.";
    const result = request.response && typeof request.response === "object"
      ? request.response as ProjectImportPayload
      : { error: fallbackError };
    resolve({
      ok: request.status >= 200 && request.status < 300,
      result,
    });
  };
  request.send(form);
});

type CloudPackagePart = { partNumber: number; etag: string };

const uploadScenarioPackageMultipart = async (
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ uploadId: string; parts: CloudPackagePart[] }> => {
  const beginResponse = await fetch("/api/projects/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  });
  const begin = await beginResponse.json() as {
    uploadId?: string;
    chunkSize?: number;
    partCount?: number;
    error?: string;
  };
  if (!beginResponse.ok || !begin.uploadId || !begin.chunkSize || !begin.partCount) {
    throw new Error(begin.error || "대용량 패키지 온라인 업로드를 시작하지 못했습니다.");
  }

  const parts: CloudPackagePart[] = [];
  try {
    for (let index = 0; index < begin.partCount; index += 1) {
      const partNumber = index + 1;
      const start = index * begin.chunkSize;
      const chunk = file.slice(start, Math.min(file.size, start + begin.chunkSize));
      let lastError = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(
            `/api/projects/uploads/${encodeURIComponent(begin.uploadId)}/parts/${partNumber}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: chunk,
            },
          );
          const result = await response.json() as CloudPackagePart & { error?: string };
          if (!response.ok || !result.etag) {
            throw new Error(result.error || `${partNumber}번 조각 업로드 실패`);
          }
          parts.push({ partNumber: result.partNumber || partNumber, etag: result.etag });
          onProgress(Math.min(1, (start + chunk.size) / file.size));
          lastError = "";
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "패키지 조각 업로드 실패";
        }
      }
      if (lastError) throw new Error(lastError);
    }
    return { uploadId: begin.uploadId, parts };
  } catch (error) {
    await fetch(`/api/projects/uploads/${encodeURIComponent(begin.uploadId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    throw error;
  }
};

const Icon = ({ name }: { name: string }) => {
  const paths: Record<string, React.ReactNode> = {
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v15h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 20h14" />
      </>
    ),
    spark: (
      <path d="m12 2 1.25 5.1L18 9l-4.75 1.9L12 16l-1.25-5.1L6 9l4.75-1.9zM5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7z" />
    ),
    shield: (
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-5" />
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    undo: (
      <>
        <path d="M9 7 4 12l5 5" />
        <path d="M5 12h8a6 6 0 0 1 6 6" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2.34 5.66" />
        <path d="M20 4v7h-7" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16" />
      </>
    ),
    send: (
      <>
        <path d="m21 3-7.5 18-3.6-7-6.9-3.5z" />
        <path d="m9.9 14 4-4" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    expand: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
        <path d="m3 8 5-5M21 8l-5-5M3 16l5 5M21 16l-5 5" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H10.4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-3.2h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 4.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h3.2v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9c.16.4.36.74.6 1 .3.27.67.4 1.1.4h.1v3.2h-.1A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    folder: (
      <>
        <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      </>
    ),
    chat: (
      <>
        <path d="M5 18.5 3.5 21v-5A8.5 8.5 0 1 1 7 19.5" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.3-1 10.9-10.9a2 2 0 0 0-2.8-2.8L5.5 16.2z" />
        <path d="m14.8 6.9 2.8 2.8" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    seal: (
      <>
        <path d="M12 4c-1.8 2.2-2.7 4.2-2.7 6 0 1.9 1.1 3.3 2.7 4.1 1.6-.8 2.7-2.2 2.7-4.1 0-1.8-.9-3.8-2.7-6Z" />
        <path d="M9.7 12.7C7 12.9 5.2 14.1 4 16.2c2.6.7 4.8.4 6.5-.9M14.3 12.7c2.7.2 4.5 1.4 5.7 3.5-2.6.7-4.8.4-6.5-.9M12 14.2V21" />
      </>
    ),
    gem: <path d="m12 3 7 6-7 12L5 9l7-6Zm-7 6h14M9 9l3 12 3-12M9 9l3-6 3 6" />,
    sword: (
      <>
        <path d="m14 4 6-2-2 6L8 18l-2-2L16 6" />
        <path d="m5 15 4 4M4 20l2-2" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v4H6.5A2.5 2.5 0 0 1 4 5.5v13A2.5 2.5 0 0 0 6.5 21H20V8H6.5" />
        <path d="M15 12h5v5h-5a2.5 2.5 0 0 1 0-5Z" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};

const initials = (name?: string) => (name ?? "?").slice(0, 1);

const weatherEmoji = (weather: string) =>
  weather.includes("비") ? "🌧️" : weather.includes("흐") ? "☁️" : "🌤️";

const riskClass = (risk: string) =>
  risk === "높음" ? "risk-high" : risk === "보통" ? "risk-mid" : "risk-low";

const relativeSessionTime = (iso: string) => {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "방금 전";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
};

const createOptimizedSessionSnapshot = (
  pack: ScenarioPack,
  state: RuntimeState,
  turns: TurnRecord[],
  longTermMemories: LongTermMemoryRecord[],
  totalCostUsd: number,
  lastMode: "mock" | "luna",
): SavedSession => optimizeConversationSnapshot({
  pack,
  state,
  turns,
  longTermMemories,
  totalCostUsd,
  lastMode,
});

const createOpeningTurnWithStatus = (
  pack: ScenarioPack,
  state: RuntimeState = createInitialState(pack),
): TurnRecord => ({
  ...createOpeningTurn(pack),
  statusSnapshot: buildPublicStatusSnapshot(pack, state),
  runtimeSnapshot: cloneRuntimeCheckpoint(state),
});

const createBuiltInDemoSnapshot = (): SavedSession => {
  const state = createInitialState(demoScenario);
  return {
    pack: demoScenario,
    state,
    turns: [createOpeningTurnWithStatus(demoScenario, state)],
    longTermMemories: [],
    totalCostUsd: 0,
    lastMode: "mock",
  };
};

function StoryBlockView({ block }: { block: StoryBlock }) {
  if (block.type === "dialogue") {
    const speakerPending = block.id.includes("-live-dialogue-") &&
      !block.speakerName;
    return (
      <div
        className={`dialogue-row${speakerPending ? " dialogue-row-live-pending" : ""}`}
        data-story-block-id={block.id}
      >
        <div className={`avatar avatar-${(block.speakerName?.length ?? 0) % 4}`}>
          {speakerPending ? "·" : initials(block.speakerName)}
        </div>
        <div className="dialogue-copy">
          <div className="speaker-line">
            <strong>{speakerPending ? "화자 확인 중" : block.speakerName || "이름 없는 인물"}</strong>
            {block.emotion && <span>{block.emotion}</span>}
          </div>
          <p>“{block.text.replace(/^[“\"]|[”\"]$/g, "")}”</p>
        </div>
      </div>
    );
  }

  if (block.type === "system") {
    return <div className="system-line" data-story-block-id={block.id}>{block.text}</div>;
  }

  return <p className="narration" data-story-block-id={block.id}>{block.text}</p>;
}

function WorldWritingProgress({
  status,
  completed,
}: {
  status: string;
  completed: boolean;
}) {
  return (
    <div className={`world-writing-progress${completed ? " is-complete" : ""}`}>
      <div className="world-writing-primary">
        <span className="world-writing-dots" aria-hidden="true"><i /><i /><i /></span>
        <strong>세계가 반응하는 중</strong>
      </div>
      <div className="world-writing-stage">
        <span>{status}</span>
        {completed && <b aria-label="단계 완료">✓</b>}
      </div>
    </div>
  );
}

function ValidatedTurnReveal({
  turn,
  status,
  statusCompleted,
}: {
  turn: TurnRecord;
  status: string;
  statusCompleted: boolean;
}) {
  return (
    <section
      className="turn-section validated-turn-reveal"
      data-live-turn-id={turn.id}
      data-story-turn-id={turn.id}
      aria-busy="true"
      aria-label="검증된 최종 본문 표시 중"
    >
      {turn.userText ? (
        <div className="user-choice">
          <span>나의 입력</span>
          <p>{turn.userText}</p>
        </div>
      ) : turn.advanceMode === "canonical" ? (
        <div className="auto-continue-marker">
          <Icon name="play" />
          <span>이어서 진행</span>
          <small>패키지 정석 전개</small>
        </div>
      ) : null}
      <div className="final-reveal-toolbar">
        <WorldWritingProgress status={status} completed={statusCompleted} />
      </div>
      <div className="final-reveal-body" aria-live="off">
        {turn.blocks.map((block) => (
          <StoryBlockView block={block} key={block.id} />
        ))}
        <span className="final-reveal-caret" aria-hidden="true" />
      </div>
    </section>
  );
}

function ProjectCover({ project }: { project: ProjectSummary }) {
  return (
    <span className={`story-cover${project.thumbnailUrl ? " has-thumbnail" : ""}`}>
      {project.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.thumbnailUrl} alt="" />
      ) : (
        project.title.slice(0, 1)
      )}
    </span>
  );
}

function ImageLightbox({
  image,
  onClose,
}: {
  image: InspectorImagePreview;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-lightbox-title"
    >
      <button
        type="button"
        className="image-lightbox-backdrop"
        aria-label="확대 이미지 닫기"
        onClick={onClose}
      />
      <figure className="image-lightbox-stage">
        <header>
          <div>
            <small>{image.meta}</small>
            <strong id="image-lightbox-title">{image.label}</strong>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="image-lightbox-close"
            aria-label="확대 이미지 닫기"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="image-lightbox-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.label} draggable={false} />
        </div>
      </figure>
    </div>
  );
}

function PackageMediaCard({
  asset,
  imageUrl,
  profileName,
}: {
  asset: ScenarioMediaAsset;
  imageUrl: string;
  profileName?: string;
}) {
  const isCharacterIntroduction = Boolean(profileName) || asset.kind === "character";
  const caption = profileName || (asset.kind === "character"
    ? asset.characterName
    : asset.caption || asset.label);
  return (
    <figure className={`package-media-card package-media-${asset.kind}${profileName ? " is-character-introduction" : ""}`}>
      {/* Package images are local ZIP assets restored from IndexedDB. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={asset.alt} loading="lazy" />
      {caption && (
        <figcaption>
          <span className="package-media-caption-icon">
            <Icon name={isCharacterIntroduction ? "spark" : "image"} />
          </span>
          <span className="package-media-caption-copy">
            {isCharacterIntroduction && <small>CHARACTER PROFILE</small>}
            <strong>{caption}</strong>
          </span>
        </figcaption>
      )}
    </figure>
  );
}

function CharacterVisualStatusCard({
  cue,
  status,
  onRetry,
}: {
  cue: CharacterVisualCue;
  status?: "loading" | "error";
  onRetry: () => void;
}) {
  const failed = status === "error";
  return (
    <figure className={`character-visual-status ${failed ? "is-error" : ""}`}>
      <div className="character-visual-silhouette">
        <Icon name="spark" />
      </div>
      <figcaption>
        <span>NEW MAJOR CHARACTER</span>
        <strong>{cue.characterName} · 시각 기준본</strong>
        <small>
          {failed
            ? "이미지를 만들지 못했습니다. API 연결을 확인한 뒤 다시 시도할 수 있습니다."
            : cue.source === "package"
              ? "패키지에 저장된 캐릭터 이미지를 불러오는 중…"
              : "첫 등장용 애니메이션 기준 이미지를 생성하는 중…"}
        </small>
        {failed && (
          <button type="button" onClick={onRetry}>
            기준 이미지 다시 만들기
          </button>
        )}
      </figcaption>
    </figure>
  );
}

function SceneImageCard({
  prompt,
  imageUrl,
  status,
  quality,
  resolution,
  aspect,
}: {
  prompt: string;
  imageUrl?: string;
  status?: "loading" | "error";
  quality: ImageQuality;
  resolution: ImageResolution;
  aspect: ImageAspect;
}) {
  const qualityLabel = `${resolution} · ${imageQualityLabel(quality)} · ${imageAspectLabel(aspect)}`;
  if (imageUrl) {
    return (
      <figure className={`scene-frame scene-generated scene-aspect-${aspect}`}>
        {/* Generated scene data is returned directly by the local API route. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="현재 장면의 애니메이션 스타일 이미지" />
        <figcaption>
          <span className="scene-label"><Icon name="image" /> 장면 프레임 · {qualityLabel}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className={`scene-frame scene-aspect-${aspect}`}>
      <div className="scene-glow scene-glow-a" />
      <div className="scene-glow scene-glow-b" />
      <div className="scene-window" />
      <div className="scene-figure">
        <span />
      </div>
      <div className="scene-caption">
        <span className="scene-label">
          <Icon name="image" /> 장면 프레임
        </span>
        <strong>
          {status === "loading"
            ? `${qualityLabel} 장면 이미지를 생성하는 중…`
            : status === "error"
              ? "이미지 생성 실패 · 프롬프트 보존됨"
              : "장면 이미지 프롬프트 준비 완료"}
        </strong>
        <small>{prompt}</small>
      </div>
    </figure>
  );
}

function LongTermMemoryDialog({
  memories,
  onClose,
}: {
  memories: LongTermMemoryRecord[];
  onClose: () => void;
}) {
  return (
    <div className="settings-overlay long-memory-overlay">
      <button
        className="settings-backdrop"
        type="button"
        aria-label="장기기억 닫기"
        onClick={onClose}
      />
      <section
        className="long-memory-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="long-memory-title"
      >
        <header className="settings-head long-memory-head">
          <div>
            <span>CHRONOLOGICAL MEMORY</span>
            <h2 id="long-memory-title">장기기억</h2>
          </div>
          <button type="button" aria-label="장기기억 닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="long-memory-summary">
          <span><Icon name="book" /></span>
          <div>
            <strong>최근 {FULL_CONTEXT_TURN_LIMIT}개 대화는 전문으로 기억합니다.</strong>
            <p>그보다 오래된 공개 사건은 시각·장소·선택·결과를 요약해 시간순으로 보존합니다.</p>
          </div>
          <b>{memories.length}건</b>
        </div>
        <div className="long-memory-scroll">
          {memories.length ? (
            <ol className="long-memory-timeline">
              {memories.map((memory) => (
                <li key={memory.id}>
                  <i aria-hidden="true" />
                  <div className="long-memory-time">
                    <span>D+{memory.day} · TURN {String(memory.turn).padStart(2, "0")}</span>
                    <strong>
                      {[memory.date, memory.weekday, memory.time]
                        .filter(Boolean)
                        .join(" · ") || "시각 기록 없음"}
                    </strong>
                  </div>
                  <article>
                    <h3>{memory.title}</h3>
                    {memory.location && <small>{memory.location}</small>}
                    <p>{memory.summary}</p>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <div className="long-memory-empty">
              <span><Icon name="book" /></span>
              <strong>아직 장기기억으로 전환된 사건이 없습니다.</strong>
              <p>{FULL_CONTEXT_TURN_LIMIT + 1}번째 대화부터 가장 오래된 장면이 이곳에 시간순으로 요약됩니다.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TurnStatusCard({
  snapshot,
  isLatest,
  pack,
  playerImageUrl,
}: {
  snapshot: PublicStatusSnapshot;
  isLatest: boolean;
  pack: ScenarioPack;
  playerImageUrl?: string;
}) {
  const status = buildDetailedStatusView(snapshot);
  const publicRole = !pack.player.role || isSensitivePublicStatusText(pack.player.role)
    ? "플레이어 캐릭터"
    : pack.player.role;
  const publicAffiliation = !pack.player.affiliation || isSensitivePublicStatusText(pack.player.affiliation)
    ? "소속 미공개"
    : pack.player.affiliation;
  const resourceSlots = [
    { id: "command_seals", label: "령주", icon: "seal", unit: "회" },
    { id: "magic_gems", label: "보석", icon: "gem", unit: "개" },
    { id: "magic_weapons", label: "마술무기", icon: "sword", unit: "개" },
  ];
  const exactResourceVisible = status.resources.some((item) =>
    resourceSlots.some((slot) => slot.id === item.id),
  );
  const resourceIcon = (item: (typeof status.resources)[number]) => {
    const descriptor = `${item.icon} ${item.id} ${item.label}`;
    if (/seal|command|령주/i.test(descriptor)) return "seal";
    if (/gem|crystal|보석|결정/i.test(descriptor)) return "gem";
    if (/sword|weapon|blade|무기|검/i.test(descriptor)) return "sword";
    if (/shield|armor|방어|보호/i.test(descriptor)) return "shield";
    return "spark";
  };
  const numberValue = (value: PublicStatusSnapshot["sections"][number]["items"][number]["value"]) =>
    typeof value === "number" ? value : Number(value);
  const fundsValue = status.funds ? numberValue(status.funds.value) : Number.NaN;
  return (
    <details
      className="turn-status-card"
      open={snapshot.defaultExpanded && isLatest}
    >
      <summary>
        <span className="status-card-mark">상태</span>
        <span className="status-card-heading">
          <b>현재 상태</b>
          <small>
            D+{snapshot.day} · {snapshot.date} · {snapshot.time}
          </small>
        </span>
        {snapshot.changedCount > 0 ? (
          <em>{snapshot.changedCount}개 변화</em>
        ) : (
          <em className="quiet">변화 없음</em>
        )}
        <span className="status-card-chevron"><Icon name="chevron" /></span>
      </summary>

      <div className="status-card-body narrative-hud">
        <div className="narrative-hud-live">
          <span><i /> TURN STATUS · LIVE</span>
          <em>TURN {String(snapshot.turn).padStart(2, "0")}</em>
        </div>

        <section className="narrative-hud-profile">
          <div className="narrative-hud-avatar">
            {playerImageUrl ? (
              // Package character art is displayed from the user's local/cloud package archive.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={playerImageUrl} alt={`${pack.player.name} 프로필`} />
            ) : (
              <span>{initials(pack.player.name)}</span>
            )}
          </div>
          <div>
            <small>PLAYER STATUS</small>
            <strong>{pack.player.name}</strong>
            <p>{publicRole} · {publicAffiliation}</p>
          </div>
          <b>● ACTIVE</b>
        </section>

        <section className="narrative-hud-section narrative-hud-ability">
          <h4><Icon name="spark" /> ABILITY</h4>
          <p>{status.ability?.displayValue || "현재 공개된 특별 능력은 아직 없다."}</p>
        </section>

        <section className="narrative-hud-section narrative-hud-stats">
          <h4><Icon name="shield" /> CORE STATS</h4>
          {status.stats.length ? (
            <div className="narrative-stat-list">
              {status.stats.map((item, index) => {
                const current = numberValue(item.value);
                const maximum = item.maximum && item.maximum > 0 ? item.maximum : 100;
                const percent = Number.isFinite(current)
                  ? Math.max(0, Math.min(100, (current / maximum) * 100))
                  : 0;
                return (
                  <div className={`narrative-stat stat-${index % 3}`} key={item.id}>
                    <span>{item.label}</span>
                    <div><i style={{ width: `${percent}%` }} /></div>
                    <strong>{item.grade && <em>{item.grade}</em>} {item.displayValue}{item.maximum ? ` / ${item.maximum}` : ""}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="narrative-hud-empty">현재 공개된 코어 스탯이 없습니다.</p>
          )}
        </section>

        <section className="narrative-hud-section narrative-hud-resources">
          <h4>RESOURCES</h4>
          {exactResourceVisible ? (
            <div className="narrative-resource-grid">
              {resourceSlots.map((slot) => {
                const item = status.resources.find((candidate) => candidate.id === slot.id);
                return (
                  <div className="narrative-resource" key={slot.id}>
                    <Icon name={slot.icon} />
                    <strong>{item?.displayValue ?? "0"}<small>{item?.unit || slot.unit}</small></strong>
                    <span>{slot.label}</span>
                  </div>
                );
              })}
            </div>
          ) : status.resources.length ? (
            <div className="narrative-resource-grid">
              {status.resources.map((item) => (
                <div className="narrative-resource" key={item.id}>
                  <Icon name={resourceIcon(item)} />
                  <strong>{item.displayValue}{item.unit && <small>{item.unit}</small>}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="narrative-hud-empty">현재 공개된 자원 정보가 없습니다.</p>
          )}
        </section>

        {(snapshot.relationshipDisplays ?? []).length > 0 && (
          <section className="narrative-hud-section narrative-hud-relationships">
            <h4><Icon name="people" /> RELATIONSHIPS</h4>
            <div className="relationship-display-list">
              {(snapshot.relationshipDisplays ?? []).map((entry) => {
                const range = entry.stat
                  ? Math.max(1, entry.stat.maximum - entry.stat.minimum)
                  : 1;
                const percent = entry.stat
                  ? Math.max(0, Math.min(100, ((entry.stat.current - entry.stat.minimum) / range) * 100))
                  : 0;
                return (
                  <article className="relationship-display-card" key={entry.id}>
                    <div className="relationship-display-heading">
                      {entry.symbol && <span aria-hidden="true">{entry.symbol}</span>}
                      <div>
                        <strong>{entry.label}</strong>
                        <small>{entry.entityType === "faction" ? "세력" : "인물"}</small>
                      </div>
                    </div>
                    {entry.sentence && <p>{entry.sentence}</p>}
                    {entry.stat && (
                      <div className="relationship-display-stat">
                        <span>{entry.stat.label}</span>
                        <div><i style={{ width: `${percent}%` }} /></div>
                        <strong>
                          {entry.stat.current}
                          {entry.stat.delta !== undefined && entry.stat.delta !== 0 && (
                            <em>{entry.stat.delta > 0 ? `+${entry.stat.delta}` : entry.stat.delta}</em>
                          )}
                        </strong>
                      </div>
                    )}
                    {entry.reason && <small className="relationship-display-reason">{entry.reason}</small>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="narrative-hud-condition">
          <h4>CONDITION</h4>
          <p>{status.condition?.displayValue || "현재 확인된 부상이나 이상 상태는 없다."}</p>
        </section>

        <section className="narrative-hud-funds">
          <h4><Icon name="wallet" /> {status.funds?.label || "자금"}</h4>
          <strong>{Number.isFinite(fundsValue) ? fundsValue.toLocaleString("ko-KR") : "기록 없음"}{Number.isFinite(fundsValue) ? (status.funds?.unit || "원") : ""}</strong>
          <span>{snapshot.location} · {weatherEmoji(snapshot.weather)} {snapshot.weather}</span>
        </section>
      </div>
    </details>
  );
}

function StateInspector({
  pack,
  state,
  totalCostUsd,
  mode,
  apiConnected,
  mobile = false,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  totalCostUsd: number;
  mode: "mock" | "luna";
  apiConnected: boolean;
  mobile?: boolean;
}) {
  const publicClocks = state.clocks.flatMap((clock) => {
    const label = observableClockLabel(pack, state, clock);
    return label ? [{ clock, label }] : [];
  });
  const publicVariables = (state.variables ?? []).filter(
    (variable) => isPubliclyObservedVariable(pack, state, variable),
  );
  const visibleRelations =
    buildPublicStatusSnapshot(pack, state)?.relations ?? [];
  const safeAffiliation = isSensitivePublicStatusText(pack.player.affiliation)
    ? "소속 미공개"
    : pack.player.affiliation;
  const safeStatus = state.status.filter(
    (item) => !isSensitivePublicStatusText(item),
  );
  const publicMemories = state.memories.filter(
    (memory) => isPubliclyObservedMemory(pack, state, memory),
  );
  return (
    <div className={mobile ? "inspector inspector-mobile" : "inspector"}>
      <section className="player-card">
        <div className="player-card-top">
          <div className="player-avatar">{initials(pack.player.name)}</div>
          <div>
            <span>PLAYER</span>
            <h2>{pack.player.name}</h2>
            <p>{safeAffiliation}</p>
          </div>
        </div>
        <div className="status-tags">
          {safeStatus.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      {publicVariables.length > 0 && (
        <section className="inspector-section variable-section">
          <div className="section-heading">
            <span>확인된 상황</span>
            <small>{publicVariables.length}</small>
          </div>
          <div className="variable-list">
            {publicVariables.slice(-5).map((variable) => (
              <div className="variable-item" key={variable.id}>
                <i />
                <div>
                  <strong>{variable.label}</strong>
                  <span>{variable.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {publicClocks.length > 0 && (
        <section className="inspector-section">
          <div className="section-heading">
            <span>직접 확인한 진행</span>
            <small>{publicClocks.length}</small>
          </div>
          <div className="clock-list">
            {publicClocks.map(({ clock, label }) => (
              <div className="clock-item" key={clock.id}>
                <div>
                  <span>{label}</span>
                  <strong>
                    {clock.current}/{clock.maximum}
                  </strong>
                </div>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${Math.round((clock.current / clock.maximum) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="inspector-section">
        <div className="section-heading">
          <span>인물 관계</span>
          <small>{visibleRelations.length}</small>
        </div>
        <div className="relation-list">
          {visibleRelations.slice(0, 5).map((relation, index) => (
            <div
              className="relation-item"
              key={`${relation.characterId}-${index}`}
            >
              <div className="relation-avatar">{initials(relation.name)}</div>
              <div>
                <strong>{relation.name}</strong>
                <span>
                  {relation.reasonTitle || relation.relationType}
                </span>
              </div>
              <em>{relation.trust}</em>
            </div>
          ))}
          {visibleRelations.length === 0 && (
            <p className="relation-empty">
              아직 직접 만난 인물이 없습니다.
            </p>
          )}
        </div>
      </section>

      <section className="inspector-section memory-section">
        <div className="section-heading">
          <span>확인된 기억</span>
          <small>{publicMemories.length}</small>
        </div>
        <ul>
          {publicMemories.slice(-4).map((memory) => (
            <li key={memory}>{memory}</li>
          ))}
        </ul>
      </section>

      <section className="engine-meter">
        <div>
          <span className={`engine-dot ${apiConnected ? "luna" : "mock"}`} />
          <div>
            <strong>
              {apiConnected
                ? "Luna API 연결됨"
                : mode === "luna"
                  ? "마지막 응답 · Luna"
                  : "모의 엔진"}
            </strong>
            <small>누적 API 추정 비용</small>
          </div>
        </div>
        <b>${totalCostUsd.toFixed(4)}</b>
      </section>
    </div>
  );
}

type NexusInspectorTab = "status" | "events" | "cast" | "images" | "records" | "cost";

const INSPECTOR_TABS: Array<{ id: NexusInspectorTab; label: string }> = [
  { id: "status", label: "상태" },
  { id: "events", label: "사건" },
  { id: "cast", label: "인물" },
  { id: "images", label: "이미지" },
  { id: "records", label: "기록" },
  { id: "cost", label: "비용" },
];

function InspectorCast({
  pack,
  state,
  mediaUrls,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  mediaUrls: Record<string, string>;
}) {
  const relationById = new Map(
    (buildPublicStatusSnapshot(pack, state)?.relations ?? [])
      .map((relation) => [relation.characterId, relation] as const),
  );
  const encountered = new Set(state.encounteredCharacterIds ?? []);
  const characters = pack.npcs.filter((character) => encountered.has(character.id));
  return (
    <div className="inspector-pane-content cast-inspector">
      <section className="inspector-section first-section">
        <div className="section-heading"><span>직접 만난 인물</span><small>{characters.length}</small></div>
        {characters.length ? (
          <div className="cast-card-list">
            {characters.map((character) => {
              const profile = state.characterVisuals?.find(
                (candidate) => candidate.characterId === character.id,
              );
              const asset = profile?.assetId
                ? pack.mediaAssets.find((candidate) => candidate.id === profile.assetId)
                : selectPackageCharacterReferenceAsset(pack, character.id);
              const imageUrl = (asset && mediaUrls[asset.id]) || asset?.dataUrl || "";
              const relation = relationById.get(character.id);
              return (
                <article className="cast-card" key={character.id}>
                  <div className="cast-portrait">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={`${character.name} 기준 이미지`} loading="lazy" />
                    ) : <span>{initials(character.name)}</span>}
                  </div>
                  <div className="cast-copy">
                    <small>{character.id}</small>
                    <strong>{character.name}</strong>
                    <p>{character.role || "역할 미공개"}</p>
                    {relation && (
                      <div><span>{relation.reasonTitle || relation.relationType}</span><em>신뢰 {relation.trust}</em></div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <p className="inspector-empty">직접 만난 인물만 이곳에 기록됩니다.</p>}
      </section>
    </div>
  );
}

function InspectorImages({
  pack,
  state,
  turns,
  mediaUrls,
  onPreviewImage,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  turns: TurnRecord[];
  mediaUrls: Record<string, string>;
  onPreviewImage: (image: InspectorImagePreview) => void;
}) {
  const assetById = new Map(pack.mediaAssets.map((asset) => [asset.id, asset] as const));
  const recent: Array<{ key: string; url: string; label: string; turn: number }> = [];
  const seen = new Set<string>();
  for (const turn of turns.slice().reverse()) {
    const candidates = [
      ...(turn.imageUrl ? [{ key: `turn-${turn.id}`, url: turn.imageUrl, label: "생성 장면" }] : []),
      ...turn.blocks.slice().reverse().flatMap((block) => {
        const asset = block.mediaAssetId ? assetById.get(block.mediaAssetId) : undefined;
        const url = asset ? mediaUrls[asset.id] || asset.dataUrl || "" : "";
        return asset && url ? [{
          key: `${turn.id}-${asset.id}`,
          url,
          label: asset.caption || asset.label || asset.characterName || "패키지 이미지",
        }] : [];
      }),
    ];
    for (const candidate of candidates) {
      if (!candidate.url || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      recent.push({ ...candidate, turn: turn.turn });
      if (recent.length >= 5) break;
    }
    if (recent.length >= 5) break;
  }
  const references = (state.characterVisuals ?? []).flatMap((profile) => {
    const asset = assetById.get(profile.assetId);
    const url = mediaUrls[profile.assetId] || asset?.dataUrl || "";
    return url ? [{ ...profile, url }] : [];
  });
  return (
    <div className="inspector-pane-content image-inspector">
      <section className="inspector-section first-section">
        <div className="section-heading"><span>최근 장면 이미지</span><small>{recent.length}/5</small></div>
        {recent.length ? (
          <div className="inspector-gallery">
            {recent.map((image) => (
              <figure key={image.key}>
                <button
                  type="button"
                  className="inspector-image-open"
                  aria-label={`${image.label} 확대 보기`}
                  onClick={() => onPreviewImage({
                    url: image.url,
                    label: image.label,
                    meta: `턴 ${image.turn} · 최근 장면 이미지`,
                  })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" loading="lazy" />
                  <span aria-hidden="true"><Icon name="expand" /></span>
                </button>
                <figcaption><strong>{image.label}</strong><span>턴 {image.turn}</span></figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="inspector-empty">아직 표시할 장면 이미지가 없습니다.</p>}
      </section>
      <section className="inspector-section">
        <div className="section-heading"><span>인물 기준 이미지 · 고정</span><small>{references.length}</small></div>
        {references.length ? (
          <div className="inspector-gallery reference-gallery">
            {references.map((image) => (
              <figure key={image.characterId}>
                <button
                  type="button"
                  className="inspector-image-open"
                  aria-label={`${image.characterName} 기준 이미지 확대 보기`}
                  onClick={() => onPreviewImage({
                    url: image.url,
                    label: `${image.characterName} 기준 이미지`,
                    meta: "첫 등장 기준본 · 고정",
                  })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" loading="lazy" />
                  <span aria-hidden="true"><Icon name="expand" /></span>
                </button>
                <figcaption><strong>{image.characterName}</strong><span>첫 등장 기준본</span></figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="inspector-empty">첫 등장 기준 이미지가 아직 없습니다.</p>}
      </section>
    </div>
  );
}

function InspectorRecords({
  pack,
  state,
  longTermMemories,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  longTermMemories: LongTermMemoryRecord[];
}) {
  const ledger = readClaudeRuntime(pack, state);
  const traces = [
    ...state.observableTraces.map((trace) => ({
      key: trace.id,
      title: trace.kind === "rumor" ? "소문" : trace.kind === "discovered" ? "발견" : "관측",
      text: trace.text,
      meta: `TURN ${trace.turn}`,
    })),
    ...state.autonomyLog.filter((log) => log.traceVisibility !== "hidden").map((log) => ({
      key: log.id,
      title: "NPC 자율행동",
      text: log.trace || log.worldMutations.join(" · ") || log.intent,
      meta: `TURN ${log.turn} · ${log.outcome}`,
    })),
  ].filter((entry, index, list) =>
    entry.text && list.findIndex((candidate) => candidate.text === entry.text) === index
  ).slice(-10).reverse();
  return (
    <div className="inspector-pane-content records-inspector">
      <section className="inspector-section first-section">
        <div className="section-heading"><span>엔진 로그</span><small>{traces.length + 1}</small></div>
        <div className="core-log-card">
          <span><i /> CLAUDE CORE</span>
          <strong>{ledger.lastAdjudication}</strong>
          <p>{ledger.activeEventId || "종막"} · 비트 {ledger.beat}/{ledger.beatTotal} · 사건 턴 {ledger.eventTurns}</p>
        </div>
        {traces.length ? (
          <ul className="inspector-log-list">
            {traces.map((trace) => (
              <li key={trace.key}>
                <span>{trace.title}<em>{trace.meta}</em></span>
                <p>{trace.text}</p>
              </li>
            ))}
          </ul>
        ) : <p className="inspector-empty">공개 가능한 엔진 기록이 아직 없습니다.</p>}
      </section>
      {state.characterResearchCache?.length > 0 && (
        <section className="inspector-section">
          <div className="section-heading"><span>캐릭터 조사 캐시</span><small>{state.characterResearchCache.length}</small></div>
          <ul className="inspector-memory-timeline">
            {state.characterResearchCache.slice().reverse().map((entry) => (
              <li key={`${entry.characterName}-${entry.researchedAt}`}>
                <span>{entry.canonCutoff || "패키지 지정 시점"}</span>
                <strong>{entry.characterName}</strong>
                <p>{entry.summary}</p>
                {entry.sources.length > 0 && (
                  <p>{entry.sources.map((source, index) => (
                    <Fragment key={source.url}>
                      {index > 0 ? " · " : ""}
                      <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                    </Fragment>
                  ))}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="inspector-section">
        <div className="section-heading"><span>장기 기억</span><small>{longTermMemories.length}</small></div>
        {longTermMemories.length ? (
          <ul className="inspector-memory-timeline">
            {longTermMemories.slice().reverse().map((memory) => (
              <li key={memory.id}>
                <span>{memory.date} · {memory.time}</span>
                <strong>{memory.title}</strong>
                <p>{memory.summary}</p>
              </li>
            ))}
          </ul>
        ) : <p className="inspector-empty">최근 15턴을 넘긴 기록부터 장기 기억으로 정리됩니다.</p>}
      </section>
    </div>
  );
}

const compactTokenCount = (value: number) =>
  new Intl.NumberFormat("ko-KR", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);

const engineCallStageLabel: Record<string, string> = {
  character_research: "캐릭터 조사",
  scene_plan: "장면 계획",
  live_writer: "실시간 집필",
  draft: "초안",
  format_repair: "형식 복구",
  audit_rewrite: "감사 재작성",
  semantic_rewrite: "인과 재작성",
  continuity_rewrite: "사건 순서 복구",
  recommendation_repair: "추천행동 국소복구",
  narrative_rescue: "단일 작가 복구",
};

const repairScopeLabel: Record<string, string> = {
  none: "초안",
  word: "단어",
  sentence: "문장",
  paragraph: "문단",
  scene: "장면",
  sidecar: "장부",
};

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadMeterFile = (fileName: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

function CostInspector({
  entries,
  liveAttempts,
}: {
  entries: CostMeterEntry[];
  liveAttempts: LiveReliabilityEntry[];
}) {
  const measuredTurns = entries.map((turn) => ({ turn, usage: turn.usage }));
  const totals = measuredTurns.reduce(
    (sum, entry) => {
      const usage = entry.usage;
      const uncached = usage.uncachedInputTokens ?? Math.max(
        0,
        usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
      );
      sum.calls += usage.callCount ?? usage.calls?.length ?? 1;
      sum.billedCalls += usage.billedCallCount ?? usage.calls?.length ?? 1;
      sum.rewrites += usage.rewriteCount ?? Math.max(0, (usage.calls?.length ?? 1) - 1);
      sum.input += usage.inputTokens;
      sum.uncached += uncached;
      sum.cached += usage.cachedInputTokens;
      sum.cacheWrite += usage.cacheWriteTokens;
      sum.output += usage.outputTokens;
      sum.textCost += usage.estimatedCostUsd;
      sum.researchCost += usage.researchCostUsd ?? 0;
      sum.webSearchCalls += usage.webSearchCallCount ?? 0;
      sum.durationMs += usage.totalDurationMs ?? (usage.calls ?? []).reduce(
        (duration, call) => duration + (call.durationMs ?? 0),
        0,
      );
      return sum;
    },
    {
      calls: 0,
      billedCalls: 0,
      rewrites: 0,
      input: 0,
      uncached: 0,
      cached: 0,
      cacheWrite: 0,
      output: 0,
      textCost: 0,
      researchCost: 0,
      webSearchCalls: 0,
      durationMs: 0,
    },
  );
  const cacheHitRate = totals.input > 0
    ? Math.round((totals.cached / totals.input) * 100)
    : 0;
  const rewriteRate = totals.billedCalls > 0
    ? Math.round((totals.rewrites / totals.billedCalls) * 100)
    : 0;
  const imageCostUsd = entries.reduce(
    (sum, turn) => sum + (turn.imageCostUsd ?? 0),
    0,
  );
  const imageCosts = entries.flatMap((turn) => turn.imageCosts ?? []);
  const sceneImageCostUsd = imageCosts
    .filter((cost) => cost.category === "scene_image")
    .reduce((sum, cost) => sum + cost.totalCostUsd, 0);
  const characterImageCostUsd = imageCosts
    .filter((cost) => cost.category === "character_image")
    .reduce((sum, cost) => sum + cost.totalCostUsd, 0);
  const legacyImageCostUsd = Math.max(0, imageCostUsd - sceneImageCostUsd - characterImageCostUsd);
  const measuredImageCalls = imageCosts.filter((cost) => cost.measured).length;
  const stageCosts = measuredTurns.flatMap(({ usage }) => usage.calls ?? []).reduce((sum, call) => {
    const bucket = call.stage === "character_research"
      ? "research"
      : call.stage === "scene_plan"
        ? "planning"
        : call.stage === "draft" || call.stage === "live_writer"
          ? "story"
          : "validation";
    sum[bucket] += call.estimatedCostUsd;
    return sum;
  }, { story: 0, planning: 0, validation: 0, research: 0 });
  const categorizedTextCost = stageCosts.story + stageCosts.planning + stageCosts.validation + stageCosts.research;
  stageCosts.story += Math.max(0, totals.textCost - categorizedTextCost);
  const cumulativeCostUsd = totals.textCost + imageCostUsd;
  const liveDiscarded = liveAttempts.filter((attempt) => attempt.discarded);
  const liveCompleted = liveAttempts.filter((attempt) => !attempt.discarded);
  const livePathCount = liveAttempts.filter((attempt) => attempt.streamPath === "live").length;
  const replayPathCount = liveAttempts.length - livePathCount;
  const liveDiscardRate = liveAttempts.length
    ? Math.round((liveDiscarded.length / liveAttempts.length) * 100)
    : 0;
  const firstSentenceSamples = liveCompleted
    .map((attempt) => attempt.firstSentenceMs)
    .filter((value): value is number => value !== null);
  const averageFirstSentenceMs = firstSentenceSamples.length
    ? Math.round(firstSentenceSamples.reduce((sum, value) => sum + value, 0) / firstSentenceSamples.length)
    : 0;
  const averageLiveMetric = (
    select: (attempt: LiveReliabilityEntry) => number | null | undefined,
  ): number => {
    const samples = liveCompleted.map(select)
      .filter((value): value is number => typeof value === "number");
    return samples.length
      ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : 0;
  };
  const averagePreparationMs = averageLiveMetric((attempt) => attempt.preparationMs);
  const averageModelFirstDeltaMs = averageLiveMetric((attempt) => attempt.modelFirstDeltaMs);
  const averageStructureBufferMs = averageLiveMetric((attempt) => attempt.structureBufferMs);
  const totalRewinds = liveAttempts.reduce((sum, attempt) => sum + attempt.rewindCount, 0);
  const discardReasonCounts = [...liveDiscarded.reduce((counts, attempt) => {
    const reason = attempt.discardReason ?? "unknown";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].sort((left, right) => right[1] - left[1]);
  const sampleTarget = 100;
  const sampleCount = Math.min(measuredTurns.length, sampleTarget);
  const sampleProgress = Math.round((sampleCount / sampleTarget) * 100);
  const compiledProfiles = measuredTurns
    .map(({ usage }) => usage.contextProfile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  const contextTotals = compiledProfiles.reduce((sum, profile) => {
    sum.fast += profile.path === "fast" ? 1 : 0;
    sum.deep += profile.path === "deep" ? 1 : 0;
    sum.compileDurationMs += profile.compileDurationMs;
    sum.estimatedPromptTokens += profile.estimatedPromptTokens;
    sum.excludedCharacters += profile.excludedCharacterCount;
    sum.excludedEvents += profile.excludedEventCount;
    sum.excludedMemories += profile.excludedMemoryCount;
    return sum;
  }, {
    fast: 0,
    deep: 0,
    compileDurationMs: 0,
    estimatedPromptTokens: 0,
    excludedCharacters: 0,
    excludedEvents: 0,
    excludedMemories: 0,
  });
  const averageCompiledPromptTokens = compiledProfiles.length
    ? Math.round(contextTotals.estimatedPromptTokens / compiledProfiles.length)
    : 0;
  const averageCompileDurationMs = compiledProfiles.length
    ? contextTotals.compileDurationMs / compiledProfiles.length
    : 0;
  const hardReasonCounts = [...measuredTurns
    .flatMap(({ usage }) =>
      usage.hardErrorReasons ?? usage.rewriteReasons ?? [],
    )
    .reduce((map, reason) => map.set(reason, (map.get(reason) ?? 0) + 1), new Map<string, number>())
    .entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"));
  const advisoryReasonCounts = [...measuredTurns
    .flatMap(({ usage }) => usage.qualityAdvisories ?? [])
    .reduce((map, reason) => map.set(reason, (map.get(reason) ?? 0) + 1), new Map<string, number>())
    .entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"));
  const ruleMetrics = [...measuredTurns.reduce((metrics, { usage }) => {
    for (const call of usage.calls ?? []) {
      if (call.stage === "draft" || call.rewriteReasons.length === 0) continue;
      const share = Math.max(1, call.rewriteReasons.length);
      for (const reason of call.rewriteReasons) {
        const current = metrics.get(reason) ?? {
          reason,
          attempts: 0,
          accepted: 0,
          local: 0,
          durationMs: 0,
          costUsd: 0,
        };
        current.attempts += 1;
        current.accepted += call.finalRewriteCandidate ? 1 : 0;
        current.durationMs += (call.durationMs ?? 0) / share;
        current.costUsd += call.estimatedCostUsd / share;
        metrics.set(reason, current);
      }
    }
    for (const repair of usage.localRepairs ?? []) {
      const share = Math.max(1, repair.reasons.length);
      for (const reason of repair.reasons) {
        const current = metrics.get(reason) ?? {
          reason,
          attempts: 0,
          accepted: 0,
          local: 0,
          durationMs: 0,
          costUsd: 0,
        };
        current.attempts += 1;
        current.accepted += repair.success ? 1 : 0;
        current.local += 1;
        current.durationMs += repair.durationMs / share;
        metrics.set(reason, current);
      }
    }
    return metrics;
  }, new Map<string, {
    reason: string;
    attempts: number;
    accepted: number;
    local: number;
    durationMs: number;
    costUsd: number;
  }>()).values()].sort((left, right) =>
    right.costUsd - left.costUsd || right.attempts - left.attempts,
  );
  const recent = measuredTurns.slice(-12).reverse();
  const exportCostMeter = (format: "json" | "csv") => {
    const exportedAt = new Date();
    const stamp = exportedAt.toISOString().replace(/[-:]/g, "").slice(0, 13);
    const rows = measuredTurns.map(({ turn, usage }) => ({
      appVersion: turn.appVersion,
      projectId: turn.projectId,
      sessionId: turn.sessionId,
      turn: turn.turn,
      createdAt: turn.createdAt,
      callCount: usage.callCount,
      billedCallCount: usage.billedCallCount,
      rewriteCount: usage.rewriteCount,
      inputTokens: usage.inputTokens,
      uncachedInputTokens: usage.uncachedInputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      textCostUsd: usage.estimatedCostUsd,
      researchCostUsd: usage.researchCostUsd ?? 0,
      webSearchCallCount: usage.webSearchCallCount ?? 0,
      imageCostUsd: turn.imageCostUsd ?? 0,
      imageCosts: turn.imageCosts ?? [],
      totalDurationMs: usage.totalDurationMs ?? 0,
      outputTokenLimit: usage.outputTokenLimit ?? 0,
      reasoningEffort: usage.reasoningEffort ?? "",
      hardErrorReasons: usage.hardErrorReasons ?? [],
      qualityAdvisories: usage.qualityAdvisories ?? [],
      calls: usage.calls ?? [],
      localRepairs: usage.localRepairs ?? [],
      contextProfile: usage.contextProfile ?? null,
    }));
    if (format === "json") {
      downloadMeterFile(
        `dancheong-api-cost-ledger-v2-${stamp}.json`,
        JSON.stringify({
          schemaVersion: "dancheong-api-cost-ledger-v2",
          appVersion: APP_VERSION,
          exportedAt: exportedAt.toISOString(),
          sampleTarget,
          sampleCount,
          totals: { ...totals, imageCostUsd },
          contextCompiler: {
            measuredTurns: compiledProfiles.length,
            ...contextTotals,
            averageCompiledPromptTokens,
            averageCompileDurationMs,
          },
          ruleMetrics,
          liveReliability: liveAttempts,
          turns: rows,
        }, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }
    const headers = [
      "appVersion", "projectId", "sessionId", "turn", "createdAt",
      "calls", "billedCalls", "rewrites",
      "uncachedInput", "cachedInput", "cacheWrite", "output",
      "textCostUsd", "researchCostUsd", "webSearchCalls", "imageCostUsd", "durationMs", "hardErrors",
      "outputTokenLimit", "reasoningEffort", "qualityAdvisories", "localRepairs",
      "contextPath", "contextReasons", "compiledPromptTokens", "compileDurationMs",
      "includedCharacters", "includedMemories", "excludedCharacters", "excludedEvents", "excludedMemories",
    ];
    const csvRows = rows.map((row) => [
      row.appVersion, row.projectId, row.sessionId, row.turn, row.createdAt,
      row.callCount, row.billedCallCount, row.rewriteCount,
      row.uncachedInputTokens, row.cachedInputTokens, row.cacheWriteTokens,
      row.outputTokens, row.textCostUsd, row.researchCostUsd, row.webSearchCallCount,
      row.imageCostUsd, row.totalDurationMs,
      row.hardErrorReasons.join(" | "), row.outputTokenLimit, row.reasoningEffort,
      row.qualityAdvisories.join(" | "),
      row.localRepairs.map((repair) => `${repair.repairScope}:${repair.reasons.join("+")}:${repair.success}`).join(" | "),
      row.contextProfile?.path ?? "",
      row.contextProfile?.pathReasons.join(" | ") ?? "",
      row.contextProfile?.estimatedPromptTokens ?? 0,
      row.contextProfile?.compileDurationMs ?? 0,
      row.contextProfile?.includedCharacterIds.join(" | ") ?? "",
      row.contextProfile?.includedMemoryTurns.join(" | ") ?? "",
      row.contextProfile?.excludedCharacterCount ?? 0,
      row.contextProfile?.excludedEventCount ?? 0,
      row.contextProfile?.excludedMemoryCount ?? 0,
    ]);
    downloadMeterFile(
      `dancheong-api-cost-ledger-v2-${stamp}.csv`,
      `\uFEFF${[headers, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n")}`,
      "text/csv;charset=utf-8",
    );
  };

  return (
    <div className="inspector-pane-content cost-inspector">
      <section className="cost-summary-card">
        <div className="cost-summary-head">
          <div>
            <span>CUMULATIVE API METER</span>
            <strong>${cumulativeCostUsd.toFixed(4)}</strong>
            <small>API 응답 usage × 공식 요금표 · 작품과 세션을 잇는 누적액</small>
          </div>
          <Icon name="wallet" />
        </div>
        <div className="cost-summary-grid">
          <div><span>본문 집필</span><b>${stageCosts.story.toFixed(4)}</b></div>
          <div><span>계획·판정</span><b>${stageCosts.planning.toFixed(4)}</b></div>
          <div><span>수리·검수</span><b>${stageCosts.validation.toFixed(4)}</b></div>
          <div><span>캐릭터 조사</span><b>${stageCosts.research.toFixed(4)}</b><small>웹 검색 {totals.webSearchCalls}회</small></div>
          <div className="cost-image-total"><span>장면 이미지</span><b>${sceneImageCostUsd.toFixed(4)}</b><small>Flare · usage 계측</small></div>
          <div className="cost-image-total"><span>인물 이미지</span><b>${characterImageCostUsd.toFixed(4)}</b><small>Flare · 기준본</small></div>
          {legacyImageCostUsd > 0 && <div><span>이전 이미지 기록</span><b>${legacyImageCostUsd.toFixed(4)}</b><small>세부 토큰 없음</small></div>}
          <div><span>모델 호출</span><b>{totals.calls}회</b></div>
          <div><span>재작성</span><b>{totals.rewrites}회</b><small>{rewriteRate}%</small></div>
          <div><span>캐시 적중</span><b>{cacheHitRate}%</b></div>
          <div><span>계측 턴</span><b>{measuredTurns.length}턴</b></div>
          <div><span>생성 대기</span><b>{(totals.durationMs / 1000).toFixed(1)}초</b></div>
          <div><span>국소 수정</span><b>{measuredTurns.reduce((sum, entry) => sum + (entry.usage.localRepairs?.length ?? 0), 0)}회</b></div>
          <div><span>첫 글자 평균</span><b>{averageFirstSentenceMs ? `${(averageFirstSentenceMs / 1000).toFixed(2)}초` : "—"}</b></div>
          <div><span>스트림 폐기율</span><b>{liveDiscardRate}%</b><small>{liveDiscarded.length}/{liveAttempts.length}</small></div>
          <div><span>문장 되감기</span><b>{totalRewinds}회</b></div>
          <div><span>이미지 실측</span><b>{measuredImageCalls}/{imageCosts.length}</b><small>응답 usage 기준</small></div>
        </div>
      </section>

      <section className="inspector-section cost-sample-section">
        <div className="section-heading"><span>비용 최적화 표본</span><small>{sampleCount}/{sampleTarget}턴</small></div>
        <div className="cost-sample-track" aria-label={`비용 표본 ${sampleProgress}% 수집`}>
          <span style={{ width: `${sampleProgress}%` }} />
        </div>
        <p>{sampleCount >= sampleTarget
          ? "100턴 표본이 모였습니다. 재작성률이 높은 강제 오류부터 비교할 수 있습니다."
          : `규칙 완화 판단까지 ${sampleTarget - sampleCount}턴이 더 필요합니다.`}</p>
        <div className="cost-export-actions">
          <button type="button" onClick={() => exportCostMeter("json")} disabled={!measuredTurns.length}>JSON 원자료</button>
          <button type="button" onClick={() => exportCostMeter("csv")} disabled={!measuredTurns.length}>CSV 분석표</button>
        </div>
      </section>

      <section className="inspector-section cost-token-section">
        <div className="section-heading"><span>토큰 사용량</span><small>{measuredTurns.length}턴</small></div>
        <div className="cost-token-grid">
          <div><span>일반 입력</span><strong>{compactTokenCount(totals.uncached)}</strong></div>
          <div><span>캐시 입력</span><strong>{compactTokenCount(totals.cached)}</strong></div>
          <div><span>캐시 쓰기</span><strong>{compactTokenCount(totals.cacheWrite)}</strong></div>
          <div><span>출력</span><strong>{compactTokenCount(totals.output)}</strong></div>
        </div>
      </section>

      <section className="inspector-section cost-token-section">
        <div className="section-heading"><span>장면 컨텍스트 컴파일러</span><small>{compiledProfiles.length}턴</small></div>
        <div className="cost-token-grid">
          <div><span>Fast / Deep</span><strong>{contextTotals.fast} / {contextTotals.deep}</strong></div>
          <div><span>평균 프롬프트</span><strong>{compactTokenCount(averageCompiledPromptTokens)}</strong></div>
          <div><span>평균 컴파일</span><strong>{averageCompileDurationMs.toFixed(1)}ms</strong></div>
          <div><span>제외한 사건</span><strong>{contextTotals.excludedEvents}</strong></div>
          <div><span>제외한 인물</span><strong>{contextTotals.excludedCharacters}</strong></div>
          <div><span>제외한 기억</span><strong>{contextTotals.excludedMemories}</strong></div>
        </div>
        <p className="cost-estimate-note">Fast는 현재 장면 중심의 최소 컨텍스트, Deep은 전투·복합 입력·필수 종결·연속성 복구용 확장 컨텍스트입니다.</p>
      </section>

      <section className="inspector-section cost-token-section">
        <div className="section-heading"><span>실시간 신뢰도</span><small>{liveAttempts.length}회</small></div>
        <div className="cost-token-grid">
          <div><span>진짜 Live</span><strong>{livePathCount}</strong></div>
          <div><span>검증 후 재생</span><strong>{replayPathCount}</strong></div>
          <div><span>성공</span><strong>{liveCompleted.length}</strong></div>
          <div><span>폐기</span><strong>{liveDiscarded.length}</strong></div>
          <div><span>평균 준비</span><strong>{averagePreparationMs ? `${averagePreparationMs}ms` : "—"}</strong></div>
          <div><span>모델 첫 델타</span><strong>{averageModelFirstDeltaMs ? `${averageModelFirstDeltaMs}ms` : "—"}</strong></div>
          <div><span>구조 대기</span><strong>{averageStructureBufferMs ? `${averageStructureBufferMs}ms` : "—"}</strong></div>
          <div><span>평균 첫 글자</span><strong>{averageFirstSentenceMs ? `${averageFirstSentenceMs}ms` : "—"}</strong></div>
          <div><span>되감기</span><strong>{totalRewinds}</strong></div>
        </div>
        {discardReasonCounts.length ? (
          <ol className="cost-reason-list">
            {discardReasonCounts.map(([reason, count]) => (
              <li key={reason}><span>{reason}</span><b>{count}회</b></li>
            ))}
          </ol>
        ) : <p className="cost-estimate-note">아직 폐기된 실시간 턴이 없습니다.</p>}
      </section>

      <section className="inspector-section cost-reason-section">
        <div className="section-heading"><span>강제 오류</span><small>{hardReasonCounts.length}</small></div>
        {hardReasonCounts.length ? (
          <ol className="cost-reason-list">
            {hardReasonCounts.map(([reason, count]) => (
              <li key={reason}><span>{reason}</span><b>{count}회</b></li>
            ))}
          </ol>
        ) : (
          <p className="inspector-empty">아직 재작성할 강제 오류가 발견되지 않았습니다.</p>
        )}
      </section>

      <section className="inspector-section cost-reason-section cost-advisory-section">
        <div className="section-heading"><span>품질 권고 · 초안 유지</span><small>{advisoryReasonCounts.length}</small></div>
        {advisoryReasonCounts.length ? (
          <ol className="cost-reason-list cost-advisory-list">
            {advisoryReasonCounts.map(([reason, count]) => (
              <li key={reason}><span>{reason}</span><b>{count}회</b></li>
            ))}
          </ol>
        ) : (
          <p className="inspector-empty">아직 기록된 품질 권고가 없습니다.</p>
        )}
      </section>

      <section className="inspector-section cost-rule-section">
        <div className="section-heading"><span>규칙별 비용·지연·채택</span><small>{ruleMetrics.length}</small></div>
        {ruleMetrics.length ? (
          <div className="cost-rule-list">
            {ruleMetrics.slice(0, 12).map((metric) => (
              <div key={metric.reason}>
                <strong>{metric.reason}</strong>
                <span>{metric.attempts}회 · 채택 {metric.accepted}회{metric.local ? ` · 국소 ${metric.local}회` : ""}</span>
                <small>${metric.costUsd.toFixed(5)} · {(metric.durationMs / 1000).toFixed(2)}초</small>
              </div>
            ))}
          </div>
        ) : <p className="inspector-empty">재작성 또는 국소 수정 규칙이 실행되면 비용과 지연을 비교합니다.</p>}
      </section>

      <section className="inspector-section cost-turn-section">
        <div className="section-heading"><span>최근 턴 상세</span><small>{recent.length}</small></div>
        {recent.length ? (
          <div className="cost-turn-list">
            {recent.map(({ turn, usage }) => (
              <details key={turn.id}>
                <summary>
                  <span>TURN {turn.turn}</span>
                  <b>{(usage.callCount ?? usage.calls?.length ?? 1) + (turn.imageCosts?.length ?? 0)}회 · ${(usage.estimatedCostUsd + (turn.imageCostUsd ?? 0)).toFixed(4)}</b>
                </summary>
                <div className="cost-turn-body">
                  <p>
                    일반 {compactTokenCount(usage.uncachedInputTokens ?? Math.max(0, usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens))}
                    <span>·</span> 캐시 {compactTokenCount(usage.cachedInputTokens)}
                    <span>·</span> 쓰기 {compactTokenCount(usage.cacheWriteTokens)}
                    <span>·</span> 출력 {compactTokenCount(usage.outputTokens)}
                    <span>·</span> 대기 {((usage.totalDurationMs ?? 0) / 1000).toFixed(2)}초
                    {usage.outputTokenLimit ? <><span>·</span> 상한 {compactTokenCount(usage.outputTokenLimit)}</> : null}
                    {usage.reasoningEffort ? <><span>·</span> 추론 {usage.reasoningEffort}</> : null}
                  </p>
                  {usage.contextProfile ? (
                    <div className="cost-call-row">
                      <span>컨텍스트 {usage.contextProfile.path === "fast" ? "Fast" : "Deep"}</span>
                      <b>{compactTokenCount(usage.contextProfile.estimatedPromptTokens)} · {usage.contextProfile.compileDurationMs.toFixed(1)}ms</b>
                      <small>{usage.contextProfile.pathReasons.join(" · ")} · 인물 {usage.contextProfile.includedCharacterIds.length}명 · 기억 {usage.contextProfile.includedMemoryTurns.length}건 · 사건 제외 {usage.contextProfile.excludedEventCount}건</small>
                    </div>
                  ) : null}
                  {(usage.calls ?? []).map((call) => (
                    <div className="cost-call-row" key={`${turn.id}-${call.call}-${call.stage}`}>
                      <span>#{call.call} {engineCallStageLabel[call.stage] ?? call.stage}</span>
                      <b>{compactTokenCount(call.inputTokens)} → {compactTokenCount(call.outputTokens)} · {((call.durationMs ?? 0) / 1000).toFixed(2)}초</b>
                      {call.reasoningEffort && <small>추론 · {call.reasoningEffort}</small>}
                      {call.repairScope && call.repairScope !== "none" && <small>수정 범위 · {repairScopeLabel[call.repairScope] ?? call.repairScope}{call.finalRewriteCandidate ? " · 최종 후보" : ""}</small>}
                      {call.rewriteReasonDetails?.length
                        ? <small>{call.rewriteReasonDetails.map((detail) => `${detail.severity === "hard_error" ? "강제" : "권고"} · ${detail.reason}`).join(" / ")}</small>
                        : call.rewriteReasons.length > 0 && <small>{call.rewriteReasons.join(" · ")}</small>}
                    </div>
                  ))}
                  {(turn.imageCosts ?? []).map((cost, index) => (
                    <div className="cost-call-row cost-image-call-row" key={`${turn.id}-image-${index}`}>
                      <span>{cost.category === "character_image" ? "인물 기준 이미지" : "장면 이미지"}</span>
                      <b>{cost.model} · ${cost.totalCostUsd.toFixed(5)}</b>
                      <small>
                        텍스트 {compactTokenCount(cost.textInputTokens)} · 이미지 입력 {compactTokenCount(cost.imageInputTokens)} · 이미지 출력 {compactTokenCount(cost.imageOutputTokens)} · 참조 {cost.referenceCount}장 · {cost.measured ? "usage 실측" : "추정"}
                      </small>
                    </div>
                  ))}
                  {(usage.localRepairs ?? []).map((repair, index) => (
                    <div className="cost-call-row cost-local-repair-row" key={`${turn.id}-${repair.ruleId}-${index}`}>
                      <span>로컬 {repairScopeLabel[repair.repairScope] ?? repair.repairScope} 수정</span>
                      <b>API $0 · {(repair.durationMs / 1000).toFixed(3)}초</b>
                      <small>{repair.success ? "성공" : "재검사 실패"} · {repair.reasons.join(" · ")}</small>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="inspector-empty">다음 Luna 생성부터 턴별 비용을 기록합니다.</p>
        )}
      </section>

      <p className="cost-estimate-note">
        OpenAI 응답의 실제 usage에 공식 표준 단가를 적용합니다. GPT-Image 2.5 Flare는 텍스트 입력·대표 사진 입력·이미지 출력을 각각 계산하며, 응답에 usage가 없는 예외만 추정값으로 구분합니다. 앱이 업데이트되어도 공용 비용 장부는 초기화하지 않습니다. 청구서의 환율·세금은 포함하지 않습니다.
      </p>
    </div>
  );
}

function NexusInspector({
  pack,
  state,
  turns,
  longTermMemories,
  mediaUrls,
  totalCostUsd,
  costMeterEntries,
  liveReliabilityAttempts,
  mode,
  apiConnected,
  onPreviewImage,
  eventControlsDisabled,
  onAdvanceEventBeat,
  onCloseEventNow,
  mobile = false,
  initialTab = "status",
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  turns: TurnRecord[];
  longTermMemories: LongTermMemoryRecord[];
  mediaUrls: Record<string, string>;
  totalCostUsd: number;
  costMeterEntries: CostMeterEntry[];
  liveReliabilityAttempts: LiveReliabilityEntry[];
  mode: "mock" | "luna";
  apiConnected: boolean;
  onPreviewImage: (image: InspectorImagePreview) => void;
  eventControlsDisabled: boolean;
  onAdvanceEventBeat: () => void;
  onCloseEventNow: () => void;
  mobile?: boolean;
  initialTab?: NexusInspectorTab;
}) {
  const [activeTab, setActiveTab] = useState<NexusInspectorTab>(initialTab);
  const ledger = readClaudeRuntime(pack, state);
  const counts: Partial<Record<NexusInspectorTab, number>> = {
    events: Math.max(0, pack.events.length - ledger.sealed.length),
    cast: state.encounteredCharacterIds.length,
    images: Math.min(5, turns.filter((turn) => turn.imageUrl || turn.blocks.some((block) => block.mediaAssetId)).length),
    records: longTermMemories.length,
    cost: costMeterEntries.reduce(
      (sum, entry) => sum + (entry.usage.rewriteCount ?? 0),
      0,
    ),
  };
  return (
    <div className={`nexus-inspector${mobile ? " nexus-inspector-mobile" : ""}`}>
      <nav className="inspector-tabs" role="tablist" aria-label="이야기 정보">
        {INSPECTOR_TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
            key={tab.id}
          >
            <span>{tab.label}</span>
            {counts[tab.id] !== undefined && <b>{counts[tab.id]}</b>}
          </button>
        ))}
      </nav>
      <div className="inspector-tab-panel inspector-pane" role="tabpanel">
        {activeTab === "status" && (
          <StateInspector
            pack={pack}
            state={state}
            totalCostUsd={totalCostUsd}
            mode={mode}
            apiConnected={apiConnected}
            mobile={mobile}
          />
        )}
        {activeTab === "events" && (
          <InspectorEvents
            pack={pack}
            state={state}
            controlsDisabled={eventControlsDisabled}
            onAdvanceBeat={onAdvanceEventBeat}
            onCloseNow={onCloseEventNow}
          />
        )}
        {activeTab === "cast" && <InspectorCast pack={pack} state={state} mediaUrls={mediaUrls} />}
        {activeTab === "images" && (
          <InspectorImages
            pack={pack}
            state={state}
            turns={turns}
            mediaUrls={mediaUrls}
            onPreviewImage={onPreviewImage}
          />
        )}
        {activeTab === "records" && (
          <InspectorRecords pack={pack} state={state} longTermMemories={longTermMemories} />
        )}
        {activeTab === "cost" && (
          <CostInspector entries={costMeterEntries} liveAttempts={liveReliabilityAttempts} />
        )}
      </div>
    </div>
  );
}

function SettingsDialog({
  runtimeEngine,
  activeTab,
  apiKeyDraft,
  apiStatus,
  apiMessage,
  showApiKey,
  rememberApiKey,
  themeMode,
  readingWidth,
  readingFontSize,
  typingSpeed,
  imageQuality,
  imageResolution,
  imageAspect,
  imageEvery,
  pack,
  longTermMemoryCount,
  projects,
  activeProjectId,
  deletingProjectId,
  thumbnailSavingProjectId,
  onTabChange,
  onApiKeyChange,
  onToggleApiKey,
  onRememberApiKeyChange,
  onThemeModeChange,
  onReadingWidthChange,
  onReadingFontSizeChange,
  onTypingSpeedChange,
  onImageQualityChange,
  onImageResolutionChange,
  onImageAspectChange,
  onImageEveryChange,
  onDeleteProject,
  onDeleteCortexProject,
  onThumbnailChange,
  onThumbnailDelete,
  onConnect,
  onDisconnect,
  onClose,
}: {
  runtimeEngine: "cortex" | "lotus";
  activeTab: SettingsTab;
  apiKeyDraft: string;
  apiStatus: ApiConnectionStatus;
  apiMessage: string;
  showApiKey: boolean;
  rememberApiKey: boolean;
  themeMode: ThemeMode;
  readingWidth: ReadingWidth;
  readingFontSize: ReadingFontSize;
  typingSpeed: TypingSpeed;
  imageQuality: ImageQuality;
  imageResolution: ImageResolution;
  imageAspect: ImageAspect;
  imageEvery: SceneImageInterval;
  pack: ScenarioPack;
  longTermMemoryCount: number;
  projects: ProjectSummary[];
  activeProjectId: string;
  deletingProjectId: string | null;
  thumbnailSavingProjectId: string | null;
  onTabChange: (tab: SettingsTab) => void;
  onApiKeyChange: (value: string) => void;
  onToggleApiKey: () => void;
  onRememberApiKeyChange: (remember: boolean) => void;
  onThemeModeChange: (theme: ThemeMode) => void;
  onReadingWidthChange: (width: ReadingWidth) => void;
  onReadingFontSizeChange: (size: ReadingFontSize) => void;
  onTypingSpeedChange: (speed: TypingSpeed) => void;
  onImageQualityChange: (quality: ImageQuality) => void;
  onImageResolutionChange: (resolution: ImageResolution) => void;
  onImageAspectChange: (aspect: ImageAspect) => void;
  onImageEveryChange: (interval: SceneImageInterval) => void;
  onDeleteProject: (project: ProjectSummary) => void;
  onDeleteCortexProject: (project: ProjectSummary) => void;
  onThumbnailChange: (project: ProjectSummary, file: File) => void;
  onThumbnailDelete: (project: ProjectSummary) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const deviceCortexRows = useCortexCatalog();
  const addedProjects = projects.filter(
    (project) => project.id !== BUILT_IN_DEMO_PROJECT_ID,
  );
  const accountProjectIds = new Set(addedProjects.map((project) => project.id));
  const deviceCortexProjects = [...new Map(
    deviceCortexRows
      .filter((row) => !accountProjectIds.has(row.projectId))
      .map((row) => [row.projectId, row]),
  ).values()].map<ProjectSummary>((row) => ({
    id: row.projectId,
    sourceProjectId: row.sourceProjectId || row.projectId,
    title: row.name || "Cortex 작품",
    genre: "Cortex 작품",
    playerName: "작품의 주인공",
    packageVersion: "1.5",
    projectRevision: 1,
    packageFingerprint: "device-cortex",
    sessionCount: deviceCortexRows.filter((session) => session.projectId === row.projectId).length,
    hasPackage: false,
    thumbnailUrl: row.thumbnailUrl,
    createdAt: row.lastPlayedAt || "",
    updatedAt: row.lastPlayedAt || "",
  }));
  const managedWorks = [
    ...addedProjects.map((project) => ({ project, deviceOnly: false })),
    ...deviceCortexProjects.map((project) => ({ project, deviceOnly: true })),
  ];
  const statusLabel =
    apiStatus === "connected"
      ? "연결됨"
      : apiStatus === "testing"
        ? "확인 중"
        : apiStatus === "error"
          ? "확인 필요"
          : "연결 안 됨";

  return (
    <div className="settings-overlay">
      <button
        className="settings-backdrop"
        type="button"
        aria-label="설정 닫기"
        onClick={onClose}
      />
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-head">
          <div>
            <span>단청 · INTERACTIVE NOVEL</span>
            <h2 id="settings-title">설정</h2>
          </div>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="설정 항목">
            <button
              type="button"
              className={activeTab === "engine" ? "active" : ""}
              onClick={() => onTabChange("engine")}
            >
              <Icon name="shield" />
              <span>엔진 구성</span>
            </button>
            <button
              type="button"
              className={activeTab === "connection" ? "active" : ""}
              onClick={() => onTabChange("connection")}
            >
              <Icon name="spark" />
              <span>API 연결</span>
            </button>
            <button
              type="button"
              className={activeTab === "appearance" ? "active" : ""}
              onClick={() => onTabChange("appearance")}
            >
              <Icon name="panel" />
              <span>화면 설정</span>
            </button>
            <button
              type="button"
              className={activeTab === "generation" ? "active" : ""}
              onClick={() => onTabChange("generation")}
            >
              <Icon name="settings" />
              <span>생성 설정</span>
            </button>
            <button
              type="button"
              className={activeTab === "works" ? "active" : ""}
              onClick={() => onTabChange("works")}
            >
              <Icon name="book" />
              <span>작품 관리</span>
            </button>
            <button
              type="button"
              className={activeTab === "about" ? "active" : ""}
              onClick={() => onTabChange("about")}
            >
              <Icon name="download" />
              <span>앱 정보</span>
            </button>
          </nav>

          <div className="settings-content">
            {activeTab === "connection" ? (
              <>
                <div className="settings-section-title">
                  <div>
                    <span>TEXT MODEL CONNECTION</span>
                    <h3>Cortex 집필 모델 연결</h3>
                  </div>
                  <strong className={`api-status api-status-${apiStatus}`}>
                    <i /> {statusLabel}
                  </strong>
                </div>

                <TextProviderSelector disabled={apiStatus === 'testing'} />
                <OpenAIApiGuide openaiOnly onGuide={() => setGuideOpen(true)} />

                <div className="api-key-field">
                  <label htmlFor="openai-api-key">선택한 모델의 API Key</label>
                  <div>
                    <input
                      id="openai-api-key"
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyDraft}
                      onChange={(event) => onApiKeyChange(event.target.value)}
                      placeholder="sk-…"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={apiStatus === "testing"}
                    />
                    <button
                      type="button"
                      onClick={onToggleApiKey}
                      disabled={!apiKeyDraft}
                    >
                      {showApiKey ? "숨기기" : "표시"}
                    </button>
                  </div>
                  <small>
                    키는 작품·세션·서버 저장소와 분리되며 선택한 제공자에게 요청할 때만 HTTPS로 전달됩니다.
                  </small>
                </div>

                <label className="remember-key-option">
                  <input
                    type="checkbox"
                    checked={rememberApiKey}
                    onChange={(event) => onRememberApiKeyChange(event.target.checked)}
                    disabled={apiStatus === "testing"}
                  />
                  <span>
                    <strong>이 기기에서 API 키 기억</strong>
                    <small>
                      암호화하여 저장하고 업데이트·새로고침 후 자동으로 불러옵니다. 다른 기기나 브라우저에는 동기화되지 않습니다.
                    </small>
                  </span>
                </label>

                <div className={`api-feedback api-feedback-${apiStatus}`}>
                  <span className="guard-icon"><Icon name="shield" /></span>
                  <p>{apiMessage}</p>
                </div>

                <div className="settings-actions">
                  {apiStatus === "connected" && (
                    <button
                      type="button"
                      className="disconnect-button"
                      onClick={onDisconnect}
                    >
                      연결 해제
                    </button>
                  )}
                  <button
                    type="button"
                    className="connect-button"
                    disabled={!apiKeyDraft.trim() || apiStatus === "testing"}
                    onClick={onConnect}
                  >
                    <Icon name="spark" />
                    {apiStatus === "testing" ? "연결 확인 중…" : "연결 확인 및 적용"}
                  </button>
                </div>
                <ImageApiSettings onGuide={() => setGuideOpen(true)} />
              </>
            ) : activeTab === "engine" ? (
              <>
                <div className="settings-section-title">
                  <div>
                    <span>DANCHEONG RUNTIME</span>
                    <h3>플레이 엔진 선택</h3>
                  </div>
                  <strong className={`api-status api-status-${apiStatus}`}><i /> {statusLabel}</strong>
                </div>

                <div className="runtime-engine-selector" aria-label="플레이 엔진">
                  <button type="button" aria-pressed={runtimeEngine==="cortex"} onClick={()=>window.dispatchEvent(new CustomEvent("nexus-engine-change",{detail:"cortex"}))}><span>기본 엔진</span><strong>Cortex 1.42.0</strong><small>공개 본문·사건·기억·분기·복구를 Cortex로 진행</small><b>Cortex 사용</b></button>
                  <button type="button" aria-pressed={runtimeEngine==="lotus"} onClick={()=>window.dispatchEvent(new CustomEvent("nexus-engine-change",{detail:"lotus"}))}><span>기존 엔진</span><strong>Lotus</strong><small>기존 단청 세션과 기능을 그대로 유지</small><b>Lotus 사용</b></button>
                </div>
                <p className="runtime-engine-note">엔진별 기록은 독립적으로 보존됩니다. Cortex 1.42.0은 산문작가가 본문과 화자 정보를 함께 공개한 뒤 통합 판정관이 사건·상태·정사 원장을 확정합니다. 전체 백업과 복원은 플레이 화면의 도구에서 사용할 수 있습니다.</p>

                <div className="engine-settings-grid">
                  <section className="engine-settings-card engine-settings-primary">
                    <header><span className="spark-box"><Icon name="spark" /></span><div><small>{runtimeEngine === "cortex" ? "PROSE WRITER" : "STORY WRITER"}</small><strong>GPT-6 Luna</strong></div></header>
                    <p>{runtimeEngine === "cortex" ? "Cortex 1.42.0 산문작가 · 본문과 화자 메타데이터를 문단 단위로 함께 공개" : "본문 우선 실시간 스트리밍 · 완료 후 상태와 메모리 정산"}</p>
                    {runtimeEngine === "cortex" ? (
                      <>
                        <div className="engine-settings-row"><span>집필 계약</span><b>CORTEX_PROSE_WRITER_V1</b></div>
                        <div className="engine-settings-row"><span>본문 공개</span><b>문단 스트리밍 · 확정 후 판정</b></div>
                        <div className="engine-settings-row"><span>대사 화자</span><b>동시 표기 · 실시간 카드</b></div>
                        <div className="engine-settings-row"><span>장면 이미지</span><b>Flare · 1088×608 · {imageIntervalLabel(imageEvery)}</b></div>
                      </>
                    ) : (
                      <>
                        <div className="engine-settings-row"><span>연결 상태</span><b>{apiStatus === "connected" ? "API LIVE" : "연결 필요"}</b></div>
                        <div className="engine-settings-row"><span>장면 이미지</span><b>Flare · {imageIntervalLabel(imageEvery)} · 최근 {GENERATED_SCENE_IMAGE_LIMIT}개</b></div>
                        <div className="engine-settings-row"><span>플레이어 주권</span><b>입력 우선 · 정사 흡수</b></div>
                      </>
                    )}
                  </section>

                  <section className="engine-settings-card">
                    <header><span className="guard-icon"><Icon name="shield" /></span><div><small>{runtimeEngine === "cortex" ? "SCENARIO CONTRACT" : "PACKAGE CONTRACT"}</small><strong>{runtimeEngine === "cortex" ? `Cortex ScenarioPack ${pack.packageVersion}` : `Studio Package ${pack.packageVersion}`}</strong></div></header>
                    <div className="engine-settings-row"><span>{runtimeEngine === "cortex" ? "런타임 계약" : "호환 상태"}</span><b>{pack.compatibility?.studioPackage15
                      ? pack.compatibility.package15FeatureNegotiated ? runtimeEngine === "cortex" ? "Package 1.5 · Runtime V5" : "Package 1.5 계약 호환" : "기능 협상 실패"
                      : pack.compatibility?.fullSupport ? "완전 호환" : pack.compatibility?.supportedPackageVersion ? "기본 호환" : "레거시"}</b></div>
                    <div className="engine-settings-row"><span>무결성</span><b>{pack.compatibility?.integrityVerified
                      ? `SHA-256 검증 · 원본 ${pack.assetLedger?.physicalAssetCount ?? 0}개`
                      : "검증 정보 없음"}</b></div>
                    <div className="engine-settings-row"><span>{runtimeEngine === "cortex" ? "대표 사진" : "패키지 이미지"}</span><b>{runtimeEngine === "cortex" ? pack.mediaAssets.filter((asset) => asset.kind === "character").length : pack.mediaAssets.length}개 · 패키지 원본</b></div>
                    {pack.package15Runtime && <div className="engine-settings-row"><span>기능 협상</span><b>{pack.package15Runtime.negotiatedFeatures.length}개 통과</b></div>}
                  </section>

                  <section className="engine-settings-card">
                    <header><span className="guard-icon"><Icon name="book" /></span><div><small>{runtimeEngine === "cortex" ? "UNIFIED ADJUDICATION" : "CANON CONTROL"}</small><strong>{runtimeEngine === "cortex" ? "Cortex 1.42.0" : "Claude × GPT 결합 엔진"}</strong></div></header>
                    {runtimeEngine === "cortex" ? (
                      <>
                        <div className="engine-settings-row"><span>{pack.instantStoryRuntime?.enabled ? 'HUD 관리자' : '사건 판정관'}</span><b>{pack.instantStoryRuntime?.enabled ? '상태 갱신 · 실패 시 작가 보완 → 기존 값 유지' : '누적 원문 → 종결조건 확인'}</b></div>
                        <div className="engine-settings-row"><span>서사 기준</span><b>공개 본문 · 작가의 시공간·화자 주석</b></div>
                        <div className="engine-settings-row"><span>{pack.instantStoryRuntime?.enabled ? 'Instant 자유 전개' : '사건 FSM'}</span><b>{pack.instantStoryRuntime?.enabled ? '고정 사건·종결조건·자동 엔딩 없음' : '요건 판정 · 조기 종결 · 봉인'}</b></div>
                        <div className="engine-settings-row"><span>연속성</span><b>Capsule V3 · 공개 본문 보존</b></div>
                        <div className="engine-settings-row"><span>현재 작품</span><b>사건 {pack.events.length}개 · 제약 {pack.constraints?.length ?? 0}개</b></div>
                      </>
                    ) : (
                      <>
                        <div className="engine-settings-row"><span>Claude Core</span><b>사건 · 비트 · 봉인 원장</b></div>
                        <div className="engine-settings-row"><span>GPT World Layer</span><b>NPC · 관계 · 공개 HUD</b></div>
                        <div className="engine-settings-row"><span>Canon Rewrite Gate</span><b>ABSORB · 정사 전환</b></div>
                        <div className="engine-settings-row"><span>제약 · 복합 사건</span><b>{pack.constraints?.length ?? 0}개 · {pack.events.filter((event) => event.kind === "compound").length}개</b></div>
                        <div className="engine-settings-row"><span>장기 기억</span><b>{longTermMemoryCount}건 · 최근 {FULL_CONTEXT_TURN_LIMIT}개 전문</b></div>
                      </>
                    )}
                  </section>
                </div>
              </>
            ) : activeTab === "appearance" ? (
              <>
                <div className="settings-section-title">
                  <div>
                    <span>READING EXPERIENCE</span>
                    <h3>화면과 본문 설정</h3>
                  </div>
                  <strong className="autosave-badge"><Icon name="check" /> 이 기기에 저장</strong>
                </div>

                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>COLOR THEME</span>
                    <strong>화면 테마</strong>
                    <small>밝은 종이 질감과 야간 독서용 어두운 화면을 즉시 전환합니다.</small>
                  </div>
                  <div className="generation-segment two-segment" role="radiogroup" aria-label="화면 테마">
                    {(["light", "dark"] as ThemeMode[]).map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        role="radio"
                        aria-checked={themeMode === theme}
                        className={themeMode === theme ? "active" : ""}
                        onClick={() => onThemeModeChange(theme)}
                      >
                        <b>{theme === "light" ? "라이트" : "다크"}</b>
                        <span>{theme === "light" ? "밝은 화면" : "야간 독서"}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="generation-control-card reading-column-control">
                  <div className="generation-control-copy">
                    <span>READING COLUMN</span>
                    <strong>본문 폭</strong>
                    <small>문장 길이와 화면 활용도를 취향에 맞게 조절합니다.</small>
                  </div>
                  <div className="generation-segment three-segment" role="radiogroup" aria-label="본문 폭">
                    {([
                      ["narrow", "좁게"],
                      ["normal", "보통"],
                      ["wide", "넓게"],
                    ] as Array<[ReadingWidth, string]>).map(([width, label]) => (
                      <button
                        key={width}
                        type="button"
                        role="radio"
                        aria-checked={readingWidth === width}
                        className={readingWidth === width ? "active" : ""}
                        onClick={() => onReadingWidthChange(width)}
                      >
                        <b>{label}</b>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>TEXT SCALE</span>
                    <strong>본문 글자 크기</strong>
                    <small>본문과 인물 대사의 크기를 함께 조절합니다. 현재 기본 크기는 소입니다.</small>
                  </div>
                  <div className="generation-segment three-segment" role="radiogroup" aria-label="본문 글자 크기">
                    {([
                      ["small", "소"],
                      ["medium", "중"],
                      ["large", "대"],
                    ] as Array<[ReadingFontSize, string]>).map(([size, label]) => (
                      <button
                        key={size}
                        type="button"
                        role="radio"
                        aria-checked={readingFontSize === size}
                        className={readingFontSize === size ? "active" : ""}
                        onClick={() => onReadingFontSizeChange(size)}
                      >
                        <b>{label}</b>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>PROSE REVEAL</span>
                    <strong>본문 표시 속도</strong>
                    <small>Cortex가 확정한 본문이 화면에 나타나는 속도를 조절합니다.</small>
                  </div>
                  <div className="generation-segment four-segment" role="radiogroup" aria-label="본문 표시 속도">
                    {([
                      ["slow", "천천히"],
                      ["natural", "자연스럽게"],
                      ["fast", "빠르게"],
                      ["instant", "즉시"],
                    ] as Array<[TypingSpeed, string]>).map(([speed, label]) => (
                      <button
                        key={speed}
                        type="button"
                        role="radio"
                        aria-checked={typingSpeed === speed}
                        className={typingSpeed === speed ? "active" : ""}
                        onClick={() => onTypingSpeedChange(speed)}
                      >
                        <b>{label}</b>
                      </button>
                    ))}
                  </div>
                </section>

                <div className="settings-note">
                  테마·본문 폭·글자 크기·표시 속도는 작품 세션과 분리되어 현재 브라우저에 저장됩니다. Cortex에서도 이 설정을 그대로 사용합니다.
                </div>
                <CompletionConditionsSetting />
              </>
            ) : activeTab === "generation" ? (
              <>
                <div className="settings-section-title">
                  <div>
                    <span>GENERATION PROFILE</span>
                    <h3>이미지 생성 설정</h3>
                  </div>
                  <strong className="autosave-badge"><Icon name="check" /> 세션에 자동 저장</strong>
                </div>

                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>GPT-IMAGE 2.5 FLARE · QUALITY</span>
                    <strong>이미지 생성 품질</strong>
                    <small>Low는 속도와 비용을, Medium은 묘사와 디테일을 우선합니다. 등장인물 대표 사진은 최대 2장까지 high fidelity로 참조합니다.</small>
                  </div>
                  <div className="generation-segment quality-segment" role="radiogroup" aria-label="이미지 품질">
                    {(["low", "medium"] as ImageQuality[]).map((quality) => (
                      <button
                        key={quality}
                        type="button"
                        role="radio"
                        aria-checked={imageQuality === quality}
                        className={imageQuality === quality ? "active" : ""}
                        onClick={() => onImageQualityChange(quality)}
                      >
                        <b>{imageQualityLabel(quality)}</b>
                        <span>{quality === "low" ? "고속" : "균형형"}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {runtimeEngine !== "cortex" && (
                <>
                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>PLAYBACK RESOLUTION</span>
                    <strong>저장 해상도</strong>
                    <small>360p는 저장 공간과 로딩 속도를, 480p는 선명도를 우선합니다.</small>
                  </div>
                  <div className="generation-segment two-segment" role="radiogroup" aria-label="이미지 저장 해상도">
                    {(["360p", "480p"] as ImageResolution[]).map((resolution) => (
                      <button
                        key={resolution}
                        type="button"
                        role="radio"
                        aria-checked={imageResolution === resolution}
                        className={imageResolution === resolution ? "active" : ""}
                        onClick={() => onImageResolutionChange(resolution)}
                      >
                        <b>{resolution}</b>
                        <span>{resolution === "360p" ? "빠른 로딩" : "더 선명하게"}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>FRAME ASPECT</span>
                    <strong>이미지 비율</strong>
                    <small>생성 API의 원본 구도와 브라우저 저장 크기에 모두 적용됩니다.</small>
                  </div>
                  <div className="generation-segment aspect-segment" role="radiogroup" aria-label="이미지 비율">
                    {(["landscape", "portrait", "square"] as ImageAspect[]).map((aspect) => (
                      <button
                        key={aspect}
                        type="button"
                        role="radio"
                        aria-checked={imageAspect === aspect}
                        className={imageAspect === aspect ? "active" : ""}
                        onClick={() => onImageAspectChange(aspect)}
                      >
                        <i className={`aspect-preview aspect-preview-${aspect}`} aria-hidden="true" />
                        <b>{aspect === "landscape" ? "가로" : aspect === "portrait" ? "세로" : "정사각"}</b>
                        <span>{aspect === "landscape" ? "16:9" : aspect === "portrait" ? "3:4" : "1:1"}</span>
                      </button>
                    ))}
                  </div>
                </section>
                </>
                )}

                <section className="generation-control-card">
                  <div className="generation-control-copy">
                    <span>SCENE IMAGE INTERVAL</span>
                    <strong>정기 장면 이미지</strong>
                    <small>선택한 턴마다 애니메이션 정지 장면을 자동 생성합니다.</small>
                  </div>
                  <div className="generation-segment interval-segment" role="radiogroup" aria-label="장면 이미지 생성 주기">
                    {IMAGE_INTERVAL_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={imageEvery === option.value}
                        className={imageEvery === option.value ? "active" : ""}
                        onClick={() => onImageEveryChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <div className="generation-settings-list">
                  <div><span>대화 모델</span><strong>GPT-6 Luna</strong></div>
                  <div><span>추론 강도</span><strong>Low · 빠른 응답</strong></div>
                  <div><span>최근 대화</span><strong>{runtimeEngine === "cortex" ? "현재 사건 전문 + 장기 기억" : "8턴 + 핵심 기억"}</strong></div>
                  <div><span>고정 세계관</span><strong>{runtimeEngine === "cortex" ? "작품 설정 + 공개 본문 기억" : "명시적 프롬프트 캐싱"}</strong></div>
                  <div><span>현재 이미지 설정</span><strong>{runtimeEngine === "cortex" ? `${imageIntervalLabel(imageEvery)} · ${imageQualityLabel(imageQuality)} · 고정 프레임` : `${imageIntervalLabel(imageEvery)} · ${imageResolution} · ${imageQualityLabel(imageQuality)} · ${imageAspectLabel(imageAspect)}`}</strong></div>
                  <div><span>주요 인물 첫 등장</span><strong>이미지 필수 · 기준본 저장</strong></div>
                  <div><span>캐릭터 외형 유지</span><strong>기준 이미지 참조 생성</strong></div>
                  <div><span>플레이어 주권</span><strong className="safe-text">이중 검사 적용</strong></div>
                </div>
                <div className="settings-note">
                  {runtimeEngine === "cortex"
                    ? "Cortex 장면 이미지는 고정 가로 프레임으로 생성됩니다. ‘끔’은 정기 자동 생성만 중지하며, 본문의 이미지 추가 버튼은 그대로 사용할 수 있습니다."
                    : "‘끔’은 정기 장면 이미지만 중지합니다. 비중 높은 새 인물의 첫 등장은 기존 정책대로 패키지 이미지를 사용하거나 AI 기준 이미지를 반드시 생성합니다."}
                </div>
              </>
            ) : activeTab === "works" ? (
              <>
                <div className="settings-section-title">
                  <div>
                    <span>WORK LIBRARY</span>
                    <h3>추가한 작품 관리</h3>
                  </div>
                  <strong className="work-count-badge">
                    {managedWorks.length}개
                  </strong>
                </div>

                <div className="work-management-intro">
                  <Icon name="shield" />
                  <p>
                    계정 작품과 너름에서 설치한 Cortex 작품을 한곳에서
                    관리합니다. 작품을 삭제하면 연결된 세션과 원본 ZIP,
                    썸네일까지 함께 제거됩니다.
                  </p>
                </div>

                <div className="managed-work-list">
                  {managedWorks.map(({ project, deviceOnly }) => {
                    const deleting = deletingProjectId === project.id;
                    const thumbnailSaving = thumbnailSavingProjectId === project.id;
                    const active = project.id === activeProjectId;
                    return (
                      <article
                        className={`managed-work-card${active ? " active" : ""}`}
                        key={project.id}
                      >
                        <ProjectCover project={project} />
                        <div className="managed-work-copy">
                          <div>
                            <strong>{project.title}</strong>
                            {active && <em>현재 작품</em>}
                          </div>
                          <small>
                            주인공 {project.playerName || "미지정"} · 채팅 세션 {project.sessionCount}개
                          </small>
                          <span>
                            {deviceOnly
                              ? project.sourceProjectId !== project.id
                                ? "너름 설치 · 이 기기의 원본 ZIP"
                                : "Cortex 설치 · 이 기기의 원본 ZIP"
                              : project.hasPackage
                              ? "작품 설정 + 온라인 원본 ZIP"
                              : "작품 설정 + 이 기기의 원본 ZIP"}
                          </span>
                        </div>
                        <div className="managed-work-actions">
                          {!deviceOnly && <label className={`thumbnail-upload-button${thumbnailSaving ? " disabled" : ""}`}>
                            <Icon name="image" />
                            {thumbnailSaving
                              ? "저장 중…"
                              : project.thumbnailUrl ? "썸네일 변경" : "썸네일 등록"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={thumbnailSaving || Boolean(deletingProjectId)}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (file) onThumbnailChange(project, file);
                              }}
                            />
                          </label>}
                          {!deviceOnly && project.thumbnailUrl && (
                            <button
                              type="button"
                              className="thumbnail-delete-button"
                              disabled={thumbnailSaving || Boolean(deletingProjectId)}
                              onClick={() => onThumbnailDelete(project)}
                            >
                              썸네일 제거
                            </button>
                          )}
                          <button
                            type="button"
                            className="delete-work-button"
                            disabled={Boolean(deletingProjectId) || thumbnailSaving}
                            onClick={() => deviceOnly
                              ? onDeleteCortexProject(project)
                              : onDeleteProject(project)}
                            aria-label={`${project.title} 작품 삭제`}
                          >
                            <Icon name="trash" />
                            {deleting ? "삭제 중…" : "작품 삭제"}
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  {managedWorks.length === 0 && (
                    <div className="managed-work-empty">
                      <span><Icon name="book" /></span>
                      <strong>추가한 작품이 없습니다</strong>
                      <small>
                        작품 보관함에서 ScenarioPack ZIP을 불러오면 이곳에서
                        관리할 수 있습니다.
                      </small>
                    </div>
                  )}
                </div>

                <div className="settings-note demo-protection-note">
                  기본 데모 작품 ‘기성학원: 첫 번째 공명’은 앱의 체험용 작품이므로
                  삭제 목록에 표시되지 않습니다.
                </div>
              </>
            ) : (
              <>
                <div className="settings-section-title">
                  <div>
                    <span>DANCHEONG · VERSION {APP_VERSION}</span>
                    <h3>앱 정보와 소스 코드</h3>
                  </div>
                  <strong className="autosave-badge"><Icon name="shield" /> 공개 배포본</strong>
                </div>

                <section className="source-export-card">
                  <span className="source-export-icon"><Icon name="download" /></span>
                  <div>
                    <span>CURRENT DEPLOYED SOURCE</span>
                    <strong>단청 {APP_VERSION_LABEL} 전체 소스</strong>
                    <p>
                      현재 배포본의 소스, 테스트, 실행 스크립트와 설정 예시를 ZIP으로
                      내려받습니다. API 키, 환경 비밀값, 의존성 캐시와 빌드 산출물은
                      포함하지 않습니다.
                    </p>
                  </div>
                  <a
                    className="source-export-button"
                    href={SOURCE_EXPORT_URL}
                    download={SOURCE_EXPORT_FILE_NAME}
                  >
                    <Icon name="download" />
                    소스 코드 ZIP 내보내기
                  </a>
                </section>

                <div className="generation-settings-list source-version-list">
                  <div><span>배포 버전</span><strong>단청 {APP_VERSION_LABEL}</strong></div>
                  <div><span>내보내기 형식</span><strong>ZIP · 재실행 가능한 전체 소스</strong></div>
                  <div><span>보안 제외</span><strong className="safe-text">API 키 · 환경 비밀값 · 사용자 데이터</strong></div>
                </div>

                <div className="settings-note">
                  ZIP은 이 배포본을 빌드할 때 함께 생성되므로 화면에 표시된 버전과 소스가 일치합니다.
                </div>
              </>
            )}
          </div>
        </div>

        {guideOpen && (
          <div className="api-guide-popup-layer">
            <button
              type="button"
              className="api-guide-popup-backdrop"
              aria-label="API 설정 가이드 닫기"
              onClick={() => setGuideOpen(false)}
            />
            <section
              className="api-guide-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="api-guide-title"
            >
              <header>
                <div>
                  <span>OPENAI API QUICK START</span>
                  <h3 id="api-guide-title">내 API로 시작하기</h3>
                </div>
                <button
                  type="button"
                  aria-label="API 설정 가이드 닫기"
                  onClick={() => setGuideOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </header>

              <ol className="api-guide-steps">
                <li>
                  <b>1</b>
                  <div>
                    <strong>OpenAI Platform 로그인</strong>
                    <small>ChatGPT와 같은 계정으로 OpenAI API 관리 화면에 로그인합니다.</small>
                  </div>
                </li>
                <li>
                  <b>2</b>
                  <div>
                    <strong>API 결제 수단 설정</strong>
                    <small>Billing 화면에서 결제 수단이나 크레딧을 등록합니다. ChatGPT 구독료와 API 사용료는 별도입니다.</small>
                  </div>
                </li>
                <li>
                  <b>3</b>
                  <div>
                    <strong>새 Secret Key 발급</strong>
                    <small>API Keys 화면에서 키를 만들고, 다시 표시되지 않으므로 즉시 복사합니다.</small>
                  </div>
                </li>
                <li>
                  <b>4</b>
                  <div>
                    <strong>키 붙여넣기 및 연결 확인</strong>
                    <small>설정창에 키를 붙여넣고 ‘연결 확인 및 적용’을 누르면 준비가 끝납니다.</small>
                  </div>
                </li>
              </ol>

              <div className="api-guide-security">
                <Icon name="shield" />
                <p>
                  API 키는 비밀번호처럼 관리하세요. 공개 게시글, 메신저, 화면 캡처에 키 전체를 노출하지 마세요.
                </p>
              </div>

              <div className="api-guide-popup-actions">
                <a href="https://opencode.ai/workspace/wrk_01M238PB85R2MWXNEH4SCK42E1/go" target="_blank" rel="noreferrer">
                  OpenCode Go로 Luna 구독 <span>↗</span>
                </a>
                <a
                  href="https://platform.openai.com/settings/organization/billing/overview"
                  target="_blank"
                  rel="noreferrer"
                >
                  결제 설정 열기 <span>↗</span>
                </a>
                <a
                  className="primary"
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  API 키 발급하기 <span>↗</span>
                </a>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "account.created": "계정 생성",
  "storage.legacy_claimed": "기존 공용 자료 마스터 귀속",
  "project.created": "작품 등록",
  "project.deleted": "작품 삭제",
  "session.created": "세션 생성",
  "session.renamed": "세션 이름 변경",
  "session.deleted": "세션 삭제",
  "session.conflict": "동시 편집 충돌 보존",
  "session.conflict.forked": "충돌 초안 새 세션 분기",
  "session.checkpoint.created": "수동 복구 지점 생성",
  "session.checkpoint.restored": "세션 체크포인트 복구",
};

const AccountDialog = ({
  account,
  auditLogs,
  auditLoading,
  projectCount,
  sessionCount,
  totalCostUsd,
  onClose,
}: {
  account: AccountInfo;
  auditLogs: AuditLogEntry[];
  auditLoading: boolean;
  projectCount: number;
  sessionCount: number;
  totalCostUsd: number;
  onClose: () => void;
}) => (
  <div className="account-overlay" role="presentation" onMouseDown={onClose}>
    <section
      className="account-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="account-dialog-head">
        <div className="account-identity-mark"><Icon name="account" /></div>
        <div>
          <small>RELAY ID · ACCOUNT VAULT</small>
          <h2 id="account-title">{account.displayName || "Relay 사용자"}</h2>
          <p>ChatGPT 로그인으로 확인된 단청 계정입니다.</p>
        </div>
        <button type="button" aria-label="계정 화면 닫기" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <div className="account-profile-grid">
        <div><span>권한</span><strong className={`account-role role-${account.role?.toLowerCase()}`}>{account.role}</strong></div>
        <div><span>온라인 저장소</span><strong>계정 전용</strong></div>
        <div><span>작품 보관함</span><strong>{projectCount.toLocaleString("ko-KR")}개</strong></div>
        <div><span>세션 / 누적 비용</span><strong>{sessionCount.toLocaleString("ko-KR")}개 · ${totalCostUsd.toFixed(4)}</strong></div>
        <div className="account-wide"><span>이메일</span><strong>{account.email}</strong></div>
        <div className="account-wide"><span>사용자 UUID</span><code>{account.id}</code></div>
      </div>

      <div className="account-storage-note">
        <Icon name="shield" />
        <div>
          <strong>작품·세션·비용 기록이 이 UUID에 귀속됩니다.</strong>
          <p>다른 계정은 이 보관함을 조회하거나 수정할 수 없습니다. API 키는 계속 각 기기에만 저장됩니다.</p>
        </div>
      </div>

      {account.role === "MASTER" && (
        <section className="audit-log-panel">
          <header>
            <div><small>MASTER CONTROL</small><h3>관리자 감사 로그</h3></div>
            <span>{auditLoading ? "불러오는 중" : `${auditLogs.length}건`}</span>
          </header>
          {auditLoading ? (
            <p className="audit-empty">최근 관리 기록을 확인하고 있습니다.</p>
          ) : auditLogs.length ? (
            <ol>
              {auditLogs.map((entry) => (
                <li key={entry.id}>
                  <i />
                  <div>
                    <strong>{AUDIT_ACTION_LABELS[entry.action] || entry.action}</strong>
                    <small>{entry.actorDisplayName} · {entry.targetType} · {entry.targetId.slice(0, 32)}</small>
                  </div>
                  <time>{new Date(entry.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="audit-empty">아직 기록된 관리 작업이 없습니다.</p>
          )}
        </section>
      )}

      <footer className="account-dialog-actions">
        <span>단청 {APP_VERSION_LABEL}</span>
        <a href={account.signOutPath || "/signout-with-chatgpt?return_to=%2F"}>로그아웃</a>
      </footer>
    </section>
  </div>
);

const AccountGate = ({ account }: { account: AccountInfo | null }) => (
  <div className="account-gate" role="dialog" aria-modal="true" aria-labelledby="account-gate-title">
    <section>
      <div className="account-gate-orbit"><Icon name="shield" /></div>
      <small>단청 · SECURE LIBRARY</small>
      <h2 id="account-gate-title">{account ? "Relay ID로 계속하기" : "계정 확인 중"}</h2>
      <p>{account
        ? "작품과 세션을 계정별 온라인 보관함에 안전하게 연결합니다."
        : "ChatGPT 로그인과 Relay ID 저장소를 확인하고 있습니다."}</p>
      {account?.signInPath ? <a href={account.signInPath}>ChatGPT로 로그인</a> : <i className="account-gate-loader" />}
      <em>OpenAI API 키는 계정 서버로 전송하지 않으며 각 기기에 별도로 보관됩니다.</em>
    </section>
  </div>
);

export default function Home() {
  const {runtimeEngine,cortexFile,setCortexFile,cortexBusy,cortexSession,openCortex} = useRuntimeEngine();
  const [surfaceMode, setSurfaceMode] = useState<"home" | "reader">("home");
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoomState | null>(null);
  const multiplayerRoomCode = useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "",
    () => "",
  );
  const [pack, setPack] = useState<ScenarioPack>(demoScenario);
  const [state, setState] = useState<RuntimeState>(() =>
    createInitialState(demoScenario),
  );
  const [turns, setTurns] = useState<TurnRecord[]>(() => [
    createOpeningTurnWithStatus(demoScenario),
  ]);
  const [longTermMemories, setLongTermMemories] = useState<LongTermMemoryRecord[]>([]);
  const [longTermMemoryOpen, setLongTermMemoryOpen] = useState(false);
  const [exportingTranscript, setExportingTranscript] = useState(false);
  const [input, setInput] = useState("");
  const mobileComposerDevice = useSyncExternalStore(
    () => () => undefined,
    () => isMobileComposerDevice(window.navigator),
    () => false,
  );
  const [loading, setLoading] = useState(false);
  const {
    pendingValidatedTurn,
    setPendingValidatedTurn,
    streamStatus,
    setStreamStatus,
    streamStatusCompleted,
    completeStreamStatus,
    finalRevealAnnouncement,
    setFinalRevealAnnouncement,
    failedDraft,
    setFailedDraft,
    showFailedDraft,
    setShowFailedDraft,
  } = useLiveStreamUi();
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(
    null,
  );
  const [notice, setNotice] = useState(
    "독립된 기본 데모 작품 ‘기성학원: 첫 번째 공명’을 열었습니다. 불러온 작품에는 데모 설정이 섞이지 않습니다.",
  );
  const [error, setError] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"menu" | "state" | null>(
    null,
  );
  const [mobileInspectorTab, setMobileInspectorTab] = useState<NexusInspectorTab>("status");
  const openMobileInspector = (tab: NexusInspectorTab) => {
    setMobileInspectorTab(tab);
    setMobilePanel("state");
  };
  const [totalCostUsd, setTotalCostUsd] = useState(0);
  const [costMeterEntries, setCostMeterEntries] = useState<CostMeterEntry[]>([]);
  const [liveReliabilityAttempts, setLiveReliabilityAttempts] = useState<LiveReliabilityEntry[]>([]);
  const [lastMode, setLastMode] = useState<"mock" | "luna">("mock");
  const [imageJobs, setImageJobs] = useState<
    Record<string, "loading" | "error">
  >({});
  const [characterImageJobs, setCharacterImageJobs] = useState<
    Record<string, "loading" | "error">
  >({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [contextTurnId, setContextTurnId] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = useState<InspectorImagePreview | null>(null);
  const closePreviewImage = useCallback(() => setPreviewImage(null), []);
  const [hydrated, setHydrated] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const {
    settingsOpen, setSettingsOpen, settingsTab, setSettingsTab,
    themeMode, setThemeMode, readingWidth, setReadingWidth,
    readingFontSize, setReadingFontSize, typingSpeed, setTypingSpeed,
    apiKey, setApiKey, apiKeyDraft, setApiKeyDraft,
    showApiKey, setShowApiKey, rememberApiKey, setRememberApiKey,
    apiStatus, setApiStatus, apiMessage, setApiMessage,
  } = useNexusSettingsState();
  const apiKeyOperationRef = useRef(0);
  useEffect(() => {
    const change = async () => {
      const run = ++apiKeyOperationRef.current, provider = deviceTextProvider();
      setApiKey(''); setApiKeyDraft(''); setApiStatus('disconnected');
      setApiMessage(`${TEXT_PROVIDERS[provider].label} 키를 입력해 연결해 주세요.`);
      const key = await restoreRememberedApiKey(provider);
      if (run !== apiKeyOperationRef.current || provider !== deviceTextProvider() || !key) return;
      // Restoring a device credential does not need a paid network probe.
      // A transient provider outage must never erase a saved key.
      setApiKey(key); setApiKeyDraft(key); setApiStatus('connected');
      setApiMessage(`${TEXT_PROVIDERS[provider].label}의 저장된 API 키를 불러왔습니다. 실제 요청 시 연결 상태를 확인합니다.`);
    };
    window.addEventListener('dancheong-provider-change', change);
    void change();
    return () => { apiKeyOperationRef.current++; window.removeEventListener('dancheong-provider-change', change); };
  }, [setApiKey, setApiKeyDraft, setApiStatus, setApiMessage]);
  const {
    account, setAccount, accountOpen, setAccountOpen,
    auditLogs, setAuditLogs, auditLoading, setAuditLoading,
    libraryTab, setLibraryTab, projects, setProjects, sessions, setSessions,
    activeProjectId, setActiveProjectId, activeSessionId, setActiveSessionId,
    activeSessionName, setActiveSessionName, libraryLoading, setLibraryLoading,
    sessionSwitching, setSessionSwitching, sessionRefreshing, setSessionRefreshing,
    syncStatus, setSyncStatus, syncConflict, setSyncConflict,
    conflictCheckpointId, setConflictCheckpointId,
    checkpointsOpen, setCheckpointsOpen, checkpoints, setCheckpoints,
    checkpointsLoading, setCheckpointsLoading,
    deletingProjectId, setDeletingProjectId,
    thumbnailSavingProjectId, setThumbnailSavingProjectId,
    renamingSessionId, setRenamingSessionId, renameDraft, setRenameDraft,
  } = useNexusLibraryState<
    ProjectSummary,
    SessionSummary,
    SessionCheckpoint,
    AccountInfo,
    AuditLogEntry
  >({
    initialProject: builtInDemoProject,
    initialSession: builtInDemoSession,
    initialProjectId: BUILT_IN_DEMO_PROJECT_ID,
    initialSessionId: BUILT_IN_DEMO_SESSION_ID,
  });
  useEffect(()=>{
    const changed=(event:Event)=>{
      if(!(event as CustomEvent).detail.previous)return;
      // Remove previous account views before reloading authenticated server data.
      setAccount(null);setProjects([]);setSessions([]);setSurfaceMode('home');
      window.location.reload();
    };
    window.addEventListener(CORTEX_ACCOUNT_CHANGED,changed);
    return()=>window.removeEventListener(CORTEX_ACCOUNT_CHANGED,changed);
  },[setAccount,setProjects,setSessions]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyScrollRef = useRef<HTMLDivElement>(null);
  const {
    showLatestButton,
    scrollToLatest,
    lockScrollForNextLayout,
    preserveVisibleStoryAnchorForNextLayout,
  } =
    useStoryScrollUi(storyScrollRef, surfaceMode === "reader");
  const latestUserTurnRef = useRef<HTMLDivElement>(null);
  const lastAutoScrolledTurnIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeSessionIdRef = useRef(activeSessionId);
  const sessionRevisionsRef = useRef(
    new Map<string, number>([[BUILT_IN_DEMO_SESSION_ID, 1]]),
  );
  const lastServerSnapshotJsonRef = useRef(new Map<string, string>());
  const storyRevisionRef = useRef(0);
  const simulationAbortRef = useRef<AbortController | null>(null);
  const failedTurnRetryRef = useRef<{ advanceMode: "player" | "canonical"; userText: string } | null>(null);
  const multiplayerCauseRef = useRef<MultiplayerCallCause>("NORMAL");
  const multiplayerTimeoutHandledRef = useRef("");
  const snapshotApplyTokenRef = useRef(0);
  const sessionEnvelopeCacheRef = useRef(
    new BoundedLruCache<string, SessionEnvelope>(SESSION_ENVELOPE_CACHE_LIMIT),
  );
  const sessionFetchPromisesRef = useRef(
    new Map<string, Promise<SessionEnvelope>>(),
  );
  const characterJobPromisesRef = useRef(
    new Map<string, Promise<{ characterId: string; imageUrl: string } | undefined>>(),
  );

  const packageMediaPromisesRef = useRef(
    new Map<string, Promise<string | undefined>>(),
  );

  const rememberSessionRevision = useCallback((sessionId: string, revision: number) => {
    sessionRevisionsRef.current.set(sessionId, Math.max(1, revision || 1));
  }, []);

  const currentSessionRevision = useCallback((sessionId: string) =>
    sessionRevisionsRef.current.get(sessionId) ?? 1, []);

  const rememberServerSnapshot = useCallback((sessionId: string, snapshot: SavedSession) => {
    lastServerSnapshotJsonRef.current.set(sessionId, JSON.stringify(snapshot));
  }, []);

  const latestRecommendations = useMemo(() => {
    const latestTurn = turns.at(-1);
    if (!latestTurn?.recommendations.length) return [];

    // The server has already run the authoritative hard-error audit and any
    // recommendation-only repair. Re-authoring the choices in the browser used
    // to discard the writer's scene-specific lines and replace them with the
    // generic emergency templates. The presentation layer must stay lossless.
    return latestTurn.recommendations.slice(0, 3);
  }, [turns]);
  const chapterTitle = useMemo(
    () => resolveChapterTitle(pack, state),
    [pack, state],
  );
  const mediaAssetById = useMemo(
    () =>
      new Map(
        (pack.mediaAssets ?? []).map((asset) => [asset.id, asset] as const),
      ),
    [pack.mediaAssets],
  );
  const playerStatusAsset = useMemo(
    () =>
      selectPackageCharacterReferenceAsset(pack, pack.player.id) ??
      selectPackageCharacterReferenceAsset(pack, pack.player.name),
    [pack],
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId),
    [activeProjectId, projects],
  );
  const activeProjectSessions = useMemo(
    () => sessions.filter((session) => session.projectId === activeProjectId),
    [activeProjectId, sessions],
  );
  const multiplayerSelf = multiplayerRoom?.members.find((member) => member.isSelf);
  const multiplayerCurrent = multiplayerRoom?.members.find((member) =>
    member.id === multiplayerRoom.currentMemberId
  );
  const multiplayerCanWrite = !multiplayerRoom ||
    multiplayerRoom.status === "SOLO" ||
    (multiplayerRoom.status === "ACTIVE" && multiplayerSelf?.id === multiplayerRoom.currentMemberId);

  const applySessionSnapshot = useCallback(async (
    snapshot: SavedSession,
    identity?: {
      projectId: string;
      sessionId: string;
      sessionName: string;
      hasPackage: boolean;
    },
    message?: string,
    composerDraft = "",
  ) => {
    storyRevisionRef.current += 1;
    const applyStoryRevision = storyRevisionRef.current;
    const applyToken = ++snapshotApplyTokenRef.current;
    const targetSessionId = identity?.sessionId ?? activeSessionIdRef.current;
    const optimizedTurns = retainRecentGeneratedSceneImages(snapshot.turns ?? []);
    const restoredLongTermMemories = appendLongTermMemories(
      optimizedTurns,
      snapshot.longTermMemories ?? [],
    );
    const detached = detachScenarioMedia({
      ...snapshot.pack,
      mediaAssets: snapshot.pack.mediaAssets ?? [],
    });
    const restoredPack: ScenarioPack = {
      ...detached.pack,
      startTime: scenarioOpeningTime(detached.pack),
      constraints: detached.pack.constraints ?? [],
      statusWindow: detached.pack.statusWindow ?? defaultStatusWindow(),
      initialStatusLedger: detached.pack.initialStatusLedger ?? [],
      factions: detached.pack.factions ?? [],
      autonomyActors: detached.pack.autonomyActors ?? [],
      autonomyRuntime:
        detached.pack.autonomyRuntime ?? defaultAutonomyRuntime(),
      initialRelationshipMemories:
        detached.pack.initialRelationshipMemories ?? [],
      relationshipMemoryRuntime:
        detached.pack.relationshipMemoryRuntime ??
        defaultRelationshipMemoryRuntime(),
    };
    const initialState = createInitialState(restoredPack);
    const restoredTurnsBase = optimizedTurns.map((turn) => ({
      ...turn,
      characterVisuals: turn.characterVisuals ?? [],
      statusSnapshot: turn.role === "opening"
        ? buildPublicStatusSnapshot(restoredPack, initialState)
        : turn.statusSnapshot
        ? sanitizeStoredPublicStatusSnapshot(restoredPack, {
            ...turn.statusSnapshot,
            relations: (turn.statusSnapshot.relations ?? []).map((relation) => ({
              ...relation,
              reasonTitle: relation.reasonTitle ?? "",
              reasonSummary: relation.reasonSummary ?? "",
            })),
            worldTraces: turn.statusSnapshot.worldTraces ?? [],
          })
        : undefined,
    }));
    const integrity = inspectSessionIntegrity(restoredPack, restoredTurnsBase);
    const relationshipMemories = normalizeRuntimeRelationshipMemories(
      restoredPack,
      snapshot.state.relationshipMemories,
    );
    const normalizedRelations = normalizeRuntimeRelations(
      restoredPack,
      snapshot.state.relations ?? initialState.relations,
    );
    const normalizedRestoredState: RuntimeState = {
      ...initialState,
      ...snapshot.state,
      imageEvery: normalizeSceneImageInterval(snapshot.state.imageEvery),
      imageQuality: normalizeImageQuality(snapshot.state.imageQuality),
      imageResolution: normalizeImageResolution(snapshot.state.imageResolution),
      imageAspect: normalizeImageAspect(
        snapshot.state.imageAspect,
        initialState.imageAspect,
      ),
      variables: snapshot.state.variables ?? [],
      characterVisuals: snapshot.state.characterVisuals ?? [],
      relations: restoredPack.relationshipMemoryRuntime.enabled
        ? deriveRuntimeRelationsFromMemories(
            restoredPack,
            normalizedRelations,
            relationshipMemories,
          )
        : normalizedRelations,
      statusLedger: normalizeRuntimeStatusLedger(
        restoredPack,
        snapshot.state.statusLedger,
      ),
      lastStatusChanges: snapshot.state.lastStatusChanges ?? [],
      autonomyActors: normalizeRuntimeAutonomyActors(
        restoredPack,
        snapshot.state.autonomyActors,
      ),
      autonomyLog: snapshot.state.autonomyLog ?? [],
      worldFacts: snapshot.state.worldFacts ?? [],
      relationshipMemories,
      lastRelationshipMemoryIds:
        snapshot.state.lastRelationshipMemoryIds ?? [],
      observableTraces: snapshot.state.observableTraces ?? [],
      characterResearchCache: snapshot.state.characterResearchCache ?? [],
      encounteredCharacterIds:
        snapshot.state.encounteredCharacterIds ??
          deriveEncounteredCharacterIds(restoredPack, restoredTurnsBase),
    };
    const resetForeignDemoTurns = integrity.foreignDemoExchangeCount > 0;
    const restoredState: RuntimeState = resetForeignDemoTurns
      ? {
          ...initialState,
          imageEvery: normalizeSceneImageInterval(snapshot.state.imageEvery),
          imageQuality: normalizeImageQuality(snapshot.state.imageQuality),
          imageResolution: normalizeImageResolution(snapshot.state.imageResolution),
          imageAspect: normalizeImageAspect(
            snapshot.state.imageAspect,
            initialState.imageAspect,
          ),
        }
      : normalizedRestoredState;
    const repairedTurnsBase = resetForeignDemoTurns
      ? [createOpeningTurnWithStatus(restoredPack, restoredState)]
      : restoredTurnsBase.map((turn) =>
          integrity.hasLegacyDemoOpening && turn.role === "opening"
            ? {
                ...createOpeningTurnWithStatus(restoredPack, initialState),
                createdAt: turn.createdAt,
              }
            : turn,
        );
    const restoredTurns = repairedTurnsBase.map((turn, index) => {
      if (index === repairedTurnsBase.length - 1) {
        return {
          ...turn,
          statusSnapshot: buildPublicStatusSnapshot(restoredPack, restoredState),
        };
      }
      if (turn.statusSnapshot) return turn;
      if (turn.role === "opening") {
        return {
          ...turn,
          statusSnapshot: buildPublicStatusSnapshot(restoredPack, initialState),
        };
      }
      return turn;
    });
    const initialAppliedTurns = attachRuntimeCheckpoints(
      restoredPack,
      restoredState,
      restoredTurns.length
        ? restoredTurns
        : [createOpeningTurnWithStatus(restoredPack, restoredState)],
    );
    const appliedLongTermMemories = resetForeignDemoTurns
      ? []
      : restoredLongTermMemories;
    const appliedLastMode = !resetForeignDemoTurns && snapshot.lastMode === "luna"
      ? "luna"
      : "mock";

    // Paint the selected conversation before optional package media recovery,
    // archive parsing, and historical repair work. Large ScenarioPacks can take
    // seconds to restore; none of that should hold the chat shell hostage.
    setPack(restoredPack);
    setState(restoredState);
    setTurns(initialAppliedTurns);
    setLongTermMemories(appliedLongTermMemories);
    setTotalCostUsd(snapshot.totalCostUsd ?? 0);
    setLastMode(appliedLastMode);
    setMediaUrls(detached.mediaUrls);
    setInput(composerDraft);
    setError("");
    if (identity) {
      activeSessionIdRef.current = identity.sessionId;
      setActiveProjectId(identity.projectId);
      setActiveSessionId(identity.sessionId);
      setActiveSessionName(identity.sessionName);
      localStorage.setItem(LAST_SESSION_KEY, identity.sessionId);
    }
    rememberServerSnapshot(targetSessionId, createOptimizedSessionSnapshot(
      restoredPack,
      restoredState,
      initialAppliedTurns,
      appliedLongTermMemories,
      snapshot.totalCostUsd ?? 0,
      appliedLastMode,
    ));
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    void (async () => {
    let restoredMedia = { ...detached.mediaUrls };
    let mediaRestoredPack = restoredPack;
    try {
      restoredMedia = {
        ...(await restorePackageMedia(restoredPack.projectId)),
        ...restoredMedia,
      };
      const packagedAssetCount = (restoredPack.mediaAssets ?? []).filter(
        (asset) => asset.source !== "generated",
      ).length;
      const storedMediaSchemaVersion = Number(
        restoredPack.rawProject?.mediaSchemaVersion ?? 0,
      );
      const needsMediaSchemaUpgrade =
        storedMediaSchemaVersion < SCENARIO_MEDIA_SCHEMA_VERSION;
      const localArchive = packagedAssetCount > 0 || needsMediaSchemaUpgrade
        ? await restorePackageArchive(restoredPack.projectId).catch(() => undefined)
        : undefined;
      const needsRemotePackage = Boolean(
        identity?.hasPackage &&
        (needsMediaSchemaUpgrade ||
          (packagedAssetCount > 0 &&
            Object.keys(restoredMedia).length < packagedAssetCount &&
            !localArchive)),
      );
      let canonicalPackageFile = needsMediaSchemaUpgrade && localArchive
        ? new File([localArchive], "restored-local-scenario-pack.zip", {
            type: "application/zip",
          })
        : undefined;
      if (!canonicalPackageFile && needsRemotePackage && identity) {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(identity.projectId)}/package`,
        );
        if (response.ok) {
          const blob = await response.blob();
          canonicalPackageFile = new File(
            [blob],
            "restored-scenario-pack.zip",
            { type: "application/zip" },
          );
        }
      }
      if (canonicalPackageFile) {
        const canonicalPack = await parseScenarioPackFile(canonicalPackageFile);
        const canonicalDetached = detachScenarioMedia(canonicalPack);
        const mergedAssets = new Map(
          (restoredPack.mediaAssets ?? []).map((asset) => [asset.id, asset] as const),
        );
        canonicalDetached.pack.mediaAssets.forEach((asset) => {
          mergedAssets.set(asset.id, asset);
        });
        mediaRestoredPack = {
          ...restoredPack,
          mediaAssets: [...mergedAssets.values()],
          assetLedger: canonicalDetached.pack.assetLedger,
          aiWorldContext: canonicalDetached.pack.aiWorldContext,
          compatibility: canonicalDetached.pack.compatibility,
          rawProject: {
            ...(restoredPack.rawProject ?? {}),
            mediaSchemaVersion: SCENARIO_MEDIA_SCHEMA_VERSION,
          },
        };
        restoredMedia = {
          ...canonicalDetached.mediaUrls,
          ...restoredMedia,
        };
        const canonicalPackageAssetCount = canonicalDetached.pack.mediaAssets
          .filter((asset) => asset.source !== "generated").length;
        if (
          Object.keys(canonicalDetached.mediaUrls).length <
          canonicalPackageAssetCount
        ) {
          await rememberPackageArchive(
            restoredPack.projectId,
            canonicalPackageFile,
            canonicalPackageFile.name,
          );
        }
        await rememberPackageMedia(restoredPack.projectId, restoredMedia, restoredPack.mediaAssets);
      } else if (Object.keys(detached.mediaUrls).length > 0) {
        await rememberPackageMedia(restoredPack.projectId, restoredMedia, restoredPack.mediaAssets);
      }
    } catch {
      // The text simulation stays usable if an optional image cannot be restored.
    }

    const narrativeControlLeakRepair = repairNarrativeControlLeakHistory(
      mediaRestoredPack,
      restoredState,
      restoredTurns,
    );
    const narrativeChronologyRepair = repairNarrativeChronologyHistory(
      mediaRestoredPack,
      narrativeControlLeakRepair.state,
      narrativeControlLeakRepair.turns,
    );
    const narrativeRegressionRepair = repairNarrativeRegressionHistory(
      mediaRestoredPack,
      narrativeChronologyRepair.state,
      narrativeChronologyRepair.turns,
    );
    const triggeredMediaHistoryRepair = repairPrematureTriggeredMediaHistory(
      mediaRestoredPack,
      narrativeRegressionRepair.turns,
    );
    const requiredEventHistoryRepair = repairRequiredEventHistory(
      mediaRestoredPack,
      triggeredMediaHistoryRepair.turns,
    );
    const summoningHistoryRepair = repairSaberSummoningHistory(
      mediaRestoredPack,
      requiredEventHistoryRepair.turns,
    );
    const claudeEventLedgerHistoryRepair = repairClaudeEventLedgerHistory(
      mediaRestoredPack,
      narrativeRegressionRepair.state,
      summoningHistoryRepair.turns,
    );
    const visualRepair = repairPackageCharacterVisuals(
      mediaRestoredPack,
      claudeEventLedgerHistoryRepair.state,
      claudeEventLedgerHistoryRepair.turns,
    );
    visualRepair.removedGeneratedAssetIds.forEach((assetId) => {
      delete restoredMedia[assetId];
    });

    if (
      snapshotApplyTokenRef.current !== applyToken ||
      activeSessionIdRef.current !== targetSessionId ||
      storyRevisionRef.current !== applyStoryRevision
    ) {
      return;
    }

    const repairedAppliedTurns = attachRuntimeCheckpoints(
      visualRepair.pack,
      visualRepair.state,
      visualRepair.turns.length
        ? visualRepair.turns
        : [createOpeningTurnWithStatus(visualRepair.pack, visualRepair.state)],
    );
    setPack(visualRepair.pack);
    setState(visualRepair.state);
    setTurns(repairedAppliedTurns);
    setLongTermMemories(appliedLongTermMemories);
    setTotalCostUsd(snapshot.totalCostUsd ?? 0);
    setLastMode(appliedLastMode);
    setMediaUrls(restoredMedia);
    setImageJobs({});
    setCharacterImageJobs({});
    setCopiedTurnId(null);
    setContextTurnId(null);
    setLongTermMemoryOpen(false);
    characterJobPromisesRef.current.clear();
    packageMediaPromisesRef.current.clear();
    setUndoStack([]);
    setInput(composerDraft);
    setError("");
    if (identity) {
      setActiveProjectId(identity.projectId);
      setActiveSessionId(identity.sessionId);
      setActiveSessionName(identity.sessionName);
      localStorage.setItem(LAST_SESSION_KEY, identity.sessionId);
    }
    rememberServerSnapshot(targetSessionId, createOptimizedSessionSnapshot(
      visualRepair.pack,
      visualRepair.state,
      repairedAppliedTurns,
      appliedLongTermMemories,
      snapshot.totalCostUsd ?? 0,
      appliedLastMode,
    ));
    const repairMessage = resetForeignDemoTurns
      ? `이전 버전이 잘못 저장한 기성학원 대체 응답 ${integrity.foreignDemoExchangeCount}개를 제거하고 ‘${restoredPack.title}’의 첫 장면으로 복구했습니다. 당시 입력은 처리되지 않았으므로 다시 보내 주세요.`
      : integrity.hasLegacyDemoOpening
        ? "이 작품에 잘못 붙어 있던 기성학원 추천 행동을 작품 공통 선택지로 교체했습니다."
        : "";
    const visualRepairMessage = visualRepair.repairedCharacterCount > 0
      ? `AI가 잘못 저장한 캐릭터 기준본 ${visualRepair.repairedCharacterCount}개를 패키지 원본으로 복구했습니다.${
          visualRepair.clearedSceneCount > 0
            ? ` 잘못된 기준본으로 만든 장면 이미지 ${visualRepair.clearedSceneCount}개도 제거했습니다.`
            : ""
        }`
      : "";
    const summoningRepairMessage = summoningHistoryRepair.repaired
      ? `기존 소환 장면에 필수 대사 “묻겠다. 그대가 나의 마스터인가.”와 소환 전용 패키지 이미지를 복구했습니다.${
          summoningHistoryRepair.clearedGeneratedSceneCount > 0
            ? ` 홍재의 패키지 기준본 없이 만든 장면 이미지 ${summoningHistoryRepair.clearedGeneratedSceneCount}개는 제거했습니다.`
            : ""
        }`
      : "";
    const requiredEventRepairMessage = requiredEventHistoryRepair.repairedEventCount > 0
      ? `기존 기록에서 패키지 필수 사건 ${requiredEventHistoryRepair.repairedEventCount}개의 누락 대사·전용 이미지·캐릭터 기준본을 복구했습니다.${
          requiredEventHistoryRepair.clearedGeneratedSceneCount > 0
            ? ` 잘못된 기준본으로 만든 장면 이미지 ${requiredEventHistoryRepair.clearedGeneratedSceneCount}개도 제거했습니다.`
            : ""
        }`
      : "";
    const narrativeRegressionRepairMessage = narrativeRegressionRepair.repaired
      ? `이미 끝난 택배를 다시 배송한 잘못된 장면 ${narrativeRegressionRepair.removedTurnCount}개를 제거하고 마지막 정상 시점으로 복구했습니다.`
      : "";
    const narrativeChronologyRepairMessage = narrativeChronologyRepair.repaired
      ? `본문의 실제 시점과 달랐던 상태창 기록 ${narrativeChronologyRepair.repairedTurnCount}개를 서사 시간순으로 복구했습니다.`
      : "";
    const narrativeControlLeakRepairMessage = narrativeControlLeakRepair.repaired
      ? `내부 진행 문구 노출·부적합한 장소의 강제 등장·현재 장소와 모순된 반복 장면 ${narrativeControlLeakRepair.removedTurnCount}개를 제거하고 직전 정상 시점으로 복구했습니다.`
      : "";
    const claudeEventLedgerRepairMessage = claudeEventLedgerHistoryRepair.repaired
      ? `본문에서 이미 성립한 사건 ${claudeEventLedgerHistoryRepair.sealedEventCount}개를 봉인 원장으로 복구했습니다.${
          claudeEventLedgerHistoryRepair.recoveredItems.length > 0
            ? ` 실제 획득 장면이 확인된 물품 ${claudeEventLedgerHistoryRepair.recoveredItems.join(", ")}도 소지품과 동기화했습니다.`
            : ""
        }`
      : "";
    const resolvedMessage = [
      message,
      repairMessage,
      narrativeControlLeakRepairMessage,
      narrativeChronologyRepairMessage,
      narrativeRegressionRepairMessage,
      claudeEventLedgerRepairMessage,
      requiredEventRepairMessage,
      summoningRepairMessage,
      visualRepairMessage,
    ]
      .filter(Boolean)
      .join(" ");
    if (resolvedMessage) setNotice(resolvedMessage);
    })().catch(() => {
      // Historical/media repair is best-effort and must never block the prose.
    });
  }, [
    rememberServerSnapshot,
    setActiveProjectId,
    setActiveSessionId,
    setActiveSessionName,
  ]);

  const fetchSessionEnvelope = useCallback(
    async (sessionId: string, allowCached = true): Promise<SessionEnvelope> => {
      if (allowCached) {
        const cached = sessionEnvelopeCacheRef.current.get(sessionId);
        if (
          cached &&
          cached.session.revision >= currentSessionRevision(sessionId)
        ) return cached;
        if (cached) sessionEnvelopeCacheRef.current.delete(sessionId);
      }
      const pending = sessionFetchPromisesRef.current.get(sessionId);
      if (pending) return pending;
      const request = (async () => {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        const envelope = (await response.json()) as SessionEnvelope;
        if (!response.ok || envelope.error) {
          throw new Error(envelope.error || "세션을 불러오지 못했습니다.");
        }
        sessionEnvelopeCacheRef.current.set(sessionId, envelope);
        return envelope;
      })();
      sessionFetchPromisesRef.current.set(sessionId, request);
      try {
        return await request;
      } finally {
        sessionFetchPromisesRef.current.delete(sessionId);
      }
    },
    [currentSessionRevision],
  );

  const prefetchSession = useCallback((sessionId: string) => {
    if (
      sessionId === BUILT_IN_DEMO_SESSION_ID ||
      sessionId === activeSessionIdRef.current
    ) return;
    void fetchSessionEnvelope(sessionId).catch(() => undefined);
  }, [fetchSessionEnvelope]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem(APPEARANCE_STORAGE_KEY) || "{}",
        ) as { theme?: ThemeMode; readingWidth?: ReadingWidth; readingFontSize?: ReadingFontSize; typingSpeed?: TypingSpeed };
        if (saved.theme === "dark" || saved.theme === "light") {
          setThemeMode(saved.theme);
        } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          setThemeMode("dark");
        }
        if (["narrow", "normal", "wide"].includes(saved.readingWidth ?? "")) {
          setReadingWidth(saved.readingWidth as ReadingWidth);
        }
        if (["small", "medium", "large"].includes(saved.readingFontSize ?? "")) {
          setReadingFontSize(saved.readingFontSize as ReadingFontSize);
        }
        if (["slow", "natural", "fast", "instant"].includes(saved.typingSpeed ?? "")) {
          setTypingSpeed(saved.typingSpeed as TypingSpeed);
        }
      } catch {
        // Corrupt device-only display preferences must never block a story session.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [setReadingFontSize, setReadingWidth, setThemeMode, setTypingSpeed]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ theme: themeMode, readingWidth, readingFontSize, typingSpeed }),
    );
  }, [hydrated, readingFontSize, readingWidth, themeMode, typingSpeed]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const preparedAccount = await prepareDeviceOwner();
        if (cancelled) return;
        setAccount(preparedAccount);
        setCortexAccountOwner(preparedAccount.authenticated?`account:${preparedAccount.id}`:"");
        if (!preparedAccount.authenticated) {
          setNotice("Relay ID 계정으로 로그인하면 계정 전용 작품·세션 보관함이 연결됩니다.");
          return;
        }
        const response = await fetch("/api/library", { cache: "no-store" });
        const library = (await response.json()) as LibraryResponse;
        if (!response.ok) throw new Error(library.error || "작품 보관함 연결 실패");
        if (cancelled) return;
        const storedProjects = library.projects ?? [];
        const storedSessions = library.sessions ?? [];
        storedSessions.forEach((session) => {
          rememberSessionRevision(session.id, session.revision);
        });
        setProjects([builtInDemoProject, ...storedProjects]);
        setSessions([builtInDemoSession, ...storedSessions]);
        setCostMeterEntries(library.costMeterTurns ?? []);
        setLiveReliabilityAttempts(library.liveReliabilityAttempts ?? []);

        if (storedSessions.length) {
          const rememberedSessionId = localStorage.getItem(LAST_SESSION_KEY);
          const target = [builtInDemoSession, ...storedSessions].find(
            (session) => session.id === rememberedSessionId,
          ) ?? storedSessions[0];
          if (target.id === BUILT_IN_DEMO_SESSION_ID) {
            const savedDemo = localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
            await applySessionSnapshot(
              savedDemo
                ? JSON.parse(savedDemo) as SavedSession
                : createBuiltInDemoSnapshot(),
              {
                projectId: BUILT_IN_DEMO_PROJECT_ID,
                sessionId: BUILT_IN_DEMO_SESSION_ID,
                sessionName: builtInDemoSession.name,
                hasPackage: false,
              },
              "독립된 기본 데모 작품을 열었습니다.",
            );
            setSyncStatus("idle");
          } else {
            const envelope = await fetchSessionEnvelope(target.id);
            if (cancelled) return;
            rememberSessionRevision(envelope.session.id, envelope.session.revision);
            setSyncConflict(false);
            setConflictCheckpointId(null);
            await applySessionSnapshot(
              envelope.snapshot,
              {
                projectId: envelope.project.id,
                sessionId: envelope.session.id,
                sessionName: envelope.session.name,
                hasPackage: envelope.project.hasPackage,
              },
              `‘${envelope.session.name}’ 세션을 이어서 시작합니다.`,
            );
            setSyncStatus("saved");
          }
        } else {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const legacy = JSON.parse(saved) as SavedSession;
            if (legacy.pack?.projectId && legacy.state && legacy.turns?.length) {
              await applySessionSnapshot(
                legacy,
                undefined,
                "이 기기의 기존 장면을 복원했습니다. 다음 ZIP부터 작품·세션 보관함에 영구 저장됩니다.",
              );
            }
          }
        }
      } catch {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            await applySessionSnapshot(
              JSON.parse(saved) as SavedSession,
              undefined,
              "온라인 보관함에 연결하지 못해 이 기기의 마지막 장면을 열었습니다.",
            );
          } else {
            setNotice("작품 보관함에 연결하지 못해 독립된 기본 데모 작품을 열었습니다.");
          }
        } catch {
          setNotice("저장된 세션을 읽지 못해 독립된 기본 데모 작품을 열었습니다.");
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setLibraryLoading(false);
        }
      }

    })();
    return () => {
      cancelled = true;
    };
  }, [
    applySessionSnapshot,
    fetchSessionEnvelope,
    rememberSessionRevision,
    setAccount,
    setApiKey,
    setApiKeyDraft,
    setApiMessage,
    setApiStatus,
    setConflictCheckpointId,
    setLibraryLoading,
    setProjects,
    setSessions,
    setSyncConflict,
    setSyncStatus,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const code = multiplayerRoomCode;
    if (!code) return;
    let cancelled = false;
    const loadSharedStory = async (announce = false) => {
      const response = await fetch(
        `/api/multiplayer/rooms/${encodeURIComponent(code)}?story=1`,
        { cache: "no-store" },
      );
      const envelope = await response.json() as MultiplayerStoryEnvelope & { error?: string };
      if (!response.ok || envelope.error || !envelope.room) {
        throw new Error(envelope.error || "공유 이야기를 불러오지 못했습니다.");
      }
      if (cancelled) return;
      setMultiplayerRoom(envelope.room);
      setProjects((items) => [envelope.project, ...items.filter((item) => item.id !== envelope.project.id)]);
      setSessions((items) => [envelope.session, ...items.filter((item) => item.id !== envelope.session.id)]);
      const localRevision = currentSessionRevision(envelope.session.id);
      if (announce || envelope.session.revision > localRevision || activeSessionIdRef.current !== envelope.session.id) {
        rememberSessionRevision(envelope.session.id, envelope.session.revision);
        await applySessionSnapshot(envelope.snapshot, {
          projectId: envelope.project.id,
          sessionId: envelope.session.id,
          sessionName: envelope.session.name,
          hasPackage: envelope.project.hasPackage,
        }, announce ? `멀티플레이 방 ‘${envelope.room.name}’의 공유 이야기를 열었습니다.` : undefined);
        setSurfaceMode("reader");
      }
    };
    void loadSharedStory(true).catch((error) => {
      if (!cancelled) setError(error instanceof Error ? error.message : "멀티플레이 방을 열지 못했습니다.");
    });
    const interval = window.setInterval(() => {
      void loadSharedStory(false).catch(() => undefined);
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    applySessionSnapshot,
    currentSessionRevision,
    hydrated,
    multiplayerRoomCode,
    rememberSessionRevision,
    setProjects,
    setSessions,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot = createOptimizedSessionSnapshot(
      pack,
      state,
      turns,
      longTermMemories,
      totalCostUsd,
      lastMode,
    );
    const snapshotJson = JSON.stringify(snapshot);
    const originSessionId = activeSessionId;
    const cachedEnvelope = sessionEnvelopeCacheRef.current.peek(activeSessionId);
    if (cachedEnvelope) {
      sessionEnvelopeCacheRef.current.set(activeSessionId, {
        ...cachedEnvelope,
        snapshot,
      });
    }
    localStorage.setItem(STORAGE_KEY, snapshotJson);
    if (activeSessionId === BUILT_IN_DEMO_SESSION_ID) {
      localStorage.setItem(DEMO_SESSION_STORAGE_KEY, snapshotJson);
      window.requestAnimationFrame(() => setSyncStatus("saved"));
      return;
    }
    if (activeSessionId === "local-session") {
      return;
    }
    if (lastServerSnapshotJsonRef.current.get(originSessionId) === snapshotJson) {
      window.requestAnimationFrame(() => setSyncStatus("saved"));
      return;
    }
    if (syncConflict) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
        setSyncStatus("saving");
        try {
          const response = await fetch(
            multiplayerRoomCode
              ? `/api/multiplayer/rooms/${encodeURIComponent(multiplayerRoomCode)}/turn`
              : `/api/sessions/${encodeURIComponent(originSessionId)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                snapshot,
                expectedRevision: currentSessionRevision(originSessionId),
                deviceId: getOrCreateDeviceId(),
                ...(multiplayerRoomCode ? {
                  cause: multiplayerCauseRef.current,
                  usage: snapshot.turns.at(-1)?.usage,
                } : {}),
              }),
            },
          );
          const result = (await response.json()) as {
            session?: SessionSummary;
            error?: string;
            conflictCheckpointId?: string | null;
            sidecarWarnings?: string[];
            room?: MultiplayerRoomState;
          };
          if (response.status === 409) {
            if (activeSessionIdRef.current === originSessionId) {
              setSyncConflict(true);
              setConflictCheckpointId(result.conflictCheckpointId ?? null);
              setError(result.conflictCheckpointId
                ? "다른 기기에서 이 세션이 먼저 변경되었습니다. 현재 초안은 복구 기록에 보존했습니다. ‘즉시 새로고침’으로 서버 최신본을 확인해 주세요."
                : "다른 기기에서 이 세션이 먼저 변경되었습니다. 현재 초안은 이 기기에 남아 있습니다. ‘즉시 새로고침’ 전에 필요하면 입력을 복사해 주세요.");
            }
            throw new Error(result.error || "동시 편집 충돌");
          }
          if (!response.ok || !result.session) {
            throw new Error(result.error || "세션 자동 저장 실패");
          }
          rememberSessionRevision(originSessionId, result.session.revision);
          if (result.room) setMultiplayerRoom(result.room);
          multiplayerCauseRef.current = "NORMAL";
          rememberServerSnapshot(originSessionId, snapshot);
          const savedEnvelope = sessionEnvelopeCacheRef.current.peek(originSessionId);
          if (savedEnvelope) {
            sessionEnvelopeCacheRef.current.set(originSessionId, {
              ...savedEnvelope,
              session: result.session,
              snapshot,
            });
          }
          setSessions((items) =>
            items.map((item) =>
              item.id === result.session?.id ? result.session : item,
            ),
          );
          if (activeSessionIdRef.current === originSessionId) {
            setSyncStatus("saved");
            if (result.sidecarWarnings?.length) {
              setNotice(`본문은 저장됐습니다. ${result.sidecarWarnings.join(" · ")}은 다음 저장에서 다시 반영합니다.`);
            }
          }
        } catch {
          if (activeSessionIdRef.current === originSessionId) setSyncStatus("error");
        }
      });
      void saveQueueRef.current;
    }, 850);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeSessionId, currentSessionRevision, hydrated, lastMode, longTermMemories, multiplayerRoomCode, pack, rememberServerSnapshot, rememberSessionRevision, setConflictCheckpointId, setSessions, setSyncConflict, setSyncStatus, state, syncConflict, totalCostUsd, turns]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    const latestTurn = turns.at(-1);
    if (
      latestTurn?.role !== "exchange" ||
      lastAutoScrolledTurnIdRef.current === latestTurn.id
    ) {
      return;
    }
    lastAutoScrolledTurnIdRef.current = latestTurn.id;
    const frame = window.requestAnimationFrame(() => {
      latestUserTurnRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [turns]);

  useEffect(() => {
    if (!settingsOpen && !longTermMemoryOpen && !accountOpen && !checkpointsOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setLongTermMemoryOpen(false);
        setAccountOpen(false);
        setCheckpointsOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen, checkpointsOpen, longTermMemoryOpen, setAccountOpen, setCheckpointsOpen, setSettingsOpen, settingsOpen]);

  const handleOpenAccount = useCallback(() => {
    if (!account?.authenticated) return;
    setAccountOpen(true);
    if (account.role !== "MASTER") return;
    setAuditLoading(true);
    void fetch("/api/admin/audit-logs?limit=80", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { logs?: AuditLogEntry[]; error?: string };
        if (!response.ok) throw new Error(result.error || "감사 로그 연결 실패");
        setAuditLogs(result.logs ?? []);
      })
      .catch((auditError) => {
        setNotice(auditError instanceof Error ? auditError.message : "감사 로그를 불러오지 못했습니다.");
      })
      .finally(() => setAuditLoading(false));
  }, [account, setAccountOpen, setAuditLoading, setAuditLogs]);

  const persistCurrentSessionNow = async () => {
    if (
      activeSessionId === BUILT_IN_DEMO_SESSION_ID ||
      activeSessionId === "local-session"
    ) {
      return;
    }
    if (syncConflict) {
      throw new Error("동시 편집 충돌을 먼저 해결해 주세요.");
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const originSessionId = activeSessionId;
    const originProject = projects.find((item) => item.id === activeProjectId);
    const originSession = sessions.find((item) => item.id === originSessionId);
    const snapshot = createOptimizedSessionSnapshot(
      pack,
      state,
      turns,
      longTermMemories,
      totalCostUsd,
      lastMode,
    );
    await saveQueueRef.current.catch(() => undefined);
    if (originProject && originSession) {
      sessionEnvelopeCacheRef.current.set(originSessionId, {
        project: originProject,
        session: originSession,
        snapshot,
      });
    }
    setSyncStatus("saving");
    const response = await fetch(
      multiplayerRoomCode
        ? `/api/multiplayer/rooms/${encodeURIComponent(multiplayerRoomCode)}/turn`
        : `/api/sessions/${encodeURIComponent(originSessionId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot,
          expectedRevision: currentSessionRevision(originSessionId),
          deviceId: getOrCreateDeviceId(),
          ...(multiplayerRoomCode ? {
            cause: multiplayerCauseRef.current,
            usage: snapshot.turns.at(-1)?.usage,
          } : {}),
        }),
      },
    );
    const result = (await response.json()) as {
      session?: SessionSummary;
      error?: string;
      conflictCheckpointId?: string | null;
      sidecarWarnings?: string[];
      room?: MultiplayerRoomState;
    };
    if (response.status === 409) {
      if (activeSessionIdRef.current === originSessionId) {
        setSyncConflict(true);
        setConflictCheckpointId(result.conflictCheckpointId ?? null);
        setError(result.conflictCheckpointId
          ? "다른 기기에서 이 세션이 먼저 변경되었습니다. 현재 초안은 복구 기록에 보존했습니다. 즉시 새로고침 후 계속해 주세요."
          : "다른 기기에서 이 세션이 먼저 변경되었습니다. 현재 초안은 이 기기에만 남아 있으므로 필요하면 입력을 복사한 뒤 즉시 새로고침해 주세요.");
      }
    }
    if (!response.ok || !result.session) {
      if (activeSessionIdRef.current === originSessionId) setSyncStatus("error");
      throw new Error(result.error || "현재 세션을 저장하지 못했습니다.");
    }
    rememberSessionRevision(originSessionId, result.session.revision);
    if (result.room) setMultiplayerRoom(result.room);
    multiplayerCauseRef.current = "NORMAL";
    rememberServerSnapshot(originSessionId, snapshot);
    if (originProject) {
      sessionEnvelopeCacheRef.current.set(originSessionId, {
        project: originProject,
        session: result.session,
        snapshot,
      });
    }
    setSessions((items) =>
      items.map((item) => item.id === result.session?.id ? result.session : item),
    );
    if (activeSessionIdRef.current === originSessionId) {
      setSyncStatus("saved");
      if (result.sidecarWarnings?.length) {
        setNotice(`본문은 저장됐습니다. ${result.sidecarWarnings.join(" · ")}은 다음 저장에서 다시 반영합니다.`);
      }
    }
  };

  const loadSession = async (sessionId: string, skipCurrentSave = false) => {
    if (
      sessionId === activeSessionId ||
      sessionSwitching ||
      sessionRefreshing ||
      loading
    ) return;
    setSessionSwitching(true);
    setError("");
    setLibraryTab("chats");
    setMobilePanel(null);
    try {
      const envelopePromise = sessionId === BUILT_IN_DEMO_SESSION_ID
        ? undefined
        : fetchSessionEnvelope(sessionId);
      if (!skipCurrentSave) {
        void persistCurrentSessionNow().catch(() => undefined);
      }
      if (sessionId === BUILT_IN_DEMO_SESSION_ID) {
        const savedDemo = localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
        await applySessionSnapshot(
          savedDemo
            ? JSON.parse(savedDemo) as SavedSession
            : createBuiltInDemoSnapshot(),
          {
            projectId: BUILT_IN_DEMO_PROJECT_ID,
            sessionId: BUILT_IN_DEMO_SESSION_ID,
            sessionName: builtInDemoSession.name,
            hasPackage: false,
          },
          "기성학원 기본 데모를 독립 작품으로 열었습니다.",
        );
        setSyncStatus("saved");
        return;
      }
      const envelope = await envelopePromise!;
      rememberSessionRevision(envelope.session.id, envelope.session.revision);
      setSyncConflict(false);
      setConflictCheckpointId(null);
      setProjects((items) =>
        items.map((item) => item.id === envelope.project.id
          ? { ...item, ...envelope.project, sessionCount: item.sessionCount }
          : item),
      );
      setSessions((items) =>
        items.map((item) => item.id === envelope.session.id
          ? envelope.session
          : item),
      );
      await applySessionSnapshot(
        envelope.snapshot,
        {
          projectId: envelope.project.id,
          sessionId: envelope.session.id,
          sessionName: envelope.session.name,
          hasPackage: envelope.project.hasPackage,
        },
        `‘${envelope.session.name}’ 세션으로 전환했습니다.`,
      );
      setLibraryTab("chats");
      setMobilePanel(null);
      setSyncStatus("saved");
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "세션을 불러오지 못했습니다.",
      );
    } finally {
      setSessionSwitching(false);
    }
  };

  const handleRefreshCurrentSession = async () => {
    const targetSessionId = activeSessionIdRef.current;
    if (
      targetSessionId === BUILT_IN_DEMO_SESSION_ID ||
      targetSessionId === "local-session" ||
      sessionRefreshing ||
      sessionSwitching ||
      loading ||
      syncStatus === "saving"
    ) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSessionRefreshing(true);
    setError("");
    setNotice("현재 세션의 최신 온라인 저장본을 확인하고 있습니다.");

    try {
      sessionEnvelopeCacheRef.current.clear();
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(targetSessionId)}?sync=${Date.now()}`,
        { cache: "no-store" },
      );
      const envelope = (await response.json()) as SessionEnvelope;
      if (!response.ok || envelope.error) {
        throw new Error(envelope.error || "최신 세션을 불러오지 못했습니다.");
      }
      if (activeSessionIdRef.current !== targetSessionId) return;

      sessionEnvelopeCacheRef.current.set(targetSessionId, envelope);
      rememberSessionRevision(envelope.session.id, envelope.session.revision);
      setSyncConflict(false);
      setConflictCheckpointId(null);
      setProjects((items) =>
        items.map((item) => item.id === envelope.project.id
          ? { ...item, ...envelope.project, sessionCount: item.sessionCount }
          : item),
      );
      setSessions((items) =>
        items.map((item) => item.id === envelope.session.id
          ? envelope.session
          : item),
      );
      await applySessionSnapshot(
        envelope.snapshot,
        {
          projectId: envelope.project.id,
          sessionId: envelope.session.id,
          sessionName: envelope.session.name,
          hasPackage: envelope.project.hasPackage,
        },
        `‘${envelope.session.name}’의 최신 온라인 저장본으로 동기화했습니다.`,
        input,
      );
      if (activeSessionIdRef.current === targetSessionId) {
        setSyncStatus("saved");
      }
      const libraryResponse = await fetch(`/api/library?sync=${Date.now()}`, {
        cache: "no-store",
      });
      const library = (await libraryResponse.json()) as LibraryResponse;
      if (libraryResponse.ok) {
        (library.sessions ?? []).forEach((session) => {
          rememberSessionRevision(session.id, session.revision);
        });
        setProjects([builtInDemoProject, ...(library.projects ?? [])]);
        setSessions([builtInDemoSession, ...(library.sessions ?? [])]);
        setCostMeterEntries(library.costMeterTurns ?? []);
        setLiveReliabilityAttempts(library.liveReliabilityAttempts ?? []);
      }
    } catch (refreshError) {
      if (activeSessionIdRef.current === targetSessionId) {
        setSyncStatus("error");
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "최신 세션을 불러오지 못했습니다.",
        );
      }
    } finally {
      setSessionRefreshing(false);
    }
  };

  const loadCheckpoints = async () => {
    if (
      activeSessionId === BUILT_IN_DEMO_SESSION_ID ||
      activeSessionId === "local-session"
    ) return;
    setCheckpointsLoading(true);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(activeSessionId)}/checkpoints`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        checkpoints?: SessionCheckpoint[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "복구 기록을 불러오지 못했습니다.");
      setCheckpoints(result.checkpoints ?? []);
    } catch (checkpointError) {
      setError(checkpointError instanceof Error ? checkpointError.message : "복구 기록을 불러오지 못했습니다.");
    } finally {
      setCheckpointsLoading(false);
    }
  };

  const handleOpenCheckpoints = async () => {
    setCheckpointsOpen(true);
    await loadCheckpoints();
  };

  const handleCreateCheckpoint = async () => {
    if (checkpointsLoading || syncConflict) return;
    setCheckpointsLoading(true);
    try {
      await persistCurrentSessionNow();
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(activeSessionId)}/checkpoints`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "복구 지점을 만들지 못했습니다.");
      setNotice("현재 상태를 수동 복구 지점으로 저장했습니다.");
      await loadCheckpoints();
    } catch (checkpointError) {
      setError(checkpointError instanceof Error ? checkpointError.message : "복구 지점을 만들지 못했습니다.");
    } finally {
      setCheckpointsLoading(false);
    }
  };

  const handleRestoreCheckpoint = async (checkpoint: SessionCheckpoint) => {
    if (checkpointsLoading || sessionRefreshing) return;
    if (!window.confirm(`‘${checkpoint.label}’ 상태로 되돌릴까요?\n현재 상태도 안전 백업으로 남습니다.`)) return;
    setSessionRefreshing(true);
    setCheckpointsLoading(true);
    try {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(activeSessionId)}/checkpoints/${encodeURIComponent(checkpoint.id)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: currentSessionRevision(activeSessionId),
            deviceId: getOrCreateDeviceId(),
          }),
        },
      );
      const result = (await response.json()) as {
        session?: SessionSummary;
        snapshot?: SavedSession;
        error?: string;
        code?: string;
      };
      if (!response.ok || !result.session || !result.snapshot) {
        if (response.status === 409) setSyncConflict(true);
        throw new Error(result.error || "복구 기록을 적용하지 못했습니다.");
      }
      rememberSessionRevision(result.session.id, result.session.revision);
      setSyncConflict(false);
      setConflictCheckpointId(null);
      setSessions((items) => items.map((item) => item.id === result.session?.id ? result.session : item));
      sessionEnvelopeCacheRef.current.delete(activeSessionId);
      await applySessionSnapshot(
        result.snapshot,
        {
          projectId: result.session.projectId,
          sessionId: result.session.id,
          sessionName: result.session.name,
          hasPackage: Boolean(activeProject?.hasPackage),
        },
        `‘${checkpoint.label}’ 복구 지점으로 돌아왔습니다. 복구 직전 상태도 별도로 보존했습니다.`,
      );
      setCheckpointsOpen(false);
      setSyncStatus("saved");
    } catch (checkpointError) {
      setError(checkpointError instanceof Error ? checkpointError.message : "복구 기록을 적용하지 못했습니다.");
    } finally {
      setCheckpointsLoading(false);
      setSessionRefreshing(false);
    }
  };

  const handleForkCheckpoint = async (checkpoint: SessionCheckpoint) => {
    if (checkpointsLoading || sessionRefreshing) return;
    setCheckpointsLoading(true);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(activeSessionId)}/checkpoints/${encodeURIComponent(checkpoint.id)}/fork`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
        },
      );
      const result = (await response.json()) as SessionEnvelope;
      if (!response.ok || !result.session || !result.project || !result.snapshot) {
        throw new Error(result.error || "충돌 초안을 새 세션으로 복사하지 못했습니다.");
      }
      setProjects((items) => items.map((item) => item.id === result.project.id
        ? { ...item, ...result.project, sessionCount: item.sessionCount + 1 }
        : item));
      setSessions((items) => [result.session, ...items]);
      rememberSessionRevision(result.session.id, result.session.revision);
      setSyncConflict(false);
      setConflictCheckpointId(null);
      sessionEnvelopeCacheRef.current.set(result.session.id, result);
      await applySessionSnapshot(
        result.snapshot,
        {
          projectId: result.project.id,
          sessionId: result.session.id,
          sessionName: result.session.name,
          hasPackage: result.project.hasPackage,
        },
        "다른 기기와 충돌한 로컬 초안을 독립된 새 세션으로 복사했습니다.",
      );
      setCheckpointsOpen(false);
      setSyncStatus("saved");
    } catch (checkpointError) {
      setError(checkpointError instanceof Error ? checkpointError.message : "충돌 초안을 새 세션으로 복사하지 못했습니다.");
    } finally {
      setCheckpointsLoading(false);
    }
  };

  const handleSelectProject = async (projectId: string) => {
    const target = sessions.find((session) => session.projectId === projectId);
    if (!target) {
      setError("이 작품에는 아직 시작 가능한 세션이 없습니다.");
      return;
    }
    setLibraryTab("chats");
    setMobilePanel(null);
    await loadSession(target.id);
  };

  const prefetchProjectSession = (projectId: string) => {
    const target = sessions.find((session) => session.projectId === projectId);
    if (target) prefetchSession(target.id);
  };

  const handleCreateSession = async (projectId = activeProject?.id) => {
    const targetProject = projects.find((project) => project.id === projectId);
    if (!targetProject || loading || sessionSwitching || sessionRefreshing) {
      setNotice("먼저 작품 탭에서 ScenarioPack ZIP을 불러와 주세요.");
      return;
    }
    setSessionSwitching(true);
    setError("");
    try {
      if (targetProject.id === BUILT_IN_DEMO_PROJECT_ID) {
        localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
        await applySessionSnapshot(
          createBuiltInDemoSnapshot(),
          {
            projectId: BUILT_IN_DEMO_PROJECT_ID,
            sessionId: BUILT_IN_DEMO_SESSION_ID,
            sessionName: builtInDemoSession.name,
            hasPackage: false,
          },
          "기본 데모 이야기를 처음부터 다시 시작했습니다.",
        );
        setLibraryTab("chats");
        setMobilePanel(null);
        setSyncStatus("saved");
        return;
      }
      await persistCurrentSessionNow();
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProject.id }),
      });
      const result = (await response.json()) as {
        session?: SessionSummary;
        snapshot?: SavedSession;
        error?: string;
      };
      if (!response.ok || !result.session || !result.snapshot) {
        throw new Error(result.error || "새 세션을 만들지 못했습니다.");
      }
      setSessions((items) => [result.session!, ...items]);
      setProjects((items) =>
        items.map((item) => item.id === targetProject.id
          ? { ...item, sessionCount: item.sessionCount + 1 }
          : item),
      );
      sessionEnvelopeCacheRef.current.set(result.session.id, {
        project: targetProject,
        session: result.session,
        snapshot: result.snapshot,
      });
      rememberSessionRevision(result.session.id, result.session.revision);
      setSyncConflict(false);
      setConflictCheckpointId(null);
      await applySessionSnapshot(
        result.snapshot,
        {
          projectId: targetProject.id,
          sessionId: result.session.id,
          sessionName: result.session.name,
          hasPackage: targetProject.hasPackage,
        },
        `‘${result.session.name}’을 새로 시작했습니다. 기존 세션과 상태가 완전히 분리됩니다.`,
      );
      setLibraryTab("chats");
      setMobilePanel(null);
      setSyncStatus("saved");
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "새 세션을 만들지 못했습니다.",
      );
    } finally {
      setSessionSwitching(false);
    }
  };

  const handleRenameSession = async (sessionId: string) => {
    if (sessionRefreshing || sessionSwitching || loading) return;
    const name = renameDraft.trim();
    if (!name) return;
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const result = (await response.json()) as {
        session?: SessionSummary;
        error?: string;
      };
      if (!response.ok || !result.session) {
        throw new Error(result.error || "세션 이름을 바꾸지 못했습니다.");
      }
      setSessions((items) =>
        items.map((item) => item.id === sessionId ? result.session! : item),
      );
      const cachedEnvelope = sessionEnvelopeCacheRef.current.peek(sessionId);
      if (cachedEnvelope) {
        sessionEnvelopeCacheRef.current.set(sessionId, {
          ...cachedEnvelope,
          session: result.session,
        });
      }
      if (sessionId === activeSessionId) setActiveSessionName(result.session.name);
      setRenamingSessionId(null);
      setRenameDraft("");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "이름 변경 실패");
    }
  };

  const handleDeleteSession = async (session: SessionSummary) => {
    if (sessionRefreshing || sessionSwitching || loading) return;
    const siblingSessions = sessions.filter(
      (item) => item.projectId === session.projectId && item.id !== session.id,
    );
    if (!siblingSessions.length) {
      setNotice(
        "마지막 세션은 작품 시작점으로 남아야 합니다. 새 이야기를 하나 만든 뒤 이 세션을 삭제해 주세요.",
      );
      return;
    }
    if (!window.confirm(
      `‘${session.name}’ 세션과 모든 대화 기록을 삭제할까요?\n삭제한 세션은 복구할 수 없습니다.`,
    )) return;
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(session.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) {
        throw new Error(result.error || "세션을 삭제하지 못했습니다.");
      }
      sessionEnvelopeCacheRef.current.delete(session.id);
      setSessions((items) => items.filter((item) => item.id !== session.id));
      setProjects((items) =>
        items.map((item) => item.id === session.projectId
          ? { ...item, sessionCount: Math.max(1, item.sessionCount - 1) }
          : item),
      );
      if (session.id === activeSessionId) {
        await loadSession(siblingSessions[0].id, true);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "세션 삭제 실패");
    }
  };

  const handleDeleteProject = async (project: ProjectSummary) => {
    if (
      project.id === BUILT_IN_DEMO_PROJECT_ID ||
      deletingProjectId ||
      loading ||
      sessionSwitching ||
      sessionRefreshing
    ) {
      return;
    }
    const projectSessions = sessions.filter(
      (session) => session.projectId === project.id,
    );
    const storageLabel = project.hasPackage
      ? "온라인 원본 ZIP과 기기 저장 자료"
      : "기기에 저장된 원본 ZIP과 이미지";
    if (!window.confirm(
      `‘${project.title}’ 작품을 삭제할까요?\n\n` +
        `• 채팅 세션 ${projectSessions.length}개와 전체 대화 기록\n` +
        `• 작품 설정 및 ${storageLabel}\n\n` +
        "삭제한 작품은 복구할 수 없습니다.",
    )) return;

    setDeletingProjectId(project.id);
    setError("");
    if (project.id === activeProjectId && saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as {
        deleted?: boolean;
        packageDeleted?: boolean;
        error?: string;
      };
      if (!response.ok || !result.deleted) {
        throw new Error(result.error || "작품을 삭제하지 못했습니다.");
      }

      const sourceStillUsed = projects.some(
        (item) =>
          item.id !== project.id &&
          item.id !== BUILT_IN_DEMO_PROJECT_ID &&
          item.sourceProjectId === project.sourceProjectId,
      );
      let deviceCleanupFailed = false;
      if (!sourceStillUsed) {
        try {
          await forgetPackageData(project.sourceProjectId);
        } catch {
          deviceCleanupFailed = true;
        }
      }

      try {
        await removeCortexProject(project.id);
      } catch {
        deviceCleanupFailed = true;
      }

      projectSessions.forEach((session) => {
        sessionEnvelopeCacheRef.current.delete(session.id);
      });

      setProjects((items) => items.filter((item) => item.id !== project.id));
      setSessions((items) =>
        items.filter((session) => session.projectId !== project.id),
      );

      if (project.id === activeProjectId) {
        await applySessionSnapshot(
          createBuiltInDemoSnapshot(),
          {
            projectId: BUILT_IN_DEMO_PROJECT_ID,
            sessionId: BUILT_IN_DEMO_SESSION_ID,
            sessionName: builtInDemoSession.name,
            hasPackage: false,
          },
        );
        setLibraryTab("works");
        setSyncStatus("idle");
      }

      const cleanupWarning = deviceCleanupFailed || result.packageDeleted === false
        ? " 작품과 세션은 삭제됐지만 일부 원본 저장 공간은 브라우저가 정리하지 못했습니다."
        : "";
      setNotice(`‘${project.title}’ 작품과 연결된 채팅 세션을 삭제했습니다.${cleanupWarning}`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "작품을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleDeleteCortexProject = async (project: ProjectSummary) => {
    if (deletingProjectId || loading || sessionSwitching || sessionRefreshing) return;
    if (!window.confirm(
      `‘${project.title}’ Cortex 작품을 삭제할까요?\n\n` +
        `• 이 기기의 Cortex 세션 ${project.sessionCount}개와 전체 진행 기록\n` +
        "• 설치된 원본 ZIP과 작품 표지\n\n" +
        "삭제한 작품은 복구할 수 없습니다.",
    )) return;

    setDeletingProjectId(project.id);
    setError("");
    try {
      await removeCortexProject(project.id);
      if (cortexSession?.projectId === project.id) setSurfaceMode("home");
      setNotice(`‘${project.title}’ Cortex 작품과 이 기기의 세션을 삭제했습니다.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Cortex 작품을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleProjectThumbnail = async (
    project: ProjectSummary,
    file: File,
  ) => {
    if (project.id === BUILT_IN_DEMO_PROJECT_ID || thumbnailSavingProjectId) return;
    setThumbnailSavingProjectId(project.id);
    setError("");
    try {
      const optimized = await optimizeProjectThumbnail(file);
      const form = new FormData();
      form.append("thumbnail", optimized);
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/thumbnail`,
        { method: "PUT", body: form },
      );
      const result = (await response.json()) as {
        project?: ProjectSummary;
        error?: string;
      };
      if (!response.ok || !result.project) {
        throw new Error(result.error || "작품 썸네일을 저장하지 못했습니다.");
      }
      const savedProject = result.project;
      setProjects((items) => items.map((item) =>
        item.id === project.id ? { ...item, ...savedProject } : item
      ));
      setNotice(`‘${project.title}’ 작품 썸네일을 온라인에 저장했습니다.`);
    } catch (thumbnailError) {
      setError(
        thumbnailError instanceof Error
          ? thumbnailError.message
          : "작품 썸네일 저장 실패",
      );
    } finally {
      setThumbnailSavingProjectId(null);
    }
  };

  const handleDeleteProjectThumbnail = async (project: ProjectSummary) => {
    if (project.id === BUILT_IN_DEMO_PROJECT_ID || thumbnailSavingProjectId) return;
    setThumbnailSavingProjectId(project.id);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/thumbnail`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as {
        project?: ProjectSummary;
        error?: string;
      };
      if (!response.ok || !result.project) {
        throw new Error(result.error || "작품 썸네일을 제거하지 못했습니다.");
      }
      const savedProject = result.project;
      setProjects((items) => items.map((item) =>
        item.id === project.id
          ? { ...item, ...savedProject, thumbnailUrl: savedProject.thumbnailUrl }
          : item
      ));
      setNotice(`‘${project.title}’ 작품 썸네일을 제거했습니다.`);
    } catch (thumbnailError) {
      setError(
        thumbnailError instanceof Error
          ? thumbnailError.message
          : "작품 썸네일 제거 실패",
      );
    } finally {
      setThumbnailSavingProjectId(null);
    }
  };

  const importScenarioPackFile = async (
    file: File,
    inputElement?: HTMLInputElement,
    projectThumbnail?: File,
    libraryOnly = false,
  ) => {
    let pendingUploadId = "";
    const updateImportProgress = (
      value: number,
      phase: string,
      detail: string,
      status: ImportProgressState["status"] = "running",
    ) => {
      setImportProgress((current) => ({
        value: status === "error"
          ? Math.max(current?.value ?? 2, Math.min(100, Math.round(value)))
          : Math.max(current?.value ?? 0, Math.min(100, Math.round(value))),
        phase,
        detail,
        fileName: file.name,
        fileSize: formatPackageSize(file.size),
        status,
      }));
    };
    try {
      setLoading(true);
      setError("");
      updateImportProgress(
        2,
        "ScenarioPack 불러오기 시작",
        "파일 형식과 크기를 먼저 확인합니다.",
      );
      if (file.size > MAX_SCENARIO_PACKAGE_BYTES) {
        throw new Error("ScenarioPack ZIP은 최대 1GB까지 불러올 수 있습니다.");
      }
      if (file.size > 40 * 1024 * 1024) {
        setNotice(
          "대용량 ZIP의 파일 목록과 JSON을 먼저 읽는 중입니다. 이미지는 필요한 장면에서 꺼냅니다…",
        );
      }
      const parsedPack = await parseScenarioPackFile(file, {
        onProgress: ({ ratio, phase, detail }) => {
          updateImportProgress(4 + ratio * 56, phase, detail);
        },
      });
      updateImportProgress(
        63,
        "세계관 분석 완료",
        "초기 상태와 첫 장면을 구성하고 있습니다.",
      );
      const { pack: nextPack, mediaUrls: nextMediaUrls } =
        detachScenarioMedia(parsedPack);
      const nextState = createInitialState(nextPack);
      const nextSnapshot: SavedSession = {
        pack: nextPack,
        state: nextState,
        turns: [createOpeningTurnWithStatus(nextPack, nextState)],
        longTermMemories: [],
        totalCostUsd: 0,
        lastMode: "mock",
      };
      const transfer = serializeProjectImport(
        file.size,
        nextPack,
        nextSnapshot,
        projectThumbnail?.size ?? 0,
      );
      const usesMultipartUpload = transfer.usesMultipartUpload;
      const needsArchive =
        nextPack.mediaAssets.length > Object.keys(nextMediaUrls).length;
      let archivePersisted = false;
      if (needsArchive) {
        updateImportProgress(
          67,
          "대용량 이미지 원본 보관 중",
          "필요한 장면에서 바로 꺼낼 수 있도록 이 기기에 저장합니다.",
        );
        try {
          await requestPersistentPackageStorage();
          await rememberPackageArchive(nextPack.projectId, file, file.name);
          archivePersisted = true;
        } catch {
          // The in-memory archive remains usable in this tab.
        }
      }
      updateImportProgress(
        74,
        "캐릭터·장면 이미지 등록 중",
        `${nextPack.mediaAssets.length.toLocaleString("ko-KR")}개 이미지 연결 정보를 준비합니다.`,
      );
      let mediaNotice =
        " 패키지 원본과 채팅 세션을 계정 온라인 보관함에 저장했습니다. 같은 계정이면 다른 기기에서도 자동으로 복원됩니다.";
      if (needsArchive && !archivePersisted) {
        mediaNotice += " 기기 이미지 캐시에 실패해 필요할 때 온라인 원본에서 다시 불러옵니다.";
      }
      if (nextPack.mediaAssets.length > 0) {
        try {
          await rememberPackageMedia(nextPack.projectId, nextMediaUrls, nextPack.mediaAssets);
          if (Object.keys(nextMediaUrls).length > 0) {
            mediaNotice += ` 캐릭터·장면 이미지 ${Object.keys(nextMediaUrls).length}개도 이 기기에 캐시했습니다.`;
          } else if (archivePersisted) {
            mediaNotice += " 이미지는 필요한 장면에서 기기 저장본을 읽습니다.";
          }
        } catch {
          if (archivePersisted) {
            mediaNotice += " 이미지는 필요한 장면에서 기기 저장본을 읽습니다.";
          }
        }
      }
      updateImportProgress(
        82,
        usesMultipartUpload ? "원본 온라인 분리 보관 중" : "시뮬레이션 세션 구성 중",
        usesMultipartUpload
          ? "원본 ZIP과 작품 설정을 안전한 요청 크기로 나눠 계정 보관함에 올리고 있습니다."
          : "작품과 독립된 첫 채팅 세션을 만들고 있습니다.",
      );
      const form = new FormData();
      if (usesMultipartUpload) {
        const staged = await uploadScenarioPackageMultipart(file, (ratio) => {
          updateImportProgress(
            82 + ratio * 13,
            "원본 온라인 분리 보관 중",
            `${Math.round(ratio * 100)}% 업로드했습니다. 다른 기기에서도 이 원본을 자동으로 사용합니다.`,
          );
        });
        pendingUploadId = staged.uploadId;
        form.append("stagedUploadId", staged.uploadId);
        form.append("stagedParts", JSON.stringify(staged.parts));
      } else {
        form.append("file", file);
      }
      form.append("pack", transfer.packJson);
      form.append("snapshot", transfer.snapshotJson);
      if (projectThumbnail) form.append("thumbnail", projectThumbnail);
      updateImportProgress(
        usesMultipartUpload ? 96 : 85,
        "계정 작품 보관함 등록 중",
        "원본 ZIP과 작품 설정, 첫 채팅 세션을 하나로 연결하고 있습니다.",
      );
      const { ok, result } = await uploadScenarioProject(form, (ratio) => {
        updateImportProgress(
          (usesMultipartUpload ? 96 : 85) + ratio * (usesMultipartUpload ? 1 : 11),
          "계정 작품 보관함 등록 중",
          usesMultipartUpload
            ? "업로드한 원본과 첫 채팅 세션을 연결하고 있습니다."
            : `${Math.round(ratio * 100)}% 업로드했습니다.`,
        );
      });
      if (!ok || !result.project || !result.session) {
        throw new Error(result.error || "패키지를 작품 보관함에 저장하지 못했습니다.");
      }
      pendingUploadId = "";
      updateImportProgress(
        97,
        "첫 장면 여는 중",
        `${nextPack.title}의 상태 장부와 대화를 연결하고 있습니다.`,
      );
      setProjects((items) => [result.project!, ...items]);
      setSessions((items) => [result.session!, ...items]);
      rememberSessionRevision(result.session.id, result.session.revision);
      if (libraryOnly) {
        setNotice(`${nextPack.title}을 내 서재에 추가했습니다.`);
        return;
      }
      setSyncConflict(false);
      setConflictCheckpointId(null);
      await applySessionSnapshot(
        nextSnapshot,
        {
          projectId: result.project.id,
          sessionId: result.session.id,
          sessionName: result.session.name,
          hasPackage: result.project.hasPackage,
        },
        `${nextPack.title}의 새 시뮬레이션을 시작했습니다. 자율 배우 ${nextPack.autonomyActors.length}개와 관계 이유 기억 ${nextPack.initialRelationshipMemories.length}개를 장부에 연결했습니다.${mediaNotice}${nextPack.compatibility?.fullSupport ? ` Studio Package ${nextPack.packageVersion} 완전 호환 검증을 통과했습니다(SHA-256 원본 ${nextPack.assetLedger?.physicalAssetCount ?? 0}개).` : nextPack.compatibility?.supportedPackageVersion ? ` Package ${nextPack.packageVersion} 기본 호환으로 열었습니다: ${nextPack.compatibility.warnings.join(" · ")}` : ""} 숨은 설정은 본문에 직접 노출되지 않습니다.`,
      );
      setLibraryTab("chats");
      setSyncStatus("saved");
      setMobilePanel(null);
      updateImportProgress(
        100,
        "시뮬레이션 준비 완료",
        `${nextPack.title}의 첫 채팅 세션을 열었습니다.`,
        "complete",
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 520));
    } catch (fileError) {
      if (pendingUploadId) {
        await fetch(`/api/projects/uploads/${encodeURIComponent(pendingUploadId)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      const message = fileError instanceof Error
        ? fileError.message
        : "ScenarioPack을 불러오지 못했습니다.";
      setError(
        message,
      );
      updateImportProgress(
        0,
        "불러오기가 중단되었습니다",
        message,
        "error",
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 850));
      if (libraryOnly) throw new Error(message);
    } finally {
      if (inputElement) inputElement.value = "";
      setImportProgress(null);
      setLoading(false);
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    if(runtimeEngine==="cortex"){openCortex({id:crypto.randomUUID(),projectId:"cortex-import-"+crypto.randomUUID(),name:file.name.replace(/\.zip$/i,"")});setCortexFile(file);setSurfaceMode("reader");inputElement.value="";return;}
    await importScenarioPackFile(file, inputElement);
    setSurfaceMode("reader");
  };

  const handleInstallHubWork = async (work: HubWorkSummary) => {
    try {
      setError("");
      setNotice(`너름에서 ‘${work.title}: ${work.subtitle}’ 패키지를 받고 있습니다…`);
      let file: File | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2 && !file; attempt += 1) {
        try {
          const response = await fetch(
            `/api/hub/works/${encodeURIComponent(work.slug)}/download?fresh=${Date.now().toString(36)}-${attempt}`,
            { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
          );
          if (!response.ok) {
            const result = await response.json().catch(() => ({})) as { error?: string };
            throw new Error(result.error || "너름 작품을 내려받지 못했습니다.");
          }
          const bytes = await response.arrayBuffer();
          await validateHubPackageBytes(bytes, work);
          file = new File([bytes], `${work.slug}-v${work.packageVersion}.zip`, {
            type: "application/zip",
          });
        } catch (reason) {
          lastError = reason;
        }
      }
      if (!file) throw lastError instanceof Error
        ? lastError
        : new Error("너름 작품을 내려받지 못했습니다.");
      const projectThumbnail = await optimizeProjectThumbnail(
        await downloadHubCoverFile(work.coverUrl, work.title),
      );
      await importScenarioPackFile(file, undefined, projectThumbnail, true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "너름 작품을 가져오지 못했습니다.";
      setError(message);
      throw new Error(message);
    }
  };

  const handleRestoreHubCover = useCallback(async (
    work: HubWorkSummary,
    project: Pick<ProjectSummary,'id'>,
  ) => {
    const cover = await optimizeProjectThumbnail(
      await downloadHubCoverFile(work.coverUrl, work.title),
    );
    const form = new FormData();
    form.append("thumbnail", cover);
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project.id)}/thumbnail`,
      { method: "PUT", body: form },
    );
    const result = (await response.json()) as { project?: ProjectSummary; error?: string };
    if (!response.ok || !result.project) {
      throw new Error(result.error || "너름 작품 표지를 복구하지 못했습니다.");
    }
    const savedProject = result.project;
    setProjects((items) => items.map((item) =>
      item.id === project.id ? { ...item, ...savedProject } : item
    ));
  }, []);

  const openSettings = (tab: SettingsTab = "connection") => {
    setSettingsTab(tab);
    setApiKeyDraft(apiKey);
    setShowApiKey(false);
    setSettingsOpen(true);
    setMobilePanel(null);
  };

  useEffect(() => {
    if (!hydrated || !account?.authenticated) return;
    const url = new URL(window.location.href);
    const panel = url.searchParams.get('panel');
    if (panel !== 'account' && panel !== 'settings') return;
    if (panel === 'account') handleOpenAccount();
    else openSettings('connection');
    url.searchParams.delete('panel');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, [hydrated, account?.authenticated, handleOpenAccount]);

  const handleConnectApi = async () => {
    const candidate = apiKeyDraft.trim();
    if (!candidate || apiStatus === "testing") return;
    const provider = deviceTextProvider(), run = ++apiKeyOperationRef.current;
    const current = () => run === apiKeyOperationRef.current && provider === deviceTextProvider();
    setApiStatus("testing");
    setApiMessage(`${TEXT_PROVIDERS[provider].label} 연결을 확인하고 있습니다.`);
    let storageMessage = " 이번 탭에서만 유지됩니다.";
    try {
      // Save the explicit input even if the subsequent connection test is
      // offline, rate limited or temporarily unavailable.
      if (rememberApiKey) {
        try {
          await rememberApiKeyOnDevice(candidate, provider);
          storageMessage = " 이 기기에 암호화하여 기억했습니다.";
        } catch {
          if (current()) setRememberApiKey(false);
          storageMessage =
            " 이 브라우저에서 암호화 저장을 사용할 수 없어 이번 탭에서만 유지됩니다.";
        }
      } else {
        await forgetRememberedApiKey(provider);
      }
      if (!current()) return;
      const result = await testApiConnection(candidate, provider);
      if (!current()) return;
      if(provider==='openai')applyOpenAIImageKey(candidate);
      setApiKey(candidate);
      setApiStatus("connected");
      setApiMessage(
        `${result.model || TEXT_PROVIDERS[provider].model} 연결을 확인했습니다.${storageMessage}`,
      );
      setNotice(`${result.model} API가 연결되었습니다. 다음 입력부터 실제 API를 사용합니다.`);
      setError("");
    } catch (connectionError) {
      if (!current()) return;
      setApiKey("");
      setApiStatus("error");
      setApiMessage(
        (connectionError instanceof Error
          ? connectionError.message
          : "API 연결을 확인하지 못했습니다.") + storageMessage,
      );
    }
  };

  const handleRememberApiKeyChange = async (remember: boolean) => {
    setRememberApiKey(remember);
    if (!remember) {
      await forgetRememberedApiKey();
      if (apiStatus === "connected") {
        setApiMessage(
          "현재 연결은 유지합니다. 저장된 API 키는 이 기기에서 삭제했습니다.",
        );
      }
      return;
    }

    if (apiStatus === "connected" && apiKey) {
      try {
        await rememberApiKeyOnDevice(apiKey);
        setApiMessage("현재 API 키를 암호화하여 이 기기에 기억했습니다.");
      } catch {
        setRememberApiKey(false);
        setApiMessage(
          "이 브라우저에서는 암호화 저장을 사용할 수 없습니다. 현재 연결은 이번 탭에서만 유지됩니다.",
        );
      }
    }
  };

  const handleDisconnectApi = async () => {
    apiKeyOperationRef.current++;
    await forgetRememberedApiKey();
    if(deviceTextProvider()==='openai')applyOpenAIImageKey('');
    setApiKey("");
    setApiKeyDraft("");
    setShowApiKey(false);
    setApiStatus("disconnected");
    setApiMessage(
      "연결을 해제했습니다. 저장된 API 키도 이 기기에서 삭제했습니다.",
    );
    setLastMode("mock");
    setNotice("OpenAI API 연결을 해제했습니다. 이후 대화는 모의 엔진으로 진행됩니다.");
  };

  const ensurePackageMediaAsset = useCallback((
    asset: ScenarioMediaAsset,
  ): Promise<string | undefined> => {
    const stored = mediaUrls[asset.id];
    if (stored) return Promise.resolve(stored);
    if (asset.source === "generated") return Promise.resolve(undefined);

    const currentJob = packageMediaPromisesRef.current.get(asset.id);
    if (currentJob) return currentJob;
    const originSessionId = activeSessionIdRef.current;
    const job = (async () => {
      try {
        const archive = await restorePackageArchive(pack.projectId);
        if (!archive) return undefined;
        const dataUrl = await extractScenarioMediaDataUrl(archive, asset);
        if (activeSessionIdRef.current !== originSessionId) return undefined;
        setMediaUrls((urls) => ({ ...urls, [asset.id]: dataUrl }));
        try {
          await rememberPackageMediaAsset(pack.projectId, asset.id, dataUrl, asset.assetRef);
        } catch {
          // The extracted image remains available in the current tab.
        }
        return dataUrl;
      } catch {
        return undefined;
      } finally {
        packageMediaPromisesRef.current.delete(asset.id);
      }
    })();
    packageMediaPromisesRef.current.set(asset.id, job);
    return job;
  }, [mediaUrls, pack.projectId]);

  const addCumulativeImageCost = useCallback((
    _sessionId: string,
    turnId: string,
    cost: ImageCostBreakdown,
  ) => {
    const entryId = `call:${turnId}`;
    setCostMeterEntries((entries) => entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            imageCostUsd: entry.imageCostUsd + cost.totalCostUsd,
            imageCosts: [...(entry.imageCosts ?? []), cost],
          }
        : entry,
    ));
  }, []);

  useEffect(() => {
    if (!hydrated || !playerStatusAsset || mediaUrls[playerStatusAsset.id]) return;
    void ensurePackageMediaAsset(playerStatusAsset);
  }, [ensurePackageMediaAsset, hydrated, mediaUrls, playerStatusAsset]);

  const generateCharacterVisual = useCallback((
    turnId: string,
    cue: CharacterVisualCue,
    force = false,
  ): Promise<{ characterId: string; imageUrl: string } | undefined> => {
    if (syncConflict) return Promise.resolve(undefined);
    const originSessionId = activeSessionIdRef.current;
    const originStoryRevision = storyRevisionRef.current;
    const jobKey = `${turnId}:${cue.characterId}`;
    if (force) characterJobPromisesRef.current.delete(jobKey);
    const currentJob = characterJobPromisesRef.current.get(jobKey);
    if (currentJob) return currentJob;

    const authoritativePackageAsset =
      selectPackageCharacterReferenceAsset(pack, cue.characterId) ??
      selectPackageCharacterReferenceAsset(pack, cue.characterName);
    const storedReference = authoritativePackageAsset
      ? mediaUrls[authoritativePackageAsset.id]
      : mediaUrls[cue.canonicalAssetId];
    if (storedReference) {
      return Promise.resolve({
        characterId: cue.characterId,
        imageUrl: storedReference,
      });
    }

    const job = (async () => {
      setCharacterImageJobs((jobs) => ({ ...jobs, [jobKey]: "loading" }));
      try {
        const packagedAsset = authoritativePackageAsset ??
          mediaAssetById.get(cue.canonicalAssetId);
        if (packagedAsset && packagedAsset.source !== "generated") {
          const packagedImage = await ensurePackageMediaAsset(packagedAsset);
          if (packagedImage) {
            setCharacterImageJobs((jobs) => {
              const next = { ...jobs };
              delete next[jobKey];
              return next;
            });
            return {
              characterId: cue.characterId,
              imageUrl: packagedImage,
            };
          }
          throw new Error(
            `${cue.characterName}의 패키지 기준 이미지를 불러오지 못해 임의 외형 생성을 중지했습니다. 작품 ZIP을 다시 불러오거나 페이지를 한 번 새로고침해 주세요.`,
          );
        }
        const prompt = [
          `한국 TV 애니메이션을 보다가 일시정지한 듯한 ${imageAspectPrompt(state.imageAspect)}의 신규 주요 캐릭터 첫 등장.`,
          `작품: ${pack.title}. 장르: ${pack.genre}.`,
          `캐릭터 이름: ${cue.characterName}.`,
          `앞으로 모든 그림에서 절대 바뀌면 안 되는 시각 기준: ${cue.appearancePrompt}.`,
          `현재 배경: ${state.location}. 인물 한 명이 중심이 되는 자연스러운 첫 등장 구도, 얼굴과 머리·대표 복장이 분명히 보이는 3/4 또는 전신 숏.`,
          pack.turnPresentation.sceneImage.styleHint,
          "캐릭터 설정표나 카드가 아니라 실제 애니메이션 본편 장면. 화면 속 글자, 이름표, 말풍선, 워터마크 없음.",
        ].filter(Boolean).join(" ");
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            apiKey: await openaiKeyForLegacy(apiKey),
            ...(multiplayerRoom?.settings ? { provider: multiplayerRoom.settings } : {}),
            purpose: "character",
            quality: state.imageQuality,
            aspect: state.imageAspect,
            referenceImages: [],
          }),
        });
        const result = (await response.json()) as {
          imageUrl?: string;
          estimatedCostUsd?: number;
          cost?: ImageCostBreakdown;
          error?: string;
        };
        if (!response.ok || !result.imageUrl) {
          throw new Error(result.error || `${cue.characterName} 기준 이미지를 만들지 못했습니다.`);
        }
        if (
          activeSessionIdRef.current !== originSessionId ||
          storyRevisionRef.current !== originStoryRevision
        ) return undefined;
        const playbackImageUrl = await resizeGeneratedImage(
          result.imageUrl,
          state.imageResolution,
          state.imageAspect,
        );
        if (
          activeSessionIdRef.current !== originSessionId ||
          storyRevisionRef.current !== originStoryRevision
        ) return undefined;
        const generatedImageCost = result.cost;
        const generatedImageCostUsd = generatedImageCost?.totalCostUsd ?? result.estimatedCostUsd ?? 0;

        const assetId = characterVisualAssetId(cue.characterId);
        const generatedAsset: ScenarioMediaAsset = {
          id: assetId,
          path: `generated/characters/${cue.characterId}/canonical-${state.imageResolution}-${state.imageAspect}.jpg`,
          kind: "character",
          characterId: cue.characterId,
          characterName: cue.characterName,
          label: "AI 시각 기준본",
          emotionTags: ["canonical", "default", "calm"],
          sceneTags: ["first-major-appearance"],
          placement: "after_block",
          priority: 1200,
          alt: `${cue.characterName}의 첫 등장 애니메이션 기준 이미지`,
          caption: cue.characterName,
          source: "generated",
          canonical: true,
        };
        setPack((current) => ({
          ...current,
          mediaAssets: [
            ...(current.mediaAssets ?? []).filter((asset) => asset.id !== assetId),
            generatedAsset,
          ],
        }));
        setMediaUrls((urls) => ({ ...urls, [assetId]: playbackImageUrl }));
        setTurns((items) =>
          items.map((turn) => {
            if (turn.id !== turnId) return turn;
            return {
              ...turn,
              imageCostUsd: (turn.imageCostUsd ?? 0) + generatedImageCostUsd,
              imageCosts: generatedImageCost
                ? [...(turn.imageCosts ?? []), generatedImageCost]
                : turn.imageCosts,
              blocks: turn.blocks.map((block, blockIndex) =>
                blockIndex === cue.blockIndex
                  ? { ...block, mediaAssetId: assetId }
                  : block,
              ),
              characterVisuals: (turn.characterVisuals ?? []).map((visual) =>
                visual.characterId === cue.characterId
                  ? {
                      ...visual,
                      canonicalAssetId: assetId,
                      source: "generated" as const,
                    }
                  : visual,
              ),
            };
          }),
        );
        setState((current) => {
          const profiles = current.characterVisuals ?? [];
          const nextProfile = {
            characterId: cue.characterId,
            characterName: cue.characterName,
            appearancePrompt: cue.appearancePrompt,
            assetId,
            source: "generated" as const,
            introducedTurn: current.turn,
          };
          return {
            ...current,
            characterVisuals: profiles.some(
              (profile) => profile.characterId === cue.characterId,
            )
              ? profiles.map((profile) =>
                  profile.characterId === cue.characterId
                    ? { ...profile, ...nextProfile }
                    : profile,
                )
              : [...profiles, nextProfile],
          };
        });
        try {
          await rememberPackageMediaAsset(pack.projectId, assetId, playbackImageUrl);
        } catch {
          setNotice(
            `${cue.characterName} 기준 이미지는 생성했지만 브라우저 영구 저장에 실패해 현재 탭에서만 유지됩니다.`,
          );
        }
        setCharacterImageJobs((jobs) => {
          const next = { ...jobs };
          delete next[jobKey];
          return next;
        });
        setTotalCostUsd(
          (cost) => cost + generatedImageCostUsd,
        );
        if (generatedImageCost) addCumulativeImageCost(originSessionId, turnId, generatedImageCost);
        return { characterId: cue.characterId, imageUrl: playbackImageUrl };
      } catch (visualError) {
        setCharacterImageJobs((jobs) => ({ ...jobs, [jobKey]: "error" }));
        setNotice(
          visualError instanceof Error
            ? visualError.message
            : `${cue.characterName} 기준 이미지를 만들지 못했습니다.`,
        );
        return undefined;
      }
    })();
    characterJobPromisesRef.current.set(jobKey, job);
    return job;
  }, [addCumulativeImageCost, apiKey, ensurePackageMediaAsset, mediaAssetById, mediaUrls, multiplayerRoom?.settings, pack, state.imageAspect, state.imageQuality, state.imageResolution, state.location, syncConflict]);

  const collectCharacterReferences = useCallback((
    characterIds: string[],
    freshReferences: Array<{ characterId: string; imageUrl: string }> = [],
  ): Promise<string[]> => {
    const fresh = new Map(
      freshReferences.map((reference) => [reference.characterId, reference.imageUrl]),
    );
    return Promise.all(characterIds.map(async (characterId) => {
      const profile = (state.characterVisuals ?? []).find(
        (item) => item.characterId === characterId,
      );
      const packageAsset =
        selectPackageCharacterReferenceAsset(pack, characterId) ??
        (profile
          ? selectPackageCharacterReferenceAsset(pack, profile.characterName)
          : undefined);
      if (packageAsset) {
        const packageImage = mediaUrls[packageAsset.id] ??
          await ensurePackageMediaAsset(packageAsset);
        if (!packageImage) {
          throw new Error(
            `${profile?.characterName || packageAsset.characterName || "등장인물"}의 패키지 기준 이미지를 불러오지 못해 장면 이미지 생성을 중지했습니다.`,
          );
        }
        return packageImage;
      }
      const justGenerated = fresh.get(characterId);
      if (justGenerated) return justGenerated;
      const asset = selectCharacterReferenceAsset(pack, characterId);
      return mediaUrls[asset?.id ?? ""] ?? mediaUrls[profile?.assetId ?? ""];
    })).then((references) =>
      [...new Set(references.filter((imageUrl): imageUrl is string => Boolean(imageUrl)))]
        .slice(0, 2),
    );
  }, [ensurePackageMediaAsset, mediaUrls, pack, state.characterVisuals]);

  const generateSceneImage = async (
    turnId: string,
    prompt: string,
    referenceImages: string[] = [],
    quality: ImageQuality = state.imageQuality,
    referenceAssetIds: string[] = [],
    resolution: ImageResolution = state.imageResolution,
    aspect: ImageAspect = state.imageAspect,
  ) => {
    const originSessionId = activeSessionIdRef.current;
    const originStoryRevision = storyRevisionRef.current;
    setImageJobs((jobs) => ({ ...jobs, [turnId]: "loading" }));
    try {
      const framedPrompt = `${prompt} 최종 출력은 ${imageAspectPrompt(aspect)}으로 구성한다.`;
      const continuityPrompt = referenceImages.length > 0
        ? `${framedPrompt} 첨부된 캐릭터 기준 이미지는 선택 참고가 아니라 동일 인물을 판별하는 절대 기준이다. 얼굴형, 눈, 머리 모양과 색, 체형, 대표 복장과 고유 장식을 다시 디자인하거나 다른 인물로 바꾸지 않는다. 장면에 맞는 표정, 자세, 카메라 구도만 자연스럽게 바꾼다.`
        : framedPrompt;
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: continuityPrompt,
          apiKey: await openaiKeyForLegacy(apiKey),
          ...(multiplayerRoom?.settings ? { provider: multiplayerRoom.settings } : {}),
          purpose: "scene",
          quality,
          aspect,
          referenceImages,
        }),
      });
      const result = (await response.json()) as {
        imageUrl?: string;
        estimatedCostUsd?: number;
        cost?: ImageCostBreakdown;
        error?: string;
      };
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.error || "장면 이미지를 만들지 못했습니다.");
      }
      if (
        activeSessionIdRef.current !== originSessionId ||
        storyRevisionRef.current !== originStoryRevision
      ) return;
      const playbackImageUrl = await resizeGeneratedImage(
        result.imageUrl,
        resolution,
        aspect,
      );
      if (
        activeSessionIdRef.current !== originSessionId ||
        storyRevisionRef.current !== originStoryRevision
      ) return;
      const generatedImageCost = result.cost;
      const generatedImageCostUsd = generatedImageCost?.totalCostUsd ?? result.estimatedCostUsd ?? 0;
      setTurns((items) =>
        retainRecentGeneratedSceneImages(
          items.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  imageCostUsd: (turn.imageCostUsd ?? 0) + generatedImageCostUsd,
                  imageCosts: generatedImageCost
                    ? [...(turn.imageCosts ?? []), generatedImageCost]
                    : turn.imageCosts,
                  imageUrl: playbackImageUrl,
                  imageQuality: quality,
                  imageResolution: resolution,
                  imageAspect: aspect,
                  imageReferenceAssetIds: [...new Set(referenceAssetIds)].slice(0, 2),
                }
              : turn,
          ),
        )
      );
      setImageJobs((jobs) => {
        const next = { ...jobs };
        delete next[turnId];
        return next;
      });
      setTotalCostUsd(
        (cost) => cost + generatedImageCostUsd,
      );
      if (generatedImageCost) addCumulativeImageCost(originSessionId, turnId, generatedImageCost);
    } catch (imageError) {
      setImageJobs((jobs) => ({ ...jobs, [turnId]: "error" }));
      setNotice(
        imageError instanceof Error
          ? imageError.message
          : "장면 이미지를 만들지 못했습니다.",
      );
    }
  };

  useEffect(() => {
    if (apiStatus !== "connected") return;
    setCharacterImageJobs((jobs) => {
      const failedKeys = Object.entries(jobs)
        .filter(([, status]) => status === "error")
        .map(([key]) => key);
      if (!failedKeys.length) return jobs;
      failedKeys.forEach((key) => characterJobPromisesRef.current.delete(key));
      const next = { ...jobs };
      failedKeys.forEach((key) => delete next[key]);
      return next;
    });
  }, [apiKey, apiStatus]);

  useEffect(() => {
    if (!hydrated) return;
    const visiblePackageAssetIds = new Set(
      turns.flatMap((turn) =>
        turn.blocks
          .map((block) => block.mediaAssetId)
          .filter((assetId): assetId is string => Boolean(assetId)),
      ),
    );
    visiblePackageAssetIds.forEach((assetId) => {
      if (mediaUrls[assetId]) return;
      const asset = mediaAssetById.get(assetId);
      if (asset && asset.source !== "generated") {
        void ensurePackageMediaAsset(asset);
      }
    });
  }, [ensurePackageMediaAsset, hydrated, mediaAssetById, mediaUrls, turns]);

  useEffect(() => {
    if (!hydrated) return;
    turns.forEach((turn) => {
      (turn.characterVisuals ?? []).forEach((cue) => {
        const block = turn.blocks[cue.blockIndex];
        if (block?.mediaAssetId && mediaUrls[block.mediaAssetId]) return;
        const jobKey = `${turn.id}:${cue.characterId}`;
        if (!characterJobPromisesRef.current.has(jobKey)) {
          void generateCharacterVisual(turn.id, cue);
        }
      });
    });
  }, [generateCharacterVisual, hydrated, mediaUrls, turns]);

  const handleManualEventAction = (action: "advance" | "close") => {
    if (loading || sessionSwitching || sessionRefreshing || syncConflict) return;
    const result = action === "advance"
      ? advanceClaudeBeatManually(pack, state)
      : closeClaudeEventManually(pack, state);
    if (!result.changed) {
      setNotice(result.message);
      return;
    }
    const snapshot: UndoSnapshot = {
      state,
      turns,
      longTermMemories,
      totalCostUsd,
      lastMode,
    };
    setUndoStack((items) => [...items.slice(-9), snapshot]);
    storyRevisionRef.current += 1;
    setState(result.state);
    setError("");
    setNotice(result.message);
  };

  const handleAdvance = async (
    advanceMode: "player" | "canonical" = "player",
    generationMode: "instant" | "planned_recovery" = "instant",
    retryUserText?: string,
  ) => {
    const userText = advanceMode === "canonical" ? "" : (retryUserText ?? input).trim();
    if (
      (advanceMode === "player" && !userText) ||
      loading ||
      sessionSwitching ||
      sessionRefreshing ||
      syncConflict ||
      !multiplayerCanWrite
    ) {
      return;
    }

    const originSessionId = activeSessionIdRef.current;
    const originStoryRevision = storyRevisionRef.current;
    const recoveryContext = generationMode === "planned_recovery" && failedDraft?.narration
      ? { failedNarration: failedDraft.narration, failureReasons: failedDraft.reasons }
      : undefined;

    const snapshot: UndoSnapshot = {
      state,
      turns,
      longTermMemories,
      totalCostUsd,
      lastMode,
    };
    setUndoStack((items) => [...items.slice(-9), snapshot]);
    if (advanceMode === "player") setInput("");
    setError("");
    setFailedDraft(null);
    setShowFailedDraft(false);
    setNotice("");
    setFinalRevealAnnouncement("");
    setLoading(true);
    setStreamStatus(generationMode === "planned_recovery"
      ? "실패 원인을 분석해 작업계획을 구상하는 중"
      : "이번 장면의 입력만 압축하는 중");

    const streamedTurnId = createId();
    const abortController = new AbortController();
    simulationAbortRef.current?.abort();
    simulationAbortRef.current = abortController;
    const previewTurn: TurnRecord = {
      id: streamedTurnId,
      turn: state.turn + 1,
      appVersion: APP_VERSION,
      role: "exchange",
      userText: advanceMode === "player" ? userText : undefined,
      advanceMode,
      blocks: [],
      recommendations: [],
      createdAt: new Date().toISOString(),
    };
    const recordLiveAttempt = (snapshot: NonNullable<EngineTurnResponse["usage"]>["liveReliability"]) => {
      if (!snapshot || !activeProjectId || !activeSessionId) return;
      const entry = liveReliabilityEntry(activeProjectId, activeSessionId, snapshot);
      setLiveReliabilityAttempts((items) =>
        mergeLiveReliabilityEntries(items, [entry])
      );
      void persistLiveReliabilityEntry(entry).catch(() => undefined);
    };

    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const simulationBody = JSON.stringify({
        pack,
        state,
        userText,
        advanceMode,
        generationMode,
        recoveryContext,
        ...(multiplayerRoom?.settings ? { provider: multiplayerRoom.settings } : {}),
        ...(multiplayerRoomCode ? {
          multiplayer: {
            roomCode: multiplayerRoomCode,
            cause: multiplayerCauseRef.current,
          },
        } : {}),
        recentTurns: turns.slice(-FULL_CONTEXT_TURN_LIMIT).map((turn) => ({
          turn: turn.turn,
          userText: turn.userText,
          blocks: turn.blocks,
          location: turn.statusSnapshot?.location,
          time: turn.statusSnapshot?.time,
        })),
        longTermMemories,
        apiKey: await openaiKeyForLegacy(apiKey),
      });
      const requestKilobytes = Math.max(1, Math.ceil(new Blob([simulationBody]).size / 1024));
      setStreamStatus(`단청 엔진에 장면 입력 ${requestKilobytes.toLocaleString("ko-KR")}KB를 전송하는 중`);
      const response = await fetch("/api/simulate/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
        body: simulationBody,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as {
          error?: string;
          code?: string;
        };
        throw Object.assign(
          new Error(failure.error || "실시간 본문 스트림을 열지 못했습니다."),
          { code: failure.code },
        );
      }

      let result: EngineTurnResponse | undefined;
      let streamCompleted = false;
      let streamFailure: {
        error: string;
        code?: string;
        diagnostic?: FailedTurnDiagnostic;
      } | undefined;
      let provisionalBlocks: StoryBlock[] = [];
      let initialStreamScrollScheduled = false;
      const publishProvisionalBlocks = (rawBlocks: StoryBlock[]) => {
        const visibleBlocks = isDirectLiveBlockStream(rawBlocks)
          ? rawBlocks.map((block, index) => ({
              ...block,
              id: `${streamedTurnId}-live-${block.type}-${index}`,
            }))
          : projectStableLiveBlocks({
              narration: rawBlocks.map((block) => block.text).join(""),
              turnId: streamedTurnId,
            });
        const shouldInitialScroll = shouldStartInitialStreamScroll({
          alreadyScheduled: initialStreamScrollScheduled,
          visibleBlockCount: visibleBlocks.length,
        });
        if (!shouldInitialScroll) lockScrollForNextLayout();
        setPendingValidatedTurn({
          ...previewTurn,
          blocks: visibleBlocks,
        });
        if (shouldInitialScroll) {
          initialStreamScrollScheduled = true;
          let attempts = 0;
          const scrollOnceWhenMounted = () => {
            const currentScroller = storyScrollRef.current;
            const target = currentScroller
              ? [...currentScroller.querySelectorAll<HTMLElement>("[data-live-turn-id]")]
                  .find((section) => section.dataset.liveTurnId === streamedTurnId)
              : undefined;
            if (currentScroller && target) {
              const viewport = currentScroller.getBoundingClientRect();
              const targetBox = target.getBoundingClientRect();
              currentScroller.scrollTop += targetBox.top - viewport.top;
              return;
            }
            attempts += 1;
            if (attempts < 3) window.requestAnimationFrame(scrollOnceWhenMounted);
          };
          window.requestAnimationFrame(scrollOnceWhenMounted);
        }
      };

      await consumeSimulationStream(response, async (event) => {
        if (event.event === "turn_ack") {
          setStreamStatus(event.data.message);
          lockScrollForNextLayout();
          setPendingValidatedTurn(previewTurn);
          return;
        }
        if (event.event === "narration_commit") {
          setStreamStatus("도착한 문장을 실시간 공개·안전 검사하는 중");
          provisionalBlocks = await revealNarrationCommit(
            provisionalBlocks,
            event,
            (visibleBlocks) => {
              provisionalBlocks = visibleBlocks;
              publishProvisionalBlocks(visibleBlocks);
            },
            { signal: abortController.signal },
          );
          return;
        }
        if (event.event === "narration_rewind") {
          setStreamStatus(`문장 교정 중 · ${event.data.reason}`);
          provisionalBlocks = rewindNarrationBlocks(
            provisionalBlocks,
            event.data.toGrapheme,
          );
          publishProvisionalBlocks(provisionalBlocks);
          return;
        }
        if (event.event === "turn_sidecar") {
          result = event.data.result;
          setStreamStatus("본문 검사 완료 · 상태와 기억을 확정하는 중");
          return;
        }
        if (event.event === "turn_abort") {
          provisionalBlocks = [];
          lockScrollForNextLayout();
          setPendingValidatedTurn(null);
          streamFailure = {
            error: event.data.reason,
            code: "SIMULATION_STREAM_ABORTED",
            diagnostic: event.data.diagnostic,
          };
          return;
        }
        if (event.event === "error") {
          streamFailure = event.data;
          return;
        }
        if (event.event === "done") {
          streamCompleted = event.data.validated;
          completeStreamStatus();
        }
      });

      if (streamFailure) {
        const failure = streamFailure as {
          error: string;
          code?: string;
          diagnostic?: FailedTurnDiagnostic;
        };
        const narrativeFailureCode = failure.diagnostic?.code ?? failure.code ?? "";
        const recoveryExhausted = generationMode === "planned_recovery" &&
          /^(?:NARRATIVE_REWRITE_FAILED|FINAL_BEAT_CLOSURE_FAILED|LIVE_SEMANTIC_CORRECTION_FAILED)$/u.test(narrativeFailureCode);
        const displayDiagnostic = recoveryExhausted && failure.diagnostic ? {
          ...failure.diagnostic,
          summary: "이탈 또는 시간·장소의 큰 도약으로 인해 사건을 정사로 편입하지 못했습니다.",
          reasons: [...new Set([
            ...failure.diagnostic.reasons,
            "입력 내용을 현재 사건 안에서 성립하는 무난한 행동으로 바꿔 다시 전송해 주세요.",
            "다시 실패하면 직전 턴을 되돌린 뒤 앞 장면의 선택부터 바꿔 진행해 주세요.",
          ])],
          recoveryExhausted: true,
        } : failure.diagnostic;
        setFailedDraft(displayDiagnostic ?? null);
        failedTurnRetryRef.current = recoveryExhausted ? null : { advanceMode, userText };
        setShowFailedDraft(false);
        recordLiveAttempt(failure.diagnostic?.reliability);
        if (failure.code === "API_KEY_REQUIRED") {
          setApiStatus("disconnected");
          setApiMessage(failure.error || "GPT-6 Luna 연결이 필요합니다.");
          setSettingsTab("connection");
          setApiKeyDraft(apiKey);
          setShowApiKey(false);
          setSettingsOpen(true);
        } else if (
          failure.code === "LUNA_REQUEST_FAILED" ||
          failure.code === "LUNA_RESPONSE_REJECTED"
        ) {
          setApiStatus("error");
          setApiMessage(failure.error || "Luna 응답을 만들지 못했습니다.");
        } else if (
          failure.code === "NARRATIVE_REWRITE_FAILED" ||
          narrativeFailureCode === "NARRATIVE_REWRITE_FAILED" ||
          narrativeFailureCode === "FINAL_BEAT_CLOSURE_FAILED" ||
          narrativeFailureCode === "LIVE_SEMANTIC_CORRECTION_FAILED"
        ) {
          // This is a prose/continuity rejection, not an API connection
          // failure. The composer catch restores the user's unsaved input and
          // the role=alert banner explains how to retry.
          setApiStatus("connected");
          setApiMessage("");
        }
        throw new Error(failure.error || "다음 장면을 만들지 못했습니다.");
      }
      if (!streamCompleted || !result) {
        throw new Error("검증된 최종 본문 스트림이 완료되기 전에 연결이 종료되었습니다.");
      }
      const finalResult: EngineTurnResponse = result;
      recordLiveAttempt(finalResult.usage?.liveReliability);
      const directBlockStream = isDirectLiveBlockStream(provisionalBlocks);
      if (
        !validatedLiveNarrationMatches(
          provisionalBlocks,
          finalResult.narration,
        ) &&
        !validatedLiveProjectionMatches(
          provisionalBlocks,
          finalResult.narration,
        ) &&
        !validatedStoryBlocksMatch(provisionalBlocks, finalResult.blocks)
      ) {
        throw new Error(
          "서버가 스트리밍 승인 본문을 최종 확정 과정에서 실제로 변경했습니다. 상태와 메모리는 적용하지 않았습니다.",
        );
      }

      // The server already owns the final player-agency adjudication. Running a
      // second heuristic after live publication could remove a safe sentence
      // and turn a valid stream into a client-only discard.
      const cleanBlocks = directBlockStream
        ? hydrateValidatedLiveBlocks({
            streamed: provisionalBlocks,
            validated: finalResult.blocks,
            turnId: streamedTurnId,
          })
        : projectStableLiveBlocks({
            narration: finalResult.narration ?? provisionalBlocks
              .map((block) => block.text)
              .join(""),
            dialogueAnnotations: finalResult.dialogueAnnotations,
            validatedBlocks: finalResult.blocks,
            turnId: streamedTurnId,
            inferDialogue: false,
          });
      if (!cleanBlocks.length) {
        throw new Error("플레이어 주권 검사에서 모든 장면이 차단되었습니다.");
      }

      const nextState = applyStatePatch(
        state,
        finalResult.statePatch,
        pack,
        finalResult.chronology,
      );
      const nextTurn: TurnRecord = {
        id: streamedTurnId,
        turn: nextState.turn,
        appVersion: APP_VERSION,
        role: "exchange",
        userText: advanceMode === "player" ? userText : undefined,
        advanceMode,
        narration: finalResult.narration,
        blocks: cleanBlocks,
        recommendations: finalResult.recommendations,
        imagePrompt: finalResult.image.recommended ? finalResult.image.prompt : undefined,
        imageQuality: finalResult.image.recommended ? state.imageQuality : undefined,
        imageResolution: finalResult.image.recommended ? state.imageResolution : undefined,
        imageAspect: finalResult.image.recommended ? state.imageAspect : undefined,
        characterVisuals: finalResult.characterVisuals ?? [],
        usage: finalResult.usage,
        statusSnapshot: buildPublicStatusSnapshot(
          pack,
          nextState,
          finalResult.statePatch,
        ),
        runtimeSnapshot: cloneRuntimeCheckpoint(nextState),
        createdAt: new Date().toISOString(),
      };

      if (
        activeSessionIdRef.current !== originSessionId ||
        storyRevisionRef.current !== originStoryRevision
      ) {
        throw new Error(
          "최종본 표시 중 세션이 변경되어 응답을 적용하지 않았습니다. 다시 시도해 주세요.",
        );
      }

      const costEntry = costMeterEntryFromTurn(
        activeProjectId,
        activeSessionId,
        nextTurn,
      );
      if (costEntry) {
        setCostMeterEntries((entries) =>
          mergeCostMeterEntries(entries, [costEntry]),
        );
      }
      const nextTurns = [...turns, nextTurn];
      storyRevisionRef.current += 1;
      lastAutoScrolledTurnIdRef.current = nextTurn.id;
      preserveVisibleStoryAnchorForNextLayout();
      setTurns((items) => [...items, nextTurn]);
      setLongTermMemories((memories) =>
        appendLongTermMemories(nextTurns, memories)
      );
      setState(nextState);
      setLastMode(finalResult.mode);
      if (finalResult.mode === "luna") {
        setApiStatus("connected");
      } else if (
        apiKey &&
        finalResult.warning?.startsWith("Luna 연결에 실패해")
      ) {
        setApiStatus("error");
        setApiMessage(finalResult.warning);
      }
      if (finalResult.usage) {
        setTotalCostUsd(
          (cost) => cost + (finalResult.usage?.estimatedCostUsd ?? 0),
        );
      }
      if (finalResult.warning) setNotice(finalResult.warning);
      setPendingValidatedTurn(null);
      setFinalRevealAnnouncement("검증된 최종 본문의 실시간 표시가 완료되었습니다.");
      failedTurnRetryRef.current = null;
      void (async () => {
        try {
          const freshReferences = (
            await Promise.all(
              (finalResult.characterVisuals ?? []).map((cue) =>
                generateCharacterVisual(nextTurn.id, cue),
              ),
            )
          ).filter(
            (reference): reference is { characterId: string; imageUrl: string } =>
              Boolean(reference),
          );
          if (
            finalResult.mode === "luna" &&
            finalResult.image.recommended &&
            finalResult.image.prompt
          ) {
            const characterIds = selectSceneCharacterReferenceIds(
              pack,
              cleanBlocks,
              [
                ...(finalResult.image.characterIds ?? []),
                ...(finalResult.characterVisuals ?? []).map((cue) => cue.characterId),
              ],
            );
            const references = await collectCharacterReferences(
              characterIds,
              freshReferences,
            );
            const referenceAssetIds = characterIds.flatMap((characterId) => {
              const packageReference = selectPackageCharacterReferenceAsset(
                pack,
                characterId,
              );
              if (packageReference) return [packageReference.id];
              const cue = (finalResult.characterVisuals ?? []).find(
                (item) => item.characterId === characterId,
              );
              const profile = (state.characterVisuals ?? []).find(
                (item) => item.characterId === characterId,
              );
              return [cue?.canonicalAssetId || profile?.assetId || ""].filter(Boolean);
            });
            await generateSceneImage(
              nextTurn.id,
              finalResult.image.prompt,
              references,
              state.imageQuality,
              referenceAssetIds,
              state.imageResolution,
              state.imageAspect,
            );
          }
        } catch (referenceError) {
          setImageJobs((jobs) => ({ ...jobs, [nextTurn.id]: "error" }));
          setNotice(
            referenceError instanceof Error
              ? referenceError.message
              : "패키지 캐릭터 기준 이미지를 준비하지 못했습니다.",
          );
        }
      })();
    } catch (sendError) {
      const sendMessage = sendError instanceof Error ? sendError.message : "";
      if (
        multiplayerRoomCode &&
        multiplayerCauseRef.current !== "HOST_FORCE" &&
        /API\s*키|권한|모델.*사용|401|403/u.test(sendMessage)
      ) {
        void fetch(`/api/multiplayer/rooms/${encodeURIComponent(multiplayerRoomCode)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "key_failed" }),
        }).catch(() => undefined);
      }
      if (multiplayerCauseRef.current !== "AUTO_TIMEOUT") multiplayerCauseRef.current = "NORMAL";
      setPendingValidatedTurn(null);
      if (advanceMode === "player") setInput(userText);
      setUndoStack((items) => items.slice(0, -1));
      setError(
        sendError instanceof Error
          ? sendError.message
          : "다음 장면을 만들지 못했습니다.",
      );
    } finally {
      if (simulationAbortRef.current === abortController) {
        simulationAbortRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleSend = async () => {
    multiplayerCauseRef.current = "NORMAL";
    await handleAdvance("player");
  };
  const handleContinue = async () => {
    multiplayerCauseRef.current = "NORMAL";
    await handleAdvance("canonical");
  };
  const handlePlannedRecovery = async () => {
    const retry = failedTurnRetryRef.current;
    if (!retry) return;
    await handleAdvance(retry.advanceMode, "planned_recovery", retry.userText);
  };

  useEffect(() => {
    if (!multiplayerRoom || !multiplayerRoomCode || loading) return;
    const isMyTurn = multiplayerSelf?.id === multiplayerRoom.currentMemberId;
    const forceRequested = new URLSearchParams(window.location.search).get("cause") === "HOST_FORCE";
    const timeoutReached = multiplayerRoom.status === "ACTIVE" && isMyTurn &&
      Boolean(multiplayerRoom.turnDeadlineAt) && Date.parse(multiplayerRoom.turnDeadlineAt || "") <= Date.now();
    if (!timeoutReached && !(forceRequested && multiplayerRoom.isHost && multiplayerRoom.status === "PAUSED_KEY")) return;
    const marker = `${multiplayerRoom.code}:${multiplayerRoom.revision}:${forceRequested ? "HOST_FORCE" : "AUTO_TIMEOUT"}`;
    if (multiplayerTimeoutHandledRef.current === marker) return;
    multiplayerTimeoutHandledRef.current = marker;
    void (async () => {
      if (!apiKey) {
        if (!forceRequested) {
          await fetch(`/api/multiplayer/rooms/${encodeURIComponent(multiplayerRoomCode)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "key_failed" }),
          });
        }
        setError("이 기기의 API 키를 사용할 수 없어 멀티플레이 턴을 일시 정지했습니다.");
        return;
      }
      multiplayerCauseRef.current = forceRequested ? "HOST_FORCE" : "AUTO_TIMEOUT";
      if (forceRequested) window.history.replaceState({}, "", `/?room=${encodeURIComponent(multiplayerRoomCode)}`);
      await handleAdvance("canonical");
    })().catch(() => {
      multiplayerCauseRef.current = "NORMAL";
    });
  }, [
    apiKey,
    loading,
    multiplayerRoom,
    multiplayerRoomCode,
    multiplayerSelf?.id,
  ]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmitComposerOnEnter({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      mobileDevice: isMobileComposerDevice(window.navigator),
    })) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleUndo = () => {
    const snapshot = undoStack.at(-1);
    if (!snapshot || loading || sessionRefreshing || syncConflict) return;
    setState(snapshot.state);
    setTurns(snapshot.turns);
    setLongTermMemories(snapshot.longTermMemories);
    setTotalCostUsd(snapshot.totalCostUsd);
    setLastMode(snapshot.lastMode);
    setUndoStack((items) => items.slice(0, -1));
    setContextTurnId(null);
    setNotice("직전 턴을 되돌렸습니다.");
  };

  const handleRollbackToTurn = (targetTurn: TurnRecord, targetIndex: number) => {
    if (
      loading ||
      sessionSwitching ||
      sessionRefreshing ||
      syncConflict ||
      targetIndex >= turns.length - 1
    ) return;
    const laterTurnCount = turns.length - targetIndex - 1;
    const targetLabel = targetTurn.role === "opening"
      ? "오프닝"
      : `TURN ${String(targetTurn.turn).padStart(2, "0")}`;
    const confirmed = window.confirm(
      `${targetLabel} 직후로 되돌릴까요?\n\n이후 본문 ${laterTurnCount}개가 제거되고 상태·필수 사건·관계·NPC 행동·월드시간이 모두 이 시점으로 복원됩니다.`,
    );
    if (!confirmed) return;

    const retainedTurns = turns.slice(0, targetIndex + 1);
    const retainedTurnIds = new Set(retainedTurns.map((turn) => turn.id));
    const restoredState = runtimeCheckpointForTurn(
      pack,
      state,
      targetTurn,
      retainedTurns,
    );
    storyRevisionRef.current += 1;
    characterJobPromisesRef.current.clear();
    setState(restoredState);
    setTurns(retainedTurns);
    setLongTermMemories((memories) => memories.filter(
      (memory) => retainedTurnIds.has(memory.sourceTurnId) && memory.turn <= restoredState.turn,
    ));
    setUndoStack([]);
    setImageJobs({});
    setCharacterImageJobs({});
    setContextTurnId(null);
    setCopiedTurnId(null);
    setInput("");
    setError("");
    setNotice(
      `${targetLabel} 직후로 되돌렸습니다. 상태·필수 사건 진행도·관계·NPC 기록·월드시간을 함께 복원했습니다.`,
    );
  };

  const handleCopyTurn = async (turn: TurnRecord) => {
    const turnText = turn.blocks
      .map((block) =>
        block.type === "dialogue"
          ? `${block.speakerName || "이름 없는 인물"} | “${block.text.replace(/^[“\"]|[”\"]$/g, "")}”`
          : block.text,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(turnText);
      setCopiedTurnId(turn.id);
      window.setTimeout(() => {
        setCopiedTurnId((current) => current === turn.id ? null : current);
      }, 1600);
    } catch {
      setNotice("이 브라우저에서는 자동 복사를 사용할 수 없습니다.");
    }
  };

  const handleExportTranscript = async () => {
    if (exportingTranscript || loading || sessionSwitching || sessionRefreshing) return;
    setExportingTranscript(true);
    setError("");
    try {
      const visibleAssetIds = new Set<string>([
        playerStatusAsset?.id ?? "",
        ...turns.flatMap((turn) => [
          ...turn.blocks.map((block) => block.mediaAssetId ?? ""),
          ...(turn.characterVisuals ?? []).map((cue) => cue.canonicalAssetId),
        ]),
      ].filter(Boolean));
      const resolvedMediaEntries = await Promise.all(
        [...visibleAssetIds].map(async (assetId) => {
          const stored = mediaUrls[assetId];
          if (stored) return [assetId, stored] as const;
          const asset = mediaAssetById.get(assetId);
          if (!asset) return [assetId, ""] as const;
          return [assetId, (await ensurePackageMediaAsset(asset)) ?? ""] as const;
        }),
      );
      const resolvedMediaUrls = Object.fromEntries(
        resolvedMediaEntries.filter(([, imageUrl]) => Boolean(imageUrl)),
      );
      const exportedAt = new Date();
      const html = buildSessionTranscriptHtml({
        pack,
        sessionName: activeSessionName,
        chapterTitle,
        exportedAt: exportedAt.toLocaleString("ko-KR", {
          dateStyle: "long",
          timeStyle: "short",
        }),
        currentScene: {
          day: state.day,
          date: state.date,
          weekday: state.weekday,
          time: state.time,
          weather: state.weather,
          location: state.location,
          summary: state.sceneSummary,
        },
        turns,
        longTermMemories,
        mediaUrls: resolvedMediaUrls,
        playerImageUrl: playerStatusAsset
          ? resolvedMediaUrls[playerStatusAsset.id]
          : undefined,
        generatedSceneImageLimit: GENERATED_SCENE_IMAGE_LIMIT,
      });
      const fileName = sessionTranscriptFileName(
        pack.title,
        activeSessionName,
        exportedAt,
      );
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setNotice(
        `‘${activeSessionName}’ 전문을 상태창과 이미지가 포함된 HTML 파일로 내보냈습니다.`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? `전문을 내보내지 못했습니다. ${exportError.message}`
          : "전문을 내보내지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setExportingTranscript(false);
    }
  };

  const handleAddTurnImage = async (turn: TurnRecord) => {
    if (syncConflict || turn.imageUrl || imageJobs[turn.id] === "loading") return;
    if (apiStatus !== "connected") {
      setNotice("이미지를 추가하려면 먼저 OpenAI API를 연결해 주세요.");
      openSettings("connection");
      return;
    }
    const quality = state.imageQuality;
    const resolution = state.imageResolution;
    const aspect = state.imageAspect;
    const sceneText = turn.blocks
      .map((block) =>
        block.type === "dialogue"
          ? `${block.speakerName || "인물"}: ${block.text}`
          : block.text,
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 1800);
    const prompt = turn.imagePrompt || [
      `TV 애니메이션 본편을 보다가 일시정지한 듯한 자연스러운 ${imageAspectPrompt(aspect)}.`,
      `작품: ${pack.title}. 장르: ${pack.genre}.`,
      `현재 위치: ${state.location}.`,
      `장면 내용: ${sceneText}`,
      pack.turnPresentation.sceneImage.styleHint,
      "인물의 얼굴·머리·대표 복장과 공간의 원근이 선명한 시네마틱 구도. 설정표나 캐릭터 카드가 아닌 실제 이야기 속 한 장면. 화면 속 글자, 이름표, 말풍선, 워터마크 없음.",
    ].filter(Boolean).join(" ");
    setTurns((items) =>
      items.map((item) =>
        item.id === turn.id
          ? {
              ...item,
              imagePrompt: prompt,
              imageQuality: quality,
              imageResolution: resolution,
              imageAspect: aspect,
            }
          : item,
      ),
    );
    const characterIds = selectSceneCharacterReferenceIds(pack, turn.blocks);
    try {
      const references = await collectCharacterReferences(characterIds);
      const referenceAssetIds = characterIds.flatMap((characterId) => {
        const packageReference = selectPackageCharacterReferenceAsset(
          pack,
          characterId,
        );
        if (packageReference) return [packageReference.id];
        const profile = (state.characterVisuals ?? []).find(
          (item) => item.characterId === characterId,
        );
        const reference = selectCharacterReferenceAsset(pack, characterId);
        return [reference?.id || profile?.assetId || ""].filter(Boolean);
      });
      await generateSceneImage(
        turn.id,
        prompt,
        references,
        quality,
        referenceAssetIds,
        resolution,
        aspect,
      );
    } catch (referenceError) {
      setNotice(
        referenceError instanceof Error
          ? referenceError.message
          : "패키지 캐릭터 기준 이미지를 준비하지 못했습니다.",
      );
    }
  };

  return (
    <main className={`${surfaceMode === "home" ? "nexus-library-shell" : "app-shell"} theme-${themeMode} reading-${readingWidth} font-${readingFontSize}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={handleFile}
      />

      {!previewImage && (
        <div className="mobile-portrait-lock" role="status" aria-live="polite">
          <span aria-hidden="true"><Icon name="book" /></span>
          <strong>세로 화면으로 돌려주세요</strong>
          <p>단청 모바일 읽기 화면은 세로 보기에 맞춰져 있습니다.<br />이미지 확대 화면에서는 가로 보기도 사용할 수 있습니다.</p>
        </div>
      )}

      {(!account || !account.authenticated) && <AccountGate account={account} />}

      {accountOpen && account?.authenticated && (
        <AccountDialog
          account={account}
          auditLogs={auditLogs}
          auditLoading={auditLoading}
          projectCount={projects.filter((item) => item.id !== BUILT_IN_DEMO_PROJECT_ID).length}
          sessionCount={sessions.filter((item) => item.id !== BUILT_IN_DEMO_SESSION_ID).length}
          totalCostUsd={costMeterEntries.reduce(
            (sum, item) => sum + Number(item.usage?.estimatedCostUsd || 0) + Number(item.imageCostUsd || 0),
            0,
          )}
          onClose={() => setAccountOpen(false)}
        />
      )}

      {checkpointsOpen && (
        <div className="checkpoint-overlay" role="presentation" onMouseDown={() => setCheckpointsOpen(false)}>
          <section
            className="checkpoint-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkpoint-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>ACCOUNT SYNC · RECOVERY LEDGER</small>
                <h2 id="checkpoint-title">세션 체크포인트</h2>
                <p>계정 서버에 저장된 시점으로 안전하게 돌아갑니다.</p>
              </div>
              <button type="button" aria-label="복구 기록 닫기" onClick={() => setCheckpointsOpen(false)}>
                <Icon name="close" />
              </button>
            </header>
            <div className="checkpoint-version-lock">
              <Icon name="shield" />
              <div>
                <strong>작품 버전 고정됨</strong>
                <span>Package {activeProject?.packageVersion || "unknown"} · 작품 r{activeProject?.projectRevision || 1} · 세션 r{sessions.find((item) => item.id === activeSessionId)?.revision || 1}</span>
              </div>
            </div>
            <div className="checkpoint-actions">
              <button type="button" onClick={() => void handleCreateCheckpoint()} disabled={checkpointsLoading || syncConflict}>
                <Icon name="plus" /> 현재 상태 저장
              </button>
              <button type="button" onClick={() => void loadCheckpoints()} disabled={checkpointsLoading}>
                <Icon name="refresh" /> 목록 새로고침
              </button>
            </div>
            <div className="checkpoint-list">
              {checkpointsLoading && !checkpoints.length ? (
                <p className="checkpoint-empty">계정 복구 장부를 확인하고 있습니다.</p>
              ) : checkpoints.length ? checkpoints.map((checkpoint) => (
                <article key={checkpoint.id} className={`checkpoint-item kind-${checkpoint.kind.toLowerCase()}`}>
                  <i aria-hidden="true"><Icon name={checkpoint.kind === "CONFLICT" ? "shield" : "clock"} /></i>
                  <div>
                    <strong>{checkpoint.label}</strong>
                    <span>{checkpoint.kind} · 턴 {checkpoint.turn} · 세션 r{checkpoint.revision}</span>
                    <time>{new Date(checkpoint.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</time>
                  </div>
                  <div className="checkpoint-item-actions">
                    {checkpoint.kind === "CONFLICT" && (
                      <button type="button" onClick={() => void handleForkCheckpoint(checkpoint)} disabled={checkpointsLoading}>
                        새 세션으로 복사
                      </button>
                    )}
                    <button type="button" onClick={() => void handleRestoreCheckpoint(checkpoint)} disabled={checkpointsLoading}>
                      이 시점 복구
                    </button>
                  </div>
                </article>
              )) : (
                <p className="checkpoint-empty">아직 저장된 복구 지점이 없습니다.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {importProgress && (
        <div
          className={`import-progress-layer import-progress-${importProgress.status}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-progress-title"
        >
          <section className="import-progress-card">
            <header>
              <span className="import-progress-icon" aria-hidden="true">
                {importProgress.status === "complete"
                  ? <Icon name="check" />
                  : importProgress.status === "error"
                    ? <Icon name="close" />
                    : <Icon name="upload" />}
              </span>
              <div>
                <small>SCENARIOPACK IMPORT</small>
                <h2 id="import-progress-title">{importProgress.phase}</h2>
                <p>{importProgress.detail}</p>
              </div>
              <strong className="import-progress-percent">
                {importProgress.value}%
              </strong>
            </header>

            <div className="import-progress-file">
              <span>{importProgress.fileName}</span>
              <b>{importProgress.fileSize}</b>
            </div>

            <div
              className="import-progress-meter"
              role="progressbar"
              aria-label="ScenarioPack 불러오기 진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={importProgress.value}
            >
              <i style={{ width: `${importProgress.value}%` }} />
            </div>

            <ol className="import-progress-steps" aria-label="불러오기 단계">
              {[
                { label: "ZIP 검사", threshold: 15, previous: 0 },
                { label: "세계관 분석", threshold: 62, previous: 15 },
                { label: "이미지 등록", threshold: 82, previous: 62 },
                { label: "세션 저장", threshold: 100, previous: 82 },
              ].map((step) => {
                const done = importProgress.value >= step.threshold;
                const active = !done && importProgress.value >= step.previous;
                return (
                  <li
                    className={done ? "done" : active ? "active" : ""}
                    key={step.label}
                  >
                    <i>{done ? "✓" : ""}</i>
                    <span>{step.label}</span>
                  </li>
                );
              })}
            </ol>

            <p className="import-progress-footnote">
              창을 닫지 마세요. 대용량 패키지도 계정 온라인 보관함에 분할 저장합니다.
            </p>
          </section>
        </div>
      )}

      {surfaceMode === "home" && runtimeEngine === "cortex" ? (
        <CortexLibrary signOutHref={account?.authenticated?(account.signOutPath || "/signout-with-chatgpt?return_to=%2F"):undefined} projects={projects} onImportFile={(file,project)=>{openCortex({id:crypto.randomUUID(),projectId:project?.id||"cortex-import-"+crypto.randomUUID(),name:project?.name||file.name.replace(/\.zip$/i,""),sourceProjectId:project?.sourceProjectId,thumbnailUrl:project?.thumbnailUrl});setCortexFile(file);setSurfaceMode("reader")}} onOpen={(session)=>{openCortex(session);setSurfaceMode("reader")}} onImportZip={()=>fileInputRef.current?.click()} onSettings={()=>openSettings("engine")} onAccount={handleOpenAccount} onDeleteAccountProject={async projectId=>{const project=projects.find(item=>item.id===projectId);if(project)await handleDeleteProject(project)}} />
      ) : surfaceMode === "home" ? (
        <NexusLibraryHome
          projects={projects}
          sessions={sessions}
          accountName={account?.displayName || "Relay ID"}
          activeProjectId={activeProjectId}
          busy={loading || sessionSwitching || sessionRefreshing}
          onOpenSession={async (sessionId) => {
            await loadSession(sessionId);
            setSurfaceMode("reader");
          }}
          onCreateSession={async (projectId) => {
            await handleCreateSession(projectId);
            setSurfaceMode("reader");
          }}
          onDeleteSession={async (sessionId) => {
            const session = sessions.find((candidate) => candidate.id === sessionId);
            if (session) await handleDeleteSession(session);
          }}
          onImportZip={() => fileInputRef.current?.click()}
          onInstallHubWork={handleInstallHubWork}
          onRestoreHubCover={handleRestoreHubCover}
          onOpenSettings={() => openSettings("connection")}
          onOpenAccount={handleOpenAccount}
          signOutHref={account?.authenticated?(account.signOutPath || "/signout-with-chatgpt?return_to=%2F"):undefined}
        />
      ) : runtimeEngine === "cortex" && cortexSession ? (
        <CortexPlayer key={`${account?.id}:${cortexSession.id}`} accountOwnerKey={account?.authenticated?`account:${account.id}`:undefined} sessionId={cortexSession.id} projectId={cortexSession.projectId} sourceProjectId={cortexSession.sourceProjectId} sessionName={cortexSession.name} apiKey={apiKey} theme={themeMode} readingWidth={readingWidth} fontSize={readingFontSize} typingSpeed={typingSpeed} imageQuality={state.imageQuality} imageEvery={state.imageEvery} file={cortexFile} onFileConsumed={()=>setCortexFile(null)} onHome={()=>{if(cortexBusy.current){setNotice("현재 비트의 저장을 마친 뒤 서재로 이동해 주세요.");return;}setSurfaceMode("home")}} onSettings={(tab)=>openSettings(tab??"engine")}/>
      ) : runtimeEngine === "cortex" ? (
        <CortexLibrary signOutHref={account?.authenticated?(account.signOutPath || "/signout-with-chatgpt?return_to=%2F"):undefined} projects={projects} onImportFile={(file,project)=>{openCortex({id:crypto.randomUUID(),projectId:project?.id||"cortex-import-"+crypto.randomUUID(),name:project?.name||file.name.replace(/\.zip$/i,""),sourceProjectId:project?.sourceProjectId,thumbnailUrl:project?.thumbnailUrl});setCortexFile(file);setSurfaceMode("reader")}} onOpen={(session)=>{openCortex(session);setSurfaceMode("reader")}} onImportZip={()=>fileInputRef.current?.click()} onSettings={()=>openSettings("engine")} onAccount={handleOpenAccount} onDeleteAccountProject={async projectId=>{const project=projects.find(item=>item.id===projectId);if(project)await handleDeleteProject(project)}} />
      ) : (
      <>
      <aside className="left-rail" hidden aria-hidden="true">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="book" />
          </div>
          <div>
            <strong>단청</strong>
            <span>RELAY CORE</span>
          </div>
        </div>

        <nav className="rail-tabs" aria-label="작품 및 채팅">
          <button
            type="button"
            className={libraryTab === "works" ? "active" : ""}
            onClick={() => setLibraryTab("works")}
          >
            <Icon name="folder" />
            <span>작품</span>
            <b>{projects.length}</b>
          </button>
          <button
            type="button"
            className={libraryTab === "chats" ? "active" : ""}
            onClick={() => setLibraryTab("chats")}
          >
            <Icon name="chat" />
            <span>채팅</span>
            <b>{sessions.length}</b>
          </button>
        </nav>

        <section className="rail-library" aria-live="polite">
          {libraryTab === "works" ? (
            <>
              <div className="rail-section-head">
                <div>
                  <span>SHARED TEST LIBRARY</span>
                  <strong>공용 테스트 작품</strong>
                </div>
              </div>
              <div className="project-list">
                {libraryLoading && (
                  <div className="library-placeholder">작품 보관함을 여는 중…</div>
                )}
                {!libraryLoading && projects.length === 0 && (
                  <div className="library-empty">
                    <span><Icon name="book" /></span>
                    <strong>아직 불러온 작품이 없습니다</strong>
                    <p>ScenarioPack ZIP 하나가 독립된 작품과 첫 채팅 세션이 됩니다.</p>
                  </div>
                )}
                {projects.map((project) => (
                  <button
                    className={`project-card ${project.id === activeProjectId ? "active" : ""}`}
                    type="button"
                    key={project.id}
                    disabled={sessionSwitching || loading}
                    onPointerEnter={() => prefetchProjectSession(project.id)}
                    onPointerDown={() => prefetchProjectSession(project.id)}
                    onFocus={() => prefetchProjectSession(project.id)}
                    onClick={() => void handleSelectProject(project.id)}
                  >
                    <ProjectCover project={project} />
                    <span className="project-card-copy">
                      <strong>{project.title}</strong>
                      <small>{project.genre || "릴레이 소설"}</small>
                      <em>{project.sessionCount}개 세션 · {project.playerName}</em>
                    </span>
                    <Icon name="chevron" />
                  </button>
                ))}
              </div>
              <button
                className="import-button import-primary"
                type="button"
                disabled={loading || sessionSwitching}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="upload" />
                ScenarioPack ZIP 불러오기
              </button>
              <p className="import-limit">
                최대 1GB · 대용량 원본도 계정 온라인 동기화
              </p>
            </>
          ) : (
            <>
              <div className="rail-section-head chat-section-head">
                <div>
                  <span>CHAT SESSIONS</span>
                  <strong>{activeProject?.title ?? "채팅 세션"}</strong>
                </div>
                <button
                  type="button"
                  aria-label="새 채팅 세션 만들기"
                  title="새 채팅"
                  disabled={!activeProject || sessionSwitching || loading}
                  onClick={() => void handleCreateSession()}
                >
                  <Icon name="plus" />
                </button>
              </div>
              {activeProject ? (
                <div className="session-list">
                  {activeProjectSessions.map((session) => (
                    <div
                      className={`session-card ${session.id === activeSessionId ? "active" : ""}`}
                      key={session.id}
                    >
                      {renamingSessionId === session.id ? (
                        <form
                          className="session-rename"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleRenameSession(session.id);
                          }}
                        >
                          <input
                            value={renameDraft}
                            maxLength={80}
                            autoFocus
                            onChange={(event) => setRenameDraft(event.target.value)}
                            aria-label="세션 이름"
                          />
                          <button type="submit" aria-label="이름 저장"><Icon name="check" /></button>
                          <button
                            type="button"
                            aria-label="이름 변경 취소"
                            onClick={() => setRenamingSessionId(null)}
                          ><Icon name="close" /></button>
                        </form>
                      ) : (
                        <>
                          <button
                            className="session-main"
                            type="button"
                            disabled={sessionSwitching || loading}
                            onPointerEnter={() => prefetchSession(session.id)}
                            onPointerDown={() => prefetchSession(session.id)}
                            onFocus={() => prefetchSession(session.id)}
                            onClick={() => void loadSession(session.id)}
                          >
                            <span className="session-icon"><Icon name="chat" /></span>
                            <span>
                              <strong>{session.name}</strong>
                              <small>{session.preview}</small>
                              <em>D+{session.day} · {session.turn}턴 · {relativeSessionTime(session.lastPlayedAt)}</em>
                            </span>
                          </button>
                          {session.id !== BUILT_IN_DEMO_SESSION_ID && (
                          <div className="session-actions">
                            <button
                              type="button"
                              aria-label={`${session.name} 이름 변경`}
                              title="이름 변경"
                              onClick={() => {
                                setRenamingSessionId(session.id);
                                setRenameDraft(session.name);
                              }}
                            ><Icon name="edit" /></button>
                            <button
                              type="button"
                              aria-label={`${session.name} 삭제`}
                              title={activeProjectSessions.length <= 1 ? "마지막 세션은 삭제할 수 없습니다" : "삭제"}
                              disabled={sessionSwitching || loading}
                              onClick={() => void handleDeleteSession(session)}
                            ><Icon name="trash" /></button>
                          </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <button
                    className="new-session-card"
                    type="button"
                    disabled={sessionSwitching || loading}
                    onClick={() => void handleCreateSession()}
                  >
                    <Icon name="plus" />
                    <span>
                      <strong>{activeProject.id === BUILT_IN_DEMO_PROJECT_ID ? "데모 처음부터" : "새 이야기 시작"}</strong>
                      <small>{activeProject.id === BUILT_IN_DEMO_PROJECT_ID ? "기본 데모 상태 초기화" : "같은 작품, 완전히 독립된 진행"}</small>
                    </span>
                  </button>
                </div>
              ) : (
                <div className="library-empty chat-empty">
                  <span><Icon name="chat" /></span>
                  <strong>채팅을 시작할 작품이 없습니다</strong>
                  <p>작품 탭에서 ScenarioPack ZIP을 먼저 불러오세요.</p>
                  <button type="button" onClick={() => setLibraryTab("works")}>작품 탭으로 이동</button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="rail-label rail-label-gap">엔진 구성</div>
        <div className="engine-card">
          <div className="engine-title">
            <span className="spark-box">
              <Icon name="spark" />
            </span>
            <div>
              <strong>GPT-6 Luna</strong>
              <small>{apiStatus === "connected" ? "API LIVE" : "DEMO MODE"}</small>
            </div>
          </div>
          <div className="engine-row">
            <span>장면 이미지</span>
            <b>{imageIntervalLabel(state.imageEvery)} · 최근 {GENERATED_SCENE_IMAGE_LIMIT}개 보관</b>
          </div>
          <div className="engine-row">
            <span>패키지 이미지</span>
            <b>{pack.mediaAssets?.length ?? 0}개 · 비용 없음</b>
          </div>
          <div className="engine-row">
            <span>Studio Package {pack.packageVersion}</span>
            <b>{pack.compatibility?.studioPackage15
              ? pack.compatibility.package15FeatureNegotiated ? "계약 호환" : "협상 실패"
              : pack.compatibility?.fullSupport ? "완전 호환" : pack.compatibility?.supportedPackageVersion ? "기본 호환" : "레거시"}</b>
          </div>
          <div className="engine-row">
            <span>Asset-Once 무결성</span>
            <b>{pack.compatibility?.integrityVerified
              ? `SHA-256 검증 · 원본 ${pack.assetLedger?.physicalAssetCount ?? 0}개`
              : "해당 없음"}</b>
          </div>
          <div className="engine-row">
            <span>AI 세계관 런타임</span>
            <b>{pack.aiWorldContext?.enabled
              ? `LIVE · 조사 캐시 ${state.characterResearchCache?.length ?? 0}명`
              : "패키지 미지정"}</b>
          </div>
          <div className="engine-row">
            <span>작품 독립 서사 계약</span>
            <b>{pack.narrativeRuntime ? "별칭·우회 비트·장면 표식 연결" : "패키지 미지정"}</b>
          </div>
          {pack.package15Runtime && (
            <div className="engine-row">
              <span>Package 1.5 기능 협상</span>
              <b>{pack.package15Runtime.negotiatedFeatures.length}개 기능 · 통과</b>
            </div>
          )}
          <div className="engine-row">
            <span>고정 세계관</span>
            <b>명시적 캐싱</b>
          </div>
          <div className="engine-row">
            <span>Claude Core</span>
            <b>결정적 사건·비트·봉인 원장</b>
          </div>
          <div className="engine-row">
            <span>GPT World Layer</span>
            <b>자율 NPC · 관계 기억 · 공개 HUD</b>
          </div>
          <div className="engine-row">
            <span>Canon Rewrite Gate</span>
            <b>ABSORB · 입력 접수 후 정사 전환</b>
          </div>
          <div className="engine-row">
            <span>제약 · 복합 사건</span>
            <b>{pack.constraints?.length ?? 0}개 · {pack.events.filter((event) => event.kind === "compound").length}개</b>
          </div>
          <div className="engine-row">
            <span>장기 기억</span>
            <b>{longTermMemories.length}건 · 최근 {FULL_CONTEXT_TURN_LIMIT}개 전문</b>
          </div>
          <button
            className="engine-settings-button"
            type="button"
            onClick={() => openSettings("connection")}
          >
            <Icon name="settings" />
            {apiStatus === "connected" ? "API 연결 관리" : "API 키 연결 설정"}
          </button>
        </div>

        <div className="guard-card">
          <span className="guard-icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>Claude × GPT 완전 결합 엔진</strong>
            <p>Claude HTML의 턴 상태기계가 사건을 판정하고, GPT 세계 계층이 NPC·관계·HUD·추천·복구를 적용합니다.</p>
          </div>
        </div>

        <div className="rail-footer">
          <span className={`engine-dot ${apiStatus === "connected" ? "luna" : "mock"}`} />
          <span>{apiStatus === "connected" ? "OpenAI API 연결됨" : "API 키 입력 전"}</span>
        </div>
      </aside>

      <section className="story-column">
        <header className="topbar">
          <div className="topbar-title">
            <small>단청 · INTERACTIVE NOVEL</small>
            <h1>{pack.title}</h1>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="library-home-button"
              onClick={() => setSurfaceMode("home")}
              title="단청 서재로 돌아가기"
            >
              <Icon name="book" />
              <span>서재</span>
            </button>
            <button
              type="button"
              className={`topbar-session-pill sync-${syncStatus}`}
              onClick={() => setSurfaceMode("home")}
              title="서재에서 작품과 채팅 세션 선택"
            >
              <Icon name="chat" />
              <span>
                <strong>{activeSessionName}</strong>
                <small>
                  {sessionRefreshing
                    ? "최신 저장본 동기화 중"
                    : sessionSwitching
                    ? "전환 중"
                    : syncStatus === "saving"
                      ? "저장 중"
                    : syncStatus === "error"
                      ? "기기 저장됨 · 온라인 저장 확인 필요"
                      : syncConflict
                        ? "동시 편집 충돌 · 새로고침 필요"
                        : activeProject
                          ? `자동 저장됨 · Package ${activeProject.packageVersion} 고정`
                          : "데모 세션"}
                </small>
              </span>
            </button>
            <button
              type="button"
              className="undo-button"
              disabled={!undoStack.length || loading || sessionSwitching || sessionRefreshing || syncConflict}
              onClick={handleUndo}
              title="직전 턴 되돌리기"
            >
              <Icon name="undo" />
              <span>되돌리기</span>
            </button>
            <details className="reader-tools-menu">
              <summary aria-label="세션 도구 열기">
                <Icon name="panel" />
                <span>도구</span>
              </summary>
              <div className="reader-tools-popover">
                <header>
                  <small>SESSION TOOLS</small>
                  <strong>필요할 때만 펼치는 도구</strong>
                </header>
                <button
                  type="button"
                  className="checkpoint-button"
                  disabled={
                    activeSessionId === BUILT_IN_DEMO_SESSION_ID ||
                    activeSessionId === "local-session" ||
                    loading || sessionSwitching || sessionRefreshing
                  }
                  onClick={() => void handleOpenCheckpoints()}
                  title="계정 서버의 세션 체크포인트를 만들거나 복구합니다"
                >
                  <Icon name="clock" />
                  <span>복구 기록</span>
                </button>
                <button
                  type="button"
                  className={`session-refresh-button ${sessionRefreshing ? "is-refreshing" : ""}`}
                  disabled={
                    activeSessionId === BUILT_IN_DEMO_SESSION_ID ||
                    activeSessionId === "local-session" ||
                    loading ||
                    sessionSwitching ||
                    sessionRefreshing ||
                    syncStatus === "saving"
                  }
                  onClick={() => void handleRefreshCurrentSession()}
                  aria-label="현재 세션 즉시 새로고침"
                  title={
                    activeSessionId === BUILT_IN_DEMO_SESSION_ID ||
                      activeSessionId === "local-session"
                      ? "온라인 세션에서 사용할 수 있습니다"
                      : syncStatus === "saving"
                        ? "현재 변경 내용을 저장한 뒤 새로고침할 수 있습니다"
                        : "페이지를 다시 열지 않고 다른 기기의 최신 세션을 불러옵니다"
                  }
                >
                  <Icon name="refresh" />
                  <span>{sessionRefreshing ? "동기화 중" : "즉시 새로고침"}</span>
                </button>
                <button
                  type="button"
                  className="long-memory-button"
                  disabled={sessionRefreshing}
                  onClick={() => setLongTermMemoryOpen(true)}
                  title={`장기기억 ${longTermMemories.length}건 열기`}
                >
                  <Icon name="book" />
                  <span>장기기억</span>
                  {longTermMemories.length > 0 && <b>{longTermMemories.length}</b>}
                </button>
                <button
                  type="button"
                  className="export-transcript-button"
                  disabled={exportingTranscript || loading || sessionSwitching || sessionRefreshing}
                  onClick={() => void handleExportTranscript()}
                  title="대화·스토리·상태창·이미지 전문 내보내기"
                >
                  <Icon name={exportingTranscript ? "spark" : "download"} />
                  <span>{exportingTranscript ? "묶는 중" : "전문 내보내기"}</span>
                </button>
                <div className="model-pill">
                  <Icon name="spark" />
                  <span>{apiStatus === "connected" ? "GPT-6 Luna" : "Luna 미연결"}</span>
                  <i className={apiStatus === "connected" ? "luna" : "mock"} />
                </div>
                <button
                  type="button"
                  className="account-menu-button"
                  aria-label="Relay ID 계정 열기"
                  title={`${account?.displayName || "Relay ID"} · ${account?.role || "계정"}`}
                  onClick={handleOpenAccount}
                >
                  <Icon name="account" />
                  <span>
                    <strong>{account?.displayName || "Relay ID"}</strong>
                    <small>{account?.role || "ACCOUNT"}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="settings-icon-button"
                  aria-label="설정 열기"
                  title="설정"
                  onClick={() => openSettings("connection")}
                >
                  <Icon name="settings" />
                  <span>설정</span>
                </button>
              </div>
            </details>
            <button
              className="mobile-icon-button state-button"
              type="button"
              aria-label="이야기 정보 패널 열기"
              onClick={() => openMobileInspector("status")}
            >
              <Icon name="panel" />
            </button>
          </div>
        </header>

        <div className="scene-meta">
          <div>
            <span>D+{state.day}</span>
            <i />
            <span>{state.date}</span>
            <span>{state.weekday}</span>
            <i />
            <span>{state.time}</span>
          </div>
          <div>
            <span>{weatherEmoji(state.weather)} {state.weather}</span>
            <i />
            <span>{state.location}</span>
          </div>
        </div>

        <nav className="mobile-inspector-dock" aria-label="모바일 이야기 정보">
          <button type="button" onClick={() => openMobileInspector("status")}>
            <Icon name="panel" /><span>상태</span>
          </button>
          <button type="button" onClick={() => openMobileInspector("events")}>
            <Icon name="clock" /><span>사건</span>
          </button>
          <button type="button" onClick={() => openMobileInspector("cast")}>
            <Icon name="account" /><span>인물</span>
          </button>
          <button type="button" onClick={() => openMobileInspector("images")}>
            <Icon name="image" /><span>이미지</span>
          </button>
        </nav>

        <button
          type="button"
          className="mobile-inspector-edge-button"
          aria-label="오른쪽 이야기 정보 펼치기"
          aria-expanded={mobilePanel === "state"}
          onClick={() => openMobileInspector(mobileInspectorTab)}
        >
          <Icon name="panel" />
          <span>정보</span>
        </button>

        <div className="story-scroll" ref={storyScrollRef}>
          <div className="chapter-heading">
            <span>CHAPTER 01</span>
            <h2>{chapterTitle}</h2>
            <p>현재 장면에서 직접 확인할 수 있는 정보만 공개됩니다.</p>
          </div>

          {notice && (
            <div className="notice-bar">
              <span>i</span>
              <p>{notice}</p>
              <button
                type="button"
                aria-label="알림 닫기"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}

          <article className="story-content">
            <span className="sr-only" role="status" aria-live="polite">
              {finalRevealAnnouncement}
            </span>
            {turns.map((turn, index) => (
              <section
                className={`turn-section${turn.blocks.some((block) => block.id.includes("-live-")) ? " live-hydrated-turn" : ""}`}
                key={turn.id}
                data-story-turn-id={turn.id}
              >
                {turn.userText ? (
                  <div
                    className="user-choice"
                    ref={index === turns.length - 1 ? latestUserTurnRef : undefined}
                  >
                    <span>나의 입력</span>
                    <p>{turn.userText}</p>
                  </div>
                ) : turn.advanceMode === "canonical" ? (
                  <div
                    className="auto-continue-marker"
                    ref={index === turns.length - 1 ? latestUserTurnRef : undefined}
                  >
                    <Icon name="play" />
                    <span>이어서 진행</span>
                    <small>패키지 정석 전개</small>
                  </div>
                ) : null}
                {turn.blocks.map((block, blockIndex) => {
                  const visualCues = (turn.characterVisuals ?? []).filter(
                    (cue) => cue.blockIndex === blockIndex,
                  );
                  const blockAsset = block.mediaAssetId
                    ? mediaAssetById.get(block.mediaAssetId)
                    : undefined;
                  const blockAssetCue = visualCues.find(
                    (cue) => cue.canonicalAssetId === blockAsset?.id,
                  );
                  return (
                    <Fragment key={block.id}>
                      <StoryBlockView block={block} />
                      {blockAsset?.placement === "after_block" &&
                        mediaUrls[blockAsset.id] && (
                          <PackageMediaCard
                            asset={blockAsset}
                            imageUrl={mediaUrls[blockAsset.id]}
                            profileName={blockAssetCue?.characterName}
                          />
                        )}
                      {visualCues.map((visualCue) => {
                        const visualAsset = mediaAssetById.get(
                          visualCue.canonicalAssetId,
                        );
                        const visualJobKey = `${turn.id}:${visualCue.characterId}`;
                        if (visualAsset && mediaUrls[visualAsset.id]) {
                          if (
                            visualAsset.id === blockAsset?.id ||
                            visualAsset.placement !== "after_block"
                          ) return null;
                          return (
                            <PackageMediaCard
                              asset={visualAsset}
                              imageUrl={mediaUrls[visualAsset.id]}
                              profileName={visualCue.characterName}
                              key={visualJobKey}
                            />
                          );
                        }
                        return (
                          <CharacterVisualStatusCard
                            cue={visualCue}
                            status={characterImageJobs[visualJobKey]}
                            onRetry={() => {
                              characterJobPromisesRef.current.delete(visualJobKey);
                              void generateCharacterVisual(
                                turn.id,
                                visualCue,
                                true,
                              );
                            }}
                            key={visualJobKey}
                          />
                        );
                      })}
                    </Fragment>
                  );
                })}
                {turn.blocks.map((block, blockIndex) => {
                  const blockAsset = block.mediaAssetId
                    ? mediaAssetById.get(block.mediaAssetId)
                    : undefined;
                  const visualCues = (turn.characterVisuals ?? []).filter(
                    (cue) => cue.blockIndex === blockIndex,
                  );
                  const turnEndAssets = [
                    ...(blockAsset ? [blockAsset] : []),
                    ...visualCues.flatMap((cue) => {
                      const asset = mediaAssetById.get(cue.canonicalAssetId);
                      return asset ? [asset] : [];
                    }),
                  ].filter(
                    (asset, assetIndex, assets) =>
                      asset.placement === "turn_end" &&
                      Boolean(mediaUrls[asset.id]) &&
                      assets.findIndex((candidate) => candidate.id === asset.id) === assetIndex,
                  );
                  return turnEndAssets.map((asset) => (
                    <PackageMediaCard
                      asset={asset}
                      imageUrl={mediaUrls[asset.id]}
                      profileName={visualCues.find(
                        (cue) => cue.canonicalAssetId === asset.id,
                      )?.characterName}
                      key={`${block.id}-${asset.id}-turn-end-media`}
                    />
                  ));
                })}
                {turn.imagePrompt && (
                  <SceneImageCard
                    prompt={turn.imagePrompt}
                    imageUrl={turn.imageUrl}
                    status={imageJobs[turn.id]}
                    quality={turn.imageQuality ?? "medium"}
                    resolution={turn.imageResolution ?? state.imageResolution}
                    aspect={turn.imageAspect ?? state.imageAspect}
                  />
                )}
                {turn.statusSnapshot && (
                  <TurnStatusCard
                    snapshot={turn.statusSnapshot}
                    isLatest={index === turns.length - 1}
                    pack={pack}
                    playerImageUrl={playerStatusAsset ? mediaUrls[playerStatusAsset.id] : undefined}
                  />
                )}
                <div className="turn-actions" role="group" aria-label={`${turn.turn}턴 응답 작업`}>
                  <button
                    type="button"
                    disabled={
                      loading ||
                      sessionSwitching ||
                      sessionRefreshing ||
                      syncConflict ||
                      (index === turns.length - 1 &&
                        (turn.role !== "exchange" || !undoStack.length))
                    }
                    onClick={() => {
                      if (index === turns.length - 1) {
                        handleUndo();
                      } else {
                        handleRollbackToTurn(turn, index);
                      }
                    }}
                    title={
                      index === turns.length - 1
                        ? "이 응답을 취소하고 직전 시점으로 되돌리기"
                        : "이 턴 직후로 본문과 전체 월드 상태 되돌리기"
                    }
                  >
                    <Icon name="undo" />
                    <span>{index === turns.length - 1 ? "되돌리기" : "이 시점으로"}</span>
                  </button>
                  <button type="button" onClick={() => void handleCopyTurn(turn)}>
                    <Icon name={copiedTurnId === turn.id ? "check" : "copy"} />
                    <span>{copiedTurnId === turn.id ? "복사됨" : "복사"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={syncConflict || Boolean(turn.imageUrl) || imageJobs[turn.id] === "loading"}
                    onClick={() => void handleAddTurnImage(turn)}
                    title={turn.imageUrl ? "이 응답에는 이미 장면 이미지가 있습니다" : "이 응답의 장면 이미지 만들기"}
                  >
                    <Icon name="image" />
                    <span>
                      {turn.imageUrl
                        ? "이미지 있음"
                        : imageJobs[turn.id] === "loading"
                          ? "생성 중"
                          : imageJobs[turn.id] === "error"
                            ? "이미지 재시도"
                            : "이미지 추가"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={contextTurnId === turn.id ? "active" : ""}
                    aria-expanded={contextTurnId === turn.id}
                    onClick={() => setContextTurnId((current) => current === turn.id ? null : turn.id)}
                  >
                    <Icon name="clock" />
                    <span>시각·위치</span>
                  </button>
                </div>
                {contextTurnId === turn.id && (
                  <div className="turn-context-popover" role="status">
                    <span><Icon name="clock" /> 현재 시각</span>
                    <strong>D+{turn.statusSnapshot?.day ?? state.day} · {turn.statusSnapshot?.date ?? state.date} {turn.statusSnapshot?.weekday ?? state.weekday} · {turn.statusSnapshot?.time ?? state.time}</strong>
                    <span>{weatherEmoji(turn.statusSnapshot?.weather ?? state.weather)} 현재 위치</span>
                    <strong>{turn.statusSnapshot?.location ?? state.location}</strong>
                  </div>
                )}
                {index < turns.length - 1 && <div className="turn-divider" />}
              </section>
            ))}

            {pendingValidatedTurn && (
              <ValidatedTurnReveal
                turn={pendingValidatedTurn}
                status={streamStatus}
                statusCompleted={streamStatusCompleted}
              />
            )}

            {loading && !pendingValidatedTurn && !importProgress && (
              <div className="thinking-row">
                <WorldWritingProgress status={streamStatus} completed={streamStatusCompleted} />
              </div>
            )}
          </article>
        </div>

        {showLatestButton && (
          <button
            className="latest-story-button"
            type="button"
            aria-label="가장 최근 시나리오로 이동"
            title="맨 아래 최신 장면으로 이동"
            onClick={scrollToLatest}
          >
            <span aria-hidden="true">↓</span> 최신으로
          </button>
        )}

        <footer className="composer-wrap">
          {multiplayerRoom && (
            <div className={`multiplayer-turn-banner status-${multiplayerRoom.status.toLowerCase()}`}>
              <div>
                <strong>{multiplayerRoom.status === "SOLO"
                  ? "남은 한 명의 싱글플레이로 전환되었습니다"
                  : multiplayerRoom.status === "PAUSED_KEY"
                    ? "API 키 복구를 기다리는 중"
                    : multiplayerCanWrite
                      ? "내 차례입니다"
                      : `${multiplayerCurrent?.displayName ?? "다음 플레이어"}의 차례입니다`}</strong>
                <span>ROOM {multiplayerRoom.code} · 하나의 주인공과 하나의 정사 원장을 공유합니다.</span>
              </div>
              <a href={`/multiplayer?room=${encodeURIComponent(multiplayerRoom.code)}`}>방 관리</a>
            </div>
          )}
          {syncConflict && (
            <div className="sync-conflict-panel" role="alert">
              <div>
                <strong>다른 기기에서 이 세션이 먼저 진행되었습니다</strong>
                <p>
                  {conflictCheckpointId
                    ? "이 기기의 초안은 복구 기록에 보존했습니다. 서버 최신본을 불러오거나 보존본을 새 세션으로 분기해 주세요."
                    : "이 기기의 초안은 로컬에 남아 있습니다. 필요한 문장을 복사한 뒤 서버 최신본을 불러와 주세요."}
                </p>
              </div>
              <div className="sync-conflict-actions">
                <button type="button" onClick={() => void handleRefreshCurrentSession()}>
                  <Icon name="refresh" /> 서버 최신본 불러오기
                </button>
                {conflictCheckpointId && (
                  <button type="button" onClick={() => void handleOpenCheckpoints()}>
                    <Icon name="clock" /> 보존 초안 분기
                  </button>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="composer-failure-stack">
              <div className="notice-bar notice-error composer-error-bar" role="alert">
                <span>!</span>
                <div className="composer-error-detail">
                  <strong>{failedDraft?.summary ?? error}</strong>
                  {failedDraft ? (
                    <ul>
                      {failedDraft.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{error}</p>
                  )}
                  {failedDraft?.narration && (
                    <div className="failed-draft-actions">
                      <button
                        type="button"
                        className="failed-draft-toggle"
                        aria-expanded={showFailedDraft}
                        onClick={() => setShowFailedDraft((visible) => !visible)}
                      >
                        {showFailedDraft
                          ? failedDraft.draftKind === "scene_plan"
                            ? "실패한 장면 계획 닫기"
                            : "실패한 본문 닫기"
                          : failedDraft.draftKind === "scene_plan"
                            ? "실패한 장면 계획 보기"
                            : "실패한 본문 보기"}
                      </button>
                      {failedDraft.draftKind !== "scene_plan" && !failedDraft.recoveryExhausted && (
                        <button
                          type="button"
                          className="planned-recovery-button"
                          disabled={loading || !failedTurnRetryRef.current}
                          onClick={() => void handlePlannedRecovery()}
                        >
                          <Icon name="spark" /> 작업계획 구상 후 집필
                        </button>
                      )}
                      {failedDraft.recoveryExhausted && undoStack.length > 0 && (
                        <button type="button" className="planned-recovery-button" onClick={handleUndo}>
                          <Icon name="undo" /> 직전 턴으로 되돌리기
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="오류 알림 닫기"
                  onClick={() => {
                    setError("");
                    setFailedDraft(null);
                    setShowFailedDraft(false);
                    failedTurnRetryRef.current = null;
                  }}
                >
                  ×
                </button>
              </div>
              {showFailedDraft && failedDraft?.narration && (
                <section
                  className={`failed-draft-preview${failedDraft.draftKind === "scene_plan" ? " failed-scene-plan-preview" : ""}`}
                  aria-label={failedDraft.draftKind === "scene_plan"
                    ? "저장되지 않은 실패 장면 계획"
                    : "저장되지 않은 실패 본문"}
                >
                  <header>
                    <strong>
                      {failedDraft.draftKind === "scene_plan"
                        ? "FAILED SCENE PLAN · 저장되지 않음"
                        : "FAILED DRAFT · 저장되지 않음"}
                    </strong>
                    <small>비트 {failedDraft.beat}/{failedDraft.totalBeats}</small>
                  </header>
                  <div>{failedDraft.narration}</div>
                </section>
              )}
            </div>
          )}
          {!loading && latestRecommendations.length > 0 && (
            <div className="recommendation-strip">
              <div className="recommendation-header">
                <span className="recommendation-label">
                  <Icon name="spark" /> 지금 할 수 있는 행동
                </span>
                <small>현재 장면 기준 · 선택하면 입력창에 채워집니다</small>
              </div>
              <div className="recommendations">
                {latestRecommendations.map((reply, index) => (
                  <button
                    key={reply.label}
                    type="button"
                    disabled={loading || sessionSwitching || sessionRefreshing || syncConflict || !multiplayerCanWrite}
                    onClick={() => setInput(reply.label)}
                  >
                    <span className="recommendation-index">{index + 1}</span>
                    <strong>{reply.label}</strong>
                    <span
                      className={`recommendation-risk ${riskClass(reply.risk)}`}
                    >
                      {reply.risk}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="composer">
            <textarea
              rows={2}
              value={input}
              disabled={loading || sessionSwitching || sessionRefreshing || syncConflict || !multiplayerCanWrite}
              maxLength={MAX_PLAYER_INPUT_CHARS}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              enterKeyHint={mobileComposerDevice ? "enter" : "send"}
              placeholder={`${pack.player.name}의 행동이나 대사를 입력하세요…`}
              aria-label="다음 행동 입력"
            />
            <div className="composer-bottom">
              <button
                type="button"
                className="situation-button"
                disabled={loading || sessionSwitching || sessionRefreshing || syncConflict || !multiplayerCanWrite}
                onClick={() => setInput((value) => `${value}${value ? "\n" : ""}[상황 추가] `)}
              >
                <Icon name="plus" /> 상황 추가
              </button>
              <button
                type="button"
                className="continue-story-button"
                disabled={loading || sessionSwitching || sessionRefreshing || syncConflict || !multiplayerCanWrite}
                onClick={() => void handleContinue()}
                title="입력 없이 패키지의 정석 시나리오로 다음 장면 진행"
              >
                <Icon name="play" />
                <span>{loading ? "진행 중" : "이어서 진행"}</span>
                <small>정석 전개</small>
              </button>
              <span>
                {mobileComposerDevice
                  ? "줄바꿈은 그대로 입력 · 완료 버튼으로 전송"
                  : "Enter 전송 · Shift+Enter 줄바꿈"}
              </span>
              <button
                type="button"
                className="send-button"
                disabled={!input.trim() || loading || sessionSwitching || sessionRefreshing || syncConflict || !multiplayerCanWrite}
                onClick={() => void handleSend()}
                aria-label="입력 완료"
                title="입력 완료"
              >
                <Icon name="send" />
                <span>완료</span>
              </button>
            </div>
          </div>
        </footer>
      </section>

      <aside className="right-rail">
        <NexusInspector
          pack={pack}
          state={state}
          turns={turns}
          longTermMemories={longTermMemories}
          mediaUrls={mediaUrls}
          totalCostUsd={totalCostUsd}
          costMeterEntries={costMeterEntries}
          liveReliabilityAttempts={liveReliabilityAttempts}
          mode={lastMode}
          apiConnected={apiStatus === "connected"}
          onPreviewImage={setPreviewImage}
          eventControlsDisabled={loading || sessionSwitching || sessionRefreshing || syncConflict}
          onAdvanceEventBeat={() => handleManualEventAction("advance")}
          onCloseEventNow={() => handleManualEventAction("close")}
        />
      </aside>

      {mobilePanel && (
        <div className="mobile-overlay" role="dialog" aria-modal="true">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="패널 닫기"
            onClick={() => setMobilePanel(null)}
          />
          <div className={`mobile-sheet mobile-sheet-${mobilePanel}`}>
            <div className="mobile-sheet-head">
              <strong>{mobilePanel === "state" ? "이야기 정보" : "작품 · 채팅"}</strong>
              <button
                type="button"
                aria-label="패널 닫기"
                onClick={() => setMobilePanel(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            {mobilePanel === "state" ? (
              <NexusInspector
                pack={pack}
                state={state}
                turns={turns}
                longTermMemories={longTermMemories}
                mediaUrls={mediaUrls}
                totalCostUsd={totalCostUsd}
                costMeterEntries={costMeterEntries}
                liveReliabilityAttempts={liveReliabilityAttempts}
                mode={lastMode}
                apiConnected={apiStatus === "connected"}
                onPreviewImage={setPreviewImage}
                eventControlsDisabled={loading || sessionSwitching || sessionRefreshing || syncConflict}
                onAdvanceEventBeat={() => handleManualEventAction("advance")}
                onCloseEventNow={() => handleManualEventAction("close")}
                mobile
                initialTab={mobileInspectorTab}
              />
            ) : (
              <div className="mobile-menu-content">
                <nav className="rail-tabs mobile-library-tabs" aria-label="작품 및 채팅">
                  <button
                    type="button"
                    className={libraryTab === "works" ? "active" : ""}
                    onClick={() => setLibraryTab("works")}
                  ><Icon name="folder" /><span>작품</span><b>{projects.length}</b></button>
                  <button
                    type="button"
                    className={libraryTab === "chats" ? "active" : ""}
                    onClick={() => setLibraryTab("chats")}
                  ><Icon name="chat" /><span>채팅</span><b>{sessions.length}</b></button>
                </nav>

                {libraryTab === "works" ? (
                  <div className="mobile-library-list">
                    {projects.map((project) => (
                      <button
                        className={`project-card ${project.id === activeProjectId ? "active" : ""}`}
                        type="button"
                        key={project.id}
                        disabled={sessionSwitching || loading}
                        onPointerEnter={() => prefetchProjectSession(project.id)}
                        onPointerDown={() => prefetchProjectSession(project.id)}
                        onFocus={() => prefetchProjectSession(project.id)}
                        onClick={() => void handleSelectProject(project.id)}
                      >
                        <ProjectCover project={project} />
                        <span className="project-card-copy">
                          <strong>{project.title}</strong>
                          <small>{project.genre || "릴레이 소설"}</small>
                          <em>{project.sessionCount}개 세션</em>
                        </span>
                        <Icon name="chevron" />
                      </button>
                    ))}
                    {!projects.length && (
                      <div className="library-empty compact">
                        <span><Icon name="book" /></span>
                        <strong>ScenarioPack을 불러와 주세요</strong>
                        <p>ZIP을 열면 새 작품과 첫 세션이 함께 만들어집니다.</p>
                      </div>
                    )}
                    <button
                      className="import-button import-primary"
                      type="button"
                      disabled={loading || sessionSwitching}
                      onClick={() => fileInputRef.current?.click()}
                    ><Icon name="upload" /> ScenarioPack ZIP 불러오기</button>
                    <p className="import-limit">
                      최대 1GB · 대용량 원본도 계정 온라인 동기화
                    </p>
                  </div>
                ) : activeProject ? (
                  <div className="mobile-library-list session-list">
                    <div className="mobile-active-work">
                      <span>현재 작품</span><strong>{activeProject.title}</strong>
                    </div>
                    {activeProjectSessions.map((session) => (
                      <div
                        className={`session-card ${session.id === activeSessionId ? "active" : ""}`}
                        key={session.id}
                      >
                        <button
                          className="session-main"
                          type="button"
                          disabled={sessionSwitching || loading}
                          onPointerEnter={() => prefetchSession(session.id)}
                          onPointerDown={() => prefetchSession(session.id)}
                          onFocus={() => prefetchSession(session.id)}
                          onClick={() => void loadSession(session.id)}
                        >
                          <span className="session-icon"><Icon name="chat" /></span>
                          <span>
                            <strong>{session.name}</strong>
                            <small>{session.preview}</small>
                            <em>D+{session.day} · {session.turn}턴</em>
                          </span>
                        </button>
                        {session.id !== BUILT_IN_DEMO_SESSION_ID && (
                        <div className="session-actions mobile-session-actions">
                          <button
                            type="button"
                            aria-label={`${session.name} 채팅 세션 삭제`}
                            title={activeProjectSessions.length <= 1
                              ? "마지막 세션은 삭제할 수 없습니다"
                              : "채팅 세션 삭제"}
                            disabled={
                              sessionSwitching ||
                              loading
                            }
                            onClick={() => void handleDeleteSession(session)}
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                        )}
                      </div>
                    ))}
                    <button
                      className="new-session-card"
                      type="button"
                      onClick={() => void handleCreateSession()}
                    ><Icon name="plus" /><span>
                      <strong>{activeProject.id === BUILT_IN_DEMO_PROJECT_ID ? "데모 처음부터" : "새 이야기 시작"}</strong>
                      <small>{activeProject.id === BUILT_IN_DEMO_PROJECT_ID ? "기본 데모 상태 초기화" : "독립된 진행 생성"}</small>
                    </span></button>
                  </div>
                ) : (
                  <div className="library-empty compact">
                    <span><Icon name="chat" /></span>
                    <strong>채팅 세션이 없습니다</strong>
                    <button type="button" onClick={() => setLibraryTab("works")}>작품 탭으로 이동</button>
                  </div>
                )}

                <div className="engine-card">
                  <div className="engine-title">
                    <span className="spark-box"><Icon name="spark" /></span>
                    <div><strong>GPT-6 Luna</strong><small>{apiStatus === "connected" ? "API LIVE" : "DEMO MODE"}</small></div>
                  </div>
                  <div className="engine-row"><span>장면 이미지</span><b>{imageIntervalLabel(state.imageEvery)} · 최근 {GENERATED_SCENE_IMAGE_LIMIT}개</b></div>
                  <div className="engine-row"><span>패키지 이미지</span><b>{pack.mediaAssets?.length ?? 0}개 · 무료</b></div>
                  <div className="engine-row"><span>Studio Package {pack.packageVersion}</span><b>{pack.compatibility?.studioPackage15 ? pack.compatibility.package15FeatureNegotiated ? "계약 호환" : "협상 실패" : pack.compatibility?.fullSupport ? "완전 호환" : pack.compatibility?.supportedPackageVersion ? "기본 호환" : "레거시"}</b></div>
                  <div className="engine-row"><span>작품 독립 서사</span><b>{pack.narrativeRuntime ? "런타임 연결" : "미지정"}</b></div>
                  {pack.package15Runtime && <div className="engine-row"><span>Package 1.5</span><b>기능 협상 {pack.package15Runtime.negotiatedFeatures.length}개</b></div>}
                  <div className="engine-row"><span>AI 세계관</span><b>{pack.aiWorldContext?.enabled ? `LIVE · ${state.characterResearchCache?.length ?? 0}명 조사` : "미지정"}</b></div>
                  <div className="engine-row"><span>장기 기억</span><b>{longTermMemories.length}건 · 최근 {FULL_CONTEXT_TURN_LIMIT}개 전문</b></div>
                  <div className="engine-row"><span>플레이어 주권</span><b>보호 중</b></div>
                  <button
                    className="engine-settings-button"
                    type="button"
                    onClick={() => openSettings("connection")}
                  >
                    <Icon name="settings" /> API 키 연결 설정
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}

      {longTermMemoryOpen && (
        <LongTermMemoryDialog
          memories={longTermMemories}
          onClose={() => setLongTermMemoryOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          runtimeEngine={runtimeEngine}
          activeTab={settingsTab}
          apiKeyDraft={apiKeyDraft}
          apiStatus={apiStatus}
          apiMessage={apiMessage}
          showApiKey={showApiKey}
          rememberApiKey={rememberApiKey}
          themeMode={themeMode}
          readingWidth={readingWidth}
          readingFontSize={readingFontSize}
          typingSpeed={typingSpeed}
          imageQuality={state.imageQuality}
          imageResolution={state.imageResolution}
          imageAspect={state.imageAspect}
          imageEvery={state.imageEvery}
          pack={pack}
          longTermMemoryCount={longTermMemories.length}
          projects={projects}
          activeProjectId={activeProjectId}
          deletingProjectId={deletingProjectId}
          thumbnailSavingProjectId={thumbnailSavingProjectId}
          onTabChange={setSettingsTab}
          onApiKeyChange={(value) => {
            apiKeyOperationRef.current++;
            setApiKeyDraft(value);
            if (value.trim() !== apiKey) {
              setApiKey("");
              setApiStatus("disconnected");
              setApiMessage(
                "수정한 키로 연결 확인을 다시 실행해 주세요. 확인 전에는 모의 엔진을 사용합니다.",
              );
            }
          }}
          onToggleApiKey={() => setShowApiKey((visible) => !visible)}
          onRememberApiKeyChange={(remember) => {
            void handleRememberApiKeyChange(remember);
          }}
          onThemeModeChange={(theme) => {
            setThemeMode(theme);
            setNotice(`${theme === "dark" ? "다크" : "라이트"} 테마로 변경했습니다.`);
          }}
          onReadingWidthChange={(width) => {
            setReadingWidth(width);
            setNotice(`본문 폭을 ${width === "narrow" ? "좁게" : width === "wide" ? "넓게" : "보통"}로 변경했습니다.`);
          }}
          onReadingFontSizeChange={(size) => {
            setReadingFontSize(size);
            setNotice(`본문 글자 크기를 ${size === "small" ? "소" : size === "medium" ? "중" : "대"}로 변경했습니다.`);
          }}
          onTypingSpeedChange={(speed) => {
            setTypingSpeed(speed);
            setNotice(`본문 표시 속도를 ${speed === "slow" ? "천천히" : speed === "natural" ? "자연스럽게" : speed === "fast" ? "빠르게" : "즉시"}로 변경했습니다.`);
          }}
          onImageQualityChange={(quality) => {
            setState((current) => ({ ...current, imageQuality: quality }));
            setNotice(`이미지 품질을 ${imageQualityLabel(quality)}로 변경했습니다.`);
          }}
          onImageResolutionChange={(resolution) => {
            setState((current) => ({ ...current, imageResolution: resolution }));
            setNotice(`새 이미지 저장 해상도를 ${resolution}로 변경했습니다.`);
          }}
          onImageAspectChange={(aspect) => {
            setState((current) => ({ ...current, imageAspect: aspect }));
            setNotice(`새 이미지 비율을 ${imageAspectLabel(aspect)}로 변경했습니다.`);
          }}
          onImageEveryChange={(interval) => {
            setState((current) => ({ ...current, imageEvery: interval }));
            setNotice(
              interval === 0
                ? "정기 장면 이미지 생성을 껐습니다. 주요 인물 첫 등장 이미지는 계속 생성됩니다."
                : `장면 이미지를 ${interval}턴마다 생성하도록 변경했습니다.`,
            );
          }}
          onDeleteProject={(project) => void handleDeleteProject(project)}
          onDeleteCortexProject={(project) => void handleDeleteCortexProject(project)}
          onThumbnailChange={(project, file) => void handleProjectThumbnail(project, file)}
          onThumbnailDelete={(project) => void handleDeleteProjectThumbnail(project)}
          onConnect={() => void handleConnectApi()}
          onDisconnect={() => void handleDisconnectApi()}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {previewImage && (
        <ImageLightbox
          image={previewImage}
          onClose={closePreviewImage}
        />
      )}
    </main>
  );
}
