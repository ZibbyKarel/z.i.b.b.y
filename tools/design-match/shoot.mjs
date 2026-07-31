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
    // A route typed without a leading slash (`--route roadmap`) must not fuse
    // straight onto appBase into a malformed, silently-never-resolving URL
    // (`http://localhost:3000roadmap`) — normalise to exactly one separator.
    const route = options.route.startsWith("/") ? options.route : `/${options.route}`;
    const url = `${options.appBase ?? APP_BASE}${route}`;
    return { mode: masks.length > 0 ? "mask" : "route", url, selector: options.selector, masks };
  }
  throw new Error("design-match: chybí scéna — zadej --story <id> nebo --route <cesta>");
}

function boxesIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * A mask that resolves to nothing, or resolves entirely outside the shot, is
 * indistinguishable from no mask at all in the output — Playwright neither
 * draws anything nor complains. Both are the exact failure this tool exists to
 * eliminate: a pixel comparison that fails on non-deterministic content with no
 * visible cause. Fail loudly here instead of shipping a result that looks
 * authoritative and isn't.
 */
async function resolveMaskLocators(page, masks, targetBox) {
  const locators = [];
  for (const selector of masks) {
    const matches = await page.locator(selector).all();
    if (matches.length === 0) {
      throw new Error(`design-match: maska "${selector}" neodpovídá žádnému prvku`);
    }
    const boxes = await Promise.all(matches.map((match) => match.boundingBox()));
    const intersectsTarget = boxes.some((box) => box && boxesIntersect(box, targetBox));
    if (!intersectsTarget) {
      throw new Error(`design-match: maska "${selector}" leží mimo snímaný výřez`);
    }
    locators.push(page.locator(selector));
  }
  return locators;
}

export async function shootScene(page, scene, outPath) {
  // `networkidle` is a discouraged Playwright wait strategy in general — an SPA
  // that keeps polling in the background never goes idle — but it's low risk
  // against a local Storybook or Next dev server. Worth reconsidering if the
  // CLI ever points this at a route with ongoing background polling.
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
  const targetBox = await target.boundingBox();
  const mask = await resolveMaskLocators(page, scene.masks, targetBox);
  return target.screenshot({
    path: outPath,
    mask,
    // Without this, any CSS transition or animation (a hover/focus state, a
    // mount fade-in, a spinner) can be caught mid-frame, and the two sides of
    // a comparison land on different frames — a pixel delta naming no real
    // cause.
    animations: "disabled",
  });
}
