import { deriveSceneFactContract } from "./scene-fact";

export type NarrativeClauseKind =
  | "prepare"
  | "move"
  | "encounter"
  | "speak"
  | "overreach"
  | "act";

export type NarrativeClauseAuthority = "player" | "world" | "mixed";

export type NarrativeClauseMode =
  | "execution"
  | "intention"
  | "negated"
  | "conditional"
  | "recalled"
  | "reported";

export type NarrativeClause = {
  order: number;
  kind: NarrativeClauseKind;
  authority: NarrativeClauseAuthority;
  mode: NarrativeClauseMode;
  text: string;
  completionRule: string;
};

export type NarrativeSceneContract = {
  version: "v31-single-narration";
  clauses: NarrativeClause[];
  compound: boolean;
  hasMovement: boolean;
  hasEncounter: boolean;
  hasSpeech: boolean;
  hasOverreach: boolean;
  destinationEncounter: boolean;
  requiresDirectScene: boolean;
  policy: string[];
};

const MOVE_PATTERN =
  /(?:간다|가기로|가려|가서|가본다|가\s*본다|향하|이동|출발|떠나|나서|들르|방문|도착|귀가|돌아가|들어가|입장|따라가|찾아가|건너가|올라가|내려가)/u;
const PREPARE_PATTERN =
  /(?:챙기|들고|가지고|휴대|남겨\s*두|놓아?\s*두|두고|입고|벗고|꺼내|정리|준비)/u;
const ENCOUNTER_PATTERN =
  /(?:재회|다시\s*(?:만나|보|마주)|마주치|발견|조우|찾아내|보았던|봤던)/u;
const SPEAK_PATTERN =
  /(?:말을?\s*(?:걸|건)|묻|질문|인사|대답|답하|설명|제안|요청|부탁|말씀|대화|알린|외치|부르)/u;
const DIRECT_UTTERANCE_PATTERN =
  /(?:안녕(?:하세요|하십니까|해)|저기요|실례(?:합니다|지만)|죄송(?:합니다|한데|하지만)|미안(?:합니다|한데|하지만)|감사(?:합니다|해요)|고맙(?:습니다|다고)|부탁(?:드립니다|드려요)|괜찮(?:으세요|을까요)|(?:해|가|와|봐|보여|알려|말해|도와|기다려|있어|보내)\s*주(?:세요|실래요|시겠어요|실\s*수\s*있(?:나요|을까요))|안\s*될까요|어떻게\s*(?:생각|해야)|무엇|왜|언제|어디|누구).{0,120}[?？]?/u;
const POLITE_QUESTION_OR_REQUEST_ENDING =
  /(?:나요|가요|까요|습니까|십니까|인가요|일까요|되나요|될까요|안될까요|주시겠어요|주실래요|주실\s*수\s*있(?:나요|을까요)|부탁드립니다)[.!?。！？]*$/u;

export const inputContainsSpeech = (value: string): boolean => {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return false;
  if (SPEAK_PATTERN.test(normalized)) return true;
  return normalized
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .some((sentence) =>
      DIRECT_UTTERANCE_PATTERN.test(sentence) ||
      POLITE_QUESTION_OR_REQUEST_ENDING.test(sentence)
    );
};
const OVERREACH_PATTERN =
  /(?:희롱|폭행|살해|죽이|납치|강탈|협박|위협|해킹|침입|폭파|방화|고문|세뇌|조종|강제로|모두에게|전부에게)/u;
const WORLD_CLAIM_PATTERN =
  /(?:상대가|그녀가|그가|누군가가|사람들이|경비가|경찰이).{0,36}(?:동의|허락|좋아|호감|반응|등장|나타나|따라|준다|건넨|말한|웃|화내|공격)/u;
const REPORTED_PATTERN =
  /(?:다고|라며|라는\s*말을|였다는).{0,24}(?:들었|전해|말했|알려|소문)|(?:듣자|전언|소문에)/u;
const RECALLED_PATTERN =
  /(?:떠올리|회상|기억해|기억하|생각나|되새기|꿈에서|과거의|어제.{0,32}(?:했던|갔던|만났던))/u;
