import type {
  EncounteredCharacterAddition,
  EngineTurnResponse,
  SimulateRequest,
} from "../engine";
import { createId, type StoryBlock } from "../scenario";
import type { StoryDrive } from "../story-director";

export const fateSeoulRouteTopicPattern = (phase: string): RegExp | undefined => {
  if (phase === "ordinary_before_parcel") return /택배|보관함|배송|알림|지도|좌표|경로/u;
  if (["nadia_human_encounter", "nadia_human_conversation"].includes(phase)) {
    return /나디아|연구자|길\s*안내|박물관/u;
  }
  if (phase === "separate_evening_daily_life") return /저녁|일상|식사|과제|귀가|배달/u;
  if (phase === "seochon_blackout_attack") return /서촌|정전|전기|가로등|습격|종이\s*가면/u;
  if (phase === "night_pursuit_to_shelter") return /추적|도주|종이\s*가면|방공호|대피|매복/u;
  if (phase === "accidental_summoning") return /소환|마법진|소녀\s*검사|촉매|계약/u;
  if (phase === "first_battle_after_summoning") return /첫\s*전투|전투|공격|추적자|종이\s*가면/u;
  if (phase === "church_orientation") return /성당|교회|신부|감독관|오요한/u;
  return undefined;
};

export const fateSeoulRerouteAlternatives = (phase: string): string[] | undefined => {
  if (phase === "ordinary_before_parcel") {
    return ["인접 보관함 또는 분리 배송", "예약 알림의 재전송", "같은 발송인의 별도 전달"];
  }
  if (["nadia_human_encounter", "nadia_human_conversation"].includes(phase)) {
    return ["같은 날 다른 공개 장소에서의 짧은 만남", "나디아가 먼저 묻고 자기소개한 뒤 퇴장", "마술과 무관한 인간적 대화"];
  }
  if (phase === "separate_evening_daily_life") {
    return ["몇 시간의 일상을 짧게 압축", "식사·과제·귀가 준비 중 하나의 결과", "낮 장면과 분리된 저녁 시간 경과"];
  }
  if (phase === "seochon_blackout_attack") {
    return ["원래 장소 밖 인접 구역의 국소 정전", "변압기·배전반 사고", "다른 귀가 동선에서의 종이가면 매복"];
  }
  if (phase === "night_pursuit_to_shelter") {
    return ["첫 추적자를 피한 뒤 다른 출구의 매복", "추적 표식과 차단된 퇴로", "인과적으로 같은 폐쇄 대피공간"];
  }
  if (phase === "accidental_summoning") {
    return ["첫 문양이 꺼진 뒤 보조 봉인 자동 발동", "촉매의 지연 반응", "외부 공격에 반응한 우발 소환"];
  }
  if (phase === "first_battle_after_summoning") {
    return ["피했던 공격의 지연 타격", "막힌 출구에서의 짧은 방어전", "소녀 검사의 퇴로 확보"];
  }
  if (phase === "church_orientation") {
    return ["신부의 보안 통화", "신부가 임시 대피처로 방문", "중립 장소에서의 감독관 설명"];
  }
  return undefined;
};

export const fateSeoulRerouteSatisfied = ({
  phase,
  eventId,
  text,
}: {
  phase: string;
  eventId: string;
  text: string;
}): boolean | undefined => {
  if (phase === "ordinary_before_parcel") {
    return eventId.includes("02_MAP_GLITCH")
      ? /지도|좌표|안내|경로/u.test(text)
      : /택배|보관함|배송|전달/u.test(text) &&
          /수령\s*완료|실제로\s*받|인도받|회수|꺼냈|열렸|배출구/u.test(text);
  }
  if (["nadia_human_encounter", "nadia_human_conversation"].includes(phase)) {
    return /나디아/u.test(text) && /연구자|박물관|길|안내|소개|인사/u.test(text);
  }
  if (phase === "separate_evening_daily_life") return /저녁|식사|과제|귀가|배달|몇\s*시간/u.test(text);
  if (phase === "seochon_blackout_attack") {
    return /정전|전력|변압기|배전|가로등.{0,12}꺼/u.test(text) &&
      /종이\s*가면|추적자|습격|매복/u.test(text);
  }
  if (phase === "night_pursuit_to_shelter") {
    return /종이\s*가면|추적|매복|퇴로/u.test(text) &&
      /방공호|대피\s*통로|폐쇄\s*공간|지하\s*통로/u.test(text);
  }
  if (phase === "accidental_summoning") return /소환|마법진|현현/u.test(text) && /묻겠다.{0,24}마스터/u.test(text);
  if (phase === "first_battle_after_summoning") {
    return /공격|전투|방어|칼날|흉기/u.test(text) && /물러|퇴로|출구|성당\s*교회/u.test(text);
  }
  if (phase === "church_orientation") {
    return /오요한|신부|감독관/u.test(text) && /성배전쟁|마술사|마스터|서번트|소환|계약/u.test(text);
  }
  return undefined;
};


export type RequiredEventReroute = {
  active: boolean;
  mode: "inactive" | "immediate_absorb";
  routeId: string;
  eventId: string;
  eventName: string;
  phase: string;
  policy: string;
  alternatives: string[];
  completionSignals: string[];
  requiredItems: string[];
  requiredDialogue: string;
  requiredSpeakerId: string;
  destinationHint: string;
  requestedEndTime: string;
  preservePlayerIntent: boolean;
  resolveCurrentEvent: boolean;
  currentBeatSignals: string[];
};

export type FateSeoulRecoveryDefaults = {
  blocks: StoryBlock[];
  time: string;
  dayDelta?: number;
  location?: string;
  sceneSummary: string;
  memory: string;
  recommendations: Array<{ label: string; risk: "낮음" | "보통" | "높음" }>;
};

export type FateSeoulRecoveryRuntime = {
  addRouteMinutes: (time: string, minutes: number) => string;
  movementActionRequested: (input: string) => boolean;
  movementTargetFromInput: (input: string, playerName: string) => string;
  movementDepartureNarration: (input: string, playerName: string, currentLocation: string, residentialLocation?: boolean) => string;
  locationAfterLeaving: (currentLocation: string) => string;
  firstDiegeticEventSentence: (...values: Array<string | undefined>) => string;
  isPublicEncounter: (request: SimulateRequest, drive: StoryDrive) => boolean;
  shouldStageRequiredEncounterLocation: (request: SimulateRequest, drive: StoryDrive) => boolean;
  requiredEventRerouteSatisfied: (turn: Omit<EngineTurnResponse, "mode" | "usage">, reroute: RequiredEventReroute) => boolean;
};

const RESIDENTIAL_LOCATION_PATTERN =
  /(?:^|의|\s)(?:집|자택|주택|아파트|원룸|기숙사|숙소|거처|침실|방)(?:$|\s)/u;

