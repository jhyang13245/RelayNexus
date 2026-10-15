// 지음 작업 JSON·CortexPack 빌드 스크립트.
// story.mjs(사건 75개)를 지음 작업 모델로 직접 옮긴다. 지음의 'AI 초안 가져오기' 스키마는 루트당 사건 12개·인물 12명까지라
// 그 변환기와 같은 필드 대응을 따르되 제한 없이 만든다. 결과는 지음의 "작업 JSON 저장"과 같은 스냅샷 형식이며,
// 같은 경로(스냅샷 → normalizeProject)로 되읽어 검증한 뒤 지음의 패키지 ZIP 저장과 같은 함수로 CortexPack을 만든다.
//
// 단청 v1.34부터 작가·판정 AI는 사건 설명·세계관 개요·비공개 설정을 받지 않고, 현재 사건의 종결 조건·제약·대안과
// 현재 사건 정보(currentFacts)만 받는다(미래 정보로 인한 스포일러를 막기 위한 설계). 그래서 사건마다 currentFacts를 채우고,
// 문체 지침과 공개 규칙은 런타임이 읽는 문체 칸(customRules·proseStyle)에 싣는다.
//
// 사용법 (단청 소스 v1.34.19 기준):
//   esbuild build.ts --bundle --platform=node --format=esm --loader:.json=json \
//     --alias:@jieum=<단청 소스>/features/jieum --outfile=build.mjs
//   node build.mjs <출력 JSON 경로> [출력 패키지 ZIP 경로]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeProjectForPackageTarget, blankStoryEvent, normalizeProject, validateProject, type Project } from "@jieum/studio-model";
import { eventDesign } from "@jieum/cortex-event-design";
import { canonDesign, canonIssues, emptyCanonEvent } from "@jieum/canon-design";
import { buildProjectSnapshot, exportScenarioPack } from "@jieum/studio-export";
import { assertCortexExportReviewed } from "@jieum/cortex-export-review";
import * as S from "./story.mjs";

const [out, zipOut] = process.argv.slice(2);
if (!out) throw new Error("출력 JSON 경로를 지정하세요.");
const here = path.dirname(fileURLToPath(import.meta.url));
const imageDir = process.env.EMPTY_HAND_IMAGES || path.join(here, "images");
if (!fs.existsSync(imageDir)) throw new Error(`인물 그림 폴더가 없습니다: ${imageDir} (EMPTY_HAND_IMAGES로 source/images 경로를 지정하세요)`);
const addedAt = "2026-10-07T00:00:00.000Z";

// 인물 기준 이미지(사용자가 넣은 그림을 WebP로 다시 압축한 것). 이미지가 없는 인물은 런타임 생성 규칙을 따른다.
function images(id: string, label: string) {
  const file = path.join(imageDir, `${id}.webp`);
  if (!fs.existsSync(file)) return [];
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") throw new Error(`${file}: WebP 파일이 아닙니다.`);
  return [{
    id: `IMG_${id}`, fileName: `${id}.webp`, mimeType: "image/webp",
    dataUrl: `data:image/webp;base64,${bytes.toString("base64")}`,
    label, isPrimary: true, addedAt, byteLength: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    imageOptimization: { profile: "screen_v1" as const, width: 1088, height: 608, originalBytes: bytes.length },
  }];
}

// 작품 표지(사용자가 지음에서 넣은 표지와 같은 파일·메타데이터).
function cover() {
  const file = path.join(imageDir, "cover.webp");
  if (!fs.existsSync(file)) return undefined;
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") throw new Error(`${file}: WebP 파일이 아닙니다.`);
  return {
    id: "COVER_muzklt5h_2dfbgw", fileName: "cover.webp", mimeType: "image/webp",
    dataUrl: `data:image/webp;base64,${bytes.toString("base64")}`,
    label: "작품 표지", isPrimary: true, addedAt: "2026-10-08T13:26:46.229Z", byteLength: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    imageOptimization: { profile: "screen_v1" as const, width: 960, height: 1440, originalBytes: 2995476 },
  };
}

const p = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
const noFirstImage = new Set(["hanbaek", "garrick", "bern", "ella"]);
const person = (c: any, isPlayer: boolean) => ({
  ...p.player, ...c, isPlayer, role: c.role, importance: c.importance,
  visualAnchor: c.appearance, images: images(c.id, c.name), imageOnFirstAppearance: !noFirstImage.has(c.id),
});

