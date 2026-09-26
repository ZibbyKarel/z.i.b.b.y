import { describe, expect, it } from "vitest";
import {
  deleteKeyPath,
  extractKeyUsages,
  extractTranslatorBindings,
  flattenKeys,
  hasRawLiteralOccurrence,
  isKeyUsed,
  joinNamespace,
  mergeUsages,
  templateStaticPrefix,
} from "./prune-unused-keys.mjs";

describe("flattenKeys", () => {
  it("dot-joins nested leaf paths", () => {
    expect(flattenKeys({ a: { b: "1", c: "2" }, d: "3" }).sort()).toEqual(["a.b", "a.c", "d"]);
  });
});

describe("joinNamespace", () => {
  it("prefixes a key with its namespace", () => {
    expect(joinNamespace("gates", "decision_.approve")).toBe("gates.decision_.approve");
  });
  it("is a no-op for the root namespace", () => {
    expect(joinNamespace("", "back")).toBe("back");
  });
});

describe("templateStaticPrefix", () => {
  it("returns the text before the first interpolation", () => {
    expect(templateStaticPrefix("subtab.${section.id}.${tab.id}")).toBe("subtab.");
  });
  it("returns the whole string when there is no interpolation", () => {
    expect(templateStaticPrefix("plain")).toBe("plain");
  });
  it("returns the empty string when interpolation starts immediately", () => {
    expect(templateStaticPrefix("${key}")).toBe("");
  });
});

function idsAndNamespaces(bindings) {
  return bindings.map(({ id, namespace }) => ({ id, namespace }));
}

describe("extractTranslatorBindings", () => {
  it("binds an id to its useTranslations namespace", () => {
    const source = `const t = useTranslations("gates");`;
    expect(idsAndNamespaces(extractTranslatorBindings(source))).toEqual([
      { id: "t", namespace: "gates" },
    ]);
  });
  it("binds the zero-arg form to the root namespace", () => {
    const source = `const t = useTranslations();`;
    expect(idsAndNamespaces(extractTranslatorBindings(source))).toEqual([
      { id: "t", namespace: "" },
    ]);
  });
  it("finds multiple distinct bindings in one file", () => {
    const source = `
      const t = useTranslations("archive");
      const tRuns = useTranslations("runs");
    `;
    expect(idsAndNamespaces(extractTranslatorBindings(source))).toEqual([
      { id: "t", namespace: "archive" },
      { id: "tRuns", namespace: "runs" },
    ]);
  });
});

describe("extractKeyUsages", () => {
  it("records an exact key from a string-literal call", () => {
    const source = `const t = useTranslations("gates");\nt("decisionHint");`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.exactKeys.has("gates.decisionHint")).toBe(true);
  });

  it("records a namespace-qualified prefix from a template literal", () => {
    const source = `const t = useTranslations("shell");\nt(\`subtab.\${section.id}.\${tab.id}\`);`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.prefixes.has("shell.subtab")).toBe(true);
  });

  it("resolves both branches of a ternary argument without protecting the namespace", () => {
    // Real pattern (`ChatMessage`'s `ReadAloudButton`):
    // `t(isPlaying ? "readAloudStop" : "readAloud")`.
    const source = `const t = useTranslations("chat");\nt(isPlaying ? "readAloudStop" : "readAloud");`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.exactKeys.has("chat.readAloudStop")).toBe(true);
    expect(usage.exactKeys.has("chat.readAloud")).toBe(true);
    expect(usage.protectedNamespaces.has("chat")).toBe(false);
  });

  it("protects the whole namespace when the argument is a lookup-table indirection", () => {
    // Real pattern (`PipelineCard`): `t(STATE_LABEL_KEY[state])` — the actual
    // key can't be known statically at all.
    const source = `const t = useTranslations("pipelines");\nt(STATE_LABEL_KEY[state]);`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.protectedNamespaces.has("pipelines")).toBe(true);
  });

  it("does not treat a zero-argument call as a usage", () => {
    const source = `const t = useTranslations("pipelines");\nt();`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.protectedNamespaces.has("pipelines")).toBe(false);
  });

  it("protects the whole namespace when a template has no static prefix", () => {
    const source = `const t = useTranslations("dynamic");\nt(\`\${key}\`);`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.protectedNamespaces.has("dynamic")).toBe(true);
  });

  it("never protects the root namespace itself (that would protect everything)", () => {
    // Real pattern (`PopoverRow`): `const t = useTranslations(); … t(label)`
    // where `label: MessageKey` is a caller-supplied prop — fully dynamic, and
    // at the root scope, so "protect the whole namespace" would silently
    // protect the entire catalog and make the whole pruner a no-op.
    const source = `const t = useTranslations();\nt(label);`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.protectedNamespaces.has("")).toBe(false);
    expect(isKeyUsed("totally.unrelated.key", mergeUsages([usage]))).toBe(false);
  });

  it("falls back to a bare infix for an unbound identifier", () => {
    const source = `function Row({ t }) {\n  return t("label");\n}`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.bareSuffixes.has("label")).toBe(true);
  });

  it("resolves a bare template prefix at any depth, not just a suffix", () => {
    // Real pattern (`signalKindLabel`): `t` is typed via
    // `ReturnType<typeof useTranslations<"departments.handoff">>` (a type
    // annotation, not a `useTranslations(...)` call this tool parses), so the
    // binding looks unbound even though every call site is actually scoped
    // under `departments.handoff`.
    const source = `
      function signalKindLabel(kind, t) {
        return t(\`signalKind.\${kind.id}\`);
      }
    `;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.bareTemplateInfixes.has("signalKind")).toBe(true);
    expect(isKeyUsed("departments.handoff.signalKind.cve", mergeUsages([usage]))).toBe(true);
  });

  it("does NOT infix-match a bare literal suffix (only a template prefix may)", () => {
    // A bare literal fallback (`t("close")`) is usually a short, generic leaf
    // name — infix-matching it anywhere would over-protect wildly (every key
    // that happens to start with, or contain, "close." as a segment). Only
    // the suffix position is safe to protect for a plain literal.
    const source = `function Row({ t }) {\n  return t("close");\n}`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    const merged = mergeUsages([usage]);
    expect(isKeyUsed("dialog.close", merged)).toBe(true);
    expect(isKeyUsed("close.aria", merged)).toBe(false);
    expect(isKeyUsed("panel.close.confirm", merged)).toBe(false);
  });

  it("handles .rich/.has member calls the same as a direct call", () => {
    const source = `const t = useTranslations("common");\nt.rich("intro");\nt.has("flag");`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.exactKeys.has("common.intro")).toBe(true);
    expect(usage.exactKeys.has("common.flag")).toBe(true);
  });

  it("scopes each `const t = useTranslations(...)` to its own enclosing block", () => {
    // A file with several sibling components each rebind `t` to a different
    // namespace (e.g. apps/web/components/layout/AppShell/AppShell.tsx) — a
    // whole-file id→namespace map would let the last one win and silently
    // misattribute every earlier call.
    const source = `
      function NavRail() {
        const t = useTranslations("nav");
        return t("org");
      }
      function NeedsYouRail() {
        const t = useTranslations("shell");
        return t("needsYou");
      }
    `;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.exactKeys.has("nav.org")).toBe(true);
    expect(usage.exactKeys.has("shell.needsYou")).toBe(true);
    expect(usage.exactKeys.has("shell.org")).toBe(false);
    expect(usage.exactKeys.has("nav.needsYou")).toBe(false);
  });

  it("does not confuse a JS Set's .has() with a translator call", () => {
    // `seen` is never bound via useTranslations, so this becomes a bare-suffix
    // "usage" of the literal key "x" — over-protective, never under-protective.
    const source = `const seen = new Set();\nseen.has("x");`;
    const usage = extractKeyUsages(source, extractTranslatorBindings(source));
    expect(usage.exactKeys.size).toBe(0);
  });
});

