/**
 * Deterministic matching for authored beat/event signals.
 *
 * A contract may provide explicit equivalent phrasings with `≈`, `≒`, `↔`
 * or `=>` (for example: `문이 열렸다 ≈ 문이 개방됐다`). Existing list
 * delimiters keep their old meaning. We intentionally avoid a broad synonym
 * dictionary: a false positive can close an event, while an author-provided
 * equivalent remains reviewable and deterministic.
 */

export const compactContractText = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

/**
 * Canonicalizes only high-confidence object-name variants used by authored
 * event contracts.  This deliberately stays narrower than a general synonym
 * dictionary: a vague word such as "종이" or "물건" must never close an event.
 *
 * Examples that should identify the same prop:
 * - 불탄 고문서 조각 / 불탄 기록지 조각 / 그을린 문서 파편
 * - 황동 열쇠 / 놋쇠 열쇠
 * - 휴대전화 / 휴대폰 / 전화기
 */
export const canonicalContractItemText = (value: string): string =>
  compactContractText(value)
    .replace(/(?:불에탄|타버린|그을린)/gu, "불탄")
    .replace(/(?:고문서|기록지|기록물|문서류)/gu, "문서")
    .replace(/(?:파편|편린)/gu, "조각")
    .replace(/놋쇠/gu, "황동")
    .replace(/(?:휴대폰|핸드폰|전화기)/gu, "휴대전화");

export const contractItemEquivalent = (
  requiredItem: string,
  candidateItem: string,
): boolean => {
  const requiredVariants = contractSignalVariants(requiredItem)
    .map(canonicalContractItemText)
    .filter((item) => item.length >= 2);
  const candidate = canonicalContractItemText(candidateItem);
  return requiredVariants.some((required) =>
    candidate === required ||
    (candidate.length > required.length && candidate.includes(required))
  );
};

export const contractItemMentioned = (
  requiredItem: string,
  observedText: string,
): boolean => {
  const observed = canonicalContractItemText(observedText);
  return contractSignalVariants(requiredItem).some((variant) => {
    const required = canonicalContractItemText(variant);
    return required.length >= 2 && observed.includes(required);
  });
};

export const contractInventoryContainsItem = (
  inventory: string[],
  requiredItem: string,
): boolean => inventory.some((entry) =>
  contractItemEquivalent(requiredItem, entry) ||
  contractItemMentioned(requiredItem, entry)
);

export const splitContractSignals = (value = ""): string[] =>
  value
    .split(/[\n,;|·、/]+/u)
    .map((item) => item.trim())
    .filter(Boolean);

export const contractSignalVariants = (signal: string): string[] =>
  signal
    .split(/\s*(?:≈|≒|↔|=>)\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);

const koreanParticleSuffix = /(?:에게서|으로서|으로써|에서|에게|까지|부터|처럼|보다|으로|와|과|은|는|이|가|을|를|의|에|로|도|만)$/u;
const koreanPredicateSuffix = /(?:되었습니다|하였습니다|되었다|하였다|됐습니다|했습니다|됩니다|합니다|됐다|했다|된다|한다|되다|하다|된|한)$/u;

const contractTokens = (value: string): string[] =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .map((token) => token
      .replace(koreanParticleSuffix, "")
      .replace(koreanPredicateSuffix, ""))
    .filter((token) => token.length >= 2);

export const contractSignalSatisfied = (
  signal: string,
  observedText: string,
): boolean => {
  const observed = compactContractText(observedText);
  return contractSignalVariants(signal).some((variant) => {
    const exact = compactContractText(variant);
    if (exact.length >= 2 && observed.includes(exact)) return true;

    // Word order and Korean particles may vary without changing the authored
    // signal. Require every substantive token so this cannot pass on a single
    // vague keyword.
    const tokens = [...new Set(contractTokens(variant))];
    return tokens.length >= 2 && tokens.every((token) => observed.includes(token));
  });
};

const situationOriginSuffix = /(?:에서부터|에서는|에서)$/u;
const situationParticleSuffix = /(?:에게서|으로서|으로써|에게|까지|부터|처럼|보다|으로|와|과|은|는|이|가|을|를|의|에|로|도|만)$/u;

const situationStructuralTokens = new Set([
  "방향",
  "방면",
  "쪽",
  "그쪽",
  "시야",
  "눈앞",
  "모습",
  "자취",
  "자리",
]);

const situationActionTokens = new Set([
  "붕괴",
  "도착",
  "추락",
  "이탈",
  "개방",
  "폐쇄",
  "발견",
  "확인",
  "전달",
  "획득",
]);