let project: Project = normalizeProject({
  ...p,
  title: S.meta.title, genre: S.meta.genre, worldType: S.meta.worldType, tone: S.meta.tone, notes: S.meta.notes,
  startDate: S.meta.startDate, startLocation: S.meta.startLocation,
  world: { ...p.world, overview: S.world, fixedCanon: S.fixedRules },
  gmData: { ...p.gmData, worldTruthLedger: S.privateWorld },
  player: person(S.player, true),
  npcs: S.npcs.map((c: any) => person(c, false)),
  factions: S.factions.map((f: any) => ({ ...f, officialGoal: f.publicInfo, hiddenGoal: f.hiddenInfo })),
  opening: {
    ...p.opening, openingLine: S.opening.prologue, currentSituation: S.opening.situation, openingLocation: S.meta.startLocation,
    openingTime: S.opening.time, recommendedReply1: S.opening.replies[0], recommendedReply2: S.opening.replies[1], recommendedReply3: S.opening.replies[2],
  },
  // 런타임은 등록된 문체 키(narrationPerson·proseStyle·customRules 등)만 작가에게 넘긴다. 지음의 「추가 서술 요청」이 저장되는
  // additionalRules와 viewpoint는 넘기지 않으므로, 같은 내용을 customRules에도 싣고 proseStyle을 지음의 문장 스타일과 맞춘다.
  style: {
    ...p.style, narrationPerson: S.style.viewpoint, viewpoint: S.style.viewpoint, proseStyle: S.style.proseStyle, sentenceStyle: S.style.proseStyle,
    additionalRules: S.style.extraStyle, customRules: [p.style.customRules, S.style.extraStyle, S.publicRules].filter(Boolean).join("\n"),
  },
  coverImage: cover(),
});

// 사건: 작성 순서가 곧 진행 순서다(정해진 정사 사건이므로 유형은 Fixed). 분기 사건의 다음 사건은 기본 경로, 갈래 사건은 next로 합류 지점을 지정한다.
const list = S.events as any[];
// 사건 설명 = 본문 + [핵심 공개](그 사건에서 독자가 새로 알게 되는 1~2개) + 작가 메모([시간]·[시우의 마음]·[관계의 흔적]·[일상]·[끝 장면]) + 사용자 연출 메모.
const revealOf = (e: any) => e.reveal ?? (S.reveals as Record<string, string>)[e.id];
const memosOf = (e: any) => (S.memos as Record<string, string[]>)[e.id] ?? [];
const withNote = (e: any) => [e.description, revealOf(e) ? `[핵심 공개] ${revealOf(e)}` : "", ...memosOf(e), (S.notes as Record<string, string>)[e.id]].filter(Boolean).join("\n\n");
// 현재 사건 정보 = 사건별 본문(facts) + [핵심 공개] + 작가 메모 + 연출 메모 + 그 사건의 복선.
// 복선은 심는 사건에 '심는 법'만, 회수하는 사건에 '회수 결과'만 넣는다(심는 사건에서 회수 결과가 새지 않게).
const eventNames = new Set(list.map((e) => `「${e.name}」`));
const factRows = (e: any) => {
  const own = (S.facts as Record<string, any[]>)[e.id];
  if (!own?.length) throw new Error(`${e.id}: 현재 사건 정보가 없습니다.`);
  const light = (f: any) => (f.light ? " 가벼운 복선이라 한두 문장으로 스치듯 다룬다." : "");
  const rows: Array<string | [string, string]> = [
    ...own,
    ...(revealOf(e) ? [`[핵심 공개] 이 사건에서 새로 드러나는 큰 사실은 이것뿐이다. ${revealOf(e)}`] : []),
    ...memosOf(e),
    ...((S.notes as Record<string, string>)[e.id] ? [(S.notes as Record<string, string>)[e.id]] : []),
    ...S.foreshadowings.filter((f: any) => f.plant === e.id).map((f: any) => `[복선 심기] ${f.title}: ${f.plantHow} 뜻은 설명하지 않고, 회수 결과는 이 사건에서 미리 드러내지 않는다.${light(f)}`),
    ...S.foreshadowings.filter((f: any) => f.payoff === e.id).map((f: any) => `[복선 회수] ${f.title}: ${f.payoffResult}${light(f)}`),
  ];
  return rows.map((row, n) => {
    const [kind, text] = Array.isArray(row) ? row : ["FIXED_FACT", row];
    for (const name of eventNames) if (text.includes(name)) throw new Error(`${e.id}: 현재 사건 정보에 사건 제목 ${name}이 있습니다. 작가 AI는 지난 사건 제목을 모르므로 실제로 일어난 일로 적으세요.`);
    return { id: `${e.id}-f${n + 1}`, text, kind: kind as "FIXED_FACT" | "REQUIRED_RESULT" | "OFFSCREEN_RESULT" };
  });
};
project.events = list.map((e, i) => {
  const b = blankStoryEvent(i + 1);
  const next = e.fallback || e.next || list[i + 1]?.id || "";
  return {
    ...b, id: e.id, name: e.name, type: "Fixed" as const, description: withNote(e), required: true, nextEventId: next,
    revealTerms: (S.revealTerms as Record<string, string[]>)[e.id] ?? [],
    cortexDesign: {
      ...eventDesign(b), otherViewpoint: false, viewpoint: "", occurrenceEnabled: false, occurrence: "",
      closureConditions: e.closure.map((text: string, n: number) => ({ id: `${e.id}-c${n + 1}`, text })),
      currentFacts: factRows(e),
      constraints: e.constraints ?? "", unmet: e.unmet ?? "",
    },
  };
});

