import assert from "node:assert/strict";
import test from "node:test";
import { lintCortexPackage } from "../../features/jieum/cortex-package-lint";
import { blankStoryEvent, makeProjectForPackageTarget, normalizeProject } from "../../features/jieum/studio-model";

const location = (locationRef: string, label: string, aliases: string[] = []) => ({ locationRef, label, aliases });

test("package linter keeps structural checks and treats semantic ambiguity as advisory", () => {
  const project = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
  project.locationGraph = {
    schema: "CORTEX_LOCATION_GRAPH_V1",
    nodes: [location("location:home", "집", ["공통"]), location("location:school", "학교", ["공통"]), location("location:roof", "교내 옥상", ["옥상"])],
    links: [],
  };
  project.world.locationEntityRef = "location:home";
  project.events = [
    { ...blankStoryEvent(1), id: "EV_ACT1_01_HOME", name: "집", canonLocation: "집", canonLocationRef: "location:home", locations: [], description: "교내 옥상을 바라본다.", startTime: "10:00:00", endTime: "11:00:00", storyDay: 1 },
    { ...blankStoryEvent(2), id: "EV_ACT1_02_SCHOOL", name: "학교", canonLocation: "학교", canonLocationRef: "location:school", locations: [], startTime: "09:00:00", endTime: "10:00:00", storyDay: 1 },
  ] as typeof project.events;
  const lint = lintCortexPackage(project);
  assert.equal(lint.findings.some((row) => row.code === "ALIAS_COLLISION" && row.level === "WARN"), false);
  assert.equal(lint.errors, 0);
  assert.equal(lint.findings.some((row) => row.code === "EVENT_TIME_REGRESSION"), false);
  assert.equal(lint.findings.some((row) => row.code === "EVENT_TEXT_LOCATION_HINT"), false);
});

test("GOLDEN_NET stays on the rail-waterway with rooftop as an adjacent observation point", () => {
  const project = makeProjectForPackageTarget("cortex", "intelligent_canon", false);
  project.locationGraph = { schema: "CORTEX_LOCATION_GRAPH_V1", nodes: [location("location:rail-waterway", "철로·수로 일대"), location("location:campus-rooftop", "교내 옥상", ["옥상"])], links: [] };
  project.world.locationEntityRef = "location:rail-waterway";
  project.events = [{
    ...blankStoryEvent(1), id: "EV_ACT2_NIGHT_12_GOLDEN_NET", name: "귀환로에 내려진 낚싯그물",
    canonLocation: "철로·수로 일대", canonLocationRef: "location:rail-waterway",
    locationAliases: ["철로", "수로"], locations: [location("location:campus-rooftop", "교내 옥상", ["옥상"])],
    transitionLocationRefs: [], observationLocationRefs: ["location:campus-rooftop"],
    storyDay: 2, startTime: "22:00:00", endTime: "23:00:00",
    description: "스카자하가 말한다. '옥상의 시선……너였나.'",
  }];
  const event = project.events[0];
  assert.equal(event.canonLocationRef, "location:rail-waterway");
  assert.equal(event.locations.some((row) => row.locationRef === "location:campus-rooftop"), true);
  assert.equal(lintCortexPackage(project).errors, 0);
});
