import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/jhyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const portraitImage = { name: "portrait.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="#d64132"/></svg>') };
const landscapeImage = { name: "landscape.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="500"><rect width="2000" height="500" fill="#2768cf"/></svg>') };
fs.mkdirSync("outputs/jieum-image-crop", { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => route.fulfill({ json: route.request().url().match(/\/(account|device-owner)(\?|$)/) ? { authenticated: true, id: "crop-qa", email: "crop@example.test", displayName: "검수", role: "USER", storageMode: "account" } : { projects: [], sessions: [], works: [] } }));
  await page.goto("http://127.0.0.1:4185/jieum");
  await page.locator(".loading-studio").waitFor({ state: "hidden" });
  await page.locator(".studio-sidebar button").filter({ has: page.locator("b", { hasText: /^캐릭터$/ }) }).click();
  const characterFile = page.locator('input[type="file"][accept="image/*"]').first();
  await characterFile.setInputFiles(portraitImage);
  const dialog = page.getByRole("dialog", { name: "사용할 영역 선택" });
  await dialog.waitFor();
  const canvas = dialog.locator("canvas"), slider = dialog.getByRole("slider", { name: "이미지 확대" });
  await page.waitForFunction(() => document.querySelector(".crop-stage")?.classList.contains("ready"));
  const sample = (x, y) => canvas.evaluate((element, point) => Array.from(element.getContext("2d").getImageData(point.x, point.y, 1, 1).data), { x, y });
  assert.deepEqual(await sample(20, 304), [139, 142, 140, 255], "Portrait starts with a left margin");
  assert.deepEqual(await sample(544, 304), [214, 65, 50, 255], "Portrait starts fully visible in the center");
  await dialog.getByRole("button", { name: "취소" }).click();
  await dialog.waitFor({ state: "hidden" });

  await characterFile.setInputFiles(landscapeImage);
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector(".crop-stage")?.classList.contains("ready"));
  assert.deepEqual(await sample(544, 20), [139, 142, 140, 255], "Landscape starts with a top margin");
  assert.deepEqual(await sample(544, 304), [39, 104, 207, 255], "Landscape starts fully visible in the center");
  const before = await canvas.evaluate((element) => element.toDataURL());
  await slider.fill("2.5");
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 45, { steps: 5 });
  await page.mouse.up();
  const after = await canvas.evaluate((element) => element.toDataURL());
  assert.notEqual(after, before, "Zoom and drag must change the selected pixels");
  await page.screenshot({ path: "outputs/jieum-image-crop/character-desktop.png" });
  await dialog.getByRole("button", { name: "이 영역 사용" }).click();
  const stored = page.locator(".instant-image-grid img").first();
  await stored.waitFor();
  assert.deepEqual(await stored.evaluate(async (element) => { const blob = await fetch(element.src).then((response) => response.blob()); const bitmap = await createImageBitmap(blob); return { width: bitmap.width, height: bitmap.height, type: blob.type }; }), { width: 1088, height: 608, type: "image/webp" });

  await page.locator(".studio-sidebar button").filter({ has: page.locator("b", { hasText: /^사건$/ }) }).click();
  await page.getByRole("button", { name: "장면 이미지", exact: true }).click();
  await page.getByRole("button", { name: "＋ 이미지 추가", exact: true }).click();
  await page.getByLabel("장면 이미지 첨부").setInputFiles(portraitImage);
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector(".crop-stage")?.classList.contains("ready"));
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const dialogBox = await dialog.boundingBox();
  assert.ok(dialogBox && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390);
  await page.screenshot({ path: "outputs/jieum-image-crop/scene-mobile.png" });
  await dialog.getByRole("button", { name: "이 영역 사용" }).click();
  const scene = page.locator(".scene-image-editor figure img").first();
  await scene.waitFor();
  assert.deepEqual(await scene.evaluate(async (element) => { const blob = await fetch(element.src).then((response) => response.blob()); const bitmap = await createImageBitmap(blob); return { width: bitmap.width, height: bitmap.height }; }), { width: 1088, height: 608 });
  assert.deepEqual(errors, []);
  console.log("Portrait/landscape contain-first previews, zoom, drag, 1088x608 output, desktop and mobile layout OK");
} finally {
  await browser.close();
}
