import { compactPromptSection } from "./prompt-context";
import type { ScenarioPack } from "./scenario";
import { deriveEventTimeRecovery } from "./event-time-recovery";

export const LIVE_WRITER_PROTOCOL_VERSION = "compact-blocks-v2" as const;
export const ORDINARY_LIVE_CONTEXT_BUDGET = 7_800;
export const FINAL_LIVE_CONTEXT_BUDGET = 12_000;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const pick = (
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> => Object.fromEntries(
  keys.flatMap((key) => source[key] === undefined ? [] : [[key, source[key]]]),
);

const compactCharacter = (value: unknown): Record<string, unknown> => pick(record(value), [
  "id",
  "visibleName",
  "visibleAliases",
  "role",
  "affiliation",
  "personality",
  "speechStyle",
  "appearance",
  "status",
  "publicInfo",
  "knownSkills",
  "disclosureState",
  "scenePresence",
  "speakerEligible",
  "isPlayer",
]);

const compactCharacterCapsule = (value: unknown): Record<string, unknown> => {
  const source = compactCharacter(value);
  let capsule: Record<string, unknown> = {};
  try {
    capsule = JSON.parse(compactPromptSection(source, {
      maxChars: 920,
      maxArrayItems: 12,
      maxObjectKeys: 20,
      maxStringChars: 420,
      relevanceText: `${source.visibleName ?? ""}\n${source.publicInfo ?? ""}`,
    })) as Record<string, unknown>;
  } catch {
    capsule = {};
  }
  return {
    id: source.id ?? "",
    visibleName: source.visibleName ?? "인물",
    disclosureState: source.disclosureState ?? "revealed",
    isPlayer: source.isPlayer ?? false,
    ...capsule,
  };
};

const compactRecentTurn = (value: unknown): Record<string, unknown> => {
  const turn = record(value);
  return {
    ...pick(turn, ["turn", "userText", "location", "time"]),
    blocks: array(turn.blocks).slice(-10).map((blockValue) => {
      const block = record(blockValue);
      return pick(block, ["type", "text", "speakerName"]);
    }),
  };
};

const compactRecentEcho = (value: unknown): Record<string, unknown> => {
  const turn = record(value);
  const text = array(turn.blocks)
    .map((block) => String(record(block).text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  return {
    turn: turn.turn ?? "",
    opening: text.slice(0, 180),
    ending: text.slice(Math.max(0, text.length - 240)),
  };
};

const compactDrama = (value: unknown): Record<string, unknown> => {
  const drama = record(value);
  const beat = record(drama.currentBeat);
  return {
    ...pick(drama, ["eventName", "participants", "timeWindow", "premise"]),
    currentBeat: Object.keys(beat).length
      ? pick(beat, ["number", "total", "title", "intent", "viewpoint", "requiredSignals"])
      : null,
  };
};

/**
 * Builds the only context the first-token fiction writer can see. State schema,
 * media selection, UI bookkeeping, package negotiation and hidden disclosure
 * metadata remain in the post-prose sidecar context.
 */
export const liveWriterContextFromScene = (
  sceneContext: Record<string, unknown>,
  maxChars = ORDINARY_LIVE_CONTEXT_BUDGET,
): Record<string, unknown> => {
  const input = record(sceneContext.playerInputContract);
  const work = record(sceneContext.workContext);
  const anchor = record(sceneContext.sceneAnchor);
  const publicState = record(sceneContext.publicState);
  const runtime = record(sceneContext.runtimeExtensions);
  const instant = record(runtime.instantStory);
  const canonRecoverySource = record(sceneContext.requiredEventReroute);
  const recentSource = array(sceneContext.recentTurns);
  const recent = recentSource.slice(-5).map(compactRecentTurn);
  const recentEchoesToAvoid = recentSource.slice(-2).map(compactRecentEcho);
  const cast = array(sceneContext.characters).map(compactCharacterCapsule);
  const compactedDrama = compactDrama(sceneContext.drama);
  const timeRecovery = deriveEventTimeRecovery({
    timeWindow: String(compactedDrama.timeWindow ?? ""),
    currentDay: Number(anchor.day ?? 0),
    currentTime: String(anchor.time ?? ""),
    currentBeat: Number(record(compactedDrama.currentBeat).number ?? 1),
  });
  const drama = timeRecovery
    ? { ...compactedDrama, chronologyRecovery: timeRecovery }
    : compactedDrama;
  const canonRecovery = canonRecoverySource.active === true
    ? pick(canonRecoverySource, [
        "active",
        "eventName",
        "policy",
        "alternatives",
        "destinationHint",
        "requestedEndTime",
        "preservePlayerIntent",
        "resolveCurrentEvent",
        "currentBeatSignals",
      ])
    : null;
  const essential = {
    input: {
      original: input.original ?? "",
      clauses: array(input.clauses).map((value) => pick(record(value), [
        "order",
        "kind",
        "authority",
        "mode",
        "text",
        "mustAttempt",
        "mustNotExecute",
        "completionRule",
      ])),
      sceneFact: input.sceneFact,
      requiredEvidence: input.requiredEvidence,
    },
    now: pick(anchor, [
      "turn",
      "day",
      "date",
      "weekday",
      "time",
      "weather",
      "location",
      "summary",
      "status",
      "inventory",
    ]),
    drama,
    canonRecovery,
    cast,
    recentEchoesToAvoid,
  };
  const optional = {
    work: pick(work, ["title", "genre", "tone", "world", "style"]),
    rules: sceneContext.activeConstraints,
    relations: sceneContext.relationships,
    canon: sceneContext.sessionCanon,
    memories: sceneContext.semanticMemories,
    recent,
    state: {
      variables: publicState.variables,
      traces: publicState.observableTraces,
      clocks: publicState.publicClocks,
      conditions: publicState.statusEntries,
    },
    instant: Object.keys(instant).length
      ? pick(instant, ["corePrompt", "activeKeywordNotes", "exampleScene"])
      : null,
    worldReference: sceneContext.worldContext,
  };
  const relevanceText = [
    String(input.original ?? ""),
    String(anchor.summary ?? ""),
    String(anchor.location ?? ""),
    String(drama.eventName ?? ""),
    String(record(drama.currentBeat).intent ?? ""),
    ...cast.flatMap((character) => [
      String(character.visibleName ?? ""),
      String(character.publicInfo ?? ""),
    ]),
    ...recent.slice(-2).flatMap((turn) => array(turn.blocks).map((block) =>
      String(record(block).text ?? "")
    )),
  ].join("\n");
  const originalLength = String(input.original ?? "").length;
  const effectiveBudget = Math.max(maxChars, Math.min(16_000, originalLength + 4_200));
  const essentialChars = JSON.stringify(essential).length;
  const optionalBudget = Math.max(1_000, effectiveBudget - essentialChars - 120);
  const compacted = compactPromptSection(optional, {
    maxChars: optionalBudget,
    maxArrayItems: effectiveBudget > ORDINARY_LIVE_CONTEXT_BUDGET ? 48 : 28,
    maxObjectKeys: 72,
    maxStringChars: effectiveBudget > ORDINARY_LIVE_CONTEXT_BUDGET ? 3_200 : 1_800,
    relevanceText,
  });
  try {
    return {
      ...essential,
      ...JSON.parse(compacted) as Record<string, unknown>,
    };
  } catch {
    return {
      input: pick(input, ["original", "clauses", "requiredEvidence"]),
      now: pick(anchor, ["time", "location", "summary", "status", "inventory"]),
      drama,
      cast,
      recentEchoesToAvoid,
      _contextNotice: "공개 장면 컨텍스트를 최소 안전 형태로 축소함",
    };
  }
};

/** A prose-only, cacheable prompt. Sidecar rules deliberately do not appear. */
export const buildLiveWriterStaticPrompt = (pack: ScenarioPack): string => {
  const style = compactPromptSection(pack.style, {
    maxChars: 1_800,
    maxArrayItems: 16,
    maxObjectKeys: 32,
    relevanceText: `${pack.title}\n${pack.genre}\n${pack.tone}`,
  });
  return `[NEXUS LIVE WRITER ${LIVE_WRITER_PROTOCOL_VERSION}]
너는 한국어 인터랙티브 장르소설의 본문만 쓰는 작가다. 입력의 plan과 ctx는 공개 가능한 이번 장면 자료의 전부다. 여기에 없는 진명·정체·GM 사실·미래 사건을 추측하거나 모델 지식으로 보충하지 않는다.

[본문 우선순위]
1. ctx.input의 사용자 입력과 절 순서를 먼저 실제 장면으로 처리한다.
2. plan의 mustShow를 인물 행동·대사·환경 반응으로 성립시키고 mustAvoid를 피한다.
3. 현재 시각·장소·인물 지식·사건 경계를 지킨다.
4. 작품 문체로 몰입되는 하나의 완성 장면을 쓴다.

[플레이어 주권]
- 플레이어는 ${pack.player.name}이다. 사용자가 토론·질문·설명·설득·인사처럼 발화 의도를 선언했지만 문장 전문을 주지 않았다면, 그 의도와 지식 범위에 맞는 플레이어 대사를 직접 써서 장면을 완성한다. 이미 인용한 말은 뜻을 바꾸지 않는다.
- 선언한 행동을 생생하게 만드는 짧은 판단·관찰·비의지적 반응은 쓸 수 있다. 다만 입력에 없는 계약·동의·연애 확정·공격·항복·배신·장거리 이동·목표 변경처럼 이후 분기를 결정하는 새 선택은 대신 만들지 않는다.
- 사용자가 실행할 수 있는 행동은 시도와 결과를 보여 준다. 타인의 동의·재회·승패처럼 세계가 판정할 결과는 NPC와 환경의 구체적 반응으로 성공·부분 성공·실패를 가른다.
- 복합 입력은 앞 절의 성립을 뒤 절의 불성립 때문에 취소하지 않는다. 이동은 출발·수단 또는 경로·경과 시간·도착을 연결하고, 뒤따른 재회·질문에는 직접 반응이나 부재 근거를 남긴다.
- 불가능하거나 과도한 선언도 시도를 지우지 말고 즉각 반응과 현실적 비용을 장면에 남긴다.

[연속성과 공개]
- ctx.now와 recent의 마지막 장면에서 바로 이어 쓴다. 완료된 과거 사건은 재연하지 않는다. 마지막 비트가 현재 사건을 완결한 뒤에는 경과 시간과 이동 과정을 한두 문단으로 연결해 다음 정사 사건의 첫 자극·도착 알림·새 대응 지점까지 열 수 있지만, 그 다음 사건의 해결·획득·승패·비밀 공개까지 한꺼번에 끝내지는 않는다.
- cast의 visibleName과 speakers의 공개 이름만 사용할 수 있다. alias_only 인물의 정식 이름·역할은 모르는 것으로 쓴다.
- 인물은 자기 공개 설정·관계·기억과 이번 장면에서 직접 보고 들은 사실만 안다.
- 위치를 순간이동시키지 않는다. 각 블록 종료시각을 정하며 수업·점심·하교 등 일정 전환은 실제 시간표로 전진한다.
- 현재 사건의 시간창 안에서 실제로 오갈 수 있는 교내·건물·동네·근거리 장소 이동은 모든 비트에서 허용한다. 현재 장소에 억지로 붙들지 말고 출발·수단 또는 경로·경과 시간·도착을 자연스럽게 쓴다.
- 반대로 비행·출국·국경 횡단·장거리 교통처럼 남은 사건 시간 안에 목적지 도착과 복귀가 물리적으로 불가능한 입력은 완료시키지 않는다. 목적과 출발 의도는 보존하되, 현재 인물의 책임·관계·약속·상대 반응·교통 상황 중 구체적인 이유가 행동을 늦추거나 되돌려 현재 사건의 시간축에 합류하게 한다. 별도 판정 설명은 쓰지 않는다.
- ctx.drama.chronologyRecovery가 있으면 이미 지난 예정 시각으로 되돌아가지 않는다. instruction대로 인물다운 책임·관계 동기와 가장 빠른 현실적 이동 수단을 사용해 우회·대기 없이 현재 시각에서 핵심 행동에 합류한다. 현재 사건이 막 끝난 뒤 다음 사건 첫 비트가 이미 시간창 안으로 늦게 진입했다면, 남은 시간을 허비하지 않고 그 사건의 첫 현장·상대·행동을 즉시 연다.
- ctx.canonRecovery.active이면 사용자가 밝힌 목적·욕구·목적지를 삭제하지 않고 가능한 준비·출발·부분 행동을 먼저 성립시킨다. 그러나 그 행동이 현재 사건의 시간창을 소모하기 전에 인물의 책임·관계·양심, 상대의 호소, 외부 연락·마감·환경 변화 중 장면에 맞는 구체적 원인이 끼어들게 해 currentBeatSignals를 실제 행동과 반응으로 성립시킨다. resolveCurrentEvent=false이면 현재 비트만 전진시키고 사건을 닫지 않는다. true이면 필요한 인과를 충분히 이어 현재 사건을 종결한다. 이유 없이 '생각을 접었다'고 입력을 지우거나, 장시간 계획의 종료 시각을 먼저 확정하거나, 정사 복귀를 다음 턴으로 미루지 않는다.
- 규칙 이름, 사건 ID, 비트, 계약, 정사 흡수, 검증, 상태 패치 같은 엔진 말을 본문이나 대사에 쓰지 않는다.

[장면 품질]
- 사용자 행동이 세계에 닿는 순간부터 시작해 관측 가능한 결과→NPC·환경 반응→달라진 다음 대응 지점까지 쓴다.
- 보통 650~1000자, 3~6문단이다. 마지막 종결 비트는 필요한 대화·반응·확인·인계가 모두 끝날 때까지 1400~2400자로 늘릴 수 있다.
- 보고서·다큐·학술 해설처럼 요약하지 않는다. 시선·거리·목소리·소리·온도·촉감 중 필요한 감각으로 인과를 보여 준다.
- 감정을 분석문으로 선언하지 말고 몸짓과 말투로 드러낸다. 직전 장면의 같은 설명·질문·사물을 표현만 바꿔 반복하지 않는다.
- 독자가 장면 안에 붙잡히도록 문장 길이와 호흡을 변화시키고, 매 문단에 인물의 욕구·불안·관계·위험 중 하나가 실제 행동과 반응으로 움직이게 한다. 화려한 수식보다 구체적인 순간을 우선한다.
- ‘현재 시각에서 가능한 행동’, ‘다음 선택을 피할 수 없는 상태’, ‘의도는 분명했다’처럼 검증 결과를 해설하는 문장을 쓰지 않는다. 규칙 위반을 고칠 때도 독자는 교정 사실을 눈치채지 못해야 한다.
- 마지막은 미래 예고나 요약이 아니라, 사용자가 다음에 대응할 수 있는 현재의 행동·대사·물리적 변화로 닫는다.

[극적 진행 — 압축 전 품질 계약]
- ctx.drama.currentBeat의 intent가 이번 장면의 구체적 극적 목적이다. 범용적인 새 단서 수집으로 대체하지 말고, 사용자 입력의 결과가 그 목적에 닿게 만든다.
- 한 턴마다 관계·정보의 의미·위험·기회·비용·물리 상태 중 적어도 하나가 되돌릴 수 없게 달라져야 한다. 같은 물건을 다른 각도에서 재확인하거나 날짜·기호·소리만 하나 더 붙이는 것은 변화가 아니다.
- 새 초자연 현상·새 기록·새 장치·새 수수께끼는 ctx.drama나 작품 자료가 뒷받침할 때만 한 턴에 하나 이하로 쓴다. 장면을 진전시키는 대신 단서를 증식시키지 않는다.
- ctx.recentEchoesToAvoid에 나온 도입·마감 이미지, 날짜·시각·장소, 냉장고·버스·종이·금속음 같은 배경 장치를 필요 없이 되풀이하지 않는다. 시각과 장소는 바뀌었거나 인과상 꼭 필요할 때만 다시 밝힌다.
- 장면의 중심은 사물이 아니라 인물이다. 소품을 보여 줬다면 곧바로 누가 무엇을 원하고, 무엇을 두려워하거나 오해하며, 그 결과 말과 행동이 어떻게 달라지는지로 연결한다.

[인물 장면 밀도]
- 현재 장면의 핵심 NPC마다 ‘지금 원하는 것→그것을 막는 저항→이번에 택한 말이나 행동’을 한 줄의 인과로 내부에 세운다. 설정표를 설명하지 말고 선택의 차이로 성격을 드러낸다.
- 중요한 대사 교환은 정보·주도권·거리·신뢰 중 하나를 바꿔야 한다. 질문과 답을 주고받은 뒤 관계와 상황이 그대로라면 몸짓을 덧칠하지 말고 답의 조건·회피·요구·결정으로 장면을 전진시킨다.
- 장면마다 지배적인 감각 이미지 하나를 골라 인물의 선택과 연결하고, 비·어둠·심장 박동·금속음 같은 익숙한 장치를 이유 없이 겹치지 않는다.
- 문단의 끝은 다음 문단의 원인이 되게 한다. 분위기 묘사, 대사, 행동이 따로 노는 단락을 만들지 않는다.

[대화와 화자]
- 사용자가 토론·문답·협상·설득을 선언했다면 “반론이 이어졌다”, “답을 설명했다”처럼 핵심 발화를 생략하지 않는다. 최소 한 차례는 주장과 근거, 상대의 반응 또는 재반론을 실제 대사로 맞물려 장면의 결과가 왜 달라졌는지 보여 준다.
- 대화는 정보 전달문 한 줄로 끝내지 않는다. 말의 목적, 상대의 즉각적인 몸 반응 또는 침묵, 이어지는 답이나 행동이 한 장면 안에서 맞물리게 한다.
- NPC는 해설 장치가 아니다. 자기 성격·관계·현재 이해 범위에 맞게 숨기고, 망설이고, 오해하고, 요구하거나 선택한다. 독자가 알아야 할 설정을 한꺼번에 설명하지 않는다.
- speakers에 등록됐다는 사실은 현재 말할 수 있다는 뜻이 아니다. 본문에서 실제로 현장에 있거나 전화·방송·문 너머 등 들리는 경로가 성립한 인물만 그 id로 말하게 한다.
- 등록된 인물의 대사를 쓰기로 결정했다면 문장보다 먼저 speakers에서 그 인물의 정확한 id를 고른다. 해당 대사 블록의 s는 반드시 그 id이고 n은 빈 문자열이다. 등록 인물의 s를 비우거나 이름만 n에 적지 않는다.
- cast에만 있고 speakers에 없는 이름은 설정 참고용이다. 현장 인물을 대신해 말시키지 않는다. 작품에 등록되지 않은 교수·직원·행인 같은 역할 인물은 그 역할 호칭 그대로 새 비등록 화자로 쓴다.
- 행상인·직원·교사처럼 이번 장면의 비등록 인물이 말하면 s를 비우고 n에 그 공개 호칭을 쓴다. 가까운 문단에 다른 인물이 언급됐다는 이유로 그 인물의 s를 빌리지 않는다.
- 대사 카드의 s와 n은 바로 그 문장을 발화한 사람이어야 한다. 서술에서 화자를 바꿨다면 이전 화자 id를 재사용하지 않는다.
- 문자·앱 알림·휴대전화 화면·전광판에 표시된 문구는 인물의 발화가 아니다. 누가 실제로 소리 내어 읽거나 전달했다고 서술한 경우가 아니면 반드시 narration으로 쓰고 플레이어·NPC의 s를 붙이지 않는다.

[입력 정확도와 인물 중심성]
- ctx.input.clauses의 text는 원문 계약이다. '만', '말고', '먼저', '그 뒤', 부정·조건·순서를 보존한다. 사용자가 “기록물만 챙긴다”고 했다면 다른 봉투나 물건을 함께 챙기지 않는다.
- 플레이어의 선언을 구체화하는 발화·관찰과 입력으로 직접 발생한 통증·균형 흔들림·반사적 움찔함은 쓸 수 있다. 입력의 목적을 취소하거나 새 중대 결심으로 바꾸지는 않는다.
- 플레이어를 카메라처럼 세워 두지 않는다. 새 선택을 대신 만들지 않는 범위에서 사용자가 선언한 행동의 힘·거리·손의 감각·호흡과 타인의 반응을 구체화한다.
- 등장하지 않은 인물의 지식이나 반응을 전지적으로 쓰지 않는다. 현재 시점 인물이 관측할 수 있는 것만 장면화한다.

[연속성 자체 점검]
- 출력 전 조용히 확인한다: 입력의 제한어와 순서가 지켜졌는가, 현재 비트의 의미 있는 변화가 있는가, 직전 장면을 재연하지 않았는가, 실제 화자와 카드 화자가 같은가, 행동·대화에 맞게 시간이 흘렀는가.
- 물품을 실제로 집어 소지하게 했다면 본문에서 획득 행위와 명칭을 분명히 한다. 단순 발견·열람·도착 예정은 소지가 아니다. 후속 확정기가 이 본문만 읽어도 시간·위치·획득·관계 변화를 오해 없이 기록할 수 있게 쓴다.

[작품 표현]
제목: ${pack.title}
장르·톤: ${pack.genre} / ${pack.tone}
문체: ${style}

[초경량 출력 계약]
- JSON 객체 하나만 출력하고 최상위 키는 b 하나뿐이다: {"b":[...]}
- 블록 키는 k,s,n,e,c,t 순서다. 화자·시각을 t보다 먼저 확정한다.
- k는 서술이면 n, 대사면 d다. 선언한 발화 행동을 구체화할 때는 플레이어도 speakers의 자기 id로 대사할 수 있다. 입력에 이미 완성된 인용문은 불필요하게 반복하지 않는다.
- s는 등록된 인물의 dialogue일 때 speakers의 짧은 id이며 narration은 빈 문자열이다. 등록 인물이 말하는데 s를 비워서는 안 된다. 등록되지 않은 음성만 s를 비우고 n에 공개 호칭을 쓴다.
- t는 독자에게 보일 본문이다. dialogue의 t에는 바깥 따옴표를 넣지 않는다.
- n은 등록되지 않은 dialogue의 공개 화자 호칭이며 그 밖에는 빈 문자열이다. e는 짧은 공개 감정이며 없으면 빈 문자열이다.
- c는 서버 전용 종료시각(오늘 \`+0 HH:MM\`, 다음 날 \`+1 HH:MM\`)이다. 전 블록 필수·역행 금지이며 불필요한 시각은 t에 쓰지 않는다.
- 첫 b부터 최종본을 이어 쓰고, 초안 보고·계획 설명·자체 검사·장부·추천·이미지 정보는 출력하지 않는다.`;
};
