"use client";

import { useState } from "react";
import {
  Braces,
  Flag,
  GitBranch,
  Plus,
  Repeat2,
  ShieldCheck,
  Signpost,
  Trash2,
} from "lucide-react";
import type { Package15Design, RuntimePredicate } from "./package15-contract";
import type { Project } from "./studio-model";
import { uid } from "./studio-model";
import { defaultBranchDecision } from "./branch-ending-contract";
import {
  Area,
  Field,
  PageFrame,
  Panel,
  Select,
  Toggle,
} from "./studio-sections";

type Setter = React.Dispatch<React.SetStateAction<Project>>;
type BranchLeafPredicate = Extract<
  RuntimePredicate,
  {
    kind:
      | "flag_at_least"
      | "flag_equals"
      | "choice_status"
      | "relation_at_least";
  }
>;

const branchPredicate = (
  kind: string,
  current?: RuntimePredicate,
): BranchLeafPredicate => {
  if (
    current &&
    "kind" in current &&
    [
      "flag_at_least",
      "flag_equals",
      "choice_status",
      "relation_at_least",
    ].includes(current.kind) &&
    current.kind === kind
  )
    return current as BranchLeafPredicate;
  if (kind === "choice_status")
    return { kind: "choice_status", choiceId: "", status: "satisfied" };
  if (kind === "relation_at_least")
    return {
      kind: "relation_at_least",
      characterId: "",
      field: "trust",
      value: 1,
      direction: "character_to_protagonist",
    };
  if (kind === "flag_equals")
    return { kind: "flag_equals", flagId: "", value: true };
  return { kind: "flag_at_least", flagId: "", value: 1 };
};
const leafPredicate = (
  predicate: RuntimePredicate,
): predicate is BranchLeafPredicate =>
  "kind" in predicate &&
  [
    "flag_at_least",
    "flag_equals",
    "choice_status",
    "relation_at_least",
  ].includes(predicate.kind);

