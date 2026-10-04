"use client";

import { Fragment, useEffect, useState } from "react";

import {
  claudeContractChecklist,
  readClaudeRuntime,
  type ClaudeCarryoverItem,
} from "../../lib/claude-runtime";
import type {
  RuntimeState,
  ScenarioEvent,
  ScenarioPack,
} from "../../lib/scenario";

const eventOrder = (event: ScenarioEvent, index: number) =>
  Number.isFinite(event.sequence) ? Number(event.sequence) : index + 1;

const GENERIC_CLOSURE_REASON = /(?:사건\s*탭|필수\s*(?:계약|조건)|자동\s*(?:봉인|이월)|봉인(?:됐|되었|합니다)|사용자가\s*직접\s*종결|시스템|eventResolved)/iu;

const sealedClosureNarrative = (
  event: ScenarioEvent,
  closureReason = "",
  summary = "",
) => {
  const candidates = [closureReason, event.onSuccess, summary, event.effects, event.description]
    .map((value) => String(value || "").replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  return candidates.find((value) => value.length >= 24 && !GENERIC_CLOSURE_REASON.test(value)) ||
    candidates.find((value) => !GENERIC_CLOSURE_REASON.test(value)) ||
    `${event.name}에서 인물들이 선택한 행동의 결과가 확정되었고, 그 결과를 안은 채 다음 상황으로 나아갈 수 있게 됐다.`;
};

function InspectorEventRow({
  event,
  badge,
  tone = "waiting",
  summary,
  closureReason,
  closedMeta,
  carryoverResolution,
  carryoverItems,
}: {
  event: ScenarioEvent;
  badge: string;
  tone?: "active" | "sealed" | "waiting" | "constraint";
  summary?: string;
  closureReason?: string;
  closedMeta?: string;
  carryoverResolution?: string;
  carryoverItems?: ClaudeCarryoverItem[];
}) {
  const details = [
    ["목표", event.description],
    ["일어나야 하는 일", event.effects],
    ["성공 시", event.onSuccess],
    ["필수 물품", event.requiredItems],
    ["필수 대사", event.requiredDialogue],
    ["종결 신호", event.completionSignals],
    ["시간창", event.timeWindow],
    ["참가", event.participants],
  ].filter((item) => Boolean(item[1]));
  return (
    <details className={`nexus-event-row event-${tone}`}>
      <summary>
        <span>
          <small>{badge}</small>
          <strong>{event.name}</strong>
          <em>{event.id}</em>
        </span>
        <span aria-hidden="true">⌄</span>
      </summary>
      {tone === "sealed" && (
        <div className="sealed-event-explanation">
          <span className="sealed-event-stamp" aria-hidden="true">封</span>
          <div>
            <small>종결 사유</small>
            <strong>{closureReason || "본문에서 사건의 완료 조건이 확인되어 봉인되었습니다."}</strong>
            {closedMeta && <em>{closedMeta}</em>}
          </div>
        </div>
      )}
      {summary && (
        <div className="nexus-event-summary">
          {tone === "sealed" && <small>종결 결과</small>}
          <p>{summary}</p>
        </div>
      )}
      {tone === "sealed" && carryoverResolution && (
        <div className="sealed-carryover-resolution">
          <small>후속 장면에서 이어진 결과</small>
          <p>{carryoverResolution}</p>
        </div>
      )}
      {tone === "sealed" && carryoverItems?.length ? (
        <div className="sealed-carryover-items">
          <small>남겨졌던 일의 처리 기록</small>
          <ul>
            {carryoverItems.map((item) => (
              <li key={item.id} data-status={item.status}>
                <strong>{item.requirement}</strong>
                <span>{item.status === "resolved"
                  ? "후속 장면에서 직접 확인"
                  : item.status === "substituted"
                    ? "현재 세계선의 대가로 대체"
                    : item.status === "abandoned"
                      ? "현재 세계선에서 포기"
                      : "아직 이어지는 중"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl>
        {details.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
        {!details.length && <dd>추가 지시가 기록되지 않았습니다.</dd>}
      </dl>
    </details>
  );
}

export function InspectorEvents({
  pack,
  state,
  controlsDisabled,
  onAdvanceBeat,
  onCloseNow,
}: {
  pack: ScenarioPack;
  state: RuntimeState;
  controlsDisabled: boolean;
  onAdvanceBeat: () => void;
  onCloseNow: () => void;
}) {
  const [closeArmed, setCloseArmed] = useState(false);
  const ledger = readClaudeRuntime(pack, state);
  const activeEvent = pack.events.find((event) => event.id === ledger.activeEventId);
  const sealedIds = new Set(ledger.sealed.map((event) => event.id));
  const waitingEvents = pack.events
    .map((event, index) => ({ event, order: eventOrder(event, index) }))
    .filter(({ event }) => event.id !== ledger.activeEventId && !sealedIds.has(event.id))
    .sort((left, right) => left.order - right.order)
    .map(({ event }) => event);
  const activeConstraints = (pack.constraints ?? []).filter((constraint) =>
    !constraint.appliesTo?.length ||
    (ledger.activeEventId && constraint.appliesTo.includes(ledger.activeEventId))
  );
  const currentBeat = activeEvent
    ? Math.min(Math.max(1, ledger.beatTotal), ledger.beat + 1)
    : 0;
  const progress = Math.round((currentBeat / Math.max(1, ledger.beatTotal)) * 100);
  const canAdvanceBeat = Boolean(activeEvent && ledger.beat < Math.max(0, ledger.beatTotal - 1));
  const manualCloseLocked = Boolean(
    activeEvent && (
      ledger.manualCloseCooldownEventId === activeEvent.id ||
      ledger.manualCarryover?.missing.length
    ),
  );
  const contractChecklist = claudeContractChecklist(
    activeEvent,
    ledger.eventText,
    state.inventory,
  );
  const contractMetCount = contractChecklist.filter((item) => item.met).length;
  useEffect(() => {
    if (!closeArmed) return;
    const timeout = window.setTimeout(() => setCloseArmed(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [closeArmed]);
  return (
    <div className="inspector-pane-content event-inspector">
      <section className="inspector-section first-section">
        <div className="section-heading"><span>활성 사건</span><small>LIVE</small></div>
        {activeEvent ? (
          <div className="active-event-card">
            <div className="active-event-top">
              <span><i /> CLAUDE CORE</span>
              <em>현재 비트 {currentBeat}/{ledger.beatTotal}</em>
            </div>
            <h2>{activeEvent.name}</h2>
            <p>{activeEvent.description || activeEvent.effects || "현재 사건을 진행하고 있습니다."}</p>
            {activeEvent.beats?.length ? (
              <div className="active-beat-copy">
                <small>CURRENT BEAT</small>
                <strong>{ledger.closureExtensionCount > 0
                  ? "종결 전용 연장 비트"
                  : [...activeEvent.beats].sort((a, b) => a.order - b.order)[Math.min(ledger.beat, activeEvent.beats.length - 1)]?.title}</strong>
              </div>
            ) : null}
            <div className="event-progress"><i style={{ width: `${progress}%` }} /></div>
            <div className="event-chips">
              {activeEvent.required && <span>필수</span>}
              {activeEvent.kind === "compound" && <span>COMPOUND</span>}
              {ledger.backfill && <span>밀린 사건 회수</span>}
              {ledger.driftTurns > 0 && <span>이탈 {ledger.driftTurns}턴</span>}
              {ledger.closureExtensionCount > 0 && <span>종결 연장</span>}
            </div>
            {contractChecklist.length > 0 && (
              <section className="event-contract-sheet" aria-label="종결조건 실시간 판정">
                <header>
                  <strong>종결조건</strong>
                  <small aria-live="polite">{contractMetCount}/{contractChecklist.length} 확인</small>
                </header>
                <ul>
                  {contractChecklist.map((item) => (
                    <li className={item.met ? "met" : "pending"} key={item.id}>
                      <i aria-hidden="true">{item.met && (
                        <svg viewBox="0 0 12 12"><path d="m2.2 6.2 2.3 2.3 5.3-5.2" /></svg>
                      )}</i>
                      <span>
                        <small>{item.kind === "item" ? "필수 물품" : item.kind === "dialogue" ? "필수 대사" : "종결 신호"}</small>
                        <strong>{item.label}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="event-manual-controls" aria-label="사건 수동 제어">
              <button
                type="button"
                className="event-beat-button"
                disabled={controlsDisabled || !canAdvanceBeat}
                onClick={onAdvanceBeat}
                title={canAdvanceBeat ? "본문 생성 없이 다음 사건 비트로 이동" : "현재 마지막 비트입니다"}
              >
                <span>비트 +1</span>
                <small>{canAdvanceBeat ? `${currentBeat + 1}/${ledger.beatTotal}로 이동` : "마지막 비트"}</small>
              </button>
              <button
                type="button"
                className={`event-close-button${closeArmed ? " armed" : ""}`}
                disabled={controlsDisabled || manualCloseLocked}
                onClick={() => {
                  if (!closeArmed) {
                    setCloseArmed(true);
                    return;
                  }
                  setCloseArmed(false);
                  onCloseNow();
                }}
                title={manualCloseLocked
                  ? "지금 종결은 두 사건 연속 사용할 수 없습니다. 현재 사건은 본문 진행으로 종결해 주세요."
                  : "필수 조건이 남아 있어도 현재 사건을 직접 종결하고 봉인"}
              >
                <span>{manualCloseLocked ? "연속 종결 잠금" : closeArmed ? "한 번 더 눌러 종결" : "지금 종결"}</span>
                <small>{manualCloseLocked ? "본문 진행으로 종결" : closeArmed ? "되돌리기로 복구 가능" : "직접 봉인"}</small>
              </button>
            </div>
            <p className="event-control-note">API 호출 없이 사건 원장만 즉시 조정하며, 세션 보관함에 자동 동기화됩니다.</p>
            {ledger.manualCarryover?.missing.length ? (
              <div className="event-carryover-card">
                <span>{ledger.manualCarryover.origin === "automatic_rejection"
                  ? "첫 종결 거부로 자동 이월"
                  : "이전 장면에서 이어진 일"}</span>
                <strong>{ledger.manualCarryover.sourceEventName}</strong>
                <p>앞 장면에서 마치지 못한 아래 결과를 현재 사건의 원인·행동·반응 안에 자연스럽게 짜 맞춥니다. 8턴 안에 직접 성립하지 않으면 실제로 일어나지 않은 것으로 포기 처리합니다. 현재 {ledger.manualCarryover.ageTurns}턴째 이어지고 있습니다.</p>
                <ul>{ledger.manualCarryover.missing.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : ledger.manualCloseCooldownEventId === activeEvent.id ? (
              <div className="event-carryover-card cooldown-only">
                <span>연속 직접 종결 방지</span>
                <p>직전 사건을 직접 종결했으므로, 현재 사건은 실제 본문 진행을 통해 마무리해야 합니다.</p>
              </div>
            ) : null}
          </div>
        ) : <p className="inspector-empty">모든 사건이 종결되었습니다.</p>}
      </section>

      {activeConstraints.length > 0 && (
        <section className="inspector-section">
          <div className="section-heading"><span>현재 장면 제약</span><small>{activeConstraints.length}</small></div>
          {activeConstraints.map((constraint) => (
            <InspectorEventRow event={constraint} badge="CONSTRAINT" tone="constraint" key={constraint.id} />
          ))}
        </section>
      )}

      <section className="inspector-section">
        <div className="section-heading"><span>봉인됨 · 재등장 불가</span><small>{ledger.sealed.length}</small></div>
        {ledger.sealed.length ? ledger.sealed.slice().reverse().map((sealed) => {
          const event = pack.events.find((candidate) => candidate.id === sealed.id) ?? {
            id: sealed.id,
            name: sealed.name,
            description: sealed.summary,
          } as ScenarioEvent;
          const closureNarrative = sealedClosureNarrative(event, sealed.closureReason, sealed.summary);
          return (
            <InspectorEventRow
              event={event}
              badge={sealed.status === "carried_over"
                ? "자동 이월"
                : sealed.status === "manually_closed"
                  ? "직접 봉인"
                  : "봉인 완료"}
              tone="sealed"
              summary={sealed.summary === closureNarrative ? "" : sealed.summary}
              closureReason={closureNarrative}
              carryoverResolution={sealed.carryoverResolution}
              carryoverItems={sealed.carryoverItems}
              closedMeta={[
                sealed.closedAtTurn !== undefined ? `${sealed.closedAtTurn}턴` : "",
                sealed.closedAtTime || "",
                sealed.closedAtLocation || "",
              ].filter(Boolean).join(" · ")}
              key={sealed.id}
            />
          );
        }) : <p className="inspector-empty">아직 봉인된 사건이 없습니다.</p>}
      </section>

      <section className="inspector-section">
        <div className="section-heading"><span>대기 중</span><small>{waitingEvents.length}</small></div>
        {waitingEvents.length ? waitingEvents.map((event) => (
          <InspectorEventRow event={event} badge={event.required ? "필수" : "선택"} key={event.id} />
        )) : <p className="inspector-empty">대기 중인 사건이 없습니다.</p>}
      </section>

      <section className="inspector-section">
        <div className="section-heading"><span>미해결 실마리</span><small>{ledger.openQuestions.length}</small></div>
        {ledger.openQuestions.length ? (
          <ul className="inspector-record-list compact">
            {ledger.openQuestions.map((question) => <li key={question}>{question}</li>)}
          </ul>
        ) : <p className="inspector-empty">쌓인 의문이 없습니다.</p>}
      </section>
    </div>
  );
}
