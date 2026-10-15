// Builds the 「이강백전」 지음(지능형 정사) project with the real Jieum model code of 단청 v1.34.19,
// validates it, writes the 지음 work JSON and exports the CortexPack ZIP.
// Usage (from the 단청 v1.34.19 source root, after `npm ci`):
//   node --import tsx <repo>/works/lee-gangbaek-jeon/source/build-project.mts <repo>/works/lee-gangbaek-jeon/source <outDir>
// The source root defaults to the current directory; override with DANCHEONG_SRC.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import * as content from "./content/settings.mts";

const SRC = resolve(process.env.DANCHEONG_SRC || process.cwd());
const load = (rel: string) => import(pathToFileURL(join(SRC, rel)).href);
const { makeNewStudioProject, normalizeProject, validateProject, blankStoryEvent, blankCharacter } = await load("features/jieum/studio-model.ts");
const { activateCanonAuthoring, emptyCanonEvent, compileCanonDesign } = await load("features/jieum/canon-design.ts");
const { lintCortexPackage } = await load("features/jieum/cortex-package-lint.ts");
const { exportScenarioPack, buildProjectSnapshot, extractStudioProjectFromPackage } = await load("features/jieum/studio-export.ts");
type Project = any; type StoryEvent = any; type Character = any;

const [workDir, outDir] = process.argv.slice(2);
if (!workDir || !outDir) throw new Error("usage: build-project.ts <workDir> <outDir>");
mkdirSync(outDir, { recursive: true });

type Draft = {
  episode: number; part: number; sections?: string; title: string; storyDay?: number; timePlace?: string; otherViewpoint?: string;
  description: string; facts: { kind: "FIXED_FACT" | "REQUIRED_RESULT" | "OFFSCREEN_RESULT"; text: string }[];
  closure: string[]; constraints?: string; unmet?: string; keyLines?: string[];
  foreshadow?: { role: string; title: string; note?: string }[]; newAbilities?: string[]; uncertain?: string;
};

const draftDir = join(workDir, "drafts");
const drafts: Draft[] = readdirSync(draftDir).filter((f) => /^ep\d\d\.json$/.test(f)).sort()
  .flatMap((f) => (JSON.parse(readFileSync(join(draftDir, f), "utf8")) as Draft[]).map((d) => ({ ...d, episode: Number(d.episode) || Number(f.slice(2, 4)) })))
  .sort((a, b) => a.episode - b.episode || a.part - b.part);
for (let n = 1; n <= 36; n++) if (!drafts.some((d) => d.episode === n)) throw new Error(`missing drafts for episode ${n}`);

const actOf = (ep: number) => ep <= 20 ? "1부 · 낙양~서안 편" : ep <= 23 ? "1부 · 경사행" : "1부 · 경사 편 1막";
const eventId = (d: Draft) => `EV_E${String(d.episode).padStart(2, "0")}_${d.part}`;
const clean = (s?: string) => String(s ?? "").trim();

let project: Project = activateCanonAuthoring(makeNewStudioProject("intelligent_canon"));
const { meta } = content;
project = {
  ...project,
  projectId: "RN-LEEGANGBAEK-PART1",
  title: meta.title, genre: meta.genre, worldType: meta.worldType, startDate: meta.startDate,
  startLocation: meta.startLocation, tone: meta.tone, author: meta.author, notes: meta.notes,
  randomSeed: 202610151,
};
project.world = { ...project.world, overview: content.world, fixedCanon: content.rules };
for (const key of Object.keys(project.world)) if (!["overview", "fixedCanon"].includes(key)) project.world[key] = "";
project.gmData = { ...project.gmData, worldTruthLedger: content.privateWorld };
for (const key of Object.keys(project.gmData)) if (key !== "worldTruthLedger") project.gmData[key] = "";
project.aiWorldContext = { ...project.aiWorldContext, enabled: true, premise: content.reference.premise, referenceFramework: content.reference.framework, localContext: content.reference.local, protectedCanon: "", avoidElements: "" };
project.disclosure = { protectedTerms: [...content.protectedTerms] };

