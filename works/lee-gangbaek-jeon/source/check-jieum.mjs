// Opens 지음 on the local server, imports the work JSON through the real UI and captures screens.
// Usage: node check-jieum.mjs <origin> <workJson> <outDir>
import { chromium } from "playwright-core";
const [origin, jsonPath, outDir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const logs = [];
page.on("pageerror", (e) => logs.push("pageerror " + e.message));
page.on("dialog", (d) => d.accept());
await page.goto(origin + "/jieum", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const b64 = (await import("node:fs")).readFileSync(jsonPath).toString("base64");
await page.evaluate(async ({ b64, name }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const input = document.querySelector('input[type=file][accept=".zip,.json,.md,.txt"]');
  const key = Object.keys(input).find((k) => k.startsWith("__reactProps"));
  input[key].onChange({ target: { files: [new File([bytes], name, { type: "application/json" })], value: "" } });
}, { b64, name: jsonPath.split("/").pop() });
const skip = page.getByRole("button", { name: "저장하지 않고 불러오기" });
if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click();
await page.getByText("작업 JSON을 불러왔습니다").waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/jieum-1-dashboard.png` });
const nav = async (label) => { await page.locator("nav.studio-nav").getByText(label, { exact: false }).first().click(); await page.waitForTimeout(1200); };
await nav("사건"); await page.screenshot({ path: `${outDir}/jieum-2-story.png` });
await nav("도입부"); await page.screenshot({ path: `${outDir}/jieum-3-direction.png` });
await nav("검증"); await page.waitForTimeout(1500); await page.screenshot({ path: `${outDir}/jieum-4-export.png` });
const exportText = await page.locator("main").innerText().catch(() => "");
console.log(JSON.stringify({ ready: /패키지를 만들 준비가 되었습니다/.test(exportText), errorsLine: (exportText.match(/수정할 항목 \d+개/) || [""])[0], logs }, null, 2));
await browser.close();
