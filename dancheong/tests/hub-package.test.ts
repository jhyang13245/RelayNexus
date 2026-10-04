import assert from "node:assert/strict";
import test from "node:test";

import {
  installedHubProject,
  validateHubPackageBytes,
} from "../lib/hub-package";
import { downloadHubCoverFile } from "../lib/hub-cover-install";

test("Chronos Core Hub 작품은 한글 패키지의 sourceProjectId로 설치 상태를 찾는다", () => {
  const project = {
    sourceProjectId: "CHRONOS_CORE_MASTER_V180",
    title: "크로노스 코어",
  };
  assert.equal(installedHubProject([project], {
    slug: "chronos-core",
    title: "Chronos Core",
    packageVersion: "1.5",
  }), project);
});

test("Hub ZIP은 시그니처·크기·SHA-256을 모두 검증한다", async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  await validateHubPackageBytes(bytes.buffer, {
    slug: "chronos-core",
    title: "Chronos Core",
    packageVersion: "1.5",
    packageBytes: bytes.byteLength,
    packageSha256: sha256,
  });
  await assert.rejects(
    validateHubPackageBytes(new Uint8Array([1, 2, 3, 4]).buffer, {
      slug: "chronos-core",
      title: "Chronos Core",
      packageVersion: "1.5",
    }),
    /ZIP 패키지 대신 손상된 응답/u,
  );
});

test("Hub 표지는 프로젝트 가져오기에 전달할 검증된 이미지 파일로 변환한다", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(
      input instanceof Request ? input.url : new URL(String(input), "https://nexus.example"),
      init,
    );
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/webp" },
    });
  };
  try {
    const cover = await downloadHubCoverFile("/api/hub/works/chronos-core/cover", "Chronos Core");
    assert.equal(cover.name, "Chronos Core-cover.webp");
    assert.equal(cover.type, "image/webp");
    assert.equal(cover.size, 3);
    assert.equal(request?.cache, "force-cache");
    assert.equal(request?.headers.get("cache-control"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