const person = (c: (typeof content.npcs)[number], isPlayer: boolean): Character => ({
  ...blankCharacter(isPlayer), id: c.id, name: c.name, role: c.role, age: c.age, gender: c.gender, importance: c.importance,
  aliases: c.aliases ?? [], appearance: c.appearance, visualAnchor: c.visualAnchor, publicInfo: c.publicInfo,
  personality: c.personality ?? "", speechStyle: c.speechStyle ?? "", hiddenInfo: c.hiddenInfo ?? "",
  imageOnFirstAppearance: false, visualLock: true, imageFallback: "generate_anime", images: [], isPlayer, preRevealAlias: "",
});
project.player = person(content.player, true);
project.npcs = content.npcs.map((c) => person(c, false));
project.protagonistInvariants = content.invariants.map((i) => ({ ...i }));
project.factions = content.factions.map((f) => ({ id: f.id, name: f.name, leader: "", officialGoal: [f.leader ? `이끄는 사람: ${f.leader}` : "", f.officialGoal].filter(Boolean).join("\n"), hiddenGoal: f.hiddenGoal, resources: "", territory: "", income: "", militaryPower: "", intelligencePower: "", politicalPower: "", internalConflict: "", allies: "", enemies: "", playerRelation: "", currentPlan: "" }));
project.statusWindow = { ...project.statusWindow, enabled: false };
project.visualBible = { ...project.visualBible, enabled: true, ...content.visual };
project.turnPresentation = { ...project.turnPresentation, sceneImage: { ...project.turnPresentation.sceneImage, styleHint: "수묵 채색 무협 일러스트, 명대풍 의복과 거리" } };

// Events
const events: StoryEvent[] = drafts.map((d, index) => {
  const id = eventId(d);
  const facts = [
    ...(clean(d.timePlace) ? [{ kind: "FIXED_FACT" as const, text: `시각·장소: ${clean(d.timePlace)}` }] : []),
    ...d.facts.filter((f) => clean(f.text)).map((f) => ({ kind: (["FIXED_FACT", "REQUIRED_RESULT", "OFFSCREEN_RESULT"].includes(f.kind) ? f.kind : "FIXED_FACT") as "FIXED_FACT", text: clean(f.text) })),
    ...(d.keyLines ?? []).filter((l) => clean(l)).map((l) => ({ kind: "FIXED_FACT" as const, text: `정사의 대사·문장(장면에 살려 쓴다): ${clean(l)}` })),
    ...(d.newAbilities ?? []).filter((a) => clean(a)).map((a) => ({ kind: "REQUIRED_RESULT" as const, text: `강백이 이 사건에서 얻는 것(근거와 대가를 함께 쓴다): ${clean(a)}` })),
  ].map((f, i) => ({ id: `${id}-fact-${i + 1}`, ...f }));
  return {
    ...blankStoryEvent(index + 1), id, name: `${d.episode}화 · ${clean(d.title)}`, kind: "event", type: "Fixed", visibility: "Public", status: "Planned",
    required: true, sequence: index + 1, act: actOf(d.episode), storyDay: Number.isFinite(d.storyDay) ? Math.max(0, Number(d.storyDay)) : 0,
    description: clean(d.description), nextEventId: "",
    cortexDesign: {
      schema: "STUDIO_EVENT_DESIGN_V2", occurrenceEnabled: false, occurrence: "",
      otherViewpoint: Boolean(clean(d.otherViewpoint)), viewpoint: clean(d.otherViewpoint),
      currentFacts: facts,
      closureConditions: d.closure.filter((c) => clean(c)).map((text, i) => ({ id: `${id}-close-${i + 1}`, text: clean(text) })),
      closure: d.closure.map(clean).filter(Boolean).join("\n\n"),
      selectionScope: "", constraints: clean(d.constraints), success: "", unmet: clean(d.unmet),
    },
  };
});
project.events = events;

