import type { Project, StoryEvent } from "./studio-model";

const scheduleKeys = ["storyDay", "scheduleDay", "startTime", "endTime", "timeWindow", "startDay", "endDay", "endStoryDay", "startTick", "endTick", "scheduleTick", "deadlineTick", "schedule"];

/** Keep old editor metadata inert. Never parse it or copy it into prose. */
export function withoutEventSchedule(event: StoryEvent, keepEditorArchive = false): StoryEvent {
  const result = { ...event } as unknown as Record<string, unknown>;
  const prior = result.studioLegacySchedule;
  const archive: Record<string, unknown> = prior && typeof prior === "object" ? { ...prior } : {};
  for (const key of scheduleKeys) {
    if (Object.hasOwn(result, key) && result[key] !== "" && result[key] !== undefined && !(key === "storyDay" && result[key] === 0 && !event.startTime && !event.endTime && !event.timeWindow) && !Object.hasOwn(archive, key)) archive[key] = result[key];
    delete result[key];
  }
  if (event.multiroute) {
    const { loopDay, ...multiroute } = event.multiroute;
    if (loopDay !== undefined && !Object.hasOwn(archive, "loopDay")) archive.loopDay = loopDay;
    result.multiroute = multiroute;
  }
  delete result.loopDay;
  delete result.studioLegacySchedule;
  if (keepEditorArchive && Object.keys(archive).length) result.studioLegacySchedule = archive;
  return result as unknown as StoryEvent;
}

export function archiveProjectSchedules(project: Project): Project {
  return project.packageTarget === "cortex" ? { ...project, events: project.events.map((event) => withoutEventSchedule(event, true)) } : project;
}

export const narrativeTimeGuidance = [
  "사건별 예정 날짜·시작 시각·종료 시각·시간창은 사용하지 않는다. 지정된 후속사건을 우선하고, 미지정이면 사건 배열 순서로 진행한다.",
  "구체적 시간 경과는 현재 공개 본문과 현재 제공된 사건 설명에 따라 집필한다. 다음 사건 설명을 진입 전에 미리 읽거나 미래 시간표에 맞추지 않는다.",
  "작품 근거 없는 24시간 이상 도약은 사용자 요청과 작가 임의 전개 모두 현재 문맥에서 인과적으로 흡수한다. 자정을 넘는 것 자체는 금지가 아니다.",
  "현재 제공된 작품 스토리가 명시한 하루 이상 경과는 그대로 따른다. 3일 뒤·17년 뒤·10년 혼수상태 같은 작가의 서사 문장을 보존한다.",
  "24시간 미만이라도 진행 중인 위험·전투·긴박성을 무너뜨리는 도약은 자연스럽게 중단·단축한다. 꿈·환상은 최후의 수단이다.",
  "새 사건을 처음 읽었을 때 시간대가 이미 지났다면 현재 시각부터 가까운 다음 시간대까지 필요한 일상을 짧게 연결해 해당 비트에서 시작한다. 별도 대기 비트를 요구하지 않는다.",
  "이미 지난 마감·기회는 설득력 있는 지연·상황 변화·대체 기회와 그 결과로 수습한다. 공개한 본문·출발·종료 사실과 시간은 정사이며 24시간 상한으로 되감거나 취소하지 않는다.",
].join("\n");
