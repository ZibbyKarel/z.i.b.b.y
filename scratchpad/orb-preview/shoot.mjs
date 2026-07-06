import { chromium } from "/home/user/z.i.b.b.y/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url"; import path from "node:path";
const url = pathToFileURL(path.resolve("scratchpad/orb-preview/index.html")).href;
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport:{width:1280,height:800} });
page.on("pageerror",e=>console.log("PAGEERROR:",e.message));
await page.goto(url); await page.waitForTimeout(2100);
async function shot(mode, name, extra){ await page.evaluate(m=>window.setMode(m), mode); if(extra) await extra(); await page.waitForTimeout(1000); await page.screenshot({path:`scratchpad/orb-preview/${name}.png`}); }
await shot("listening","t3-listening");
await shot("thinking","t3-thinking");
await shot("streaming","t3-streaming", async()=>{ for(let i=0;i<12;i++){ await page.evaluate(()=>window.pump()); await page.waitForTimeout(50);} });
// completion flash: go idle then flash, capture quickly
await page.evaluate(()=>window.setMode("idle")); await page.evaluate(()=>window.flash()); await page.waitForTimeout(250);
await page.screenshot({path:"scratchpad/orb-preview/t3-doneflash.png"});
await shot("error","t3-error");
await b.close(); console.log("done");