const CONDITIONAL_PATTERN =
  /(?:만약|가정하|전제하)|(?:다면|라면|이라면|였다면|경우에는|때에는|때라면|거든|(?:그치|끝나|도착하|만나|되|하|있|없|오|가|받|보)(?:면|으면))(?:\s|[,.!?。！？]|$)/u;
const NEGATED_PATTERN =
  /(?:아니(?:다|었|라고)|안\s*(?:가|나가|떠나|이동|말|만나|하)|못\s*(?:가|나가|떠나|이동|말|만나|하)|(?:가|나가|떠나|이동|말|만나|하|들르|방문)(?:지\s*않|지\s*못|지\s*말|지\s*않기로|지\s*않겠다)|(?:가지|떠나지|이동하지|방문하지|들르지)\s*않)/u;
const INTENTION_PATTERN =
  /(?:할|갈|떠날|이동할|만날|말할)\s*(?:생각|계획|예정|의향|고민)|(?:생각|계획|예정)\s*중/u;

const clauseMode = (text: string): NarrativeClauseMode => {
  if (REPORTED_PATTERN.test(text)) return "reported";
  if (RECALLED_PATTERN.test(text)) return "recalled";
  if (CONDITIONAL_PATTERN.test(text)) return "conditional";
  if (NEGATED_PATTERN.test(text)) return "negated";
  if (INTENTION_PATTERN.test(text)) return "intention";
  return "execution";
};

const splitInputClauses = (input: string): string[] => {
  const normalized = input.normalize("NFKC").replace(/\r/g, "").trim();
  if (!normalized) return [];
  const sentences = normalized
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const sentence of sentences) {
    const orderedSentence = sentence.replace(
      /((?:남겨\s*두고|놓아?\s*두고|챙기고|챙긴\s*뒤|준비하고|정리하고|문을\s*닫고|문을\s*열고))\s+/gu,
      "$1\n",
    );
    const pieces = orderedSentence
      .split(/\s*(?:그리고|그러고는|그런\s*뒤|그\s*뒤|이어서|그때|그곳에서|그\s*자리에서)\s*/u)
      .flatMap((part) => part.split(/\n+/u))
      .map((part) => part.trim())
      .filter(Boolean);
    clauses.push(...pieces);
  }
  return clauses.length ? clauses : [normalized];
};

const classifyClause = (text: string): NarrativeClauseKind => {
  if (OVERREACH_PATTERN.test(text)) return "overreach";
  if (inputContainsSpeech(text)) return "speak";
  if (ENCOUNTER_PATTERN.test(text)) return "encounter";
  if (MOVE_PATTERN.test(text)) return "move";
  if (PREPARE_PATTERN.test(text)) return "prepare";
  return "act";
};

const clauseAuthority = (
  kind: NarrativeClauseKind,
  text: string,
): NarrativeClauseAuthority => {
  if (kind === "encounter" || WORLD_CLAIM_PATTERN.test(text)) return "world";
  if (kind === "overreach") return "mixed";
  return "player";
};

const completionRuleFor = (
  kind: NarrativeClauseKind,
  authority: NarrativeClauseAuthority,
  mode: NarrativeClauseMode,
): string => {
  if (mode === "negated") {
    return "실행된 행동으로 만들지 않는다. 하지 않았다는 현재 선택과 그에 대한 세계의 반응만 반영한다.";
  }
  if (mode === "conditional") {
    return "조건이 아직 충족되지 않았다면 행동·이동을 발생시키지 않고 조건부 의사나 계획으로만 남긴다.";
  }
  if (mode === "recalled") {
    return "과거 회상으로만 다루며 현재 시각·장소·사건 상태를 그 과거로 되돌리지 않는다.";
  }
  if (mode === "reported") {
    return "전언·소문으로만 기록하며 화자나 플레이어가 직접 실행·목격한 사실로 승격하지 않는다.";
  }
  if (mode === "intention") {
    return "계획·고민으로만 제시된 부분은 실제 실행하지 않는다. 준비나 착수까지 명시된 범위만 장면화한다.";
  }
  if (authority === "world" && kind !== "encounter") {
    return "플레이어의 선언만으로 확정하지 말고 세계가 성립 또는 불성립을 장면으로 판정한다.";
  }
  if (kind === "move") {
    return "출발·경로 또는 수단·경과 시간·도착을 본문에 실제로 쓴다.";
  }
  if (kind === "encounter") {
    return "재회가 성립하면 실제 등장과 첫 반응을, 불성립하면 부재·착각·엇갈림의 관측 가능한 근거를 쓴다.";
  }
  if (kind === "speak") {
    return "말을 건 행동을 생략하지 않고 상대가 이해한 직접 반응 또는 답을 같은 장면에 쓴다.";
  }
  if (kind === "overreach") {
    return "시도 자체를 실행한 뒤 대상·주변의 직접 반응과 현실적인 비용을 장면 안에 확정한다.";
  }
  return "사용자가 통제할 수 있는 행동은 취소하지 않고 관측 가능한 실행 결과를 쓴다.";
};

