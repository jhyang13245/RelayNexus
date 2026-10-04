"use client";

import { BookOpenCheck, Gauge, ImagePlus, KeyRound, LockKeyhole, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InstantStoryDesign } from "./instant-story-contract";
import { blankCharacter, type Character, type Project, uid } from "./studio-model";
import { Area, Field, PageFrame, Panel } from "./studio-sections";
import { instantWorldProse, privateWorldProse, updateInstantWorldProse, updatePrivateWorldProse } from "./world-prose";
import { appearanceProse, characterProse, updateCharacterProse } from "./character-prose";
import { ImageCropDialog } from "./image-crop-dialog";

type Setter = React.Dispatch<React.SetStateAction<Project>>;
type Notify = (message: string) => void;

function TextArea({ label, value, onChange, rows = 5, placeholder, secret = false }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; secret?: boolean }) {
  return <label className={`instant-textarea ${secret ? "secret-field" : ""}`}><span>{secret && <LockKeyhole size={12} />}{label}</span><textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

const setInstant = (setProject: Setter, patch: Partial<InstantStoryDesign>) => setProject((current) => ({ ...current, instantStory: { ...current.instantStory, ...patch } }));

export function InstantSettingBookSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const design = project.instantStory;
  const setExample = (id: string, patch: Partial<InstantStoryDesign["exampleScenes"][number]>) => setInstant(setProject, { exampleScenes: design.exampleScenes.map((scene) => scene.id === id ? { ...scene, ...patch } : scene) });
  return <PageFrame eyebrow="SETTING BOOK" title="설정집" description="작가가 실제로 참고할 공개 세계관과 숨은 진실, 작품의 문장 결을 보여 줄 예시만 적습니다.">
    <div className="form-grid two-col instant-world-pair">
      <Panel title="세계관" note="형식 없이 자유롭게 작성하세요. 필요한 작품은 아래 분야까지 함께 적으면 패키지가 더 풍부해집니다." badge="PUBLIC">
        <Area label="공개 세계관" value={instantWorldProse(project.world)} onChange={(overview) => setProject((current) => ({ ...current, world: updateInstantWorldProse(current.world, overview) }))} placeholder="시대와 장소, 사회·정치, 종교·이념, 문화, 기술·마법, 종족, 경제, 갈등과 금기, 반드시 지킬 사실과 능력 한계 등 작품에 필요한 내용을 자유롭게 적으세요." />
      </Panel>
      <Panel title="비공개 세계관" note="독자가 아직 알면 안 되는 진실과 반전, 인과의 배경을 적습니다." badge="WRITER ONLY">
        <TextArea secret label="비공개 세계관 설정" value={privateWorldProse(project.gmData)} onChange={(worldTruthLedger) => setProject((current) => ({ ...current, gmData: updatePrivateWorldProse(current.gmData, worldTruthLedger) }))} rows={12} placeholder="숨은 진실, 배후 관계, 향후 공개할 반전 등" />
        <div className="instant-private-note"><LockKeyhole size={18} /><p><b>산문 작가 전용 정보</b><span>동기와 반응, 인과를 구성할 때만 참고합니다. 독자가 직접 발견하기 전에는 원문을 인용하거나 사실로 확인·해설하지 않습니다.</span></p></div>
      </Panel>
    </div>

    <Panel title="예시 설정" note="플레이어 입력과 그에 어울리는 본문·추천 행동을 한 묶음으로 적습니다. 문체와 응답 밀도를 맞추는 참고 자료이며, 이야기에서 이미 일어난 사실로 취급하지 않습니다." badge={`${design.exampleScenes.length}/3`} actions={<button type="button" className="soft-button" disabled={design.exampleScenes.length >= 3} onClick={() => setInstant(setProject, { exampleScenes: [...design.exampleScenes, { id: uid("EXAMPLE"), userInput: "", narration: "", recommendations: ["", "", ""] }] })}><Plus size={15} /> 예시 추가</button>} wide>
      {design.exampleScenes.length ? <div className="instant-example-grid">{design.exampleScenes.map((scene, index) => <article className="instant-editor-card" key={scene.id}>
        <header><span>EX {String(index + 1).padStart(2, "0")}</span><code>{scene.id}</code><button type="button" aria-label="예시 삭제" onClick={() => setInstant(setProject, { exampleScenes: design.exampleScenes.filter((item) => item.id !== scene.id) })}><Trash2 size={15} /></button></header>
        <TextArea label="플레이어 입력" value={scene.userInput} onChange={(userInput) => setExample(scene.id, { userInput })} rows={3} />
        <TextArea label="본문 예시" value={scene.narration} onChange={(narration) => setExample(scene.id, { narration })} rows={7} />
        <TextArea label="추천 행동 예시 · 최대 3개, 줄바꿈 구분" value={scene.recommendations.join("\n")} onChange={(value) => setExample(scene.id, { recommendations: value.split("\n").slice(0, 3) })} rows={3} />
      </article>)}</div> : <p className="contract-empty">예시는 선택 사항입니다. 작품 고유의 문체나 응답 길이를 분명히 보여 주고 싶을 때 1~3개만 추가하세요.</p>}
    </Panel>
  </PageFrame>;
}

