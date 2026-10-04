"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Area, Field, PageFrame, Panel, Select } from "./studio-sections";
import { blankCharacter, type Character, type Project } from "./studio-model";
import { instantWorldProse, worldProse, updateWorldProse } from "./world-prose";
import { characterProse } from "./character-prose";

type Setter = Dispatch<SetStateAction<Project>>;
export const basicScreens = ["project", "world", "characters", "direction"];

// These are writing milestones, not an export certification. Optional collections
// deliberately do not affect progress; the existing package validator stays authoritative.
export function writingSteps(project: Project) {
  const filled = (...values: string[]) => values.every(value => Boolean(value.trim()));
  if (project.runtimeMode === "instant_story") {
    const start = project.instantStory.startProfiles[0];
    return [
      { screen: "project", label: "작품 정보", done: filled(project.title, project.genre, project.startLocation) },
      { screen: "world", label: "설정집", done: filled(instantWorldProse(project.world)) },
      { screen: "characters", label: "주인공", done: filled(project.player.name, characterProse(project.player)) },
      { screen: "instant", label: "도입부와 세 파동", done: Boolean(start && filled(start.prologue, start.startSituation, ...(start.recommendedReplies.slice(0, 3)))) },
    ];
  }
  return [
    { screen: "dashboard", label: "작품 정보", done: filled(project.title, project.genre, project.startLocation) },
    { screen: "world", label: "세계관 소개", done: filled(worldProse(project.world)) },
    { screen: "characters", label: "주인공", done: filled(project.player.name) },
    { screen: "direction", label: "첫 장면", done: Boolean(project.canonDesign?.openingSituation.trim() || filled(project.opening.currentSituation, project.opening.openingLocation, project.opening.openingEvent)) },
    { screen: "story", label: "사건 구성", done: project.events.some(event => event.kind !== "constraint" && filled(event.description)) },
  ];
}