export const deriveNarrativeSceneContract = (
  input: string,
): NarrativeSceneContract => {
  const clauses = splitInputClauses(input).map((text, index) => {
    const kind = classifyClause(text);
    const authority = clauseAuthority(kind, text);
    const mode = clauseMode(text);
    return {
      order: index + 1,
      kind,
      authority,
      mode,
      text: text.replace(/[.!?。！？]+$/u, "").trim(),
      completionRule: completionRuleFor(kind, authority, mode),
    };
  });
  const executedClauses = clauses.filter((clause) => clause.mode === "execution");
  const hasMovement = executedClauses.some((clause) => clause.kind === "move");
  const hasEncounter = executedClauses.some((clause) => clause.kind === "encounter");
  const hasSpeech = executedClauses.some((clause) => clause.kind === "speak");
  const hasOverreach = executedClauses.some((clause) => clause.kind === "overreach");
  const destinationEncounter = hasMovement && (hasEncounter || hasSpeech);
  const requiresDirectScene = executedClauses.some((clause) =>
    ["move", "encounter", "speak", "overreach"].includes(clause.kind) ||
    (clause.authority === "player" &&
      deriveSceneFactContract(clause.text).active)
  );

  return {
    version: "v31-single-narration",
    clauses,
    compound: clauses.length > 1 || clauses.filter((clause) =>
      ["prepare", "move", "encounter", "speak", "overreach"].includes(clause.kind)
    ).length > 1,
    hasMovement,
    hasEncounter,
    hasSpeech,
    hasOverreach,
    destinationEncounter,
    requiresDirectScene,
    policy: [
      "절을 선언 순서대로 장면화하며 뒤 절의 실패 때문에 앞 절을 취소하지 않는다.",
      "플레이어 권한의 절은 실행 결과를 확정하고, 세계 권한의 절은 성립 또는 불성립을 관측 가능한 반응으로 판정한다.",
      "본문은 요약 보고가 아니라 한 명의 작가가 쓴 연속된 장르소설 장면이어야 한다.",
      "필수 사건은 이미 실행된 절의 결과에 인과적으로 연결하며 입력을 다른 정사 행동으로 덮어쓰지 않는다.",
      "도구 사용·소품 조작·공격·파괴·연소처럼 플레이어가 직접 실행한 sceneFact는 대상과 즉시 효과를 먼저 보여 준 뒤 세계와 NPC의 후속 반응을 잇는다.",
      "부정·조건·회상·전언·계획은 실제 실행과 분리하고 현재 시각·장소·사건 완료의 근거로 쓰지 않는다.",
    ],
  };
};

export const narrativeSceneContractPrompt = (
  contract: NarrativeSceneContract,
): string => contract.clauses.length
  ? contract.clauses.map((clause) =>
      `${clause.order}. [${clause.kind}/${clause.authority}/${clause.mode}] ${clause.text}\n   완료 기준: ${clause.completionRule}`
    ).join("\n")
  : "플레이어 입력 없음 — NPC와 환경의 현재 행동으로 한 장면 비트를 진행한다.";

export const inputContainsExecutedMovement = (value: string): boolean =>
  deriveNarrativeSceneContract(value).hasMovement;