export function InstantCharactersSection({ project, setProject, notify }: { project: Project; setProject: Setter; notify: Notify }) {
  const characters = [project.player, ...project.npcs];
  const [selectedId, setSelectedId] = useState(project.player.id);
  const [imageQueue, setImageQueue] = useState<File[]>([]);
  const [imageCharacterId, setImageCharacterId] = useState(project.player.id);
  const imageRef = useRef<HTMLInputElement>(null);
  const selected = characters.find((character) => character.id === selectedId) ?? project.player;
  useEffect(() => { if (!characters.some((character) => character.id === selectedId)) setSelectedId(project.player.id); }, [characters, project.player.id, selectedId]);
  const updateCharacter = (id: string, patch: Partial<Character>) => setProject((current) => id === current.player.id
    ? { ...current, player: { ...current.player, ...patch } }
    : { ...current, npcs: current.npcs.map((character) => character.id === id ? { ...character, ...patch } : character) });
  const addCharacter = () => {
    const character = blankCharacter(false);
    setProject((current) => ({ ...current, npcs: [...current.npcs, character] }));
    setSelectedId(character.id);
  };
  const removeCharacter = (id: string) => {
    setProject((current) => ({ ...current, npcs: current.npcs.filter((character) => character.id !== id), protagonistInvariants: current.protagonistInvariants.filter((item) => item.characterId !== id) }));
    setSelectedId(project.player.id);
  };
  const chooseImages = (files: FileList | null) => {
    if (!files) return;
    const room = Math.max(0, 6 - selected.images.length);
    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, room);
    if (!accepted.length) { notify("이미지는 인물마다 최대 6장, 파일당 8MB까지 추가할 수 있습니다."); return; }
    setImageCharacterId(selected.id);
    setImageQueue(accepted);
  };
  const removeImage = (imageId: string) => {
    const removed = selected.images.find((image) => image.id === imageId);
    if (removed?.dataUrl.startsWith("blob:")) URL.revokeObjectURL(removed.dataUrl);
    const remaining = selected.images.filter((image) => image.id !== imageId);
    if (remaining.length && !remaining.some((image) => image.isPrimary)) remaining[0] = { ...remaining[0], isPrimary: true };
    updateCharacter(selected.id, { images: remaining });
  };
  return <PageFrame eyebrow="CHARACTERS" title="캐릭터" description="독자가 알아도 되는 설정, 외형 특징, 작가만 참고할 비공개 설정과 내장 이미지만 구성합니다." actions={<button type="button" className="soft-button" onClick={addCharacter}><Plus size={15} /> 캐릭터 추가</button>}>
    <ImageCropDialog file={imageQueue[0] || null} onCancel={() => setImageQueue([])} onComplete={({ blob, width, height }) => {
      const file = imageQueue[0];
      if (!file) return;
      setProject((current) => {
        const character = [current.player, ...current.npcs].find((item) => item.id === imageCharacterId);
        if (!character) return current;
        const stem = file.name.replace(/\.[^.]+$/u, "");
        const image = { id: uid("IMG"), fileName: `${stem}-${width}x${height}.webp`, mimeType: blob.type, dataUrl: URL.createObjectURL(blob), sourceBlob: blob, byteLength: blob.size, label: stem, isPrimary: character.images.length === 0, addedAt: new Date().toISOString(), imageOptimization: { profile: "screen_v1" as const, width, height, originalBytes: file.size } };
        const patch = { images: [...character.images, image], visualLock: true };
        return character.id === current.player.id ? { ...current, player: { ...current.player, ...patch } } : { ...current, npcs: current.npcs.map((item) => item.id === character.id ? { ...item, ...patch } : item) };
      });
      const remaining = imageQueue.slice(1);
      setImageQueue(remaining);
      notify(remaining.length ? `1088×608 이미지로 저장했습니다. ${remaining.length}장을 이어서 조정하세요.` : "내장 이미지를 1088×608로 저장했습니다.");
    }} />
    <div className="character-layout instant-character-layout">
      <aside className="character-list">{characters.map((character) => <button type="button" key={character.id} className={selected.id === character.id ? "active" : ""} onClick={() => setSelectedId(character.id)}><span className="character-avatar">{character.images[0]?.dataUrl ? <img src={character.images.find((image) => image.isPrimary)?.dataUrl || character.images[0].dataUrl} alt="" /> : <UserRound size={18} />}</span><span><b>{character.name || "이름 없는 캐릭터"}</b><small>{character.isPlayer ? "주인공" : "캐릭터"} · 이미지 {character.images.length}</small></span></button>)}</aside>
      <section className="character-editor">
        <div className="character-editor-head canon-character-hero">{project.runtimeMode === 'intelligent_canon' && <div className="canon-portrait">{selected.images.length ? <img src={selected.images.find(i=>i.isPrimary)?.dataUrl||selected.images[0].dataUrl} alt={selected.name}/> : <UserRound size={48}/>}</div>}<div><span>{selected.isPlayer ? "PLAYER CHARACTER" : "STORY CHARACTER"}</span><h2>{selected.name || "이름 없는 캐릭터"}</h2>{project.runtimeMode === "intelligent_canon" && <button className="soft-button" onClick={()=>imageRef.current?.click()}>이미지 추가</button>}</div>{!selected.isPlayer && <button type="button" className="icon-button danger" aria-label="캐릭터 삭제" onClick={() => removeCharacter(selected.id)}><Trash2 size={17} /></button>}</div>
        <div className={`instant-image-head ${project.runtimeMode==='intelligent_canon'?'canon-image-controls':''}`}><div><b>캐릭터 내장 이미지</b><span>모든 이미지는 선택한 영역을 1088×608로 저장합니다. 첫 번째 이미지는 대표 이미지로 사용됩니다.</span></div><button type="button" className="soft-button" disabled={selected.images.length >= 6} onClick={() => imageRef.current?.click()}><ImagePlus size={15} /> 이미지 추가</button><input ref={imageRef} hidden multiple type="file" accept="image/*" onChange={(event) => { chooseImages(event.target.files); event.target.value = ""; }} /></div>
        {selected.images.length ? <div className="instant-image-grid">{selected.images.map((image) => <article key={image.id} className={image.isPrimary ? "primary" : ""}><img src={image.dataUrl} alt={image.label || selected.name} /><div><button type="button" title="대표 이미지로 지정" onClick={() => updateCharacter(selected.id, { images: selected.images.map((item) => ({ ...item, isPrimary: item.id === image.id })) })}><Star size={15} fill={image.isPrimary ? "currentColor" : "none"} /></button><button type="button" title="이미지 삭제" onClick={() => removeImage(image.id)}><X size={15} /></button></div><span>{image.isPrimary ? "대표" : image.label}</span></article>)}</div> : project.runtimeMode==='intelligent_canon'?null:<div className="instant-image-empty"><ImagePlus size={24} /><b>내장 이미지가 없습니다</b><span>JPG, PNG, WebP 등 · 장당 8MB · 인물당 최대 6장</span></div>}
        <Field label="이름" value={selected.name} onChange={(name) => updateCharacter(selected.id, { name })} required />
        <TextArea label="캐릭터 설정" value={characterProse(selected)} onChange={(publicInfo) => updateCharacter(selected.id, updateCharacterProse(selected, publicInfo))} rows={8} placeholder="성격, 말투, 능력, 목표, 관계처럼 이야기에 필요한 공개 설정을 자유롭게 적으세요." />
        <TextArea label="외형 특징" value={appearanceProse(selected)} onChange={(appearance) => updateCharacter(selected.id, { appearance, visualAnchor: appearance })} rows={4} placeholder="얼굴, 머리, 체형, 옷차림, 눈에 띄는 표식 등 이미지와 본문에서 유지할 특징" />
        <TextArea secret label="비공개 캐릭터 설정" value={selected.hiddenInfo} onChange={(hiddenInfo) => updateCharacter(selected.id, { hiddenInfo })} rows={6} placeholder="숨은 동기, 정체, 과거, 아직 드러나지 않은 관계 등" />
        <div className="instant-private-note"><LockKeyhole size={18} /><p><b>독자 비공개</b><span>산문 작가는 행동과 감정의 원인으로만 참고합니다. 공개 장면에서 드러난 단서 없이 비밀을 직접 말하거나 설명하지 않습니다.</span></p></div>

      </section>
    </div>
  </PageFrame>;
}