const canonicalSituationToken = (value: string): string => value
  .replace(situationParticleSuffix, "")
  .replace(/^(?:방공호|지하공간|지하시설|지하실|지하구조물|지하통로)$/u, "지하공간")
  .replace(/^(?:지면|바닥판)$/u, "바닥")
  .replace(/^(?:꺼져|꺼졌|무너져|무너졌|붕괴해|붕괴했|내려앉아|내려앉았|갈라져|갈라졌)$/u, "붕괴")
  .replace(/^(?:도착|도착했|도착했다|당도|당도했|당도했다|이르렀|진입|진입했|진입했다|들어섰|들어섰다)$/u, "도착")
  .replace(/^(?:추락|추락했|추락했다|떨어져|떨어졌|떨어졌다|빠져|빠졌|빠졌다)$/u, "추락")
  // A written scene may express the same observed departure as movement,
  // distance, occlusion, or loss of sight.  Intent-only forms such as
  // `떠날`, `향할`, and negated forms such as `떠나지` deliberately do not
  // appear here.
  .replace(/^(?:떠나|떠났|떠났다|출발|출발했|출발했다|향해|향했|향했다|나서|나섰|나섰다|이동|이동했|이동했다|옮겨|옮겼|옮겼다|멀어져|멀어졌|멀어졌다|벗어나|벗어났|벗어났다|빠져나가|빠져나갔|빠져나갔다|사라져|사라졌|사라졌다|사라짐|묻혀|묻혔|묻혔다|가려져|가려졌|가려졌다|보이지|감춰져|감춰졌|감춰졌다)$/u, "이탈")
  .replace(/^(?:열려|열렸|열렸다|개방|개방돼|개방됐다)$/u, "개방")
  .replace(/^(?:닫혀|닫혔|닫혔다|폐쇄|폐쇄돼|폐쇄됐다)$/u, "폐쇄")
  .replace(/^(?:발견|발견해|발견했|발견했다|찾아내|찾아냈|찾아냈다)$/u, "발견")
  .replace(/^(?:확인|확인해|확인했|확인했다|밝혀|밝혔|밝혔다)$/u, "확인")
  .replace(/^(?:전달|전달해|전달했|전달했다|건네|건넸|건넸다|넘겨|넘겼|넘겼다)$/u, "전달")
  .replace(/^(?:획득|획득해|획득했|획득했다|얻어|얻었|얻었다|손에넣어|손에넣었다)$/u, "획득");

const situationTokens = (value: string): string[] => value
  .normalize("NFKC")
  .toLowerCase()
  // Keep ordinal identity as one anchor. Without this, `두 번째 문` and
  // `세 번째 문` both collapse to the vague anchors `번째`, `문`.
  .replace(/(첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s+(번째)/gu, "$1$2")
  .split(/[\s\p{P}\p{S}]+/u)
  .filter((token) => token.length >= 2 && !situationOriginSuffix.test(token))
  .map(canonicalSituationToken)
  .filter((token) => token.length >= 2);

const situationEvidenceWindows = (value: string): string[] => {
  const units = value
    .split(/(?<=[.!?。！？])|\r?\n+/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  if (units.length <= 1) return [value];
  const windows: string[] = [...units];
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index + size <= units.length; index += 1) {
      windows.push(units.slice(index, index + size).join(" "));
    }
  }
  return windows;
};

const semanticallyEquivalentSituation = (
  requiredTokens: string[],
  observedText: string,
): boolean => {
  const required = [...new Set(requiredTokens)]
    .filter((token) => !situationStructuralTokens.has(token));
  const requiredActions = required.filter((token) => situationActionTokens.has(token));
  if (requiredActions.length === 0) return false;
  const requiredAnchors = required.filter((token) => !situationActionTokens.has(token));

  return situationEvidenceWindows(observedText).some((window) => {
    const observed = new Set(
      situationTokens(window).filter((token) => !situationStructuralTokens.has(token)),
    );
    if (!requiredActions.every((action) => observed.has(action))) return false;

    const matchingAnchors = requiredAnchors.filter((anchor) => observed.has(anchor)).length;
    const minimumAnchors = requiredAnchors.length <= 2
      ? requiredAnchors.length
      : Math.max(2, Math.ceil(requiredAnchors.length * 0.6));
    return matchingAnchors >= minimumAnchors;
  });
};

/** Completion situations may keep their causal event while the player's
 * chosen origin or surface wording changes. Origin-location tokens are
 * ignored, but at least three remaining causal/result anchors must all match.
 * Required dialogue never uses this relaxed matcher. */
export const contractSituationSatisfied = (
  signal: string,
  observedText: string,
): boolean => {
  const observedCompact = compactContractText(observedText);
  if (contractSignalVariants(signal).some((variant) => {
    const exact = compactContractText(variant);
    return exact.length >= 2 && observedCompact.includes(exact);
  })) return true;
  const observedTokens = new Set(situationTokens(observedText));
  return contractSignalVariants(signal).some((variant) => {
    const requiredTokens = [...new Set(situationTokens(variant))];
    return (requiredTokens.length >= 3 &&
      requiredTokens.every((token) => observedTokens.has(token))) ||
      semanticallyEquivalentSituation(requiredTokens, observedText);
  });
};

export const missingContractSignals = (
  value: string | undefined,
  observedText: string,
): string[] => splitContractSignals(value)
  .filter((signal) => !contractSignalSatisfied(signal, observedText));
