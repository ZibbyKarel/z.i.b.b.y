import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Catalog parity.
 *
 * The next-intl `AppConfig` augmentation (see `global.d.ts`) type-checks every
 * key against `en.json` only. This test closes the gap the compiler can't see:
 * **locale drift** — other locales (cs) must hold exactly the same leaf keys as
 * the reference (en): no missing, no extra.
 *
 * (Agent categories used to be an enum with `agents.categories.<id>` keys; they
 * are now a dynamic, untranslated taxonomy from the API, so there is no longer
 * an enum-driven key set to assert here.)
 */

const MESSAGES_DIR = new URL("./messages/", import.meta.url);
const REFERENCE = "en";

type Catalog = Record<string, unknown>;

function loadCatalogs(): Record<string, Catalog> {
  const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
  return Object.fromEntries(
    files.map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(readFileSync(new URL(f, MESSAGES_DIR), "utf8")) as Catalog,
    ]),
  );
}

/** Flatten a (possibly nested) catalog to the set of dotted leaf-key paths. */
function leafKeys(obj: Catalog, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object"
      ? leafKeys(value as Catalog, path)
      : [path];
  });
}

const catalogs = loadCatalogs();
const locales = Object.keys(catalogs);
const referenceKeys = new Set(leafKeys(catalogs[REFERENCE] ?? {}));

describe("translation catalogs", () => {
  it("discovers the reference locale plus at least one more", () => {
    expect(locales).toContain(REFERENCE);
    expect(locales.length).toBeGreaterThan(1);
  });

  describe.each(locales.filter((l) => l !== REFERENCE))("%s vs en", (locale) => {
    const keys = new Set(leafKeys(catalogs[locale] ?? {}));

    it(`${locale}.json has no missing keys`, () => {
      const missing = [...referenceKeys].filter((k) => !keys.has(k)).sort();
      expect(missing).toEqual([]);
    });

    it(`${locale}.json has no extra keys`, () => {
      const extra = [...keys].filter((k) => !referenceKeys.has(k)).sort();
      expect(extra).toEqual([]);
    });
  });
});