const arcStart = new Map(S.arcs.map((a: any) => [a.events[0].id, a.name]));
const d = canonDesign(project);
d.mode = "single";
d.routes = [S.route];
d.stats = S.stats;
d.openingSituation = S.opening.situation;
d.events = Object.fromEntries(list.map((e, i) => [e.id, {
  ...emptyCanonEvent(S.route.id),
  ending: i === list.length - 1,
  authorComment: arcStart.get(e.id) ?? "",
  branching: !!e.branches?.length,
  branches: (e.branches ?? []).map((b: any, n: number) => ({
    id: `br_${e.id}_${n + 1}`, kind: b.kind, criterion: b.criterion ?? "",
    statId: b.stat ?? "", threshold: b.value ?? 0, comparison: b.comparison ?? "gte", nextEventId: b.next,
  })),
  fallbackEventId: e.fallback ?? "",
  effects: (e.effects ?? []).map(([statId, amount, criterion]: [string, number, string], n: number) => ({ id: `ef_${e.id}_${n + 1}`, statId, amount, criterion })),
}]));
project.canonDesign = d;

project.foreshadowings = S.foreshadowings.map((f: any, i: number) => ({
  id: `FS_${String(i + 1).padStart(2, "0")}`, title: f.title, visibility: "Hidden", status: "Planned",
  earliestDate: "", latestDate: "", plantingScene: f.plant, reinforcementPlan: f.plantHow,
  payoffConditions: f.payoff, payoffResult: f.payoffResult, relatedEntities: "",
  misdirection: "심는 장면에서는 이 단서의 뜻을 인물이 설명하거나 서술이 풀어 주지 않는다.",
  notes: f.light ? "가벼운 복선이다. 장면의 중심이 아니므로 심을 때도 회수할 때도 한두 문장으로 스치듯 다룬다." : "",
}));
project.disclosure = { protectedTerms: S.protectedTerms };
project.protagonistInvariants = [...project.protagonistInvariants, ...S.invariants];
project.visualBible = { ...project.visualBible, ...S.visualBible };

const people = [project.player, ...project.npcs].map((c) => c.id);
if (new Set(people).size !== people.length) throw new Error("인물 ID가 중복됩니다.");

// 지음의 파일 가져오기와 같은 경로(스냅샷 → project → normalizeProject)로 되읽어 검증한다.
const snapshot = buildProjectSnapshot(project, addedAt);
const text = JSON.stringify(snapshot, null, 2);
const reloaded = normalizeProject(JSON.parse(text).project);

const issues = validateProject(reloaded);
const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");
const canon = canonIssues(reloaded);
const imageCount = [reloaded.player, ...reloaded.npcs].filter((c) => c.images.length).length;
const factCount = reloaded.events.reduce((n, e) => n + (e.cortexDesign?.currentFacts?.length ?? 0), 0);
console.log(`현재 사건 정보 ${factCount}개 · 표지 ${reloaded.coverImage ? "있음" : "없음"}`);
console.log(`사건 ${reloaded.events.length}개 · 인물 ${1 + reloaded.npcs.length}명(이미지 ${imageCount}명) · 복선 ${reloaded.foreshadowings.length}개 · 수치 ${reloaded.canonDesign!.stats.length}개 · 루트 ${reloaded.canonDesign!.routes.length}개(${reloaded.canonDesign!.mode})`);
console.log(`정사 설계 문제 ${canon.length}건 · 검증 오류 ${errors.length}건 · 경고 ${warnings.length}건`);
for (const i of [...canon, ...issues.filter((i) => i.severity !== "info")]) console.log(`  [${i.severity}] ${i.area}: ${i.message}`);
if (errors.length || canon.length) process.exit(1);

fs.writeFileSync(out, text + "\n");
console.log(`기록: ${out} (${Buffer.byteLength(text)} bytes)`);

// 지음 「검증·내보내기 → 패키지 ZIP 저장」과 같은 확인(보호어·호환성·검증 오류)을 거친 뒤 같은 함수로 패키지를 만든다.
if (zipOut) {
  assertCortexExportReviewed(reloaded, {});
  const pack = await exportScenarioPack(reloaded, false);
  fs.writeFileSync(zipOut, Buffer.from(await pack.blob.arrayBuffer()));
  console.log(`기록: ${zipOut} (${pack.blobBytes} bytes)`);
}