export const fateSeoulRouteRecoveryDefaults = (
  request: SimulateRequest,
  drive: StoryDrive,
  runtime: FateSeoulRecoveryRuntime,
): FateSeoulRecoveryDefaults => {
  const phase = drive.routeLock.phase;
  const currentLocation = request.state.location || "현재 장소";
  const currentTimeMatch = request.state.time.match(/^(\d{1,2}):([0-5]\d)$/u);
  const currentMinutes = currentTimeMatch
    ? Number(currentTimeMatch[1]) * 60 + Number(currentTimeMatch[2])
    : 12 * 60;
  const residentialLocation = RESIDENTIAL_LOCATION_PATTERN.test(currentLocation);
  const nadia = request.pack.npcs.find((npc) => /나디아/u.test(npc.name));
  const saber = request.pack.npcs.find((npc) =>
    /(?:^|\b)saber(?:\b|$)|세이버/iu.test(
      `${npc.role} ${npc.affiliation} ${npc.publicInfo}`,
    )
  );
  const priest = request.pack.npcs.find((npc) => /오요한/u.test(npc.name));
  const narration = (text: string): StoryBlock => ({
    id: createId(),
    type: "narration",
    text,
  });
  const dialogue = (
    text: string,
    npc = nadia,
  ): StoryBlock => ({
    id: createId(),
    type: "dialogue",
    text,
    speakerId: npc?.id,
    speakerName: npc?.name ?? "방문 연구자",
    emotion: "차분함",
  });

  const locationBridgeRequired = runtime.shouldStageRequiredEncounterLocation(
    request,
    drive,
  );
  if (locationBridgeRequired) {
    const playerName = request.pack.player.name || "주인공";
    const nadiaEncounter = runtime.isPublicEncounter(request, drive);
    const movingToEncounterVenue = runtime.movementActionRequested(request.userText);
    if (movingToEncounterVenue) {
      const explicitTarget = runtime.movementTargetFromInput(
        request.userText,
        playerName,
      );
      const namedEncounterTarget = nadiaEncounter &&
          /(?:등교|캠퍼스|대학교|대학|학교|교정|박물관|별관)/u.test(
            request.userText,
          )
        ? "대학 캠퍼스 정문"
        : "";
      const destination = explicitTarget || namedEncounterTarget ||
        (residentialLocation
          ? `${playerName}의 집 인근 공개 보행로`
          : runtime.locationAfterLeaving(currentLocation));
      const travelMinutes = residentialLocation &&
          /(?:등교|캠퍼스|대학교|대학|학교|교정|박물관|별관)/u.test(destination)
        ? 35
        : residentialLocation
          ? 10
          : 5;
      const travelWeather = /비|소나기|폭우/u.test(request.state.weather)
        ? "비가 이어지는"
        : `${request.state.weather || "현재 날씨"} 속`;
      const travelRoute = travelMinutes >= 30
        ? "대중교통을 타고 남은 길을 걸어"
        : "확인한 공개 동선을 따라";
      return {
        blocks: [
          narration(runtime.movementDepartureNarration(
            request.userText,
            playerName,
            currentLocation,
            residentialLocation,
          )),
          narration(`${travelWeather} ${travelRoute} ${travelMinutes}분 동안 실제로 이동해 ${destination}에 도착했다. 이전 장소의 사건은 그곳에서 끝났고, 아직 새로운 사람과 마주치기 전 현재 위치와 다음 동선을 확인할 수 있게 됐다.`),
        ],
        time: runtime.addRouteMinutes(request.state.time, travelMinutes),
        location: destination,
        sceneSummary: `${playerName}가 ${currentLocation}을 떠나 ${destination}에 도착했다.`,
        memory: `${currentLocation}에서 ${destination}까지 실제 이동 동선을 따라 이동했다.`,
        recommendations: nadiaEncounter
          ? [
              { label: `${destination}에서 오늘 일정과 건물 위치를 확인한다.`, risk: "낮음" },
              { label: `${destination}의 안내도 앞에서 다음 동선을 정한다.`, risk: "낮음" },
              { label: "가방과 우산을 정리한 뒤 중앙 보행로로 들어간다.", risk: "보통" },
            ]
          : [
              { label: `${destination}에서 예정된 일정과 출입 동선을 확인한다.`, risk: "낮음" },
              { label: `${destination}의 안내판에서 다음 이동 경로를 확인한다.`, risk: "낮음" },
              { label: "소지품을 정리한 뒤 입구 안쪽으로 들어간다.", risk: "보통" },
            ],
      };
    }

    if (!residentialLocation) {
      const bridgeTime = runtime.addRouteMinutes(request.state.time, 3);
      return {
        blocks: [
          narration(`${bridgeTime}, 현재 위치는 집이 아니라 ${currentLocation}이다. ${playerName}는 방금까지의 대화와 사건이 끝난 지점을 확인했다.`),
          narration("가까운 출구와 공개 동선이 확인됐다. 이 장소를 떠나기로 하면 실제 이동 경로와 경과 시간을 거쳐 다음 장소로 이어지며, 아직 새로운 인물이나 과거 사건은 시작되지 않는다."),
        ],
        time: bridgeTime,
        location: currentLocation,
        sceneSummary: `${currentLocation}에서 현재 장면을 정리하고 출구와 공개 동선을 확인했다.`,
        memory: `${currentLocation}에서 현재 장면을 마친 뒤 다음 이동 동선을 확인했다.`,
        recommendations: [
          { label: `${currentLocation}을 떠나 가장 가까운 공개 동선으로 이동한다.`, risk: "낮음" },
          { label: `${currentLocation}의 출구와 주변 교통편을 확인한다.`, risk: "낮음" },
          { label: "현재 동행자에게 다음 목적지를 묻는다.", risk: "보통" },
        ],
      };
    }

    const lateNight = currentMinutes >= 21 * 60 || currentMinutes < 6 * 60;
    const bridgeTime = lateNight ? "08:12" : runtime.addRouteMinutes(request.state.time, 3);
    const dayDelta = currentMinutes >= 21 * 60 ? 1 : 0;
    const overnightLead = lateNight
      ? "밤사이 빗소리가 잦아들고 아침이 밝았다. "
      : "";
    return {
      blocks: [
        narration(`${overnightLead}${bridgeTime}, ${currentLocation}에서 ${playerName}의 휴대전화 알람과 오늘 일정표가 차례로 화면에 떴다.`),
        narration(`창밖에는 ${request.state.weather || "평범한 아침 날씨"}와 일상의 소음만 이어졌다. 아직 집 안이므로, 외출 준비와 목적지를 정한 뒤 실제 이동을 시작할 수 있는 아침의 여유가 남아 있었다.`),
      ],
      time: bridgeTime,
      ...(dayDelta ? { dayDelta } : {}),
      sceneSummary: `${currentLocation}에서 시간이 흐른 뒤 오늘 일정과 이동 준비를 확인했다.`,
      memory: `${currentLocation}에서 아침을 맞아 오늘 일정과 이동 준비를 확인했다.`,
      recommendations: nadiaEncounter
        ? [
            { label: "오늘 첫 일정의 시간과 장소를 확인한다.", risk: "낮음" },
            { label: "우산과 가방을 챙겨 캠퍼스로 출발한다.", risk: "낮음" },
            { label: "통학 경로와 대중교통 도착 시간을 확인한다.", risk: "낮음" },
          ]
        : [
            { label: "오늘 예정된 외부 일정의 시간과 장소를 확인한다.", risk: "낮음" },
            { label: "외출 준비를 마치고 예정된 장소로 출발한다.", risk: "낮음" },
            { label: "이동 경로와 대중교통 도착 시간을 확인한다.", risk: "낮음" },
          ],
    };
  }

  if (phase === "ordinary_before_parcel") {
    if (drive.routeLock.currentEventId.includes("02_MAP_GLITCH")) {
      return {
        blocks: [
          narration(`${currentLocation}에서 사용 중이던 지도 화면이 한 차례 새로 고쳐지며 공식 도면에 없는 짧은 지하 선을 표시했다.`),
          narration("좌표와 갱신 시각이 기록된 직후 그 선은 다시 사라졌다. 화면 캡처와 오류 기록만 현재 시점의 확인 가능한 흔적으로 남았다."),
        ],
        time: runtime.addRouteMinutes(request.state.time, 3),
        sceneSummary: `${currentLocation}의 지도 화면에서 공식 도면에 없는 지하 선이 나타났다가 사라졌다.`,
        memory: "지도 좌표 오류와 사라진 지하 선의 갱신 시각을 확인했다.",
        recommendations: [
          { label: "방금 저장된 지도 오류 기록을 확인한다.", risk: "낮음" },
          { label: "공식 도면과 화면 캡처의 좌표를 비교한다.", risk: "보통" },
          { label: "지도 오류는 기록해 두고 택배 도착 알림으로 넘어간다.", risk: "낮음" },
        ],
      };
    }
    const itemText = drive.routeLock.requiredItems.join(" · ") || "봉인된 내용물";
    return {
      blocks: [
        narration(`${currentLocation}에서 휴대전화가 다시 진동했다. 교내 순환 배송 직원이 보관 기한이 임박한 작은 봉투를 들고 현재 위치까지 찾아와 수령인 이름을 확인했다.`),
        narration(`봉투 겉면의 발송인에는 한명진이 적혀 있었다. 봉인을 열자 ${itemText}이 모습을 드러냈고, 실제 수령을 마친 물건을 그대로 손에 넣었다.`),
      ],
      time: runtime.addRouteMinutes(request.state.time, 5),
      sceneSummary: `${currentLocation}에서 한명진 명의 미수령 택배가 현재 시점의 분리 전달로 실제 수령 완료됐다.`,
      memory: `한명진 명의 택배를 실제 수령하고 필수 내용물을 확보했다: ${itemText}.`,
      recommendations: [
        { label: "한명진 명의가 표시된 배송 기록부터 확인한다.", risk: "낮음" },
        { label: "방금 확보된 물품들의 외관과 손상 상태를 살핀다.", risk: "보통" },
        { label: "물품을 안전하게 챙긴 뒤 현재 일정을 계속한다.", risk: "낮음" },
      ],
    };
  }

  if (phase === "required_event") {
    const event = request.pack.events.find((candidate) =>
      candidate.id === drive.routeLock.currentEventId
    );
    const speaker = request.pack.npcs.find((npc) =>
      npc.id === drive.routeLock.requiredSpeakerId
    );
    const eventContext = [
      event?.name,
      event?.description,
      event?.effects,
      ...drive.routeLock.completionSignals,
      speaker?.name,
      speaker?.role,
    ].filter(Boolean).join(" ");
    const nadiaLikeEncounter = /나디아\s*알\s*하(?:다|디)드|나디아|방문\s*연구자|외국인\s*연구자/u.test(
      eventContext,
    ) && /길|안내|박물관|별관|방문|연구자/u.test(eventContext);
    if (nadiaLikeEncounter && nadia) {
      const lateNight = currentMinutes >= 21 * 60 || currentMinutes < 6 * 60;
      const meetingTime = lateNight ? "08:12" : runtime.addRouteMinutes(request.state.time, 3);
      const dayDelta = currentMinutes >= 21 * 60 ? 1 : 0;
      return {
        blocks: [
          narration(`${currentLocation}의 출입구 안내판 위로 가벼운 빗방울이 번졌다. 젖은 방문 지도를 든 외국인 연구자가 건물 이름 두 곳을 번갈아 확인하다가 이쪽을 바라보았다.`),
          dialogue(
            drive.routeLock.requiredDialogue ||
              "실례합니다. 나디아 알 하다드라고 합니다. 대학박물관 별관은 어느 쪽인가요? 안내 지도에는 같은 이름의 건물이 두 개나 있네요.",
            nadia,
          ),
        ],
        time: meetingTime,
        ...(dayDelta ? { dayDelta } : {}),
        sceneSummary: `${currentLocation}에서 나디아 알 하다드를 길을 묻는 평범한 방문 연구자로 처음 마주쳤다.`,
        memory: "나디아 알 하다드를 평범한 방문 연구자로 처음 만났다.",
        recommendations: [
          { label: "현재 안내판을 짚어 대학박물관 별관 방향을 알려준다.", risk: "낮음" },
          { label: "나디아에게 어느 주소를 찾는지 묻는다.", risk: "낮음" },
          { label: "가까운 공식 안내 창구를 함께 확인하자고 제안한다.", risk: "보통" },
        ],
      };
    }

    const signal = runtime.firstDiegeticEventSentence(
      drive.routeLock.completionSignals[0],
      event?.effects,
      event?.description,
      event?.name,
    );
    const mechanism = speaker
      ? `${speaker.name}의 연락이 현재 위치로 도착했다`
      : residentialLocation
        ? "현관 밖과 휴대전화에서 거의 동시에 변화가 감지됐다"
        : "주변의 소리와 사람들의 움직임이 한 방향으로 달라졌다";
    const blocks = [
      narration(`${currentLocation}에서 ${mechanism}. 직전까지 이어지던 상황을 끊어내지 않은 채, 그 변화가 눈앞에서 확인됐다.`),
      narration(`${signal.replace(/[.。!?！？]+$/u, "")}.`),
      ...(drive.routeLock.requiredItems.length
        ? [narration(`그 과정에서 ${drive.routeLock.requiredItems.join(" · ")}이 실제로 전달되어 손에 들어왔다.`)]
        : []),
      ...(drive.routeLock.requiredDialogue
        ? [dialogue(drive.routeLock.requiredDialogue, speaker)]
        : [narration("변화의 원인과 당장 확인할 수 있는 흔적이 남았고, 지금 이 자리에서 어느 쪽부터 살필지 정할 수 있었다.")]),
    ];
    return {
      blocks,
      time: runtime.addRouteMinutes(request.state.time, 5),
      sceneSummary: `${currentLocation}에서 ${drive.routeLock.currentEventName}의 관측 가능한 변화가 나타났다.`,
      memory: `${currentLocation}에서 ${drive.routeLock.currentEventName}과 관련된 변화를 직접 확인했다.`,
      recommendations: [
        { label: `${currentLocation}에서 방금 달라진 흔적을 확인한다.`, risk: "보통" },
        { label: speaker ? `${speaker.name}에게 방금 연락한 이유를 묻는다.` : `${currentLocation}에서 변화가 시작된 방향을 살핀다.`, risk: "낮음" },
        { label: drive.routeLock.requiredItems.length ? `방금 전달된 ${drive.routeLock.requiredItems[0]}의 상태를 확인한다.` : `${currentLocation}의 출입 동선과 휴대전화 기록을 비교한다.`, risk: "낮음" },
      ],
    };
  }

  if (phase === "nadia_human_encounter") {
    return {
      blocks: [
        narration("가벼운 비가 캠퍼스 안내도 위로 번졌다. 접힌 방문 지도를 든 외국인 연구자가 건물 이름 두 곳을 번갈아 확인하다가 말을 걸었다."),
        dialogue("실례합니다. 대학박물관 별관은 어느 쪽인가요? 안내 지도에는 같은 이름의 건물이 두 개나 있네요."),
      ],
      time: runtime.addRouteMinutes(request.state.time, 3),
      sceneSummary: "비 오는 캠퍼스에서 나디아 알 하다드가 박물관 별관으로 가는 길을 물었다.",
      memory: "나디아 알 하다드를 평범한 방문 연구자로 처음 만났다.",
      recommendations: [
        { label: "박물관 별관으로 가는 길을 알려준다.", risk: "낮음" },
        { label: "방문 목적이 무엇인지 묻는다.", risk: "낮음" },
        { label: "가까운 교내 안내 창구를 가리킨다.", risk: "보통" },
      ],
    };
  }
  if (phase === "nadia_human_conversation") {
    const declined = /모르|거절|무시|대답하지|답하지/u.test(request.userText);
    return {
      blocks: [
        dialogue(
          declined
            ? "괜찮습니다. 갑자기 길을 물어서 미안해요. 나디아 알 하다드라고 합니다. 다른 안내도를 찾아볼게요."
            : "감사합니다. 나디아 알 하다드예요. 프랑스에서 온 이름고고학자입니다. 오래된 기록에서 이름이 어떻게 남고 사라지는지 연구해요.",
        ),
        narration("나디아는 가볍게 고개를 숙여 인사한 뒤 박물관 별관 쪽으로 걸어갔다. 빗소리와 학생들의 발걸음만 남으며 낮의 짧은 만남은 그곳에서 완전히 끝났다."),
      ],
      time: runtime.addRouteMinutes(request.state.time, 3),
      sceneSummary: "나디아 알 하다드가 인사를 남기고 떠나며 평범한 캠퍼스 만남이 끝났다.",
      memory: "나디아 알 하다드와의 평범한 길 안내 대화가 끝났다.",
      recommendations: [
        { label: "현재 장소에서 다음 일정을 확인한다.", risk: "낮음" },
        { label: "남은 오후 수업이나 과제를 정리한다.", risk: "낮음" },
        { label: "받아 둔 택배 알림을 다시 확인한다.", risk: "보통" },
      ],
    };
  }
  if (phase === "separate_evening_daily_life") {
    if (residentialLocation) {
      const morning = currentMinutes < 12 * 60;
      const daytime = currentMinutes < 18 * 60;
      const nextTime = runtime.addRouteMinutes(request.state.time, 20);
      const periodNarration = morning
        ? `${currentLocation}에는 아침 식사와 오늘 일정표, 아직 정리하지 않은 컵 같은 평범한 생활의 흔적만 남아 있었다.`
        : daytime
          ? `${currentLocation}에는 늦은 점심과 과제, 충전 중인 휴대전화 같은 평범한 생활의 흔적만 남아 있었다.`
          : `${currentLocation}에는 저녁 식사와 과제, 씻지 않은 컵 같은 평범한 생활의 흔적만 남아 있었다.`;
      const nextBeat = morning
        ? "휴대전화에는 강의 일정과 이동 알림이 차례로 떴다. 아직 정전도 수상한 기척도 없었고, 오늘의 다음 일정을 정할 시간이 충분했다."
        : daytime
          ? "휴대전화에는 과제 마감과 남은 일정 알림이 차례로 떴다. 아직 정전도 수상한 기척도 없었고, 다음 일정을 정할 시간이 충분했다."
          : "휴대전화에는 배달 주문과 과제 마감 알림이 차례로 떴다. 아직 정전도 수상한 기척도 없었고, 저녁의 다음 일정을 정할 시간이 충분했다.";
      return {
        blocks: [
          narration(`이전에 끝난 만남과 분리된 현재 장면이 이어졌다. ${periodNarration}`),
          narration(nextBeat),
        ],
        time: nextTime,
        sceneSummary: `${currentLocation}에서 과거의 만남과 분리된 현재 시각의 평범한 일상이 이어졌다.`,
        memory: `${currentLocation}에서 현재 시각에 맞는 식사와 일정을 정리하며 평범한 일상을 보냈다.`,
        recommendations: morning
          ? [
              { label: "집에서 아침 식사를 해결한다.", risk: "낮음" },
              { label: "오늘 일정과 필요한 준비물을 확인한다.", risk: "낮음" },
              { label: "현재 장소에서 먼저 처리할 일을 정한다.", risk: "보통" },
            ]
          : daytime
            ? [
                { label: "늦은 점심을 해결하고 남은 일정을 확인한다.", risk: "낮음" },
                { label: "과제를 정리하고 다음 외출 시간을 정한다.", risk: "낮음" },
                { label: "현재 장소에서 처리할 일을 먼저 끝낸다.", risk: "보통" },
              ]
            : [
                { label: "집에서 저녁 식사를 해결한다.", risk: "낮음" },
                { label: "과제를 정리하고 남은 일정을 확인한다.", risk: "낮음" },
                { label: "배달 앱의 저녁 주문을 확인한다.", risk: "보통" },
              ],
      };
    }
    return {
      blocks: [
        narration("낮의 만남과 분리된 채 몇 시간이 흘렀다. 캠퍼스에는 저녁 식사 안내와 과제 마감 알림, 귀가를 서두르는 학생들의 평범한 소음이 차례로 쌓였다."),
        narration("학생식당 메뉴판과 배달 앱의 주문 알림, 젖은 자전거 안장처럼 오늘 밤의 생활을 정해야 할 것들이 눈앞에 남았다. 아직 수상한 기척이나 위험은 없었다."),
      ],
      time: request.state.time < "18:30" ? "18:30" : runtime.addRouteMinutes(request.state.time, 20),
      sceneSummary: "나디아와의 만남 뒤 별도의 평범한 저녁 일상이 시작됐다.",
      memory: "나디아 장면과 분리된 저녁에 식사·과제·배달 중 다음 일정을 정할 시간이 됐다.",
      recommendations: [
        { label: "학생식당에서 저녁을 해결한다.", risk: "낮음" },
        { label: "과제를 정리하고 귀가를 준비한다.", risk: "낮음" },
        { label: "배달 앱을 켜고 저녁 주문을 확인한다.", risk: "보통" },
      ],
    };
  }
  if (phase === "seochon_blackout_attack") {
    const seochonReady = /서촌/u.test(currentLocation);
    return seochonReady
      ? {
          blocks: [
            narration("밤 10시 47분, 서촌 골목의 가로등과 상가 간판이 한꺼번에 꺼졌다. 평범한 주문 전달과 귀가 소리가 끊기며 한 구역 전체가 갑자기 어둠에 잠겼다."),
            narration("골목 반대편에서 비에 젖은 종이가면을 쓴 추적자 한 명이 모습을 드러냈다. 오후 캠퍼스와는 시간도 장소도 다른 새로운 야간 사건이었다."),
          ],
          time: "22:47",
          location: "서울 서촌 골목",
          sceneSummary: "서촌의 별도 야간 동선에서 정전이 발생하고 종이가면 추적자가 나타났다.",
          memory: "22시 47분 서촌에서 정전과 함께 종이가면 추적자가 나타났다.",
          recommendations: [
            { label: "가까운 불 켜진 가게에 도움을 요청한다.", risk: "보통" },
            { label: "추적자와 거리를 벌릴 퇴로를 찾는다.", risk: "보통" },
            { label: "골목의 좁은 통로를 이용해 시야를 끊는다.", risk: "높음" },
          ],
        }
      : {
          blocks: [
            narration(`평범한 저녁이 지나 22시 47분이 되었을 때, ${currentLocation}의 조명과 전자기기가 한꺼번에 꺼졌다. 다른 장소로 이동한 것이 아니라 현재 건물과 인접 구역의 전력만 끊긴 국소 정전이었다.`),
            narration(residentialLocation
              ? "곧 현관문 바깥에서 젖은 종이가면을 쓴 누군가가 문손잡이를 시험하고 금속 도구로 잠금장치를 부수기 시작했다. 야간 습격이 집까지 도달한 것이었다."
              : "꺼진 출입구 반대편에서 젖은 종이가면을 쓴 추적자가 나타나 퇴로를 막았다. 야간 습격이 현재 동선까지 도달한 것이었다."),
          ],
          time: request.state.time < "22:47" ? "22:47" : runtime.addRouteMinutes(request.state.time, 2),
          sceneSummary: `${currentLocation}에서 국소 정전이 발생하고 종이가면 추적자가 현재 출구를 노렸다.`,
          memory: `${currentLocation}에서 정전과 함께 종이가면 추적자의 습격이 시작됐다.`,
          recommendations: [
            { label: "현재 출구를 막을 수단을 찾아 도움을 요청한다.", risk: "보통" },
            { label: "정전된 건물의 다른 비상 연락망에 연락한다.", risk: "보통" },
            { label: "종이가면 추적자와 거리를 벌릴 퇴로를 찾는다.", risk: "높음" },
          ],
        };
  }
  if (phase === "night_pursuit_to_shelter") {
    return {
      blocks: [
        narration(residentialLocation
          ? `종이가면 추적자의 충격에 ${currentLocation}의 현관 잠금장치가 부서졌다. 동시에 정전용 방화문과 엘리베이터가 멈추면서 집 안과 바로 이어진 복도는 퇴로가 막힌 폐쇄공간이 되었다.`
          : `종이가면 추적자가 ${currentLocation}의 출구를 차례로 막았다. 정전으로 비상문까지 잠기면서 현재 장소 자체가 빠져나가기 어려운 폐쇄공간으로 바뀌었다.`),
        narration("유일한 출구 앞에서 추적자가 흉기를 들어 올렸다. 바닥의 낡은 선은 찾아간 목적지가 아니라, 현재 위기에서 우연히 드러난 오래된 구조물의 흔적이었다."),
      ],
      time: runtime.addRouteMinutes(request.state.time, 18),
      sceneSummary: `${currentLocation}가 폐쇄공간이 되며 종이가면 추적자에게 퇴로가 막혔다.`,
      memory: `${currentLocation}의 출구가 막혀 종이가면 추적자의 직접적인 생존 위기에 놓였다.`,
      recommendations: [
        { label: "추적자와 출구 사이의 장애물을 이용한다.", risk: "높음" },
        { label: "현재 폐쇄공간의 다른 비상구를 찾는다.", risk: "높음" },
        { label: "주변에 도움을 요청할 수단을 찾는다.", risk: "보통" },
      ],
    };
  }
  if (phase === "accidental_summoning") {
    return {
      blocks: [
        narration(`추적자의 치명적인 공격이 닿으려는 순간, ${currentLocation} 바닥의 낡은 선과 택배의 촉매가 누구의 주문도 없이 붉게 타올랐다. 빛의 원과 겹친 마법진이 바닥 전체로 펼쳐졌다.`),
        narration("폭발한 검광 속에서 검을 든 소녀 검사가 현현했다. 그녀는 가장 먼저 날아든 칼날을 검으로 쳐내 한시우에게 닿을 치명타를 막았다."),
        dialogue("묻겠다. 그대가 나의 마스터인가.", saber),
      ],
      time: "23:41",
      sceneSummary: `${currentLocation}의 생존 위기에서 마법진이 우발 발동해 진명을 밝히지 않은 소녀 검사가 현현했다.`,
      memory: "23시 41분, 마법진에서 현현한 소녀 검사가 치명타를 막고 마스터인지 물었다.",
      recommendations: [
        { label: "소녀 검사의 질문에 사실대로 답한다.", risk: "낮음" },
        { label: "먼저 눈앞의 추적자를 막아 달라고 요청한다.", risk: "보통" },
        { label: "계약과 현재 상황이 무엇인지 되묻는다.", risk: "보통" },
      ],
    };
  }
  if (phase === "first_battle_after_summoning") {
    return {
      blocks: [
        narration(`${currentLocation}의 꺼진 조명 아래서 종이가면의 흉기가 다시 휘둘러졌다. 소녀 검사는 추적보다 생존을 우선해 검으로 공격을 걷어 내고 출구까지 이어지는 퇴로를 만들었다.`),
        narration("짧고 압도적인 첫 방어전 끝에 추적자는 어둠 속으로 물러났다. 복잡한 술식이나 새로운 적의 개입 없이, 방금의 소환이 실제 구원이었음만 분명히 남았다."),
        dialogue("이곳에 오래 머물 수는 없다. 이 전쟁을 감독하는 자가 있는 성당교회로 가는 편이 좋다.", saber),
      ],
      time: runtime.addRouteMinutes(request.state.time, 12),
      sceneSummary: "소녀 검사가 첫 방어전에서 종이가면을 물리치고 퇴로를 확보한 뒤 성당교회행을 제안했다.",
      memory: "소녀 검사가 첫 전투에서 생존을 우선해 퇴로를 만들고 성당교회 감독관을 만나자고 제안했다.",
      recommendations: [
        { label: "성당교회로 가자는 제안을 받아들인다.", risk: "낮음" },
        { label: "이 전쟁과 감독관에 대해 먼저 묻는다.", risk: "보통" },
        { label: "부상과 주변 안전을 먼저 확인해 달라고 요청한다.", risk: "보통" },
      ],
    };
  }
  if (phase === "church_orientation") {
    const refusedChurch = /(?:거절|가지\s*않|안\s*(?:가|갈)|싫|혼자\s*(?:있|남)|동행하지\s*않)/u.test(
      request.userText,
    );
    if (refusedChurch) {
      return {
        blocks: [
          dialogue("알겠다. 억지로 데려가지는 않겠다. 다만 이곳은 다시 추적당할 수 있으니, 우선 몸을 숨길 안전한 곳부터 확보하자.", saber),
          narration("소녀 검사는 성당으로 향하는 대신 방공호 밖의 인기척을 살피고 임시 대피 동선을 잡았다. 감독관을 만나는 일은 강요되지 않은 다음 선택으로 남았다."),
        ],
        time: runtime.addRouteMinutes(request.state.time, 5),
        sceneSummary: "성당행을 거절하자 소녀 검사가 결정을 존중하고 임시 안전 확보를 우선했다.",
        memory: "성당교회 동행 제안을 거절했고, 소녀 검사는 강요하지 않은 채 임시 대피를 도왔다.",
        recommendations: [
          { label: "성당교회에 가야 하는 이유를 먼저 묻는다.", risk: "낮음" },
          { label: "임시로 숨을 안전한 장소부터 찾는다.", risk: "보통" },
          { label: "상황을 정리한 뒤 성당행을 다시 판단한다.", risk: "낮음" },
        ],
      };
    }
    return {
      blocks: [
        narration(`첫 전투가 끝난 ${currentLocation}에서 소녀 검사는 추적을 피할 안전한 길을 확인했다. 그녀의 안내를 따라 지상으로 빠져나와 차량으로 이동했고, 24분 뒤 명동성당 부속 별관 지하 고해실에 도착했다. 낡은 묵주가 작은 탁자 위에 놓였다.`),
        dialogue("오요한 신부입니다. 이 밤 서울에서 벌어진 일을 공식적으로 감독하고 있습니다. 우선, 당신이 선택해서 들어온 싸움이라고 생각하지는 않겠습니다.", priest),
        narration("오요한은 용어를 한꺼번에 늘어놓지 않고, 먼저 오늘 밤 벌어진 소환과 공격이 무엇이었는지부터 설명한 뒤 질문을 기다렸다."),
      ],
      time: runtime.addRouteMinutes(request.state.time, 24),
      location: "명동성당 부속 별관 지하 고해실",
      sceneSummary: "성당교회 감독관 오요한 신부가 오늘 밤 벌어진 일을 먼저 설명하기 시작했다.",
      memory: "오요한 신부가 성당교회 감독관으로서 성배전쟁의 기초 설명을 시작했다.",
      recommendations: [
        { label: "성배전쟁이 무엇인지 먼저 묻는다.", risk: "낮음" },
        { label: "마술사와 마스터의 차이를 묻는다.", risk: "낮음" },
        { label: "서번트와 계약의 규칙을 묻는다.", risk: "보통" },
      ],
    };
  }

  return {
    blocks: [
      narration(`몇 분이 흐르자 ${currentLocation}의 사람들과 소음도 다음 시간대로 넘어갔다. 가까이에 있던 인물은 하던 일을 마치고 움직였고, 직전의 문제를 같은 방식으로 붙잡아 둘 이유도 사라졌다.`),
      narration(`${request.state.sceneSummary || "방금까지 이어진 상황"}의 직접적인 여파만 남은 가운데, ${currentLocation}에서 새 연락이 도착하거나 출입 동선의 움직임이 달라졌다. 눈앞에서 먼저 확인할 수 있는 변화가 분명해졌다.`),
    ],
    time: runtime.addRouteMinutes(request.state.time, 3),
    sceneSummary: `${currentLocation}에서 직전 상황이 일단락되고 새로운 현장 반응이 나타났다.`,
    memory: `${currentLocation}에서 같은 확인을 반복하지 않고 다음 현장 변화로 이어졌다.`,
    recommendations: [
      { label: `${currentLocation}에서 새로 들어온 연락이나 안내를 확인한다.`, risk: "낮음" },
      { label: `${currentLocation}의 출입 동선과 주변 인물의 움직임을 따라간다.`, risk: "보통" },
      { label: `${currentLocation}에 남은 직전 사건의 흔적을 정리하고 다음 일정으로 넘어간다.`, risk: "보통" },
    ],
  };
};