// Foreshadowing (plant/payoff both inside this route)
const pick = (episode: number, part: number) => {
  const hit = drafts.find((d) => d.episode === episode && d.part === part);
  if (!hit) throw new Error(`foreshadow anchor not found: ${episode}-${part}`);
  return eventId(hit);
};
const fsh = (id: string, plant: [number, number], payoff: [number, number], title: string, payoffResult: string) => ({
  id, title, visibility: "Hidden" as const, status: "Planned" as const, earliestDate: "", latestDate: "",
  plantingScene: pick(...plant), reinforcementPlan: "", payoffConditions: pick(...payoff), payoffResult, relatedEntities: "", misdirection: "", notes: "",
});
// title = what is planted (shown in the planting event); payoffResult = what the payoff event reveals.
project.foreshadowings = [
  fsh("FSH_SEAL", [1, 1], [2, 3], "다섯 번째 수레의 약재 상자 하나만 봉랍이 검붉고, 바퀴 축이 그쪽으로 내려앉아 있으며, 약초 냄새 밑으로 쇠 비린내가 난다. 상자 속이 무엇인지는 아직 아무도 말하지 않는다.", "효산 협곡에서 그 상자 속의 것이 쇠뇌 방아쇠(노기)이고, 옆면에 네모난 군기고 봉인이 찍혀 있다는 것이 드러난다."),
  fsh("FSH_KNOT", [1, 1], [10, 1], "강백의 짐꾼 매듭은 단단히 묶이되 끝을 한 번 당기면 풀린다. 늙은 이씨가 그 매듭을 가르치며 붙인 말을 강백은 잊었다.", "마광이 죽은 손에 쥔 짐꾼 매듭에서 강백이 늙은이의 말 \"묶여도 풀 수 있으면, 그건 묶인 게 아니다\"를 기억해 낸다."),
  fsh("FSH_JAR", [1, 1], [16, 3], "첫날 밤 석두가 젖은 강백에게 누런 무명 저고리를 던지며 \"서안 가서 술 한 병으로\" 돌려받겠다고 한다.", "서안에서 강백이 진목이 준 호리병 하나로 석두의 저고리 값을 치른다."),
  fsh("FSH_RING", [5, 2], [17, 1], "장락문 세관 곁에 옥가락지를 낀 희고 가는 손이 보인다. 그 손의 주인은 이름이 나오지 않는다.", "그 손이 가락지를 뺀 하얀 띠로 다시 나타난다."),
  fsh("FSH_CONDITION2", [9, 1], [23, 2], "양하의 조건 ②: \"이걸로 사람을 죽이러 가는 날이 오면 나한테 먼저 와라.\"", "죽이러 간 날 없이 죽인 날을 맞은 강백에게 진목이 그 조건을 꺼내고, \"다음에 사람을 죽이게 되면 이 패를 쥐어라\"로 고쳐 준다."),
  fsh("FSH_GAPJIN", [4, 1], [16, 3], "석두가 기억하는 갑진년 동짓달: 팥죽을 먹고 떠난 표행, 마을 안쪽의 칼 소리, 모두 달렸는데 늙은 이씨만 짐을 진 채 걸어서 지나갔고, 반 시진 뒤 지게 위에 아이가 앉아 있었다.", "서기 부자의 책에서 그달의 일이 \"갑진년 동짓달, 목 서리 입회하에 노기를 이름 없는 자들에게, 하남 서쪽 산골 마을\"로 드러난다(마을 이름은 재가 되었다)."),
  fsh("FSH_NINTH", [15, 3], [20, 1], "진목이 다음 가르침을 남겨 둔다(떠나기 전에 가르칠 것).", "서안을 떠나기 전, 대추나무 가지로 아홉 번째를 가르친다: 여덟 번 막고 아홉 번째는 받아서 흘리며 들어간다. 첫 시도는 굳어서 실패한다."),
  fsh("FSH_REVERSE", [14, 3], [21, 2], "진목의 숙제: 뒤집은 분경, 도망치는 쪽의 분경. 아직 붙지 않는다.", "경사로 가는 길, 말 위에서 뒤집은 분경(역분경)이 붙는다."),
  fsh("FSH_BLACKTAG", [18, 3], [19, 3], "피투성이로 돌아온 여인이 위는 둥글고 아래는 각진, 무늬 없는 검은 나무 패를 가져온다.", "옻칠 아래에서 문파 글자 靑과 이름 陳穆이 드러나고, 청산검문의 명패임이 밝혀진다."),
  fsh("FSH_ANTIDOTE", [18, 1], [28, 2], "방소의 왼 소매에서 붉은 마개 작은 병(해독환)이 나온다.", "어구교에서 강백이 남은 해독환 한 알을 쓴다. 병에는 한 알이 남는다."),
  fsh("FSH_THUMB", [23, 3], [30, 2], "성문 앞 형부 시랑의 손에는 붓 굳은살이 없고, 엄지가 넷째 손가락 맨살을 쓴다. 문루에는 쇠뇌 둘이 서 있다.", "후당에서 시랑의 엄지 버릇이 \"위에서\"라는 말에만 나온다는 것이 보인다. 그는 왼손으로 엄지를 덮는다."),
  fsh("FSH_SAMEHAND", [4, 3], [27, 2], "협박장(\"짐꾼 이강백도 함께 둘 것\")은 반듯한 글씨에 좋은 먹이다. 누가 쓴 것인지는 모른다.", "경사에서 같은 손의 세 버릇(꺾임마다 두 번 눌러 먹이 고임, 글자 사이 새끼손가락 한 마디, 줄 첫머리 붓 털기)과 푸른빛 먹이 짚인다. 손의 주인은 드러나지 않는다."),
  fsh("FSH_TONGHYE", [24, 3], [34, 2], "어느 관아에도 딸리지 않은 집 통혜관. 같은 방 같은 등잔 아래서 생포자가 숨을 멈춘다.", "통혜관 장작 광 바닥 판자 아래 돌계단과 도랑 통로가 드러나고, 도랑은 황성 해자 수문 쪽으로 끊긴다."),
  fsh("FSH_TAGPOISON", [28, 2], [35, 2], "어구교에서 강백의 명패 李 자 옆에 독침이 박힌다. 명패에 독이 묻는다.", "잿물 하룻밤과 볕 사흘(방소의 법)로 해독해 강백이 명패를 맨손으로 쥔다. 검은 결은 흔적으로 남는다."),
];

