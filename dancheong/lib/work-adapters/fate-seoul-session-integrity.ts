import type { ScenarioPack } from "../scenario";
import { fateSeoulAdapter } from "./fate-seoul";

const RESIDENTIAL_LOCATION_PATTERN =
  /(?:^|의|\s)(?:집|자택|주택|아파트|원룸|기숙사|숙소|거처|침실|방)(?:$|\s)/u;
const LEGACY_FORCED_HOME_ENCOUNTER_PATTERN =
  /(?=.*(?:공동현관\s*)?인터폰)(?=.*(?:나디아\s*알\s*하(?:다|디)드|외국인\s*연구자|방문\s*연구자))(?=.*(?:대학박물관|박물관\s*별관|길을\s*묻|주소가\s*두\s*곳))/isu;
const NADIA_VISIBLE_PATTERN = /나디아\s*알\s*하(?:다|디)드/u;
const NADIA_MEMORY_PATTERN =
  /나디아\s*알\s*하(?:다|디)드|외국인\s*연구자|방문\s*연구자/u;
const SABER_ALIAS_PATTERN =
  /정체불명의\s*소녀\s*검사|소녀\s*검사|검을\s*든\s*소녀|세이버|saber|홍재/iu;
const MASTER_QUESTION_VARIANT_PATTERN =
  /^묻겠다[\s.,!?。！？“”"'·]*(?:그대가)?[\s.,!?。！？“”"'·]*(?:내|나의)[\s.,!?。！？“”"'·]*마스터인가[\s.,!?。！？“”"'·]*$/u;
const CHAPTER_TITLES: Record<string, string> = {
  ordinary_before_parcel: "프롤로그 · 의문의 발송인",
  nadia_human_encounter: "프롤로그 · 평범한 조우",
  nadia_human_conversation: "프롤로그 · 스쳐 간 인연",
  separate_evening_daily_life: "프롤로그 · 기울어가는 일상",
  seochon_blackout_attack: "제1막 · 꺼진 서울",
  night_pursuit_to_shelter: "제1막 · 막힌 퇴로",
  accidental_summoning: "제1막 · 우발 소환",
  first_battle_after_summoning: "제1막 · 첫 전투",
  church_orientation: "제1막 · 성당교회의 감독관",
};

export const fateSeoulSessionIntegrity = {
  matches: (pack: ScenarioPack): boolean => fateSeoulAdapter.matches(pack),
  isResidentialLocation: (location: string): boolean =>
    RESIDENTIAL_LOCATION_PATTERN.test(location),
  isForcedHomeEncounter: (location: string, publicText: string): boolean =>
    RESIDENTIAL_LOCATION_PATTERN.test(location) &&
    LEGACY_FORCED_HOME_ENCOUNTER_PATTERN.test(publicText),
  characterWasAlreadyVisible: (publicText: string): boolean =>
    NADIA_VISIBLE_PATTERN.test(publicText),
  isForcedEncounterMemory: (memory: string): boolean =>
    NADIA_MEMORY_PATTERN.test(memory),
  saberIdentityScore: (descriptor: string): number =>
    /홍재|정조|이산/u.test(descriptor) ? 40 : 0,
  isSaberAlias: (value: string): boolean => SABER_ALIAS_PATTERN.test(value),
  isMasterQuestionVariant: (value: string): boolean =>
    MASTER_QUESTION_VARIANT_PATTERN.test(value),
  canonicalMasterQuestion: "묻겠다. 그대가 나의 마스터인가.",
  defaultSaberAlias: "정체불명의 소녀 검사",
  chapterTitleForPhase: (phase: string): string => CHAPTER_TITLES[phase] ?? "",
} as const;
