// 지음 작업 JSON 빌드 스크립트.
// 단청 소스의 지음 모듈(@jieum 별칭)로 초안을 변환·정규화·검증한 뒤, 지음의 "작업 JSON 저장"과 같은 스냅샷 형식으로 기록한다.
//
// 사용법 (단청 소스 v1.28.0 기준):
//   esbuild build.ts --bundle --platform=node --format=esm --loader:.json=json \
//     --alias:@jieum=<단청 소스>/features/jieum --outfile=build.mjs
//   node build.mjs <출력 JSON 경로> [출력 패키지 ZIP 경로]
import fs from "node:fs";
import { projectFromGeneratedDraft } from "@jieum/generated-draft";
import { normalizeProject, validateProject, type Project } from "@jieum/studio-model";
import { buildProjectSnapshot, exportScenarioPack } from "@jieum/studio-export";
import { assertCortexExportReviewed } from "@jieum/cortex-export-review";
import { canonIssues } from "@jieum/canon-design";
import { draft, extras } from "./draft.mjs";

const [out, zipOut] = process.argv.slice(2);
if (!out) throw new Error("출력 JSON 경로를 지정하세요.");

const project: Project = projectFromGeneratedDraft(draft, "intelligent_canon");

Object.assign(project, extras.project);

// 시작 상황은 초안의 문장만 쓴다(변환기는 시작 지역을 덧붙인다).
const design = project.canonDesign!;
design.openingSituation = draft.opening.situation;
design.stats = design.stats.map((s) => (extras.revealWhenChanged.includes(s.id) ? { ...s, revealWhenChanged: true } : s));

project.disclosure = { protectedTerms: extras.protectedTerms };
project.events = project.events.map((e) => (extras.revealTerms[e.id] ? { ...e, revealTerms: extras.revealTerms[e.id] } : e));

project.npcs = project.npcs.map((c) => ({
  ...c,
  importance: extras.importance[c.id] ?? c.importance,
  imageOnFirstAppearance: !extras.noFirstAppearanceImage.includes(c.id),
}));

project.protagonistInvariants = [...project.protagonistInvariants, ...extras.invariants];
project.visualBible = { ...project.visualBible, ...extras.visualBible };

project.foreshadowings = extras.foreshadowings.map((f) => ({
  id: f.id, title: f.title, visibility: "Hidden", status: "Planned",
  earliestDate: "", latestDate: "", plantingScene: f.plantingScene, reinforcementPlan: "",
  payoffConditions: f.payoffConditions, payoffResult: "", relatedEntities: "", misdirection: "", notes: "",
}));

// 지음의 파일 가져오기와 같은 경로(스냅샷 → project → normalizeProject)로 되읽어 검증한다.
const snapshot = buildProjectSnapshot(project, new Date().toISOString());
const text = JSON.stringify(snapshot, null, 2);
const reloaded = normalizeProject(JSON.parse(text).project);

const issues = validateProject(reloaded);
const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");
console.log(`사건 ${reloaded.events.length}개 · 인물 ${1 + reloaded.npcs.length}명 · 복선 ${reloaded.foreshadowings.length}개 · 수치 ${reloaded.canonDesign!.stats.length}개 · 루트 ${reloaded.canonDesign!.routes.length}개`);
console.log(`정사 설계 문제 ${canonIssues(reloaded).length}건 · 검증 오류 ${errors.length}건 · 경고 ${warnings.length}건`);
for (const i of issues.filter((i) => i.severity !== "info")) console.log(`  [${i.severity}] ${i.area}: ${i.message}`);
if (errors.length) process.exit(1);

fs.writeFileSync(out, text + "\n");
console.log(`기록: ${out} (${Buffer.byteLength(text)} bytes)`);

// 지음 「검증·내보내기 → 패키지 ZIP 저장」과 같은 확인(보호어·호환성·검증 오류)을 거친 뒤 같은 함수로 패키지를 만든다.
if (zipOut) {
  assertCortexExportReviewed(reloaded, {});
  const pack = await exportScenarioPack(reloaded, false);
  fs.writeFileSync(zipOut, Buffer.from(await pack.blob.arrayBuffer()));
  console.log(`기록: ${zipOut} (${pack.blobBytes} bytes)`);
}