// canon design: single route, last event is the ending, letter effects per episode
const d0 = project.canonDesign!;
const lastId = events.at(-1)!.id;
const canonEvents: Record<string, ReturnType<typeof emptyCanonEvent>> = {};
for (const e of events) canonEvents[e.id] = { ...emptyCanonEvent("main"), ending: e.id === lastId };
for (const [epText, effects] of Object.entries(content.letterEffects)) {
  const ep = Number(epText);
  effects.forEach((ef, i) => {
    const id = eventId(drafts.find((d) => d.episode === ep && d.part === ef.part) ?? (() => { throw new Error(`letter anchor ${ep}-${ef.part}`); })());
    canonEvents[id].effects.push({ id: `SCORE_LETTERS_E${String(ep).padStart(2, "0")}_${i + 1}`, criterion: ef.criterion, statId: "STAT_LETTERS", amount: ef.amount });
  });
}
project.canonDesign = {
  ...d0, mode: "single", routes: [{ id: "main", name: "1부 · 낙양에서 경사까지" }], events: canonEvents, migrationNotes: [],
  stats: content.stats.map((s) => ({ ...s })),
  openingText: readFileSync(join(workDir, "prologue.txt"), "utf8").trim(),
  openingSituation: content.opening.situation, replies: [...content.opening.replies],
  viewpoint: content.style.viewpoint, proseStyle: content.style.proseStyle, extraStyle: content.style.extraStyle,
};
project.style = { ...project.style, narrationPerson: "3인칭 제한 시점(이강백)", proseStyle: "짧고 단단한 문장과 긴 문장을 섞은 정통 무협 소설체", dialogueStyle: "인물마다 다른 말투(문체 규칙 참고)", descriptionDensity: "감각 중심, 결정적인 것 한두 가지", violenceLevel: "높음(사실적이되 과장 없이)", romanceLevel: "절제(관계를 서둘러 규정하지 않음)", statusDisclosure: "본문에 수치를 쓰지 않음" };