function JsonEditor({
  label,
  value,
  onCommit,
  rows = 7,
}: {
  label: string;
  value: unknown;
  onCommit: (value: unknown) => void;
  rows?: number;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState("");
  const commit = () => {
    try {
      onCommit(JSON.parse(draft));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "JSON 형식 오류");
    }
  };
  return (
    <label className="contract-json-editor">
      <span>
        <Braces size={13} />
        {label}
      </span>
      <textarea
        rows={rows}
        value={draft}
        onFocus={() => setDraft(serialized)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        spellCheck={false}
      />
      {error && <small>{error} · 수정 후 입력창 밖을 누르세요.</small>}
    </label>
  );
}

export function Package15Section({
  project,
  setProject,
}: {
  project: Project;
  setProject: Setter;
}) {
  const design = project.package15;
  const setDesign = (patch: Partial<Package15Design>) =>
    setProject((current) => ({
      ...current,
      package15: { ...current.package15, ...patch },
    }));
  const setCharacter = (id: string, patch: Partial<Project["player"]>) =>
    setProject((current) => ({
      ...current,
      player:
        current.player.id === id
          ? { ...current.player, ...patch }
          : current.player,
      npcs: current.npcs.map((character) =>
        character.id === id ? { ...character, ...patch } : character,
      ),
    }));
  const setEvent = (id: string, patch: Partial<Project["events"][number]>) =>
    setProject((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === id ? { ...event, ...patch } : event,
      ),
    }));
  const setTrigger = (
    id: string,
    patch: Partial<Project["imageTriggers"][number]>,
  ) =>
    setProject((current) => ({
      ...current,
      imageTriggers: current.imageTriggers.map((trigger) =>
        trigger.id === id ? { ...trigger, ...patch } : trigger,
      ),
    }));
  const addRoute = () =>
    setDesign({
      routes: [
        ...design.routes,
        {
          id: uid("ROUTE"),
          name: "새 루트",
          description: "",
          order: design.routes.length + 1,
          initiallyUnlocked: design.routes.length === 0,
          recommendedPrerequisiteRouteIds: [],
          entryEventId: "",
          lockEventId: "",
          chapterIds: [],
          endingIds: [],
          revealPolicyIds: [],
        },
      ],
    });
  const setRoute = (
    id: string,
    patch: Partial<Package15Design["routes"][number]>,
  ) =>
    setDesign({
      routes: design.routes.map((route) =>
        route.id === id ? { ...route, ...patch } : route,
      ),
    });
  const setBranchEnding = (patch: Partial<Package15Design["branchEnding"]>) =>
    setDesign({ branchEnding: { ...design.branchEnding, ...patch } });
  const addFlag = () =>
    setDesign({
      flags: [
        ...design.flags,
        {
          id: uid("FLAG"),
          label: "새 분기 점수",
          valueType: "number",
          defaultValue: 0,
          scope: "worldline",
        },
      ],
    });
  const setFlag = (
    id: string,
    patch: Partial<Package15Design["flags"][number]>,
  ) =>
    setDesign({
      flags: design.flags.map((flag) =>
        flag.id === id ? { ...flag, ...patch } : flag,
      ),
    });
  const addChoice = () =>
    setBranchEnding({
      choiceRecords: [
        ...design.branchEnding.choiceRecords,
        {
          id: uid("CHOICE"),
          name: "새 선택 기록",
          sourceEventId: "",
          criterion: "",
          evaluationSource: "PUBLIC_PROSE",
          applyPolicy: "ONCE_PER_EVENT",
        },
      ],
    });
  const setChoice = (
    id: string,
    patch: Partial<Package15Design["branchEnding"]["choiceRecords"][number]>,
  ) =>
    setBranchEnding({
      choiceRecords: design.branchEnding.choiceRecords.map((choice) =>
        choice.id === id ? { ...choice, ...patch } : choice,
      ),
    });
  const addDecision = () =>
    setBranchEnding({
      decisions: [
        ...design.branchEnding.decisions,
        defaultBranchDecision(uid("BRANCH")),
      ],
    });
  const setDecision = (
    id: string,
    patch: Partial<Package15Design["branchEnding"]["decisions"][number]>,
  ) =>
    setBranchEnding({
      decisions: design.branchEnding.decisions.map((decision) =>
        decision.id === id ? { ...decision, ...patch } : decision,
      ),
    });
  const addEnding = () =>
    setDesign({
      endings: [
        ...design.endings,
        {
          id: uid("ENDING"),
          routeId: design.routes[0]?.id || "",
          name: "새 엔딩",
          type: "normal",
          priority: 0,
          terminalEventId: "",
          exclusiveGroupId:
            design.branchEnding.primaryEndingGroupId || "primary",
          condition: {},
          effects: [],
          returnPolicy: "stay_ended",
        },
      ],
    });
  const setEnding = (
    id: string,
    patch: Partial<Package15Design["endings"][number]>,
  ) =>
    setDesign({
      endings: design.endings.map((ending) =>
        ending.id === id ? { ...ending, ...patch } : ending,
      ),
    });
  const feature = (
    id: Package15Design["requiredFeatures"][number],
    required: boolean,
  ) => {
    const source = required ? design.requiredFeatures : design.optionalFeatures;
    const other = required ? design.optionalFeatures : design.requiredFeatures;
    setDesign({
      [required ? "requiredFeatures" : "optionalFeatures"]: source.includes(id)
        ? source.filter((item) => item !== id)
        : [...source, id],
      [required ? "optionalFeatures" : "requiredFeatures"]: other.filter(
        (item) => item !== id,
      ),
    });
  };

  return (
    <PageFrame
      eyebrow="PACKAGE CONTRACT"
      title="세계선·루프와 작품 독립 서사 계약"
      description="Nexus가 작품 이름을 하드코딩하지 않도록 서사 복구·장면 표식·정체 공개 규칙은 Package 1.4 선택 확장으로 저장하고, 멀티루트·루프·엔딩 메타 진행은 Package 1.5 계약으로 내보냅니다."
    >
      <div className="form-grid two-col">
        <Panel
          title="패키지 대상"
          note="기존 단일 루트 작품은 1.4를 유지합니다. 1.5를 켜면 v2.1 공식 파일군이 추가됩니다."
          badge={design.enabled ? "PACKAGE 1.5" : "PACKAGE 1.4"}
        >
          <Toggle
            checked={design.enabled}
            onChange={(enabled) => setDesign({ enabled })}
            label="Package 1.5 멀티루트 계약"
            note="routes/·loops/·state/ 구조를 생성"
          />
          <Select
            label="작품 진행 방식"
            value={design.storyMode}
            onChange={(storyMode) =>
              setDesign({
                storyMode: storyMode as Package15Design["storyMode"],
              })
            }
            options={[
              { value: "single_route", label: "단일 루트" },
              { value: "branching", label: "분기형" },
              { value: "multi_route", label: "멀티 루트" },
              { value: "time_loop", label: "시간 루프" },
              {
                value: "multi_route_time_loop",
                label: "멀티 루트 + 시간 루프",
              },
            ]}
          />
          <Select
            label="기본 해금 방식"
            value={design.defaultUnlockMode}
            onChange={(defaultUnlockMode) =>
              setDesign({
                defaultUnlockMode:
                  defaultUnlockMode as Package15Design["defaultUnlockMode"],
              })
            }
            options={[
              { value: "canonical_order", label: "정사 순서" },
              { value: "all_open", label: "모든 루트 개방" },
            ]}
          />
          <Toggle
            checked={design.allowAllOpenOverride}
            onChange={(allowAllOpenOverride) =>
              setDesign({ allowAllOpenOverride })
            }
            label="사용자 전체 개방 허용"
            note="정사 해금 순서를 건너뛰는 선택을 명시적으로 허용"
          />
        </Panel>
        <Panel
          title="기능 협상"
          note="지원하지 못한 필수 기능은 축소 실행하지 않고 Nexus가 호환 오류로 차단해야 합니다."
          badge="NEGOTIATION"
        >
          {(
            [
              "multi_route_v1",
              "time_loop_v1",
              "reveal_policy_v1",
              "ending_meta_progress_v1",
              "branch_ending_convergence_v1",
            ] as const
          ).map((id) => (
            <div className="feature-contract-row" key={id}>
              <b>{id}</b>
              <Toggle
                checked={design.requiredFeatures.includes(id)}
                onChange={() => feature(id, true)}
                label="필수"
              />
              <Toggle
                checked={design.optionalFeatures.includes(id)}
                onChange={() => feature(id, false)}
                label="선택"
              />
            </div>
          ))}
          <p className="contract-note">
            <ShieldCheck size={15} /> 엔딩 감상으로 후속 루트가 열리는 작품은{" "}
            <code>ending_meta_progress_v1</code>을 반드시 필수로 지정합니다.
          </p>
        </Panel>
      </div>

      <Panel
        title="루트 그래프"
        note="루트 진입·확정 사건과 챕터·엔딩·공개 정책 ID를 연결합니다."
        badge={`${design.routes.length} ROUTES`}
        actions={
          <button className="soft-button" onClick={addRoute}>
            <Plus size={15} /> 루트 추가
          </button>
        }
        wide
      >
        {design.routes.length ? (
          <div className="contract-card-grid">
            {design.routes.map((route) => (
              <article className="contract-card" key={route.id}>
                <header>
                  <GitBranch size={17} />
                  <b>{route.name}</b>
                  <button
                    aria-label="루트 삭제"
                    onClick={() =>
                      setDesign({
                        routes: design.routes.filter(
                          (item) => item.id !== route.id,
                        ),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </header>
                <div className="form-grid two-col">
                  <Field
                    label="루트 ID"
                    value={route.id}
                    onChange={(id) => setRoute(route.id, { id })}
                  />
                  <Field
                    label="표시 순서"
                    type="number"
                    value={route.order}
                    onChange={(order) =>
                      setRoute(route.id, { order: Number(order) })
                    }
                  />
                  <Field
                    label="루트 이름"
                    value={route.name}
                    onChange={(name) => setRoute(route.id, { name })}
                  />
                  <Field
                    label="중심 인물 ID"
                    value={route.heroineCharacterId ?? ""}
                    onChange={(heroineCharacterId) =>
                      setRoute(route.id, { heroineCharacterId })
                    }
                  />
                  <Field
                    label="진입 사건 ID"
                    value={route.entryEventId}
                    onChange={(entryEventId) =>
                      setRoute(route.id, { entryEventId })
                    }
                  />
                  <Field
                    label="확정 사건 ID"
                    value={route.lockEventId}
                    onChange={(lockEventId) =>
                      setRoute(route.id, { lockEventId })
                    }
                  />
                </div>
                <Toggle
                  checked={route.initiallyUnlocked}
                  onChange={(initiallyUnlocked) =>
                    setRoute(route.id, { initiallyUnlocked })
                  }
                  label="초기 해금"
                />
                <JsonEditor
                  label="루트 상세 참조"
                  value={{
                    description: route.description,
                    unlockCondition: route.unlockCondition,
                    recommendedPrerequisiteRouteIds:
                      route.recommendedPrerequisiteRouteIds,
                    lensId: route.lensId,
                    chapterIds: route.chapterIds,
                    endingIds: route.endingIds,
                    revealPolicyIds: route.revealPolicyIds,
                    spoilerWarning: route.spoilerWarning,
                  }}
                  onCommit={(value) =>
                    setRoute(route.id, value as Partial<typeof route>)
                  }
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="contract-empty">
            1.5를 사용할 경우 루트를 추가하세요. 단일 루트 1.4 작품에는 필요하지
            않습니다.
          </p>
        )}
      </Panel>

      <Panel
        title="선택·분기·엔딩 수렴"
        note="복수 결말이 있는 작품만 켭니다. Fate/Seoul 같은 단일 정사 작품은 끈 상태로 두면 기존 사건 순서만 사용합니다."
        badge={design.branchEnding.enabled ? "ENDING GUARANTEE" : "OPTIONAL"}
        wide
      >
        <Toggle
          checked={design.branchEnding.enabled}
          onChange={(enabled) => {
            const requiredFeatures = enabled
              ? [
                  ...new Set([
                    ...design.requiredFeatures,
                    "branch_ending_convergence_v1" as const,
                  ]),
                ]
              : design.requiredFeatures.filter(
                  (id) => id !== "branch_ending_convergence_v1",
                );
            setDesign({
              branchEnding: { ...design.branchEnding, enabled },
              requiredFeatures,
            });
          }}
          label="분기·복수 엔딩 사용"
          note="조건 미달이나 미평가 때문에 멈추지 않고 작가가 지정한 경로로 계속 진행"
        />
        {design.branchEnding.enabled && (
          <div className="branch-ending-editor">
            <div className="form-grid two-col">
              <Field
                label="대표 배타 엔딩 그룹 ID"
                value={design.branchEnding.primaryEndingGroupId}
                onChange={(primaryEndingGroupId) =>
                  setBranchEnding({ primaryEndingGroupId })
                }
              />
              <div className="contract-note">
                <ShieldCheck size={15} /> 분기는 진행 허가가 아니라 결말
                선택입니다. API 장애를 숨기지는 않지만 조건 때문에 멈추거나 무한
                반복하지 않습니다.
              </div>
            </div>

            <section className="contract-workbench">
              <header>
                <div>
                  <h3>공개 본문 선택 기록</h3>
                  <p>
                    문장력이나 입력 문구가 아니라, 공개 본문에서 실제로 실현된
                    행동만 한 번 기록합니다.
                  </p>
                </div>
                <div className="contract-actions">
                  <button
                    type="button"
                    className="soft-button"
                    onClick={addFlag}
                  >
                    <Plus size={15} /> 점수·플래그
                  </button>
                  <button
                    type="button"
                    className="soft-button"
                    onClick={addChoice}
                  >
                    <Plus size={15} /> 선택 기록
                  </button>
                </div>
              </header>
              {design.flags.length > 0 && (
                <div className="branch-flag-grid">
                  {design.flags.map((flag) => (
                    <article className="branch-flag" key={flag.id}>
                      <Field
                        label="플래그 ID"
                        value={flag.id}
                        onChange={(id) => setFlag(flag.id, { id })}
                      />
                      <Field
                        label="표시 이름"
                        value={flag.label}
                        onChange={(label) => setFlag(flag.id, { label })}
                      />
                      <Select
                        label="자료형"
                        value={flag.valueType}
                        onChange={(valueType) =>
                          setFlag(flag.id, {
                            valueType: valueType as typeof flag.valueType,
                            defaultValue:
                              valueType === "number"
                                ? 0
                                : valueType === "boolean"
                                  ? false
                                  : "",
                          })
                        }
                        options={[
                          { value: "number", label: "숫자 점수" },
                          { value: "boolean", label: "참/거짓" },
                          { value: "string", label: "문자열" },
                        ]}
                      />
                      <Select
                        label="보존 범위"
                        value={flag.scope}
                        onChange={(scope) =>
                          setFlag(flag.id, {
                            scope: scope as typeof flag.scope,
                          })
                        }
                        options={[
                          { value: "session", label: "현재 세션" },
                          { value: "worldline", label: "현재 세계선" },
                          { value: "route_meta", label: "루트 메타" },
                          { value: "work_meta", label: "작품 메타" },
                        ]}
                      />
                      <button
                        type="button"
                        className="icon-danger"
                        aria-label="점수·플래그 삭제"
                        onClick={() =>
                          setDesign({
                            flags: design.flags.filter(
                              (item) => item.id !== flag.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {design.branchEnding.choiceRecords.length ? (
                <div className="contract-card-grid">
                  {design.branchEnding.choiceRecords.map((choice) => (
                    <article className="contract-card" key={choice.id}>
                      <header>
                        <Flag size={16} />
                        <b>{choice.name}</b>
                        <button
                          type="button"
                          aria-label="선택 기록 삭제"
                          onClick={() =>
                            setBranchEnding({
                              choiceRecords:
                                design.branchEnding.choiceRecords.filter(
                                  (item) => item.id !== choice.id,
                                ),
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </header>
                      <div className="form-grid two-col">
                        <Field
                          label="기록 ID"
                          value={choice.id}
                          onChange={(id) => setChoice(choice.id, { id })}
                        />
                        <Field
                          label="표시 이름"
                          value={choice.name}
                          onChange={(name) => setChoice(choice.id, { name })}
                        />
                        <Select
                          label="판정 사건"
                          value={choice.sourceEventId}
                          onChange={(sourceEventId) =>
                            setChoice(choice.id, { sourceEventId })
                          }
                          options={[
                            { value: "", label: "사건 선택" },
                            ...project.events
                              .filter((event) => event.kind !== "constraint")
                              .map((event) => ({
                                value: event.id,
                                label: event.name,
                              })),
                          ]}
                        />
                        <Select
                          label="달성 시 효과"
                          value={choice.satisfiedEffect?.kind || "none"}
                          onChange={(kind) =>
                            setChoice(choice.id, {
                              satisfiedEffect:
                                kind === "none"
                                  ? undefined
                                  : {
                                      kind: kind as
                                        | "increment_flag"
                                        | "set_flag",
                                      flagId:
                                        choice.satisfiedEffect?.flagId || "",
                                      value:
                                        kind === "increment_flag" ? 1 : true,
                                    },
                            })
                          }
                          options={[
                            { value: "none", label: "기록만" },
                            { value: "increment_flag", label: "점수 누적" },
                            { value: "set_flag", label: "플래그 설정" },
                          ]}
                        />
                      </div>
                      <Area
                        label="행동 판정 기준"
                        value={choice.criterion}
                        onChange={(criterion) =>
                          setChoice(choice.id, { criterion })
                        }
                        placeholder="예: 공개 본문에서 주인공이 백서현에게 실제 계획을 공유했다."
                      />
                      {choice.satisfiedEffect && (
                        <div className="form-grid two-col">
                          <Select
                            label="결과 플래그"
                            value={choice.satisfiedEffect.flagId}
                            onChange={(flagId) =>
                              setChoice(choice.id, {
                                satisfiedEffect: {
                                  ...choice.satisfiedEffect!,
                                  flagId,
                                },
                              })
                            }
                            options={[
                              { value: "", label: "플래그 선택" },
                              ...design.flags.map((flag) => ({
                                value: flag.id,
                                label: `${flag.label} · ${flag.id}`,
                              })),
                            ]}
                          />
                          <Field
                            label={
                              choice.satisfiedEffect.kind === "increment_flag"
                                ? "달성 시 가산값"
                                : "달성 시 값"
                            }
                            type={
                              choice.satisfiedEffect.kind === "increment_flag"
                                ? "number"
                                : "text"
                            }
                            value={String(choice.satisfiedEffect.value)}
                            onChange={(value) =>
                              setChoice(choice.id, {
                                satisfiedEffect: {
                                  ...choice.satisfiedEffect!,
                                  value:
                                    choice.satisfiedEffect!.kind ===
                                    "increment_flag"
                                      ? Number(value)
                                      : value === "true"
                                        ? true
                                        : value === "false"
                                          ? false
                                          : value,
                                },
                              })
                            }
                          />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="contract-empty">
                  선택 판정이 필요한 사건만 추가하세요. 관계 수치를 직접
                  사용하는 작품은 선택 기록 없이 분기 조건만 작성할 수 있습니다.
                </p>
              )}
            </section>

            <section className="contract-workbench">
              <header>
                <div>
                  <h3>조건별 후속사건과 안전 경로</h3>
                  <p>
                    조건은 작성 순서대로 처음 충족된 하나를 선택합니다. 어느
                    조건도 확정되지 않으면 작가가 지정한 안전 경로로 진행합니다.
                  </p>
                </div>
                <button
                  type="button"
                  className="soft-button"
                  onClick={addDecision}
                >
                  <Plus size={15} /> 분기
                </button>
              </header>
              {design.branchEnding.decisions.length ? (
                <div className="contract-card-grid">
                  {design.branchEnding.decisions.map((decision) => (
                    <article className="contract-card" key={decision.id}>
                      <header>
                        <Signpost size={16} />
                        <b>{decision.name}</b>
                        <button
                          type="button"
                          aria-label="분기 삭제"
                          onClick={() =>
                            setBranchEnding({
                              decisions: design.branchEnding.decisions.filter(
                                (item) => item.id !== decision.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </header>
                      <div className="form-grid two-col">
                        <Field
                          label="분기 ID"
                          value={decision.id}
                          onChange={(id) => setDecision(decision.id, { id })}
                        />
                        <Field
                          label="분기 이름"
                          value={decision.name}
                          onChange={(name) =>
                            setDecision(decision.id, { name })
                          }
                        />
                        <Select
                          label="분기 판정 사건"
                          value={decision.decisionEventId}
                          onChange={(decisionEventId) =>
                            setDecision(decision.id, { decisionEventId })
                          }
                          options={[
                            { value: "", label: "사건 선택" },
                            ...project.events
                              .filter((event) => event.kind !== "constraint")
                              .map((event) => ({
                                value: event.id,
                                label: event.name,
                              })),
                          ]}
                        />
                        <Select
                          label="미평가 복구 횟수"
                          value={String(decision.recoveryAttempts)}
                          onChange={(value) =>
                            setDecision(decision.id, {
                              recoveryAttempts: Number(value) as 0 | 1 | 2,
                            })
                          }
                          options={[
                            { value: "0", label: "복구 없이 안전 경로" },
                            { value: "1", label: "1회 복구" },
                            { value: "2", label: "2회 복구" },
                          ]}
                        />
                      </div>
                      <div className="branch-rule-list">
                        {decision.rules.map((rule, index) => {
                          const predicate = leafPredicate(rule.when)
                            ? rule.when
                            : branchPredicate("flag_at_least");
                          const kind = predicate.kind;
                          return (
                            <div className="branch-rule-row" key={rule.id}>
                              <b>{index + 1}</b>
                              <Field
                                label="조건 이름"
                                value={rule.label}
                                onChange={(label) =>
                                  setDecision(decision.id, {
                                    rules: decision.rules.map((item) =>
                                      item.id === rule.id
                                        ? { ...item, label }
                                        : item,
                                    ),
                                  })
                                }
                              />
                              <Select
                                label="조건 종류"
                                value={kind}
                                onChange={(nextKind) =>
                                  setDecision(decision.id, {
                                    rules: decision.rules.map((item) =>
                                      item.id === rule.id
                                        ? {
                                            ...item,
                                            when: branchPredicate(
                                              nextKind,
                                              item.when,
                                            ),
                                          }
                                        : item,
                                    ),
                                  })
                                }
                                options={[
                                  {
                                    value: "flag_at_least",
                                    label: "점수 이상",
                                  },
                                  {
                                    value: "flag_equals",
                                    label: "플래그 일치",
                                  },
                                  {
                                    value: "choice_status",
                                    label: "선택 판정 상태",
                                  },
                                  {
                                    value: "relation_at_least",
                                    label: "관계 수치 이상",
                                  },
                                ]}
                              />
                              {kind === "choice_status" ? (
                                <>
                                  <Select
                                    label="선택 기록"
                                    value={predicate.choiceId}
                                    onChange={(choiceId) =>
                                      setDecision(decision.id, {
                                        rules: decision.rules.map((item) =>
                                          item.id === rule.id
                                            ? {
                                                ...item,
                                                when: {
                                                  ...predicate,
                                                  choiceId,
                                                },
                                              }
                                            : item,
                                        ),
                                      })
                                    }
                                    options={[
                                      { value: "", label: "선택 기록 선택" },
                                      ...design.branchEnding.choiceRecords.map(
                                        (choice) => ({
                                          value: choice.id,
                                          label: choice.name,
                                        }),
                                      ),
                                    ]}
                                  />
                                  <Select
                                    label="필요한 판정"
                                    value={predicate.status}
                                    onChange={(status) =>
                                      setDecision(decision.id, {
                                        rules: decision.rules.map((item) =>
                                          item.id === rule.id
                                            ? {
                                                ...item,
                                                when: {
                                                  ...predicate,
                                                  status:
                                                    status as typeof predicate.status,
                                                },
                                              }
                                            : item,
                                        ),
                                      })
                                    }
                                    options={[
                                      {
                                        value: "satisfied",
                                        label: "행동 달성",
                                      },
                                      {
                                        value: "not_satisfied",
                                        label: "행동 미달성",
                                      },
                                      {
                                        value: "evaluated",
                                        label: "판정 완료",
                                      },
                                    ]}
                                  />
                                </>
                              ) : kind === "relation_at_least" ? (
                                <Select
                                  label="관계 인물"
                                  value={predicate.characterId}
                                  onChange={(characterId) =>
                                    setDecision(decision.id, {
                                      rules: decision.rules.map((item) =>
                                        item.id === rule.id
                                          ? {
                                              ...item,
                                              when: {
                                                ...predicate,
                                                characterId,
                                              },
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                  options={[
                                    { value: "", label: "인물 선택" },
                                    ...project.npcs.map((character) => ({
                                      value: character.id,
                                      label: character.name,
                                    })),
                                  ]}
                                />
                              ) : (
                                <Select
                                  label="플래그"
                                  value={predicate.flagId}
                                  onChange={(flagId) =>
                                    setDecision(decision.id, {
                                      rules: decision.rules.map((item) =>
                                        item.id === rule.id
                                          ? {
                                              ...item,
                                              when: { ...predicate, flagId },
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                  options={[
                                    { value: "", label: "플래그 선택" },
                                    ...design.flags.map((flag) => ({
                                      value: flag.id,
                                      label: flag.label,
                                    })),
                                  ]}
                                />
                              )}
                              {(kind === "flag_at_least" ||
                                kind === "relation_at_least") && (
                                <Field
                                  label="기준값"
                                  type="number"
                                  value={predicate.value}
                                  onChange={(value) =>
                                    setDecision(decision.id, {
                                      rules: decision.rules.map((item) =>
                                        item.id === rule.id
                                          ? {
                                              ...item,
                                              when: {
                                                ...predicate,
                                                value: Number(value),
                                              },
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              )}
                              {kind === "relation_at_least" && (
                                <>
                                  <Select
                                    label="관계 항목"
                                    value={predicate.field}
                                    onChange={(field) =>
                                      setDecision(decision.id, {
                                        rules: decision.rules.map((item) =>
                                          item.id === rule.id
                                            ? {
                                                ...item,
                                                when: {
                                                  ...predicate,
                                                  field:
                                                    field as typeof predicate.field,
                                                },
                                              }
                                            : item,
                                        ),
                                      })
                                    }
                                    options={[
                                      { value: "trust", label: "신뢰" },
                                      { value: "favor", label: "호감" },
                                      { value: "respect", label: "존중" },
                                    ]}
                                  />
                                  <Select
                                    label="관계 방향"
                                    value={predicate.direction}
                                    onChange={(direction) =>
                                      setDecision(decision.id, {
                                        rules: decision.rules.map((item) =>
                                          item.id === rule.id
                                            ? {
                                                ...item,
                                                when: {
                                                  ...predicate,
                                                  direction:
                                                    direction as typeof predicate.direction,
                                                },
                                              }
                                            : item,
                                        ),
                                      })
                                    }
                                    options={[
                                      {
                                        value: "character_to_protagonist",
                                        label: "인물 → 주인공",
                                      },
                                      {
                                        value: "protagonist_to_character",
                                        label: "주인공 → 인물",
                                      },
                                    ]}
                                  />
                                </>
                              )}
                              {kind === "flag_equals" && (
                                <Field
                                  label="일치 값"
                                  value={String(predicate.value)}
                                  onChange={(value) =>
                                    setDecision(decision.id, {
                                      rules: decision.rules.map((item) =>
                                        item.id === rule.id
                                          ? {
                                              ...item,
                                              when: {
                                                ...predicate,
                                                value:
                                                  value === "true"
                                                    ? true
                                                    : value === "false"
                                                      ? false
                                                      : Number.isNaN(
                                                            Number(value),
                                                          )
                                                        ? value
                                                        : Number(value),
                                              },
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              )}
                              <Select
                                label="충족 시 후속사건"
                                value={rule.nextEventId}
                                onChange={(nextEventId) =>
                                  setDecision(decision.id, {
                                    rules: decision.rules.map((item) =>
                                      item.id === rule.id
                                        ? { ...item, nextEventId }
                                        : item,
                                    ),
                                  })
                                }
                                options={[
                                  { value: "", label: "사건 선택" },
                                  ...project.events
                                    .filter(
                                      (event) => event.kind !== "constraint",
                                    )
                                    .map((event) => ({
                                      value: event.id,
                                      label: event.name,
                                    })),
                                ]}
                              />
                              <button
                                type="button"
                                className="icon-danger"
                                aria-label="분기 조건 삭제"
                                onClick={() =>
                                  setDecision(decision.id, {
                                    rules: decision.rules.filter(
                                      (item) => item.id !== rule.id,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="soft-button add-wide"
                        onClick={() =>
                          setDecision(decision.id, {
                            rules: [
                              ...decision.rules,
                              {
                                id: uid("RULE"),
                                label: "새 조건",
                                when: {
                                  kind: "flag_at_least",
                                  flagId: "",
                                  value: 1,
                                },
                                nextEventId: "",
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={15} /> 조건별 후속사건 추가
                      </button>
                      <div className="branch-fallback">
                        <Select
                          label="조건 미달·미평가 안전 경로"
                          value={decision.fallback.nextEventId}
                          onChange={(nextEventId) =>
                            setDecision(decision.id, {
                              fallback: { ...decision.fallback, nextEventId },
                            })
                          }
                          options={[
                            { value: "", label: "작가가 경로 지정" },
                            ...project.events
                              .filter((event) => event.kind !== "constraint")
                              .map((event) => ({
                                value: event.id,
                                label: event.name,
                              })),
                          ]}
                        />
                        <Area
                          label="안전 경로 연결 지침"
                          value={decision.fallback.narrativeGuidance}
                          onChange={(narrativeGuidance) =>
                            setDecision(decision.id, {
                              fallback: {
                                ...decision.fallback,
                                narrativeGuidance,
                              },
                            })
                          }
                        />
                        <Toggle
                          checked={decision.fallback.acceptsUnevaluated}
                          onChange={(acceptsUnevaluated) =>
                            setDecision(decision.id, {
                              fallback: {
                                ...decision.fallback,
                                acceptsUnevaluated,
                              },
                            })
                          }
                          label="미평가 상태도 이 경로로 진행"
                          note="관계 훼손·조건 실패를 날조하지 않고 경로 선택 사유만 기록"
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="contract-empty">
                  복수 엔딩을 가르는 사건에만 분기를 추가하세요.
                </p>
              )}
            </section>

            <section className="contract-workbench">
              <header>
                <div>
                  <h3>배타적 엔딩 종결점</h3>
                  <p>
                    에필로그까지 완료되는 실제 마지막 사건을 지정합니다. 이
                    지점에서는 배열의 다음 사건으로 넘어가지 않습니다.
                  </p>
                </div>
                <button
                  type="button"
                  className="soft-button"
                  onClick={addEnding}
                >
                  <Plus size={15} /> 엔딩
                </button>
              </header>
              <div className="contract-card-grid">
                {design.endings.map((ending) => (
                  <article className="contract-card" key={ending.id}>
                    <header>
                      <ShieldCheck size={16} />
                      <b>{ending.name}</b>
                      <button
                        type="button"
                        aria-label="엔딩 삭제"
                        onClick={() =>
                          setDesign({
                            endings: design.endings.filter(
                              (item) => item.id !== ending.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </header>
                    <div className="form-grid two-col">
                      <Field
                        label="엔딩 ID"
                        value={ending.id}
                        onChange={(id) => setEnding(ending.id, { id })}
                      />
                      <Field
                        label="엔딩 이름"
                        value={ending.name}
                        onChange={(name) => setEnding(ending.id, { name })}
                      />
                      <Select
                        label="소속 루트"
                        value={ending.routeId}
                        onChange={(routeId) =>
                          setEnding(ending.id, { routeId })
                        }
                        options={[
                          { value: "", label: "루트 선택" },
                          ...design.routes.map((route) => ({
                            value: route.id,
                            label: route.name,
                          })),
                        ]}
                      />
                      <Select
                        label="엔딩 종류"
                        value={ending.type}
                        onChange={(type) =>
                          setEnding(ending.id, {
                            type: type as typeof ending.type,
                          })
                        }
                        options={[
                          { value: "bad", label: "배드" },
                          { value: "normal", label: "노멀" },
                          { value: "good", label: "굿" },
                          { value: "true", label: "트루" },
                          { value: "final", label: "파이널" },
                        ]}
                      />
                      <Select
                        label="종결 사건"
                        value={ending.terminalEventId || ""}
                        onChange={(terminalEventId) =>
                          setEnding(ending.id, { terminalEventId })
                        }
                        options={[
                          { value: "", label: "마지막 사건 선택" },
                          ...project.events
                            .filter((event) => event.kind !== "constraint")
                            .map((event) => ({
                              value: event.id,
                              label: event.name,
                            })),
                        ]}
                      />
                      <Field
                        label="배타 엔딩 그룹"
                        value={ending.exclusiveGroupId || "primary"}
                        onChange={(exclusiveGroupId) =>
                          setEnding(ending.id, { exclusiveGroupId })
                        }
                      />
                      <Select
                        label="엔딩 뒤 처리"
                        value={ending.returnPolicy}
                        onChange={(returnPolicy) =>
                          setEnding(ending.id, {
                            returnPolicy:
                              returnPolicy as typeof ending.returnPolicy,
                          })
                        }
                        options={[
                          { value: "stay_ended", label: "종료 유지" },
                          {
                            value: "return_checkpoint",
                            label: "체크포인트 복귀",
                          },
                          { value: "new_worldline", label: "새 세계선" },
                        ]}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </Panel>

      <Panel
        title="시간 루프 정책"
        note="조건식과 ActorSelector를 구분하고, 상태 복원 우선순위를 v2.1 순서로 고정합니다."
        badge="CHRONOS v2.1"
        wide
      >
        <div className="form-grid two-col">
          <Toggle
            checked={design.loopPolicy.enabled}
            onChange={(enabled) =>
              setDesign({ loopPolicy: { ...design.loopPolicy, enabled } })
            }
            label="시간 루프 활성화"
          />
          <Select
            label="주인공 사망 처리"
            value={design.loopPolicy.protagonistDeathMode}
            onChange={(protagonistDeathMode) =>
              setDesign({
                loopPolicy: {
                  ...design.loopPolicy,
                  protagonistDeathMode:
                    protagonistDeathMode as Package15Design["loopPolicy"]["protagonistDeathMode"],
                },
              })
            }
            options={[
              { value: "game_over", label: "게임 오버" },
              { value: "loop", label: "루프 발동" },
              { value: "package_defined", label: "패키지 규칙" },
            ]}
          />
          <Field
            label="리셋 날짜"
            value={design.loopPolicy.resetPoint.date}
            onChange={(date) =>
              setDesign({
                loopPolicy: {
                  ...design.loopPolicy,
                  resetPoint: { ...design.loopPolicy.resetPoint, date },
                },
              })
            }
          />
          <Field
            label="리셋 시각"
            value={design.loopPolicy.resetPoint.time}
            onChange={(time) =>
              setDesign({
                loopPolicy: {
                  ...design.loopPolicy,
                  resetPoint: { ...design.loopPolicy.resetPoint, time },
                },
              })
            }
          />
        </div>
        <JsonEditor
          label="루프 트리거 · 상태 규칙 · ActorSelector"
          value={{
            trigger: design.loopPolicy.trigger,
            activeWindow: design.loopPolicy.activeWindow,
            stateRules: design.loopPolicy.stateRules,
            maxLoops: design.loopPolicy.maxLoops,
          }}
          onCommit={(value) =>
            setDesign({
              loopPolicy: {
                ...design.loopPolicy,
                ...(value as Partial<Package15Design["loopPolicy"]>),
              },
            })
          }
          rows={12}
        />
      </Panel>

      <Panel
        title="Package 1.4 선택적 서사 확장"
        note="Nexus의 Fate/Seoul 결정론적 복구 코드를 작품 데이터로 이동시키기 위한 공통 계약입니다. Package 1.5도 같은 필드를 그대로 사용합니다."
        badge="WORK-AGNOSTIC"
        wide
      >
        <div className="contract-card-grid">
          {[project.player, ...project.npcs].map((character) => (
            <article className="contract-card" key={character.id}>
              <header>
                <ShieldCheck size={16} />
                <b>{character.name}</b>
                <code>{character.id}</code>
              </header>
              <Field
                label="공개 전 별칭 · preRevealAlias"
                value={character.preRevealAlias}
                onChange={(preRevealAlias) =>
                  setCharacter(character.id, { preRevealAlias })
                }
              />
              <JsonEditor
                label="정체 공개 조건 · revealCondition"
                value={
                  character.revealCondition ?? {
                    kind: "event_completed",
                    eventId: "",
                  }
                }
                onCommit={(value) =>
                  setCharacter(character.id, {
                    revealCondition: value as RuntimePredicate,
                  })
                }
              />
            </article>
          ))}
        </div>
        <div className="contract-card-grid">
          {project.events.map((event) => (
            <article className="contract-card" key={event.id}>
              <header>
                <GitBranch size={16} />
                <b>{event.name}</b>
                <code>{event.id}</code>
              </header>
              <JsonEditor
                label="우회 비트 · alternateBeats"
                value={event.alternateBeats}
                onCommit={(value) =>
                  setEvent(event.id, {
                    alternateBeats: Array.isArray(value)
                      ? (value as typeof event.alternateBeats)
                      : [],
                  })
                }
              />
              <JsonEditor
                label="장면 표식 · sceneMarkers"
                value={event.sceneMarkers}
                onCommit={(value) =>
                  setEvent(event.id, {
                    sceneMarkers: Array.isArray(value)
                      ? (value as typeof event.sceneMarkers)
                      : [],
                  })
                }
              />
              <JsonEditor
                label="Package 1.5 사건 확장"
                value={
                  event.multiroute ?? {
                    scope: "common",
                    completionScope: "scene_once",
                    resetBehavior: "reset_to_pending",
                    alternativeFulfillment: [],
                  }
                }
                onCommit={(value) =>
                  setEvent(event.id, {
                    multiroute: value as typeof event.multiroute,
                  })
                }
              />
            </article>
          ))}
        </div>
        {project.imageTriggers.length > 0 && (
          <>
            <h3 className="contract-subheading">이미지 트리거 루트 범위</h3>
            <div className="contract-card-grid">
              {project.imageTriggers.map((trigger) => (
                <article className="contract-card" key={trigger.id}>
                  <header>
                    <GitBranch size={16} />
                    <b>{trigger.name}</b>
                    <code>{trigger.id}</code>
                  </header>
                  <JsonEditor
                    label="routeIds · chapterIds · endingIds · 공개/플래그"
                    value={{
                      routeIds: trigger.routeIds,
                      chapterIds: trigger.chapterIds,
                      endingIds: trigger.endingIds,
                      revealPolicyId: trigger.revealPolicyId,
                      requiredFlags: trigger.requiredFlags,
                      forbiddenFlags: trigger.forbiddenFlags,
                    }}
                    onCommit={(value) =>
                      setTrigger(trigger.id, value as Partial<typeof trigger>)
                    }
                  />
                </article>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Package 1.5 전체 계약 JSON"
        note="챕터·렌즈·공개 사실·공개 정책·엔딩·플래그·갤러리·후일담·체크포인트·단서·아이템·구역·세계 사실을 손실 없이 편집합니다."
        badge="LOSSLESS"
        wide
      >
        <JsonEditor
          label="Final Contract Candidate v2.1"
          value={design}
          onCommit={(value) =>
            setProject((current) => ({
              ...current,
              package15: value as Package15Design,
            }))
          }
          rows={24}
        />
        <p className="contract-note">
          <Repeat2 size={15} /> 저장·작업 JSON·ScenarioPack 왕복 시 알려진 모든
          필드와 구조화 조건을 그대로 보존합니다.
        </p>
      </Panel>
    </PageFrame>
  );
}