export function CreationBasics({ screen, project, setProject }: { screen: string; project: Project; setProject: Setter }) {
  const [characterId, setCharacterId] = useState(project.player.id);
  const setRoot = <K extends keyof Project>(key: K, value: Project[K]) => setProject(current => ({ ...current, [key]: value }));
  const setWorld = (key: string, value: string) => setProject(current => ({ ...current, world: { ...current.world, [key]: value } }));
  const setOpening = (key: keyof Project["opening"], value: string) => setProject(current => ({ ...current, opening: { ...current.opening, [key]: value } }));
  const characters = [project.player, ...project.npcs];
  const character = characters.find(item => item.id === characterId) || project.player;
  const setCharacter = (patch: Partial<Character>) => setProject(current => ({ ...current,
    player: current.player.id === character.id ? { ...current.player, ...patch } : current.player,
    npcs: current.npcs.map(item => item.id === character.id ? { ...item, ...patch } : item),
  }));
  return <div className="jieum-basics">
    {screen === "project" && <PageFrame eyebrow="작품" title="어떤 이야기를 만들까요?" description="제목, 장르, 시작 장소를 정하세요. 나머지는 쓰면서 다듬어도 됩니다.">
      <Panel title="작품 정보"><Field label="작품 제목" value={project.title} onChange={value => setRoot("title", value)} required />
        <div className="field-row"><Field label="장르" value={project.genre} onChange={value => setRoot("genre", value)} placeholder="예: 학원 판타지" required /><Field label="시작 장소" value={project.startLocation} onChange={value => setRoot("startLocation", value)} placeholder="예: 입학식이 열리는 강당" required /></div>
        <details className="jieum-extra"><summary>분위기·작가 이름 추가 · 선택</summary><Field label="분위기" value={project.tone} onChange={value => setRoot("tone", value)} /><Field label="작가 이름" value={project.author} onChange={value => setRoot("author", value)} /></details>
      </Panel></PageFrame>}
    {screen === "world" && <PageFrame eyebrow="세계관" title="이야기의 배경을 들려주세요" description="장소·시대·사회의 모습을 한곳에 자유롭게 적으세요. 모든 설정을 미리 정할 필요는 없습니다.">
      <Panel title="세계관"><Area label="세계관 자유 작성" value={worldProse(project.world)} onChange={value => setProject(current => ({ ...current, world: updateWorldProse(current.world, value) }))} placeholder="어떤 세계인지 자유롭게 적어 주세요. 역사·정치·종교·능력 등은 작품에 필요한 만큼만 설명하면 됩니다." />
        <p>역사, 정치, 경제, 사회·문화, 종교·이념, 기술, 군사, 교통·통신, 화폐·물가, 초자연적 능력 등 작품에 필요한 분야를 자유롭게 적어 주세요. 구체적인 배경이 담길수록 패키지가 더 풍부해집니다. 모든 분야를 채울 필요는 없습니다.</p>
        <details className="jieum-extra"><summary>세계의 핵심 규칙 · 선택{project.world.fixedCanon?.trim() ? " · 작성됨" : ""}</summary><Area label="이 세계에서 반드시 지킬 설정" value={project.world.fixedCanon || ""} onChange={value => setWorld("fixedCanon", value)} placeholder="예: 능력은 하루에 세 번만 사용할 수 있다." /></details>
      </Panel></PageFrame>}
    {screen === "characters" && <PageFrame eyebrow="등장인물" title="주인공부터 만들어 보세요" description="이름과 인물 소개부터 시작하세요. 외형·능력·비밀·이미지는 상세 설정에서 더할 수 있습니다.">
      <Panel title="인물" actions={<button type="button" className="soft-button" onClick={() => { const next = blankCharacter(false); setProject(current => ({ ...current, npcs: [...current.npcs, next] })); setCharacterId(next.id); }}>인물 추가</button>}>
        <Select label="편집할 인물" value={character.id} onChange={setCharacterId} options={characters.map(item => ({ value: item.id, label: `${item.id === project.player.id ? "주인공 · " : ""}${item.name || "이름 없는 인물"}` }))} />
        <Field label="이름" value={character.name} onChange={name => setCharacter({ name })} required={character.id === project.player.id} />
        <Area label="공개 인물 소개" value={character.publicInfo} onChange={publicInfo => setCharacter({ publicInfo })} placeholder="이야기에 처음 등장할 때 알 수 있는 배경과 역할을 적으세요." />
        <details className="jieum-extra"><summary>성격·말투 추가 · 선택{character.personality || character.speechStyle ? " · 작성됨" : ""}</summary><Area label="성격" value={character.personality} onChange={personality => setCharacter({ personality })} /><Area label="말투" value={character.speechStyle} onChange={speechStyle => setCharacter({ speechStyle })} /></details>
      </Panel></PageFrame>}
    {screen === "direction" && <PageFrame eyebrow="이야기 시작" title="첫 장면을 열어 주세요" description="플레이어가 어디에서, 어떤 상황과 사건을 마주하는지 정하세요.">
      <Panel title="첫 장면"><Field label="첫 장면 장소" value={project.opening.openingLocation} onChange={value => setOpening("openingLocation", value)} required />
        {!project.opening.openingLocation.trim() && project.startLocation.trim() && <button type="button" className="soft-button" onClick={() => setOpening("openingLocation", project.startLocation)}>작품의 시작 장소 사용</button>}
        <Area label="현재 상황 · 필수" value={project.opening.currentSituation} onChange={value => setOpening("currentSituation", value)} placeholder="예: 입학식 직전, 주인공은 강당 앞에서 자신의 이름이 빠진 명단을 발견한다." />
        <Area label="첫 사건 · 필수" value={project.opening.openingEvent} onChange={value => setOpening("openingEvent", value)} placeholder="예: 낯선 선배가 다가와 명단에 없는 학생만 따라오라고 말한다." />
      </Panel></PageFrame>}
  </div>;
}