// cover
const coverBytes = readFileSync(process.env.COVER_WEBP || join(workDir, "..", "cover", "cover.webp"));
project.coverImage = { id: "IMG_COVER", fileName: "lee-gangbaek-cover.webp", mimeType: "image/webp", dataUrl: `data:image/webp;base64,${coverBytes.toString("base64")}`, byteLength: coverBytes.length, label: "이강백전 표지", isPrimary: true, addedAt: "2026-10-15T00:00:00.000Z", imageOptimization: { profile: "screen_v1", width: 1080, height: 1440, originalBytes: coverBytes.length } };

project = normalizeProject(project);

// validation
const issues = validateProject(project);
const lint = lintCortexPackage(compileCanonDesign(project));
const errors = issues.filter((i) => i.severity === "error");
const report = {
  events: events.length,
  episodes: new Set(drafts.map((d) => d.episode)).size,
  errors: errors.map((i) => `${i.area}: ${i.message}`),
  warnings: issues.filter((i) => i.severity === "warning").map((i) => `${i.area}: ${i.message}`),
  info: issues.filter((i) => i.severity === "info").map((i) => `${i.area}: ${i.message}`),
  lint: { errors: lint.errors, warnings: lint.warnings, findings: lint.findings },
  uncertain: drafts.filter((d) => clean(d.uncertain)).map((d) => `${eventId(d)} ${d.title}: ${clean(d.uncertain)}`),
};
writeFileSync(join(outDir, "validation-report.json"), JSON.stringify(report, null, 2));
console.log(`events=${report.events} errors=${report.errors.length} warnings=${report.warnings.length} lintErrors=${lint.errors}`);
for (const e of report.errors) console.log("ERROR", e);
if (errors.length || lint.errors) process.exit(2);

// 지음 작업 JSON (same shape as the editor's "작업 JSON 저장")
const workJson = JSON.stringify(buildProjectSnapshot(project), null, 2);
writeFileSync(join(outDir, "이강백전_작업.json"), workJson);

// CortexPack ZIP through the editor's own exporter
const summary = await exportScenarioPack(project, false, { acknowledgeEmptyProtection: true, acknowledgeUnsupportedPolicy: true });
const zipBytes = new Uint8Array(await summary.blob.arrayBuffer());
writeFileSync(join(outDir, "이강백전_CortexPack.zip"), zipBytes);
const sha = createHash("sha256").update(zipBytes).digest("hex");
console.log(`zip bytes=${zipBytes.length} sha256=${sha}`);

// Round trip: the editor must be able to reopen the published package losslessly.
const reopened = await extractStudioProjectFromPackage(new Blob([zipBytes], { type: "application/zip" }));
const again = normalizeProject(reopened.project);
const againErrors = validateProject(again).filter((i) => i.severity === "error");
console.log(`roundtrip fullFidelity=${reopened.fullFidelity} events=${again.events.length} errors=${againErrors.length} cover=${Boolean(again.coverImage)}`);
if (again.events.length !== events.length || againErrors.length) process.exit(3);
writeFileSync(join(outDir, "export-summary.json"), JSON.stringify({ zipBytes: zipBytes.length, sha256: sha, events: events.length, characters: 1 + project.npcs.length, factions: project.factions.length, foreshadowings: project.foreshadowings.length, roundtrip: { fullFidelity: reopened.fullFidelity, events: again.events.length } }, null, 2));