export function InstantOpeningSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const design = project.instantStory;
  const updateStarts = (startProfiles: InstantStoryDesign["startProfiles"]) => setProject((current) => {
    const first = startProfiles[0];
    return { ...current, instantStory: { ...current.instantStory, startProfiles }, opening: first ? { ...current.opening, currentSituation: first.startSituation, openingEvent: first.startSituation, openingLine: first.prologue } : current.opening };
  });
  const setStart = (id: string, patch: Partial<InstantStoryDesign["startProfiles"][number]>) => updateStarts(design.startProfiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
  const setReply = (id: string, index: number, value: string) => {
    const profile = design.startProfiles.find((item) => item.id === id);
    if (!profile) return;
    const recommendedReplies = [0, 1, 2].map((replyIndex) => replyIndex === index ? value : profile.recommendedReplies[replyIndex] || "");
    setStart(id, { recommendedReplies });
  };
  return <PageFrame eyebrow="OPENING SETUP" title="도입부 설정" description="처음 보여 줄 프롤로그와 시작 상황을 만들고, 독자가 고를 세 가지 파동을 각각 고정합니다." actions={<button type="button" className="soft-button" onClick={() => updateStarts([...design.startProfiles, { id: uid("START"), name: "새 도입부", prologue: "", startSituation: "", recommendedReplies: ["", "", ""] }])}><Plus size={15} /> 도입부 추가</button>}>
    {design.startProfiles.length ? <div className="instant-opening-list">{design.startProfiles.map((profile, index) => <Panel key={profile.id} title={profile.name || `도입부 ${index + 1}`} note="프롤로그는 첫 화면의 본문, 시작 상황은 첫 입력 직전의 현재 상태입니다." badge={`START ${String(index + 1).padStart(2, "0")}`} actions={design.startProfiles.length > 1 ? <button type="button" className="icon-button danger" aria-label="도입부 삭제" onClick={() => updateStarts(design.startProfiles.filter((item) => item.id !== profile.id))}><Trash2 size={16} /></button> : undefined} wide>
        <Field label="도입부 이름" value={profile.name} onChange={(name) => setStart(profile.id, { name })} />
        <TextArea label="프롤로그" value={profile.prologue} onChange={(prologue) => setStart(profile.id, { prologue })} rows={9} placeholder="독자가 처음 읽을 장면을 적으세요." />
        <TextArea label="시작 상황" value={profile.startSituation} onChange={(startSituation) => setStart(profile.id, { startSituation })} rows={5} placeholder="시간, 장소, 인물의 현재 위치와 바로 행동할 수 있는 상황" />
        <div className="instant-wave-head"><BookOpenCheck size={18} /><p><b>시작 추천답변 3개</b><span>입력한 문구가 시작 화면의 작은 파동·중간 파동·큰 파동 선택지로 그대로 표시됩니다.</span></p></div>
        <div className="instant-wave-grid"><Field label="작은 파동" value={profile.recommendedReplies[0] || ""} onChange={(value) => setReply(profile.id, 0, value)} placeholder="관찰하거나 확인하는 작은 행동" /><Field label="중간 파동" value={profile.recommendedReplies[1] || ""} onChange={(value) => setReply(profile.id, 1, value)} placeholder="상황을 움직이는 적극적인 행동" /><Field label="큰 파동" value={profile.recommendedReplies[2] || ""} onChange={(value) => setReply(profile.id, 2, value)} placeholder="장면을 크게 바꾸는 과감한 행동" /></div>
      </Panel>)}</div> : <div className="instant-opening-empty"><BookOpenCheck size={28} /><h2>도입부를 하나 추가하세요</h2><p>Instant Story 패키지는 최소 한 개의 도입부와 세 파동을 사용합니다.</p></div>}
  </PageFrame>;
}

