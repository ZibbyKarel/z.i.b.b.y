import { chromium } from "/home/user/z.i.b.b.y/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url"; import path from "node:path";
const url = pathToFileURL(path.resolve("scratchpad/orb-preview/index.html")).href;
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport:{width:1280,height:800} });
await page.goto(url); await page.waitForTimeout(2100);
await page.evaluate(()=>window.setMode("error")); await page.waitForTimeout(1600);
await page.screenshot({path:"scratchpad/orb-preview/t3-error-clean.png"});
await b.close(); console.log("done");
