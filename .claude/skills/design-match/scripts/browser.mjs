import { chromium } from "@playwright/test";
import { translatePlaywrightError } from "./errors.mjs";

export const VIEWPORT = { width: 1440, height: 900 };
export const DEVICE_SCALE_FACTOR = 2;

/**
 * One place that owns viewport and DPR, so the design side and the app side can
 * never drift apart — a mixed DPR silently poisons every pixel comparison.
 *
 * It is also the tool's ONE translation boundary for operator-caused Playwright
 * failures (see errors.mjs for why there is exactly one). This module is the
 * only importer of `@playwright/test` in the tool, and `browser`/`page`/`locator`
 * exist nowhere but inside `fn` — so every Playwright call design-match makes is
 * inside this `try` by construction, including the ones nobody has written yet.
 * That is what the four per-call translators could not promise: each covered the
 * call site it was written beside, and the failure came back at the next one.
 *
 * `chromium.launch()` is deliberately outside: a browser that will not start is
 * an environment fault whose stack is the diagnostic, not an operator's mistake
 * with a remedy.
 */
export async function withPage(fn) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    const page = await context.newPage();
    return await fn(page);
  } catch (error) {
    throw translatePlaywrightError(error);
  } finally {
    await browser.close();
  }
}
