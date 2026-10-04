import {
  contractItemMentioned,
  contractSignalSatisfied,
  contractSituationSatisfied,
} from "./contract-signals";
import type { EngineTurnResponse } from "./engine";
import {
  compactDisclosureTerm,
  publicTurnText,
} from "./narrative-output-safety";
import type { RequiredEventReroute } from "./work-adapters/fate-seoul-recovery";

const containsDisclosureTerm = (value: string, term: string): boolean => {
  const key = compactDisclosureTerm(term);
  return key.length >= 2 && compactDisclosureTerm(value).includes(key);
};

export const requiredEventRerouteTurnSatisfied = ({
  turn,
  reroute,
  phaseSatisfied = true,
}: {
  turn: Omit<EngineTurnResponse, "mode" | "usage">;
  reroute: RequiredEventReroute;
  phaseSatisfied?: boolean;
}): boolean => {
  if (!reroute.active) return true;
  const text = publicTurnText(turn);
  const causalBridgeVisible =
    /그러나|하지만|문득|마음에\s*걸|생각이\s*들|떠올|가기\s*(?:전|전에)|향하(?:는|던)\s*(?:길|도중)|이동하(?:는|던)\s*도중|출발하(?:기|려던)|먼저|잠시|보류|미루|우회|끼어들|가로막|막히|남은\s*시간|이후에|뒤에|계획(?:은|을).{0,20}(?:유지|남|이어|재개|바꾸)/u.test(text);
  if (!causalBridgeVisible) return false;
  if (reroute.destinationHint && !containsDisclosureTerm(text, reroute.destinationHint)) {
    return false;
  }
  const shallowCancellation =
    /(?:생각|계획)을\s*(?:접|버리)|포기했|취소했/u.test(text) &&
    !/(?:취소|포기)(?:한|한\s*것이)\s*아니|잠시\s*(?:미뤄|보류)|나중에\s*(?:이어|가|재개)|계획(?:은|을).{0,20}(?:유지|남|이어|재개)/u.test(text);
  if (shallowCancellation) return false;
  if (!reroute.resolveCurrentEvent) {
    if (turn.claudeSignals?.eventResolved) return false;
    return reroute.currentBeatSignals.length === 0 ||
      reroute.currentBeatSignals.every((signal) => contractSignalSatisfied(signal, text));
  }
  const claimsCompletion = Boolean(turn.claudeSignals?.eventResolved) ||
    turn.narrativeAudit?.routeEventStatus === "completed";
  if (!claimsCompletion) return false;
  const inventoryText = turn.statePatch.inventoryAdd.join("\n");
  if (!reroute.requiredItems.every((item) =>
    contractItemMentioned(item, text) && contractItemMentioned(item, inventoryText)
  )) return false;
  if (reroute.phase !== "required_event") return phaseSatisfied;
  const compactText = compactDisclosureTerm(`${text}\n${inventoryText}`);
  return (reroute.completionSignals.length === 0 || reroute.completionSignals.some((signal) =>
    contractSituationSatisfied(signal, `${text}\n${inventoryText}`)
  )) && reroute.requiredItems.every((item) =>
    contractItemMentioned(item, compactText)
  ) && (!reroute.requiredDialogue ||
    compactText.includes(compactDisclosureTerm(reroute.requiredDialogue)));
};
