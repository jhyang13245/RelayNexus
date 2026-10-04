"use client";

import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { Area, Field, PageFrame, Panel, Select, Toggle } from "./studio-sections";
import { blankImageTrigger, uid, type Project } from "./studio-model";
import { CanonEventsEditor } from "./canon-events";
import { eventDesign } from "./cortex-event-design";
import { ImageCropDialog } from "./image-crop-dialog";

export function CanonStorySection({ project: p, setProject, notify }: { project: Project; setProject: React.Dispatch<React.SetStateAction<Project>>; notify: (s: string) => void }) {
  const [tab, setTab] = useState("events");
  const [sceneFile, setSceneFile] = useState<{ triggerId: string; file: File } | null>(null);
  const options = [{ value: "", label: "사건 선택" }, ...p.events.filter((event) => event.kind !== "constraint").map((event) => ({ value: event.id, label: event.name }))];

  return <PageFrame eyebrow="STORY" title="사건" description="사건을 순서대로 작성하고, 필요한 곳에 분기와 장면 이미지를 더하세요.">
    <ImageCropDialog file={sceneFile?.file || null} onCancel={() => setSceneFile(null)} onComplete={({ blob, width, height }) => {
      if (!sceneFile) return;
      const { triggerId, file } = sceneFile;
      setProject((current) => ({ ...current, imageTriggers: current.imageTriggers.map((trigger) => {
        if (trigger.id !== triggerId) return trigger;
        trigger.attachedImages.forEach((image) => { if (image.dataUrl.startsWith("blob:")) URL.revokeObjectURL(image.dataUrl); });
        const stem = file.name.replace(/\.[^.]+$/u, "");
        return { ...trigger, mode: "show_trigger_image", attachedImages: [{ id: uid("IMG"), fileName: `${stem}-${width}x${height}.webp`, mimeType: blob.type, dataUrl: URL.createObjectURL(blob), sourceBlob: blob, byteLength: blob.size, label: stem, isPrimary: true, addedAt: new Date().toISOString(), imageOptimization: { profile: "screen_v1", width, height, originalBytes: file.size } }] };
      }) }));
      setSceneFile(null);
      notify("장면 이미지를 1088×608로 저장했습니다.");
    }} />
    <div className="page-actions">{[["events", "사건"], ["foreshadow", "복선"], ["images", "장면 이미지"]].map(([id, label]) => <button className={tab === id ? "primary-button" : "soft-button"} aria-pressed={tab === id} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "events" && <CanonEventsEditor project={p} setProject={setProject} notify={notify} />}
    {tab === "foreshadow" && <Panel title="복선 · 선택" note="반드시 회수해야 하는 결과는 해당 사건의 종결조건에도 적으세요." actions={<button className="soft-button" onClick={() => setProject((current) => ({ ...current, foreshadowings: [...current.foreshadowings, { id: uid("FSH"), title: "", visibility: "Hidden", status: "Planned", earliestDate: "", latestDate: "", plantingScene: "", reinforcementPlan: "", payoffConditions: "", payoffResult: "", relatedEntities: "", misdirection: "", notes: "" }] }))}>＋ 복선 추가</button>}>
      {p.foreshadowings.map((foreshadowing) => {
        const patch = (value: Partial<typeof foreshadowing>) => setProject((current) => ({ ...current, foreshadowings: current.foreshadowings.map((item) => item.id === foreshadowing.id ? { ...item, ...value } : item) }));
        return <div className="canon-card" key={foreshadowing.id}><Area label="복선 내용" value={[foreshadowing.title, foreshadowing.reinforcementPlan, foreshadowing.payoffResult, foreshadowing.misdirection, foreshadowing.notes].filter(Boolean).join("\n\n")} onChange={(title) => patch({ title, reinforcementPlan: "", payoffResult: "", misdirection: "", notes: "" })} placeholder="레나의 목걸이에는 실종된 학생의 이니셜이 새겨져 있다." /><Select label="심을 사건" value={foreshadowing.plantingScene} options={options} onChange={(plantingScene) => patch({ plantingScene })} /><Select label="회수할 사건" value={foreshadowing.payoffConditions} options={options} onChange={(payoffConditions) => patch({ payoffConditions })} /><button className="soft-button danger-button" onClick={() => setProject((current) => ({ ...current, foreshadowings: current.foreshadowings.filter((item) => item.id !== foreshadowing.id) }))}>복선 삭제</button></div>;
      })}
    </Panel>}
    {tab === "images" && <Panel title="장면 이미지" note="사용할 영역을 고르면 1088×608 이미지로 패키지에 저장합니다. 모델 호출 없이 지정한 시점에 바로 표시됩니다." actions={<button className="soft-button" onClick={() => setProject((current) => ({ ...current, imageTriggers: [...current.imageTriggers, { ...blankImageTrigger(), mode: "show_trigger_image", triggerType: "event_start", outputPosition: "after_scene", once: true }] }))}>＋ 이미지 추가</button>}>
      {p.imageTriggers.map((trigger) => {
        const patch = (value: Partial<typeof trigger>) => setProject((current) => ({ ...current, imageTriggers: current.imageTriggers.map((item) => item.id === trigger.id ? { ...item, ...value } : item) }));
        const event = p.events.find((item) => item.id === trigger.sourceId);
        return <article className="canon-card" key={trigger.id}>
          <Field label="이름·설명" value={trigger.name} onChange={(name) => patch({ name })} placeholder="지하실의 문이 열린 순간" />
          <Select label="사용할 이미지" value={trigger.mode === "show_package_image" ? trigger.characterIds[0] || "" : "upload"} onChange={(id) => patch(id === "upload" ? { mode: "show_trigger_image", characterIds: [] } : { mode: "show_package_image", characterIds: [id] })} options={[{ value: "upload", label: "이미지 직접 첨부" }, ...[p.player, ...p.npcs].filter((character) => character.images.length).map((character) => ({ value: character.id, label: `${character.name} · 대표 이미지` }))]} />
          {trigger.mode !== "show_package_image" && <div className="scene-image-editor">
            <label className="scene-image-upload"><ImagePlus size={18} /><span>{trigger.attachedImages.length ? "다른 이미지 선택" : "이미지 선택"}</span><small>JPG, PNG, WebP 등 · 8MB 이하</small><input hidden type="file" accept="image/*" aria-label="장면 이미지 첨부" onChange={(input) => { const file = input.target.files?.[0]; input.target.value = ""; if (!file) return; if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) { notify("이미지는 8MB 이하의 이미지 파일만 추가할 수 있습니다."); return; } setSceneFile({ triggerId: trigger.id, file }); }} /></label>
            {trigger.attachedImages.map((image) => <figure key={image.id}><img src={image.dataUrl} alt={image.label} /><figcaption>{image.label} · 1088×608</figcaption></figure>)}
          </div>}
          <Select label="연결할 사건" value={trigger.sourceId} options={options} onChange={(sourceId) => patch({ sourceId, customCondition: "" })} />
          <Select label="표시할 때" value={trigger.triggerType} options={[{ value: "event_start", label: "사건의 첫 본문 뒤" }, { value: "event_condition_met", label: "특정 종결조건 충족 후" }, { value: "event_success", label: "사건 종료 후" }]} onChange={(triggerType) => patch({ triggerType: triggerType as typeof trigger.triggerType })} />
          {trigger.triggerType === "event_condition_met" && <Select label="충족할 조건" value={trigger.customCondition} options={[{ value: "", label: "조건 선택" }, ...(event ? eventDesign(event).closureConditions : []).map((condition) => ({ value: condition.id, label: condition.text || "내용 없는 조건" }))]} onChange={(customCondition) => patch({ customCondition })} />}
          <Toggle label="한 번만 표시" checked={trigger.once} onChange={(once) => patch({ once })} />
          <Toggle label="이미지 사용" checked={trigger.enabled} onChange={(enabled) => patch({ enabled })} />
          <button className="soft-button danger-button" onClick={() => setProject((current) => ({ ...current, imageTriggers: current.imageTriggers.filter((item) => item.id !== trigger.id) }))}>이미지 삭제</button>
        </article>;
      })}
    </Panel>}
  </PageFrame>;
}
