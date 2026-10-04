export type SceneFactKind =
  | "fire"
  | "damage"
  | "cut"
  | "throw"
  | "open_close"
  | "transfer"
  | "tool_use";

export type SceneFactContract = {
  active: boolean;
  kind: SceneFactKind | "none";
  tools: string[];
  targets: string[];
  temporaryEffect: boolean;
  source: string;
};

const FIRE_ACTION = /(?:불태|태우|태워|불붙|점화|불을?\s*(?:붙|지르))/u;
const DAMAGE_ACTION = /(?:부수|부순|깨뜨|깨트|박살|파손|찌그러뜨|망가뜨)/u;
const CUT_ACTION = /(?:찢|자르|베(?:다|어|고)|찌르)/u;
const THROW_ACTION = /(?:던지|내던지|투척)/u;
const OPEN_CLOSE_ACTION = /(?:열(?:다|어|고)|연(?:다|뒤|채)|닫(?:다|아|고)|잠그|봉인)/u;
const TRANSFER_ACTION = /(?:건네|건넨|넘기|돌려주|받(?:다|아|고)|챙기|집어\s*들|놓(?:다|아|고))/u;
const TOOL_USE_ACTION = /(?:사용|꺼내|휘두르|쏘(?:다|고|며)|발사|찍(?:다|어|고)|때리|걷어차|밀(?:다|어|고)|당기)/u;
const PHYSICAL_OBJECT =
  /(?:라이터|성냥|횃불|칼|검|총|망치|도구|휴대전화|휴대폰|문|창문|서랍|상자|가방|병|봉투|종이|책|열쇠|우산|밧줄|버튼|손잡이|스위치)/u;
const TEMPORARY_EFFECT = /(?:잠시|잠깐|일시|한동안|잠시나마|효과가\s*있|효과를\s*보)/u;
const EXECUTION_ACTION = new RegExp(
  `(?:${FIRE_ACTION.source}|${DAMAGE_ACTION.source}|${CUT_ACTION.source}|${THROW_ACTION.source}|${OPEN_CLOSE_ACTION.source}|${TRANSFER_ACTION.source}|${TOOL_USE_ACTION.source})`,
  "u",
);

const uniqueTerms = (values: Array<string | undefined>): string[] =>
  [...new Set(values
    .map((value) => value?.normalize("NFKC").trim() ?? "")
    .filter((value) => value.length >= 1 && value.length <= 32))]
    .slice(0, 4);

const phraseBeforeParticle = (
  value: string,
  particle: "tool" | "target",
): string[] => {
  const pattern = particle === "tool"
    ? /([^\s.,!?。！？]{1,24}?)(?:으)?로\s+(?=[\p{L}\p{N}])/gu
    : /([^\s.,!?。！？]{1,24}?)(?:을|를)\s+(?=[\p{L}\p{N}])/gu;
  return [...value.matchAll(pattern)]
    .map((match) => match[1]?.trim().split(/\s+/u).slice(-3).join(" "))
    .filter((term): term is string => Boolean(term));
};

export const deriveSceneFactContract = (input: string): SceneFactContract => {
  const source = input.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const actionVisible = EXECUTION_ACTION.test(source);
  const objectVisible = PHYSICAL_OBJECT.test(source) ||
    phraseBeforeParticle(source, "tool").length > 0 ||
    phraseBeforeParticle(source, "target").length > 0;
  const active = actionVisible && objectVisible;
  const kind: SceneFactContract["kind"] = FIRE_ACTION.test(source)
    ? "fire"
    : DAMAGE_ACTION.test(source)
      ? "damage"
      : CUT_ACTION.test(source)
        ? "cut"
        : THROW_ACTION.test(source)
          ? "throw"
          : OPEN_CLOSE_ACTION.test(source)
            ? "open_close"
            : TRANSFER_ACTION.test(source)
              ? "transfer"
              : TOOL_USE_ACTION.test(source)
                ? "tool_use"
                : "none";
  return {
    active,
    kind: active ? kind : "none",
    tools: active ? uniqueTerms(phraseBeforeParticle(source, "tool")) : [],
    targets: active ? uniqueTerms(phraseBeforeParticle(source, "target")) : [],
    temporaryEffect: active && TEMPORARY_EFFECT.test(source),
    source,
  };
};

const EFFECT_PATTERNS: Record<SceneFactKind, RegExp> = {
  fire: /(?:불꽃|불이\s*붙|타오르|타들어|그을|연기|재가\s*되|재로|불태웠|태웠|점화됐)/u,
  damage: /(?:부서|깨졌|깨뜨|박살|파손|금이\s*가|찌그러|망가)/u,
  cut: /(?:찢어|찢겼|잘라|잘렸|베었|베였|갈라|절단|찔렸)/u,
  throw: /(?:던졌|날아|튕겨|바닥에\s*떨어|벽에\s*부딪|멀어졌)/u,
  open_close: /(?:열렸|열었|닫혔|닫았|잠겼|잠갔|봉인됐)/u,
  transfer: /(?:건넸|넘겼|돌려줬|받았|챙겼|집어\s*들|놓았|손에\s*쥐)/u,
  tool_use: /(?:사용했|꺼냈|휘둘렀|발사했|쏘았|찍었|때렸|걷어찼|밀었|당겼|작동)/u,
};

const TEMPORARY_RESULT =
  /(?:잠시|잠깐|일시|한동안|순간|몇\s*초|멈췄|멎었|물러|약해|끊겼|사라졌|효과|다시|되살아|재개)/u;

const compact = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const recognizableTerm = (value: string): string =>
  value
    .replace(/^(?:한시우는?|주인공은?|그는?|그녀는?)\s+/u, "")
    .split(/\s+/u)
    .slice(-2)
    .join(" ")
    .trim();

export const sceneFactVisible = (
  contract: SceneFactContract,
  publicText: string,
): boolean => {
  if (!contract.active || contract.kind === "none") return true;
  const normalized = publicText.normalize("NFKC");
  const compactText = compact(normalized);
  const toolVisible = contract.tools.length === 0 || contract.tools.some((tool) => {
    const term = recognizableTerm(tool);
    return term.length > 0 && compactText.includes(compact(term));
  });
  const targetVisible = contract.targets.length === 0 || contract.targets.some((target) => {
    const term = recognizableTerm(target);
    return term.length > 0 && compactText.includes(compact(term));
  });
  const durationVisible = !contract.temporaryEffect || TEMPORARY_RESULT.test(normalized);
  return toolVisible && targetVisible && EFFECT_PATTERNS[contract.kind].test(normalized) && durationVisible;
};

export const sceneFactPrompt = (contract: SceneFactContract): string => {
  if (!contract.active || contract.kind === "none") return "직접 물리 sceneFact 없음";
  const tools = contract.tools.length ? contract.tools.join(" · ") : "입력에 명시된 도구";
  const targets = contract.targets.length ? contract.targets.join(" · ") : "입력에 명시된 대상";
  return [
    `kind=${contract.kind}`,
    `도구=${tools}`,
    `대상=${targets}`,
    "도구·대상·실행 동작·관측 가능한 즉시 효과를 첫 인과로 반드시 서술",
    contract.temporaryEffect
      ? "사용자가 효과를 일시적이라고 확정했으므로 잠시 성립한 효과와 그 뒤의 재개·반동을 모두 보존"
      : "효과의 강도·지속시간은 세계 규칙과 현재 장면에서 판정",
  ].join("\n");
};
