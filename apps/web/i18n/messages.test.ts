import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_CATEGORIES } from "../state/config";

/**
 * Catalog parity + enum-key coverage.
 *
 * The next-intl `AppConfig` augmentation (see `global.d.ts`) type-checks every
 * key against `en.json` only. These tests close the two gaps the compiler can't
 * see at all:
 *   1. **Locale drift** — other locales (cs) must hold exactly the same leaf
 *      keys as the reference (en): no missing, no extra.
 *   2. **Enum-driven keys** — keys built dynamically from a runtime list (e.g.
 *      `agents.categories.<id>`) must resolve in *every* locale. typecheck
 *      already guarantees `en` completeness for these (the source id is a typed
 *      union validated against the catalog), so parity carries it to cs — but
 *      we assert it directly too, as the explicit contract for context keys.
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

  describe.each(locales)("enum-driven keys resolve in %s", (locale) => {
    const keys = new Set(leafKeys(catalogs[locale] ?? {}));

    it("every AGENT_CATEGORIES id has an agents.categories.<id> entry", () => {
      const missing = AGENT_CATEGORIES.filter((c) => !keys.has(`agents.categories.${c}`));
      expect(missing).toEqual([]);
    });
  });
});