export function InstantStatsSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const design = project.instantStory;
  const setStat = (id: string, patch: Partial<InstantStoryDesign["statRules"][number]>) => setInstant(setProject, { statRules: design.statRules.map((stat) => stat.id === id ? { ...stat, ...patch } : stat) });
  return <PageFrame eyebrow="STAT RULES" title="스탯 규칙" description="본문의 행동과 결과를 실제로 바꾸는 핵심 수치만 추가합니다.">
    <Panel title="스탯 규칙" note="최대 7개. 수치가 구간을 넘어갈 때 해당 구간의 행동 프롬프트가 활성화됩니다." badge={`${design.statRules.length}/7`} actions={<button type="button" className="soft-button" disabled={design.statRules.length >= 7} onClick={() => setInstant(setProject, { statRules: [...design.statRules, { id: uid("STAT"), label: "새 스탯", minimum: 0, maximum: 100, initial: 50, unit: "", increaseWhen: "", decreaseWhen: "", tiers: [] }] })}><Plus size={15} /> 스탯 추가</button>} wide>
      {design.statRules.length ? <div className="instant-note-grid">{design.statRules.map((stat) => <article className="instant-editor-card" key={stat.id}><header><Gauge size={16} /><code>{stat.id}</code><button type="button" aria-label="스탯 삭제" onClick={() => setInstant(setProject, { statRules: design.statRules.filter((item) => item.id !== stat.id) })}><Trash2 size={15} /></button></header><div className="form-grid two-col"><Field label="표시명" value={stat.label} onChange={(label) => setStat(stat.id, { label })} /><Field label="단위" value={stat.unit} onChange={(unit) => setStat(stat.id, { unit })} /><Field label="최솟값" type="number" value={stat.minimum} onChange={(minimum) => setStat(stat.id, { minimum: Number(minimum) })} /><Field label="최댓값" type="number" value={stat.maximum} onChange={(maximum) => setStat(stat.id, { maximum: Number(maximum) })} /><Field label="초깃값" type="number" value={stat.initial} onChange={(initial) => setStat(stat.id, { initial: Number(initial) })} /></div><TextArea label="증가 조건" value={stat.increaseWhen} onChange={(increaseWhen) => setStat(stat.id, { increaseWhen })} rows={2} /><TextArea label="감소 조건" value={stat.decreaseWhen} onChange={(decreaseWhen) => setStat(stat.id, { decreaseWhen })} rows={2} /><div className="instant-tier-head"><b>구간 프롬프트</b><button type="button" className="soft-button" disabled={stat.tiers.length >= 4} onClick={() => setStat(stat.id, { tiers: [...stat.tiers, { id: uid("TIER"), minimum: stat.minimum, maximum: stat.maximum, prompt: "" }] })}><Plus size={13} /> 구간</button></div>{stat.tiers.map((tier) => <div className="instant-tier-row" key={tier.id}><Field label="MIN" type="number" value={tier.minimum} onChange={(minimum) => setStat(stat.id, { tiers: stat.tiers.map((item) => item.id === tier.id ? { ...item, minimum: Number(minimum) } : item) })} /><Field label="MAX" type="number" value={tier.maximum} onChange={(maximum) => setStat(stat.id, { tiers: stat.tiers.map((item) => item.id === tier.id ? { ...item, maximum: Number(maximum) } : item) })} /><Field label="행동 변화 프롬프트" value={tier.prompt} onChange={(prompt) => setStat(stat.id, { tiers: stat.tiers.map((item) => item.id === tier.id ? { ...item, prompt } : item) })} /><button type="button" aria-label="구간 삭제" onClick={() => setStat(stat.id, { tiers: stat.tiers.filter((item) => item.id !== tier.id) })}><Trash2 size={14} /></button></div>)}</article>)}</div> : <p className="contract-empty">관계, 긴장, 오염도처럼 장면의 결과에 영향을 주는 수치가 있을 때만 추가하세요.</p>}
    </Panel>
  </PageFrame>;
}

