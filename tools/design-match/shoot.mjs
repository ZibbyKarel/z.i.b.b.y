export const STORYBOOK_BASE = "http://localhost:6006";
export const APP_BASE = "http://localhost:3000";

export function storybookUrl(storyId, base = STORYBOOK_BASE) {
  return `${base}/iframe.html?id=${storyId}&viewMode=story`;
}

/**
 * Scene selection follows the spec's C → A → B preference: an isolated story
 * where the unit can stand alone, a seeded route where page composition is the
 * thing under test, masking only where state cannot be made deterministic.
 */
export function resolveScene(options) {
  const masks = options.masks ?? [];
  if (options.story) {
    return { mode: "story", url: storybookUrl(options.story), selector: options.selector, masks };
  }
  if (options.route) {
    const url = `${options.appBase ?? APP_BASE}${options.route}`;
    return { mode: masks.length > 0 ? "mask" : "route", url, selector: options.selector, masks };
  }
  throw new Error("design-match: chybí scéna — zadej --story <id> nebo --route <cesta>");
}

export async function shootScene(page, scene, outPath) {
  await page.goto(scene.url, { waitUntil: "networkidle" });
  // `document.fonts.ready` resolves to a FontFaceSet, which Playwright then has
  // to serialize back across the protocol boundary. A FontFaceSet isn't a plain
  // object, so evaluate doesn't throw — it silently coerces the result to `{}`,
  // discarding the value while still paying the serialization cost. Awaiting the
  // promise inside the page and returning nothing gets the actual effect (wait
  // for fonts) without the pointless round trip.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const target = page.locator(scene.selector).first();
  await target.waitFor({ state: "visible" });
  return target.screenshot({
    path: outPath,
    mask: scene.masks.map((selector) => page.locator(selector)),
  });
}
