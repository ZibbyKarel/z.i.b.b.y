import { chromium } from "/home/user/z.i.b.b.y/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
const url = pathToFileURL(path.resolve("scratchpad/orb-preview/index.html")).href;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type()==="error") console.log("PAGE ERR:", m.text()); });
await page.goto(url);
await page.waitForTimeout(2200); // let reveal (1.5s) finish
await page.screenshot({ path: "scratchpad/orb-preview/t2-idle.png" });
await page.evaluate(() => window.setMode("thinking"));
await page.waitForTimeout(1500);
await page.screenshot({ path: "scratchpad/orb-preview/t2-thinking.png" });
await browser.close();
console.log("done");
