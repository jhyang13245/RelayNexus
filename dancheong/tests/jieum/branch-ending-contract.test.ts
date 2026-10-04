import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { validateBranchEndingContract } from "../../features/jieum/branch-ending-contract";
import { lintCortexPackage } from "../../features/jieum/cortex-package-lint";
import { exportScenarioPack, package15Documents } from "../../features/jieum/studio-export";
import {
  blankStoryEvent,
  makeProjectForPackageTarget,
} from "../../features/jieum/studio-model";

const branchingProject = () => {
  const project = makeProjectForPackageTarget(
    "cortex",
    "intelligent_canon",
    false,
  );
  const decision = {
    ...blankStoryEvent(1),
    id: "EV_DECIDE",
    name: "마지막 선택",
    nextEventId: "",
    multiroute: {
      scope: "route" as const,
      routeId: "ROUTE_BAEK",
      routeEntryFor: "ROUTE_BAEK",
      routeLockOnComplete: true,
    },
  };
  const normal = {
    ...blankStoryEvent(2),
    id: "EV_NORMAL",
    name: "노멀 에필로그",
    nextEventId: "EV_TRUE",
    multiroute: { scope: "ending" as const, routeId: "ROUTE_BAEK" },
  };
  const truth = {
    ...blankStoryEvent(3),
    id: "EV_TRUE",
    name: "트루 에필로그",
    nextEventId: "",
    multiroute: { scope: "ending" as const, routeId: "ROUTE_BAEK" },
  };
  project.events = [decision, normal, truth];
  project.package15.enabled = true;
  project.package15.storyMode = "branching";
  project.package15.requiredFeatures = [
    "ending_meta_progress_v1",
    "branch_ending_convergence_v1",
  ];
  project.package15.routes = [
    {
      id: "ROUTE_BAEK",
      name: "백서현 루트",
      description: "",
      order: 1,
      initiallyUnlocked: true,
      recommendedPrerequisiteRouteIds: [],
      entryEventId: "EV_DECIDE",
      lockEventId: "EV_DECIDE",
      chapterIds: [],
      endingIds: ["END_NORMAL", "END_TRUE"],
      revealPolicyIds: [],
    },
  ];
  project.package15.flags = [
    {
      id: "BOND_SCORE",
      label: "유대 점수",
      valueType: "number",
      defaultValue: 0,
      scope: "worldline",
    },
  ];
  project.package15.endings = [
    {
      id: "END_NORMAL",
      routeId: "ROUTE_BAEK",
      name: "노멀 엔딩",
      type: "normal",
      priority: 0,
      terminalEventId: "EV_NORMAL",
      exclusiveGroupId: "primary",
      condition: {},
      effects: [{ kind: "record_ending", targetId: "END_NORMAL" }],
      returnPolicy: "stay_ended",
    },
    {
      id: "END_TRUE",
      routeId: "ROUTE_BAEK",
      name: "트루 엔딩",
      type: "true",
      priority: 0,
      terminalEventId: "EV_TRUE",
      exclusiveGroupId: "primary",
      condition: {},
      effects: [{ kind: "record_ending", targetId: "END_TRUE" }],
      returnPolicy: "stay_ended",
    },
  ];
  project.package15.branchEnding = {
    enabled: true,
    primaryEndingGroupId: "primary",
    choiceRecords: [
      {
        id: "SHARED_PLAN",
        name: "계획 공유",
        sourceEventId: "EV_DECIDE",
        criterion: "공개 본문에서 주인공이 실제 계획을 백서현에게 공유했다.",
        evaluationSource: "PUBLIC_PROSE",
        applyPolicy: "ONCE_PER_EVENT",
        satisfiedEffect: {
          kind: "increment_flag",
          flagId: "BOND_SCORE",
          value: 1,
        },
      },
    ],
    decisions: [
      {
        id: "FINAL_BRANCH",
        name: "최종 엔딩 선택",
        decisionEventId: "EV_DECIDE",
        rules: [
          {
            id: "TRUE_ROUTE",
            label: "유대 점수 충족",
            when: { kind: "flag_at_least", flagId: "BOND_SCORE", value: 1 },
            nextEventId: "EV_TRUE",
          },
        ],
        matchPolicy: "FIRST_AUTHORED_MATCH",
        recoveryAttempts: 1,
        fallback: {
          nextEventId: "EV_NORMAL",
          acceptsUnevaluated: true,
          narrativeGuidance:
            "확정되지 않은 관계 상태를 날조하지 않고 노멀 결말의 인과로 연결한다.",
        },
        unresolvedPolicy: "FALLBACK_WITHOUT_ASSERTING_CONDITION",
      },
    ],
  };
  return project;
};

