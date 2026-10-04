import type { DialogueAnnotation } from "./engine";
import type { LivePlanEnvelope, LiveSpeakerBinding } from "./live-story-runtime";
import { resolveLiveWriterSceneClock, type LiveWriterSceneClock } from "./live-scene-time";

export type LiveAuthoredBlock = {
  type: "narration" | "dialogue";
  speakerId: string;
  speakerName: string;
  emotion: string;
  text: string;
};

const DEVICE_CONTEXT = /(?:휴대전화|휴대폰|스마트폰|단말기|화면|잠금\s*화면|알림|문자|메시지|앱|전광판|표시창)/u;
const NOTIFICATION_COPY = /(?:발송인|수령\s*(?:가능|장소|기한|번호)|도착\s*(?:예정|완료|했습니다)|무인\s*택배함|인증\s*번호|예약\s*번호|결제\s*(?:완료|금액)|보관\s*기한|새\s*(?:알림|문자|메시지))/u;
const DISPLAYED_NOTIFICATION_CONTEXT = /(?:알림|문자|메시지|화면에.{0,24}(?:표시|떠|나타)|표시(?:되|됐|했다|되었다))/u;
const AUDIBLE_SPEECH_CUE = /(?:말했|말을\s*했|입을\s*열|소리\s*내|읽어\s*(?:주|내)|중얼|대답|외쳤|알렸|전했|보고했)/u;

/** Prevents visual device copy from borrowing the nearby player's speaker ID. */
export const isDeviceNotificationMisclassifiedAsDialogue = ({
  text,
  previousText,
}: {
  text: string;
  previousText?: string;
}): boolean => {
  const context = String(previousText ?? "").normalize("NFKC");
  const copy = text.normalize("NFKC");
  return DEVICE_CONTEXT.test(context) &&
    (NOTIFICATION_COPY.test(copy) || DISPLAYED_NOTIFICATION_CONTEXT.test(context.slice(-180))) &&
    !AUDIBLE_SPEECH_CUE.test(context.slice(-120));
};

const speakerBindingFor = (
  bindings: LiveSpeakerBinding[],
  streamId: string,
  visibleName = "",
): LiveSpeakerBinding | undefined => bindings.find((binding) =>
  binding.streamId === streamId ||
  (visibleName.trim() !== "" && binding.visibleName === visibleName.trim())
);

export type ResolvedLiveDialogueSpeaker = {
  speakerId: string;
  speakerName: string;
  registered: boolean;
};

/** Resolves the writer's opaque stream ID before a dialogue block is shown.
 * A registered character may be recovered from its exact public name, but an
 * unknown/non-matching ID is never allowed to borrow another character card. */
export const resolveLiveDialogueSpeaker = ({
  bindings,
  streamId,
  visibleName,
}: {
  bindings: LiveSpeakerBinding[];
  streamId: string;
  visibleName: string;
}): ResolvedLiveDialogueSpeaker => {
  const id = streamId.normalize("NFKC").trim();
  const name = visibleName.normalize("NFKC").trim();
  if (id) {
    const binding = bindings.find((candidate) => candidate.streamId === id);
    if (!binding) throw new Error(`등록되지 않은 실시간 화자 ID입니다: ${id}`);
    if (name && name !== binding.visibleName) {
      throw new Error(`실시간 화자 ID와 공개 이름이 일치하지 않습니다: ${id}`);
    }
    return {
      speakerId: binding.characterId,
      speakerName: binding.visibleName,
      registered: true,
    };
  }
  if (!name) throw new Error("대사 블록의 화자 ID 또는 공개 호칭이 비어 있습니다.");
  const recovered = speakerBindingFor(bindings, "", name);
  if (recovered) {
    return {
      speakerId: recovered.characterId,
      speakerName: recovered.visibleName,
      registered: true,
    };
  }
  return { speakerId: "", speakerName: name, registered: false };
};

export const authoredTurnFromLiveBlocks = ({
  rawTurn,
  envelope,
}: {
  rawTurn: Record<string, unknown>;
  envelope: LivePlanEnvelope;
}): { turn: Record<string, unknown>; blocks: LiveAuthoredBlock[]; writerSceneClock: LiveWriterSceneClock } => {
  const rawBlocks = Array.isArray(rawTurn.b)
    ? rawTurn.b
    : Array.isArray(rawTurn.liveBlocks)
      ? rawTurn.liveBlocks
      : [];
  if (rawBlocks.length === 0) throw new Error("실시간 본문 블록이 없습니다.");
  const bindings = envelope.speakerBindings ?? [];
  const blocks = rawBlocks.map((candidate, index): LiveAuthoredBlock => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`실시간 본문 ${index + 1}번 블록 구조가 손상되었습니다.`);
    }
    const block = candidate as Record<string, unknown>;
    const rawType = String(block.k ?? block.type ?? "");
    const declaredType = (rawType === "n" ? "narration" : rawType === "d" ? "dialogue" : rawType) as LiveAuthoredBlock["type"];
    const text = String(block.t ?? block.text ?? "");
    if ((declaredType !== "narration" && declaredType !== "dialogue") || !text.trim()) {
      throw new Error(`실시간 본문 ${index + 1}번 블록의 종류 또는 텍스트가 올바르지 않습니다.`);
    }
    const previous = index > 0 && rawBlocks[index - 1] && typeof rawBlocks[index - 1] === "object"
      ? String((rawBlocks[index - 1] as Record<string, unknown>).t ?? (rawBlocks[index - 1] as Record<string, unknown>).text ?? "")
      : "";
    const type = declaredType === "dialogue" && isDeviceNotificationMisclassifiedAsDialogue({ text, previousText: previous })
      ? "narration"
      : declaredType;
    if (type === "narration") return { type, text, speakerId: "", speakerName: "", emotion: "" };
    const speaker = resolveLiveDialogueSpeaker({
      bindings,
      streamId: String(block.s ?? block.speakerId ?? ""),
      visibleName: String(block.n ?? block.speakerName ?? ""),
    });
    return {
      type,
      text,
      speakerId: speaker.speakerId,
      speakerName: speaker.speakerName,
      emotion: String(block.e ?? block.emotion ?? "").trim(),
    };
  });
  const dialogueAnnotations: DialogueAnnotation[] = blocks
    .filter((block) => block.type === "dialogue")
    .map((block) => ({
      quote: block.text,
      speakerId: block.speakerId,
      speakerName: block.speakerName,
      emotion: block.emotion,
    }));
  const narration = blocks.map((block) =>
    block.type === "dialogue" ? `“${block.text}”` : block.text
  ).join("\n\n");
  const { liveBlocks: _liveBlocks, b: _compactBlocks, ...sidecars } = rawTurn;
  void _liveBlocks;
  void _compactBlocks;
  const writerSceneClock = resolveLiveWriterSceneClock({
    rawBlocks: rawBlocks as Array<Record<string, unknown>>,
    currentTime: envelope.diagnosticContract.currentTime,
  });
  return { turn: { ...sidecars, narration, dialogueAnnotations }, blocks, writerSceneClock };
};