export function InstantKeywordsSection({ project, setProject }: { project: Project; setProject: Setter }) {
  const design = project.instantStory;
  const setNote = (id: string, patch: Partial<InstantStoryDesign["keywordNotes"][number]>) => setInstant(setProject, { keywordNotes: design.keywordNotes.map((note) => note.id === id ? { ...note, ...patch } : note) });
  return <PageFrame eyebrow="KEYWORD NOTES" title="키워드 노트" description="특정 말이나 장소, 인물이 등장한 순간에만 필요한 설정을 짧게 연결합니다.">
    <Panel title="키워드 노트" note={`최대 20개를 저장하고 한 턴에는 우선순위가 높은 관련 노트 ${design.contextBudget.activeKeywordNotes}개만 자동으로 활성화합니다.`} badge={`${design.keywordNotes.length}/20`} actions={<button type="button" className="soft-button" disabled={design.keywordNotes.length >= 20} onClick={() => setInstant(setProject, { keywordNotes: [...design.keywordNotes, { id: uid("NOTE"), title: "새 노트", keywords: [], priority: 50, content: "" }] })}><Plus size={15} /> 노트 추가</button>} wide>
      {design.keywordNotes.length ? <div className="instant-note-grid">{design.keywordNotes.map((note) => <article className="instant-editor-card" key={note.id}><header><KeyRound size={16} /><code>{note.id}</code><button type="button" aria-label="노트 삭제" onClick={() => setInstant(setProject, { keywordNotes: design.keywordNotes.filter((item) => item.id !== note.id) })}><Trash2 size={15} /></button></header><div className="form-grid two-col"><Field label="이름" value={note.title} onChange={(title) => setNote(note.id, { title })} /><Field label="우선순위" type="number" min={0} max={100} value={note.priority} onChange={(priority) => setNote(note.id, { priority: Number(priority) })} /></div><Field label="키워드 · 쉼표 구분" value={note.keywords.join(", ")} onChange={(value) => setNote(note.id, { keywords: value.split(",").map((item) => item.trim()).filter(Boolean) })} /><TextArea label="키워드가 등장했을 때 참고할 정보" value={note.content} onChange={(content) => setNote(note.id, { content })} rows={6} /></article>)}</div> : <p className="contract-empty">현재 장면에서만 필요한 장소 규칙, 인물 습관, 용어 설명을 분리하면 작가가 관련 설정만 정확히 읽을 수 있습니다.</p>}
    </Panel>
  </PageFrame>;
}