test("single-route Cortex projects keep branch and ending convergence disabled", async () => {
  const project = makeProjectForPackageTarget(
    "cortex",
    "intelligent_canon",
    false,
  );
  project.package15.enabled = true;
  project.package15.storyMode = "single_route";
  assert.equal(project.package15.branchEnding.enabled, false);
  assert.deepEqual(validateBranchEndingContract(project), []);
  assert.equal(
    lintCortexPackage(project).findings.some(
      (finding) =>
        finding.code.startsWith("BRANCH_") ||
        finding.code.startsWith("ENDING_CONVERGENCE"),
    ),
    false,
  );
  const output = await exportScenarioPack(project, false, {
    acknowledgeUnsupportedPolicy: true,
    acknowledgeEmptyProtection: true,
  });
  const archive = await JSZip.loadAsync(await output.blob.arrayBuffer());
  assert.equal(archive.file("routes/choice_records.json"), null);
  assert.equal(archive.file("routes/branch_decisions.json"), null);
  assert.equal(archive.file("routes/ending_convergence.json"), null);
});

test("authored conditions and unevaluated fallback both terminate in one exclusive ending group", async () => {
  const project = branchingProject();
  const findings = validateBranchEndingContract(project);
  assert.equal(
    findings.some((finding) => finding.level === "ERROR"),
    false,
    JSON.stringify(findings),
  );
  assert.equal(
    findings.some((finding) => finding.code === "ENDING_CONVERGENCE_OK"),
    true,
  );
  const docs = package15Documents(project);
  assert.equal(docs.choiceRecords.authority, "PUBLIC_PROSE");
  assert.equal(
    docs.branchDecisions.semantics,
    "ENDING_SELECTION_NOT_PROGRESS_PERMISSION",
  );
  assert.equal(docs.endingConvergence.apiFailureGuarantee, false);

  const output = await exportScenarioPack(project, false, {
    acknowledgeUnsupportedPolicy: true,
    acknowledgeEmptyProtection: true,
  });
  const archive = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const events = JSON.parse(
    await archive.file("events/events.json")!.async("string"),
  );
  const manifest = JSON.parse(await archive.file("manifest.json")!.async("string"));
  assert.equal(archive.file("routes/choice_records.json") !== null, true);
  assert.equal(archive.file("routes/branch_decisions.json") !== null, true);
  assert.equal(archive.file("routes/ending_convergence.json") !== null, true);
  assert.equal(manifest.requiredFeatures.includes("branch_ending_convergence_v1"), true);
  assert.equal(manifest.branchEndingContract.apiFailureGuarantee, false);
  for (const path of ["routes/choice_records.json", "routes/branch_decisions.json", "routes/ending_convergence.json"]) assert.equal(manifest.packageContract.requiredFiles.includes(path), true);
  assert.equal(
    events.find((event: { id: string }) => event.id === "EV_NORMAL")
      .nextEventId,
    undefined,
  );
  assert.equal(
    events.find((event: { id: string }) => event.id === "EV_TRUE").nextEventId,
    undefined,
  );
});

test("missing unevaluated fallback and open cycles fail convergence", () => {
  const project = branchingProject();
  project.package15.branchEnding.decisions[0].fallback = {
    nextEventId: "",
    acceptsUnevaluated: false,
    narrativeGuidance: "",
  };
  project.package15.branchEnding.decisions[0].rules[0].nextEventId =
    "EV_DECIDE";
  const findings = validateBranchEndingContract(project);
  assert.equal(
    findings.some((finding) => finding.code === "BRANCH_FALLBACK_MISSING"),
    true,
  );
  assert.equal(
    findings.some((finding) => finding.code === "BRANCH_UNEVALUATED_BLOCK"),
    true,
  );
  assert.equal(
    findings.some((finding) => finding.code === "ENDING_CONVERGENCE_BROKEN"),
    true,
  );
});
