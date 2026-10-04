import assert from "node:assert/strict";
import test from "node:test";
import { groupHubRevisionProjects, hubRevisionIdentity, hubRevisionProjectId, isSameHubWork, latestInstalledHubRevision, newestInstalledRevisionProject, uniqueHubRevisionWork } from "../lib/hub-revision";

const work = { slug: "fate-seoul", title: "Fate/Seoul", packageVersion: "1.5", sourceProjectId: "fate-source", currentRevision: 2 };
test("덧칠 키는 형식 버전과 독립적이며 복원 후에도 작품과 덧칠을 식별한다", () => {
  const first = hubRevisionProjectId({ ...work, currentRevision: 1 });
  const second = hubRevisionProjectId(work);
  assert.notEqual(first, second);
  assert.deepEqual(hubRevisionIdentity(second), { slug: work.slug, revision: 2 });
  assert.equal(hubRevisionIdentity("cortex-import-fate-source"), null);
  assert.throws(() => hubRevisionProjectId({ ...work, currentRevision: undefined }));
});
test("동명 작품이나 source ID가 같아도 다른 출간작의 덧칠과 결합하지 않는다", () => {
  assert.equal(isSameHubWork({ id: "unrelated" }, work), false);
  assert.equal(isSameHubWork({ id: hubRevisionProjectId({ ...work, slug: "other" }), sourceProjectId: "fate-source" }, work), false);
  assert.equal(isSameHubWork({ id: "cortex-import-fate-source" }, work), true);
  assert.equal(uniqueHubRevisionWork({ id: "cortex-import-fate-source" }, [work, { ...work, slug: "other-publication" }]), undefined);
});
test("최신 설치 확인은 구 덧칠을 최신으로 취급하지 않는다", () => {
  const old = { id: hubRevisionProjectId({ ...work, currentRevision: 1 }) };
  const latest = { id: hubRevisionProjectId(work) };
  assert.equal(latestInstalledHubRevision([old], work), undefined);
  assert.equal(latestInstalledHubRevision([old, latest], work), latest);
});

test("설치된 덧칠 중 가장 높은 리비전을 버전명 입력 없이 기본 선택한다", () => {
  const first = { id: hubRevisionProjectId({ ...work, currentRevision: 1 }) };
  const third = { id: hubRevisionProjectId({ ...work, currentRevision: 3 }) };
  const second = { id: hubRevisionProjectId({ ...work, currentRevision: 2 }) };
  assert.equal(newestInstalledRevisionProject([first, third, second]), third);

  const legacy = { id: "cortex-import-fate-source" };
  assert.equal(newestInstalledRevisionProject([first, legacy], project => project === legacy ? 4 : null), legacy);
  assert.equal(newestInstalledRevisionProject([legacy, first], () => null), first);
});

test("한 출간작의 여러 덧칠은 표지 하나로 묶되 설치 키는 보존한다", () => {
  const projects = [1,2,3].map(currentRevision => ({ id: hubRevisionProjectId({ ...work, currentRevision }), title: work.title }));
  const original = JSON.stringify(projects);
  const groups = groupHubRevisionProjects(projects, [work]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].projects.map(p => p.id), projects.map(p => p.id));
  assert.equal(groups[0].work, work);
  assert.equal(groupHubRevisionProjects(projects, []).length, 1, "목록 조회 실패에도 알려진 작품별 묶음 유지");
  assert.equal(JSON.stringify(projects), original);
});

test("기존 설치는 고유 출간작에만 묶고 동명·모호한 작품은 독립 표지로 둔다", () => {
  const legacy = { id: "cortex-import-fate-source", title: work.title };
  const v2 = { id: hubRevisionProjectId(work), title: work.title };
  const unrelated = { id: "manual-copy", title: work.title };
  assert.equal(groupHubRevisionProjects([legacy,v2,unrelated],[work]).length, 2);
  assert.equal(groupHubRevisionProjects([legacy,v2,unrelated],[work,{ ...work, slug:"another" }]).length, 3);
  assert.equal(groupHubRevisionProjects([v2,{...v2,id:hubRevisionProjectId({...work,slug:"another"})}],[work]).length, 2);
});
