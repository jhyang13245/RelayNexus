import assert from "node:assert/strict";
import test from "node:test";
import { makeNewStudioProject, validateProject } from "../../features/jieum/studio-model";
import { instantWorldProse, privateWorldProse, updateInstantWorldProse, updatePrivateWorldProse, worldProse, worldProseFields, updateWorldProse } from "../../features/jieum/world-prose";
import { exportScenarioPack, extractStudioProjectFromPackage } from "../../features/jieum/studio-export";
import { writingSteps } from "../../features/jieum/creation-basics";
import { appearanceProse, characterProse, updateCharacterProse } from "../../features/jieum/character-prose";

test("world prose combines every descriptive category without changing data on read", () => {
  const project = makeNewStudioProject("instant_story");
  project.world.overview = "  배경 원문\n둘째 줄  ";
  for (const [key] of worldProseFields) project.world[key] = `${key}의 원문\n다음 줄`;
  const before = structuredClone(project.world);
  const text = worldProse(project.world);
  for (const value of Object.values(before).filter(Boolean)) assert.ok(text.includes(value));
  assert.deepEqual(project.world, before);
  const edited = updateWorldProse(project.world, text);
  assert.equal(worldProse(edited), text);
  assert.equal(worldProse(updateWorldProse(edited, text)), text);
});

test("editing combined prose retains constraints, unknown fields, private data and character IDs", async () => {
  const project = makeNewStudioProject("instant_story");
  project.world.politics = "도시 의회가 통치한다.";
  project.world.religionIdeology = "강을 신성하게 여긴다.";
  project.world.fixedCanon = "고정 설정";
  project.world.impossibilities = "불가능한 것";
  project.world.aiFillConstraints = "보완 제약";
  project.world.futureField = "미래 필드";
  project.opening.currentSituation = "도시 의회 앞에 도착했다.";
  project.opening.openingLocation = "의회 앞";
  project.opening.openingEvent = "회의가 시작된다.";
  const before = structuredClone(project);
  project.world = updateWorldProse(project.world, worldProse(project.world) + "\n추가 설정");
  for (const key of ["fixedCanon", "impossibilities", "aiFillConstraints", "futureField"]) assert.equal(project.world[key], before.world[key]);
  assert.deepEqual(project.player, before.player);
  assert.deepEqual(project.gmData, before.gmData);
  assert.deepEqual(project.disclosure, before.disclosure);
  const output = await exportScenarioPack(project, false);
  const restored = (await extractStudioProjectFromPackage(output.blob)).project;
  assert.deepEqual(restored.world, project.world);
  assert.deepEqual(restored.disclosure, project.disclosure);
});

test("Instant setting book folds public rules into the one authored world field", () => {
  const project = makeNewStudioProject("instant_story");
  Object.assign(project.world, { overview: "도시 배경", politics: "의회 정치", fixedCanon: "마력에는 대가가 있다.", impossibilities: "순간이동은 없다.", aiFillConstraints: "거리를 현실적으로 계산한다.", futureField: "미래 확장" });
  const text = instantWorldProse(project.world);
  assert.match(text, /도시 배경[\s\S]*\[정치 구조\][\s\S]*의회 정치[\s\S]*\[고정 사실·진행 원칙\][\s\S]*마력에는 대가/u);
  const edited = updateInstantWorldProse(project.world, text);
  assert.equal(instantWorldProse(edited), text);
  assert.equal(edited.politics, "");
  assert.equal(edited.fixedCanon, "");
  assert.equal(edited.impossibilities, "");
  assert.equal(edited.aiFillConstraints, "");
  assert.equal(edited.futureField, "미래 확장");
});

test("compact private world prose includes old GM categories and preserves unknown fields on edit", () => {
  const project = makeNewStudioProject("instant_story");
  project.gmData = { worldTruthLedger: "핵심 진실", hiddenTimeline: "비공개 연표", forbiddenDisclosures: "아직 말하지 않는다", futurePrivateField: "미래 확장" };
  assert.match(privateWorldProse(project.gmData), /핵심 진실[\s\S]*\[비공개 연표\][\s\S]*비공개 연표[\s\S]*\[아직 공개하면 안 되는 정보\]/u);
  const edited = updatePrivateWorldProse(project.gmData, "하나로 정리한 비공개 세계관");
  assert.equal(edited.worldTruthLedger, "하나로 정리한 비공개 세계관");
  assert.equal(edited.hiddenTimeline, "");
  assert.equal(edited.forbiddenDisclosures, "");
  assert.equal(edited.futurePrivateField, "미래 확장");
});

test("compact character prose turns detailed values into one Jieum setting field", () => {
  const character = makeNewStudioProject("instant_story").player;
  Object.assign(character, { publicInfo: "전학생이다.", personality: "신중하다.", speechStyle: "짧게 말한다.", appearance: "검은 머리", visualAnchor: "회색 눈" });
  assert.match(characterProse(character), /전학생이다[\s\S]*\[성격\][\s\S]*신중하다[\s\S]*\[말투\]/u);
  assert.match(appearanceProse(character), /검은 머리[\s\S]*\[이미지 일관성 특징\][\s\S]*회색 눈/u);
  const edited = updateCharacterProse(character, "신중하고 짧게 말하는 전학생이다.");
  assert.equal(edited.publicInfo, "신중하고 짧게 말하는 전학생이다.");
  assert.equal(edited.personality, "");
  assert.equal(edited.speechStyle, "");
  assert.deepEqual(edited.images, character.images);
});

test("optional collections do not count as writing obligations", () => {
  const project = makeNewStudioProject("instant_story");
  const steps = writingSteps(project);
  project.instantStory.exampleScenes = [];
  project.instantStory.keywordNotes = [];
  project.instantStory.startProfiles = [];
  project.npcs = [];
  project.statusWindow.enabled = false;
  assert.deepEqual(writingSteps(project), steps);
  project.title = "   ";
  assert.equal(writingSteps(project)[0].done, false);
});

test("compatibility difficulty does not create a hidden character-detail obligation", () => {
  const canon = makeNewStudioProject("intelligent_canon");
  canon.difficulty = "HARD";
  canon.player.weaknesses = "";
  assert.equal(validateProject(canon).some(issue => issue.message.includes("HARD 난이도")), false);
  const instant = makeNewStudioProject("instant_story");
  instant.difficulty = "HARD";
  instant.player.weaknesses = "";
  assert.equal(validateProject(instant).some(issue => issue.message.includes("HARD 난이도")), false);
});