const preservedPlayerPlan = (
  request: SimulateRequest,
  reroute: RequiredEventReroute,
) => {
  const playerName = request.pack.player.name || "주인공";
  const destination = reroute.destinationHint.trim();
  const longNightPlan = /밤을\s*(?:새|샌|보내)|밤새|파티|클럽/u.test(
    request.userText,
  );
  const planLabel = destination
    ? longNightPlan
      ? `${destination}에서 밤을 보내려는 계획`
      : `${destination}로 향하려는 계획`
    : "방금 스스로 정한 계획";
  const preparation = destination
    ? longNightPlan
      ? `${playerName}는 휴대전화에 ${destination}의 위치와 이동 경로를 저장하고, 영업 시작 시각과 귀가 동선까지 실제로 확인했다.`
      : `${playerName}는 휴대전화에 ${destination}의 위치와 이동 경로를 저장하고 출발 준비를 실제로 시작했다.`
    : `${playerName}는 그 선택을 말뿐인 충동으로 흘려보내지 않고, 실행에 필요한 첫 준비를 실제로 시작했다.`;
  const timing = reroute.requestedEndTime
    ? ` ${reroute.requestedEndTime}까지 이어가려던 시간 계획도 그대로 남아 있었다.`
    : "";
  return {
    playerName,
    destination,
    planLabel,
    opening: `${planLabel}은 말뿐인 충동으로 끝나지 않았다. ${preparation}${timing}`,
    deferral: `원래 계획을 포기한 것이 아니었다. 뜻밖의 일을 먼저 매듭지은 뒤 다시 선택할 수 있도록, 순서만 잠시 뒤로 밀렸을 뿐이었다.`,
    memory: `${planLabel}은 취소되지 않았고, 현재 눈앞의 사건 때문에 잠시 보류됐다.`,
    resumeRecommendation: destination
      ? `현재 일을 마친 뒤 ${destination}로 갈 계획을 계속할지 결정한다.`
      : "현재 일을 마친 뒤 원래 계획을 계속할지 결정한다.",
  };
};

