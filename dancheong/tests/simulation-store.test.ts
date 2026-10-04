import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEVICE_OWNER_COOKIE,
  deviceOwnerKeyFromCookieHeader,
  toProjectSummary,
} from "../lib/simulation-store";

test("v1.5.4 저장 API는 로그인 계정 UUID 소유권을 요구한다", () => {
  const source = readFileSync(
    new URL("../lib/simulation-store.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /requireAccountContext/u);
  assert.doesNotMatch(source, /return resolveLibraryOwnerKey\(\)/u);
});

test("기존 공용 자료 귀속은 MASTER 계정에서 일회성 마이그레이션으로 처리한다", () => {
  const source = readFileSync(new URL("../lib/account-store.ts", import.meta.url), "utf8");
  assert.match(source, /relay_account_migrations/u);
  for (const table of ["scenario_projects", "simulation_sessions", "package_uploads", "project_thumbnails", "cost_meter_turns"]) {
    assert.match(source, new RegExp(`UPDATE ${table} SET owner_key = \\? WHERE`, "u"));
  }
});

test("향후 개인 보관함 복귀를 위해 기존 기기 쿠키 파서는 보존한다", () => {
  const token = "da3c2048-20ad-4c84-9837-38d540cf490d";
  assert.equal(
    deviceOwnerKeyFromCookieHeader(
      `theme=dark; ${DEVICE_OWNER_COOKIE}=${token}; sample=1`,
    ),
    `device:${token}`,
  );
  assert.equal(
    deviceOwnerKeyFromCookieHeader(`${DEVICE_OWNER_COOKIE}=not-a-device-token`),
    null,
  );
});

test("다른 쿠키만 있는 요청은 공개 기기 보관함 소유자로 인정하지 않는다", () => {
  assert.equal(deviceOwnerKeyFromCookieHeader("theme=dark; sample=1"), null);
  assert.equal(deviceOwnerKeyFromCookieHeader(null), null);
});

test("온라인 작품 썸네일이 있으면 캐시 버전이 포함된 선택 목록 URL을 만든다", () => {
  const project = toProjectSummary({
    id: "project with space",
    source_project_id: "source-1",
    title: "썸네일 작품",
    genre: "릴레이 소설",
    player_name: "한시우",
    package_version: "1",
    session_count: 2,
    r2_key: "scenario.zip",
    thumbnail_r2_key: "thumbnail.jpg",
    thumbnail_updated_at: "2026-08-15T18:30:00+09:00",
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
  });

  assert.equal(
    project.thumbnailUrl,
    "/api/projects/project%20with%20space/thumbnail?v=2026-08-15T18%3A30%3A00%2B09%3A00",
  );
});

test("온라인 작품 썸네일이 없으면 기존 글자 표지를 유지한다", () => {
  const project = toProjectSummary({
    id: "project-1",
    source_project_id: "source-1",
    title: "기본 표지 작품",
    genre: "릴레이 소설",
    player_name: "한시우",
    package_version: "1",
    session_count: 1,
    r2_key: "scenario.zip",
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
  });

  assert.equal(project.thumbnailUrl, undefined);
});