describe("isKeyUsed", () => {
  const usage = mergeUsages([
    {
      exactKeys: new Set(["gates.decisionHint"]),
      prefixes: new Set(["shell.subtab"]),
      protectedNamespaces: new Set(["dynamic"]),
      bareSuffixes: new Set(["label"]),
      bareTemplateInfixes: new Set(),
    },
  ]);

  it("matches an exact key", () => {
    expect(isKeyUsed("gates.decisionHint", usage)).toBe(true);
  });
  it("matches anything under a used prefix", () => {
    expect(isKeyUsed("shell.subtab.org.map", usage)).toBe(true);
  });
  it("matches anything in a fully protected namespace", () => {
    expect(isKeyUsed("dynamic.anything.deep", usage)).toBe(true);
  });
  it("a fully protected root namespace protects the entire catalog", () => {
    // The root scope (`useTranslations()`, namespace "") isn't a "\"\".foo"
    // prefix over the catalog — it spans everything.
    const rootProtected = mergeUsages([
      {
        exactKeys: new Set(),
        prefixes: new Set(),
        protectedNamespaces: new Set([""]),
        bareSuffixes: new Set(),
        bareTemplateInfixes: new Set(),
      },
    ]);
    expect(isKeyUsed("anything.at.all", rootProtected)).toBe(true);
  });
  it("matches a bare suffix at any depth", () => {
    expect(isKeyUsed("some.nested.label", usage)).toBe(true);
    expect(isKeyUsed("label", usage)).toBe(true);
  });
  it("reports an unrelated key as unused", () => {
    expect(isKeyUsed("totally.unused.key", usage)).toBe(false);
  });
});

describe("deleteKeyPath", () => {
  it("removes a leaf key", () => {
    const catalog = { a: { b: "1", c: "2" } };
    deleteKeyPath(catalog, "a.b");
    expect(catalog).toEqual({ a: { c: "2" } });
  });
  it("prunes an object left empty by the deletion", () => {
    const catalog = { a: { b: "1" }, d: "2" };
    deleteKeyPath(catalog, "a.b");
    expect(catalog).toEqual({ d: "2" });
  });
  it("is a no-op for an already-missing path", () => {
    const catalog = { a: { b: "1" } };
    deleteKeyPath(catalog, "a.missing.deep");
    expect(catalog).toEqual({ a: { b: "1" } });
  });
});

describe("hasRawLiteralOccurrence", () => {
  it("finds a full dotted key stored as plain data, outside any call", () => {
    // Real pattern (`healthPresentation.ts`'s `DEPARTMENT_LABEL`): a
    // `Record<X, MessageKey>` whose values are full catalog paths, resolved
    // by a `t()` call nowhere near the literal.
    const source = `
      export const DEPARTMENT_LABEL = {
        backend: "overview.departmentBackend",
      };
    `;
    expect(hasRawLiteralOccurrence("overview.departmentBackend", source)).toBe(true);
    expect(hasRawLiteralOccurrence("overview.departmentVault", source)).toBe(false);
  });

  it("matches single-quoted literals too", () => {
    const source = `const x = 'overview.departmentVault';`;
    expect(hasRawLiteralOccurrence("overview.departmentVault", source)).toBe(true);
  });
});
