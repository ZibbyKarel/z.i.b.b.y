import { chromium } from "/home/user/z.i.b.b.y/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url"; import path from "node:path";
const url = pathToFileURL(path.resolve("scratchpad/orb-preview/index.html")).href;
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport:{width:1280,height:800} });
page.on("pageerror",e=>console.log("PAGEERROR:",e.message));
await page.goto(url); await page.waitForTimeout(2600);
await page.screenshot({path:"scratchpad/orb-preview/t4-constellation.png"});
await b.close(); console.log("done");
