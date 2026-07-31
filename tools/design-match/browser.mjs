import { chromium } from "@playwright/test";

export const VIEWPORT = { width: 1440, height: 900 };
export const DEVICE_SCALE_FACTOR = 2;

/**
 * One place that owns viewport and DPR, so the design side and the app side can
 * never drift apart — a mixed DPR silently poisons every pixel comparison.
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
  } finally {
    await browser.close();
  }
}
