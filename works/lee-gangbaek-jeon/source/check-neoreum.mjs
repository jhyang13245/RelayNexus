import { chromium } from "playwright-core";
const [origin, cookie, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const [name, value] = cookie.split("=");
await ctx.addCookies([{ name, value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict" }]);
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
for (const [path, file] of [["/neoreum", "neoreum-1-console.png"], ["/neoreum/works/lee-gangbaek-jeon", "neoreum-2-work.png"], ["/neoreum/manage/lee-gangbaek-jeon", "neoreum-3-manage.png"], ["/", "home-hub.png"]]) {
  await page.goto(origin + path, { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${file}` });
  const text = await page.locator("body").innerText();
  console.log(path, "| 이강백전:", text.includes("이강백전"), "| 李江白傳:", text.includes("李江白傳"));
}
console.log("errors", errors.slice(0, 3));
await browser.close();
