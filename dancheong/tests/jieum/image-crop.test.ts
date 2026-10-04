import test from "node:test";
import assert from "node:assert/strict";
import { imageDrawRect, maximumImageZoom, moveCropPosition } from "../../features/jieum/image-crop";

test("세로 이미지는 처음에 세로 전체와 좌우 여백을 보여준다", () => {
  assert.deepEqual(imageDrawRect(800, 1600, 1, { x: 0.5, y: 0.5 }), { dx: 392, dy: 0, dw: 304, dh: 608 });
});

test("긴 가로 이미지는 처음에 가로 전체와 위아래 여백을 보여준다", () => {
  assert.deepEqual(imageDrawRect(2000, 500, 1, { x: 0.5, y: 0.5 }), { dx: 0, dy: 168, dw: 1088, dh: 272 });
});

test("확대 후 드래그는 이미지 가장자리에서 멈춘다", () => {
  const moved = moveCropPosition(800, 1600, 4, { x: 0.5, y: 0.5 }, 20, -20);
  assert.deepEqual(moved, { x: 0, y: 1 });
  const draw = imageDrawRect(800, 1600, 4, moved);
  assert.equal(draw.dx, 0);
  assert.equal(draw.dy + draw.dh, 608);
});

test("극단적인 세로·가로 비율도 프레임을 채울 만큼 확대할 수 있다", () => {
  const portrait = imageDrawRect(500, 2000, maximumImageZoom(500, 2000), { x: 0.5, y: 0.5 });
  const panorama = imageDrawRect(3000, 500, maximumImageZoom(3000, 500), { x: 0.5, y: 0.5 });
  assert.ok(portrait.dw > 1088 && portrait.dh > 608);
  assert.ok(panorama.dw > 1088 && panorama.dh > 608);
});
