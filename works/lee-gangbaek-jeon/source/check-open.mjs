import { chromium } from "playwright-core";
const [origin, cookie, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const [name, value] = cookie.split("=");
await ctx.addCookies([{ name, value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict" }]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", d => d.accept());
await page.goto(origin + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(2000);
await page.getByText("내 서재").first().click().catch(() => {}); await page.waitForTimeout(2000);
await page.locator("text=이강백전").first().click(); await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/reader-3-open.png` });
let t = await page.locator("body").innerText(); console.log("step1:", t.slice(0, 400).replace(/\n+/g, " | "));
const start = page.getByRole("button", { name: /시작|읽기|새 이야기|이어/ }).first();
if (await start.isVisible().catch(() => false)) { console.log("click:", await start.innerText()); await start.click(); await page.waitForTimeout(8000); }
await page.screenshot({ path: `${out}/reader-4-prologue.png` });
t = await page.locator("body").innerText(); console.log("prologue shown:", t.includes("갑진년 동짓달"), "| has 마교 잔당:", t.includes("마교 잔당의 소행"));
for (const f of page.frames()) { try { const ft = await f.locator("body").innerText({ timeout: 2000 }); if (ft.includes("갑진년")) console.log("frame has prologue:", f.url().slice(0, 80)); } catch {} }
console.log("errors", errors.slice(0, 5));
await browser.close();