export const recoverFateSeoulRequiredEventReroute = (
  turn: Omit<EngineTurnResponse, "mode" | "usage">,
  request: SimulateRequest,
  reroute: RequiredEventReroute,
  runtime: Pick<FateSeoulRecoveryRuntime, "addRouteMinutes" | "requiredEventRerouteSatisfied">,
): Omit<EngineTurnResponse, "mode" | "usage"> => {
  if (!reroute.active || runtime.requiredEventRerouteSatisfied(turn, reroute)) return turn;

  const nadia = request.pack.npcs.find((npc) => /나디아/u.test(npc.name));
  const saber = request.pack.npcs.find((npc) =>
    /(?:^|\b)saber(?:\b|$)|세이버/iu.test(
      `${npc.role} ${npc.affiliation} ${npc.publicInfo}`,
    )
  );
  const priest = request.pack.npcs.find((npc) => /오요한|신부/u.test(npc.name));
  const narration = (text: string): StoryBlock => ({
    id: createId(),
    type: "narration",
    text,
  });
  const dialogue = (
    text: string,
    npc?: (typeof request.pack.npcs)[number],
  ): StoryBlock => ({
    id: createId(),
    type: "dialogue",
    text,
    speakerId: npc?.id,
    speakerName: npc?.name ?? "",
    emotion: "차분함",
  });

  let blocks: StoryBlock[] = [];
  let time = runtime.addRouteMinutes(request.state.time, 5);
  let location = request.state.location;
  let sceneSummary = `${reroute.eventName}이 사용자의 선택과 맞물려 다른 경로에서 이어졌다.`;
  let memory = `${reroute.eventName}은 사라지지 않고 사용자의 선택에서 비롯된 우회 경로로 이어졌다.`;
  let recommendations: Array<{ label: string; risk: "낮음" | "보통" | "높음" }> = [
    { label: "새로 발생한 변화에 대응한다.", risk: "보통" },
    { label: "현재 확인된 원인을 묻거나 확인한다.", risk: "낮음" },
    { label: "안전한 다음 동선을 찾는다.", risk: "보통" },
  ];
  let encounteredCharacters: EncounteredCharacterAddition[] = [];
  const playerPlan = preservedPlayerPlan(request, reroute);

  if (reroute.phase === "required_event") {
    const event = request.pack.events.find((candidate) =>
      candidate.id === reroute.eventId
    );
    const speaker = request.pack.npcs.find((npc) =>
      npc.id === reroute.requiredSpeakerId
    );
    const alternative = reroute.alternatives[0] ||
      "지금 지나치면 되돌릴 수 없는 작은 징후";
    const observableOutcome = reroute.completionSignals[0] ||
      event?.description?.split(/[.!?。！？\n]/u)[0]?.trim() ||
      "예정된 핵심 변화가 관측 가능한 형태로 성립했다";
    blocks = [
      narration(playerPlan.opening),
      narration(`막 출발하려던 순간, ${alternative}이 발목을 붙잡았다. 모른 척 지나치기에는 마음에 걸리는 이유가 너무 구체적이었다. 멀리 돌아가는 대신, 지금 있는 곳에서 끝낼 수 있는 만큼만 먼저 확인하기로 했다.`),
      narration(`짧은 우회 끝에 ${observableOutcome}. 말이나 예고로 끝난 일이 아니라, 손에 잡히는 결과가 눈앞에 남았다. ${playerPlan.deferral}`),
    ];
    if (reroute.requiredItems.length) {
      blocks.push(
        narration(`그 안에서 ${reroute.requiredItems.join(" · ")}이 모습을 드러냈다. 하나씩 확인한 뒤 빠뜨리지 않고 챙겼다.`),
      );
    }
    if (reroute.requiredDialogue) {
      blocks.push(dialogue(reroute.requiredDialogue, speaker));
    }
    sceneSummary = "원래 계획을 남겨 둔 채 뜻밖의 우회를 거쳐 눈앞의 일을 매듭지었다.";
    memory = `${playerPlan.memory} 눈앞의 사건은 말로 넘기지 않고 행동과 결과까지 실제로 마쳤다.`;
    encounteredCharacters = speaker &&
        !request.state.encounteredCharacterIds.includes(speaker.id)
      ? [{ characterId: speaker.id, name: speaker.name, relationType: "첫 대면" }]
      : [];
    recommendations = [
      { label: "새로 드러난 결과에 대응한다.", risk: "보통" },
      { label: "방금 우회를 부른 흔적을 가까이서 확인한다.", risk: "낮음" },
      { label: playerPlan.resumeRecommendation, risk: "보통" },
    ];
  } else if (reroute.phase === "ordinary_before_parcel") {
    if (reroute.eventId.includes("02_MAP_GLITCH")) {
      blocks = [
        narration(playerPlan.opening),
        narration("출발 경로를 확인하려 학교 공식 앱을 연 바로 그때 좌표 갱신 알림이 도착했다. 후문 동선 하나가 임시 경로로 표시되어, 원래 계획을 실행하기 전에 이 변화부터 확인할 이유가 생겼다."),
        narration("갱신 시각과 좌표가 화면에 남아, 처음 지도와는 별개의 기록임을 바로 구분할 수 있었다."),
      ];
      sceneSummary = "정상 지도와 별개인 좌표 갱신 알림이 후문 택배함 동선을 표시했다.";
      memory = `${playerPlan.memory} 기존 지도와 별개의 좌표 갱신 알림을 확인했다.`;
    } else {
      blocks = [
        narration(playerPlan.opening),
        narration("출발 버튼에 손을 올린 순간, 보관 알림이 다시 진동했다. 수령 마감까지 남은 시간은 길지 않았고 발송인 칸의 이름은 쉽게 외면할 수 있는 것이 아니었다. 몇 분이면 확인할 수 있었다. 이대로 떠나면 밤새 마음 한구석에 남을 터였다."),
        narration("보관함을 직접 열자 수령 트레이가 움직이며 봉투와 내용물을 내보냈다."),
        ...(reroute.requiredItems.length
          ? [narration(`봉투를 열자 ${reroute.requiredItems.join(" · ")}이 차례로 모습을 드러냈다. 손끝으로 상태를 확인한 뒤 빠짐없이 챙겼다. ${playerPlan.deferral}`)]
          : []),
      ];
      sceneSummary = "원래 계획을 유지한 채 출발 전 짧게 우회해 무인택배함의 내용물과 필수 물품을 확보했다.";
      memory = `${playerPlan.memory} 출발 전 무인택배함을 직접 열어 내용물과 필수 물품을 실제 확보했다.`;
    }
  } else if (["nadia_human_encounter", "nadia_human_conversation"].includes(reroute.phase)) {
    blocks = [
      narration(playerPlan.opening),
      narration(`아직 예정한 일정까지 시간이 남아 있어, ${playerPlan.playerName}는 교내에서 하던 일을 마치고 밖으로 나가는 동선부터 잡았다. 대학박물관 안내판 앞을 지나는 순간, 접힌 지도를 든 방문 연구자가 두 건물을 번갈아 보다가 ${playerPlan.playerName} 쪽을 바라봤다.`),
      dialogue("실례합니다. 나디아 알 하다드예요. 박물관 별관을 찾고 있는데, 이 안내판의 두 건물 중 어느 쪽인지 혹시 아시나요?", nadia),
      narration(`몇 걸음만 더 가면 교문이었다. 이 만남은 원래 계획을 지운 일이 아니라, 출발 전 같은 길 위에서 마주친 뜻밖의 변수였다. ${playerPlan.deferral}`),
    ];
    sceneSummary = "사용자가 정한 이후 일정을 유지한 채 교내를 나서는 동선에서 나디아를 평범한 방문 연구자로 마주쳤다.";
    memory = `${playerPlan.memory} 출발 동선의 안내판 앞에서 나디아 알 하다드를 평범한 방문 연구자로 만났다.`;
    encounteredCharacters = nadia && !request.state.encounteredCharacterIds.includes(nadia.id)
      ? [{ characterId: nadia.id, name: nadia.name, relationType: "첫 만남" }]
      : [];
    recommendations = [
      { label: "박물관 별관으로 가는 길을 알려준다.", risk: "낮음" },
      { label: "방문 목적을 짧게 묻는다.", risk: "낮음" },
      { label: playerPlan.resumeRecommendation, risk: "보통" },
    ];
  } else if (reroute.phase === "separate_evening_daily_life") {
    blocks = [
      narration(playerPlan.opening),
      narration("예정한 밤 일정까지 남은 시간을 없던 일로 건너뛰지 않고, 식사와 과제 정리, 귀가 준비를 차례로 마쳤다. 낮의 만남은 다시 이어지지 않았고 각 행동의 결과만 남으며 시간이 자연스럽게 흘렀다."),
      narration(`식당 마감 방송과 귀가를 서두르는 학생들의 발소리가 들릴 무렵에는 다음 이동을 시작할 준비가 끝나 있었다. ${playerPlan.deferral}`),
    ];
    time = request.state.time < "18:30" ? "18:30" : runtime.addRouteMinutes(request.state.time, 20);
    sceneSummary = "건너뛴 저녁 일상이 압축되고 캠퍼스 밖 동선을 정할 시간이 됐다.";
    memory = `${playerPlan.memory} 낮 장면과 분리된 저녁 준비 시간을 실제로 보냈다.`;
  } else if (reroute.phase === "seochon_blackout_attack") {
    blocks = [
      narration(playerPlan.opening),
      narration("정한 목적지로 향하기 위해 현재 장소를 나서 실제 이동을 시작했다. 그 동선과 맞닿은 한 블록 건너편 배전함에서 둔탁한 폭음이 울리고, 골목의 가로등과 상가 간판이 연쇄적으로 꺼졌다."),
      narration("자동 교통 안내가 보행자를 그 국소 정전 구역의 우회로로 돌리는 순간, 비에 젖은 종이가면을 쓴 추적자가 골목 출구에 모습을 드러냈다. 정전과 습격은 사라진 것이 아니라 다른 전력 구간과 동선에서 발생했다."),
    ];
    time = "22:47";
    location = "서울 서촌 인접 골목";
    sceneSummary = "원래 길은 정상인 채 인접 구역의 국소 정전과 종이가면 매복이 발생했다.";
    memory = `${playerPlan.memory} 실제 이동 도중 22시 47분에 국소 정전과 종이가면 추적이 시작됐다.`;
    recommendations = [
      { label: "불이 켜진 큰길 쪽 퇴로를 찾는다.", risk: "보통" },
      { label: "가까운 영업점에 도움을 요청한다.", risk: "보통" },
      { label: "장애물을 이용해 추적자의 시야를 끊는다.", risk: "높음" },
    ];
  } else if (reroute.phase === "night_pursuit_to_shelter") {
    blocks = [
      narration(playerPlan.opening),
      narration("그 계획을 실행하려 출구로 움직인 순간 방화 셔터가 원격으로 내려왔다. 벽에 남은 젖은 종이가면 표식과 함께 반대편 계단에서 또 다른 발소리가 들려, 선택을 취소한 것이 아니라 물리적으로 동선이 차단됐다."),
      narration("열려 있는 피난 유도등은 오래된 민방위 지하 통로 하나만 가리켰다. 통로 끝 옛 방공호에서 매복한 추적자가 출구를 막으며, 피했던 추격이 다른 퇴로 차단으로 이어졌다."),
    ];
    location = "서촌 옛 민방위 방공호";
    sceneSummary = "첫 추적을 피했지만 다른 출구의 매복과 차단으로 옛 방공호의 생존 위기에 놓였다.";
    memory = `${playerPlan.memory} 출구로 이동했지만 별도의 퇴로 차단으로 옛 방공호에 고립됐다.`;
  } else if (reroute.phase === "accidental_summoning") {
    blocks = [
      narration(playerPlan.opening),
      narration("현장을 벗어나 원래 선택을 실행하려 출구 쪽으로 움직였지만, 추적자의 칼날이 먼저 퇴로를 끊었다. 피하는 과정에서 택배의 촉매가 충격으로 바닥의 보조 봉인선에 닿으며 누구의 주문도 없이 빛의 원을 열었다."),
      narration("지연 발동한 마법진에서 검을 든 소녀 검사가 현현했다. 그녀는 먼저 날아든 치명타를 쳐내고 한시우와 공격자 사이를 가로막았다."),
      dialogue("묻겠다. 그대가 나의 마스터인가.", saber),
    ];
    time = "23:41";
    sceneSummary = "첫 문양은 실패했지만 촉매와 보조 봉인의 자동 반응으로 소녀 검사가 우발 소환됐다.";
    memory = `${playerPlan.memory} 출구가 공격으로 막힌 순간 보조 봉인이 반응해 소녀 검사가 현현했다.`;
    encounteredCharacters = saber && !request.state.encounteredCharacterIds.includes(saber.id)
      ? [{ characterId: saber.id, name: saber.name, relationType: "우발 소환으로 첫 대면" }]
      : [];
  } else if (reroute.phase === "first_battle_after_summoning") {
    blocks = [
      narration(playerPlan.opening),
      narration("싸움을 피해 원래 계획으로 돌아가려 했지만 닫힌 출구 너머에서 칼날이 다시 날아들었다. 선택을 바꾼 것이 아니라 공격이 먼저 따라붙었고, 소녀 검사가 검으로 그것을 걷어 내며 짧은 방어전을 시작했다."),
      narration("그녀는 추격하지 않고 퇴로만 확보했다. 종이가면 추적자는 어둠 속으로 물러났고, 피하려 했던 충돌은 최소한의 방어전으로 끝났다."),
      dialogue("이 전쟁을 감독하는 자가 있다. 원한다면 성당교회로 안내하겠다.", saber),
    ];
    sceneSummary = "피했던 공격의 지연 타격을 소녀 검사가 막아 퇴로를 확보하고 첫 방어전을 끝냈다.";
    memory = `${playerPlan.memory} 퇴로에 따라붙은 공격을 소녀 검사가 막아 첫 방어전을 끝냈다.`;
  } else if (reroute.phase === "church_orientation") {
    blocks = [
      narration(playerPlan.opening),
      narration("다만 방금의 습격이 왜 자신을 노렸는지 모른 채 움직이면 같은 위험이 목적지까지 따라갈 수 있었다. 원래 일정을 취소한 것이 아니라, 안전과 계약에 관한 최소한의 설명을 먼저 듣기 위해 소녀 검사와 감독관에게로 이동했다."),
      dialogue("오요한 신부입니다. 방금 벌어진 것은 성배전쟁의 소환이며, 마술사가 마스터로서 서번트와 계약해 싸우는 구조입니다. 모르는 용어부터 하나씩 설명하죠.", priest),
    ];
    sceneSummary = "성당행 거절을 재고하고 감독관 오요한 신부에게 이동해 성배전쟁 안내를 들었다.";
    memory = `${playerPlan.memory} 이후 동선을 안전하게 정하기 위해 오요한 신부에게 기초 설명을 먼저 들었다.`;
    encounteredCharacters = priest && !request.state.encounteredCharacterIds.includes(priest.id)
      ? [{ characterId: priest.id, name: priest.name, relationType: "보안 통화로 첫 대화" }]
      : [];
    recommendations = [
      { label: "성배전쟁이 무엇인지 먼저 묻는다.", risk: "낮음" },
      { label: "마술사와 마스터의 차이를 묻는다.", risk: "낮음" },
      { label: playerPlan.resumeRecommendation, risk: "보통" },
    ];
  }

  const recoveryEvidence = blocks
    .filter((block) => block.type !== "system")
    .map((block) => block.text)
    .join(" ")
    .slice(0, 360);
  const inventoryAdd = [...new Set([
    ...turn.statePatch.inventoryAdd,
    ...reroute.requiredItems,
  ])];
  const verificationTurn = {
    ...turn,
    blocks,
    statePatch: {
      ...turn.statePatch,
      inventoryAdd,
    },
    claudeSignals: turn.claudeSignals
      ? { ...turn.claudeSignals, eventResolved: true }
      : turn.claudeSignals,
    narrativeAudit: turn.narrativeAudit
      ? { ...turn.narrativeAudit, routeEventStatus: "completed" as const }
      : turn.narrativeAudit,
  };
  // 서버가 쓴 흡수 장면도 본문·소품·대사·종결 신호를 똑같이 검증한다.
  // 실제로 성립한 경우에만 완료 신호를 올려 원장과 사건 탭을 함께 봉인한다.
  // 첫 질문만 나온 평온한 대화 장면은 계속 열어 둔다.
  const serverMayResolveEvent =
    !["nadia_human_encounter", "nadia_human_conversation"].includes(reroute.phase) &&
    runtime.requiredEventRerouteSatisfied(verificationTurn, reroute);
  return {
    ...turn,
    blocks,
    statePatch: {
      ...turn.statePatch,
      time,
      dayDelta: 0,
      location,
      sceneSummary,
      memoryAdd: [...new Set([...turn.statePatch.memoryAdd, memory])],
      inventoryAdd,
      encounteredCharactersAdd: [
        ...turn.statePatch.encounteredCharactersAdd,
        ...encounteredCharacters,
      ].filter((character, index, all) =>
        all.findIndex((candidate) => candidate.characterId === character.characterId) === index
      ),
    },
    recommendations,
    agencyAudit: {
      playerActionInvented: false,
      note: "사용자가 밝힌 이탈 욕구를 인물의 갈등으로 보존하고 현재 필수 사건의 정사 행동으로 즉시 흡수했습니다.",
    },
    claudeSignals: turn.claudeSignals
      ? {
          ...turn.claudeSignals,
          inputMode: "advance",
          sceneTime: time,
          location,
          beatAdvanced: true,
          eventResolved: serverMayResolveEvent,
          resolutionSummary: serverMayResolveEvent
            ? `${reroute.eventName}의 필수 행동과 결과가 본문에서 실제로 성립했다.`
            : "",
        }
      : turn.claudeSignals,
    narrativeAudit: turn.narrativeAudit
      ? {
          ...turn.narrativeAudit,
          inputHandled: true,
          inputOutcome: "resolved",
          inputEvidence: recoveryEvidence,
          meaningfulBeat: true,
          meaningfulBeatEvidence: recoveryEvidence,
          routeEventStatus: serverMayResolveEvent ? "completed" : "in_progress",
          routeEventEvidence: recoveryEvidence,
          chronologyConsistent: true,
          recommendationsGrounded: true,
          currentTime: time,
          currentLocation: location,
        }
      : turn.narrativeAudit,
  };
};

/**
 * Last-resort server-authored turn used when every model rewrite fails the
 * narrative guards. User input is still accepted: an active required event is
 * completed through the same canon-absorption path, while a free scene is
 * advanced by one small, observable beat. Unsafe model prose and patches are
 * never copied into this recovery turn.
 */
