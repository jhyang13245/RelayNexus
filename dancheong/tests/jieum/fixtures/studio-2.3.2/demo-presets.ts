import instantStorySnapshot from "./demo-data/giseong-instant-story.json";
import type { Project } from "./studio-model";
import { demoProject, normalizeProject } from "./studio-model";

export type DemoPresetId = "giseong_full_fit" | "giseong_instant_story";

type DemoPreset = {
  id: DemoPresetId;
  eyebrow: string;
  title: string;
  description: string;
  facts: string[];
  badge: string;
};

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "giseong_full_fit",
    eyebrow: "STANDARD PACKAGE",
    title: "기성학원 신규 패키지 · 풀 핏",
    description: "Studio의 전체 설계 항목을 폭넓게 살펴보고 수정하는 표준 완성형 데모입니다.",
    facts: ["전체 설정 편집", "표준 Nexus 런타임", "기능별 세부 검증"],
    badge: "FULL FIT",
  },
  {
    id: "giseong_instant_story",
    eyebrow: "INSTANT STORY RUNTIME",
    title: "기성학원 · 인스턴트 플레이",
    description: "윤지훈의 원소조작 설정으로 만든 Instant Story Runtime 전용 첫 실험작입니다.",
    facts: ["표준 사건·정사 엔진 없음", "시작 설정·예시·키워드 노트", "안전 문장 SSE 계약"],
    badge: "FAST",
  },
];

type InstantStorySnapshot = { project: unknown };

export function createDemoPreset(id: DemoPresetId): Project {
  if (id === "giseong_instant_story") {
    return normalizeProject((instantStorySnapshot as InstantStorySnapshot).project);
  }
  return demoProject();
}
