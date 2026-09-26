#!/usr/bin/env node
/**
 * i18n dead-key pruner (ZB-13). Finds keys in `apps/web/i18n/messages/{cs,en}.json`
 * that no source under `apps/web` references, and removes them.
 *
 * Dry-run by default (prints the list); `--apply` writes both catalogs.
 *
 * Detection strategy — deliberately conservative (a false "keep" just leaves a
 * dead key behind for the next pass; a false "prune" silently breaks a live
 * string, which is much worse):
 *
 * 1. `useTranslations(<literal-or-nothing>)` assigned to a `const <id>` binds
 *    `id` to a namespace (or the root namespace, for the zero-arg form) for the
 *    rest of that file.
 * 2. Every `id(...)` / `id.rich(...)` / `id.markup(...)` / `id.has(...)` /
 *    `id.raw(...)` call in that file is a usage of that namespace:
 *      - a string-literal argument marks that exact key used;
 *      - a template-literal argument (`t(\`subtab.${x}\`)`) marks every key
 *        under the literal's static prefix as used — anything after the first
 *        `${` is a runtime value, so the whole subtree from that prefix down
 *        is protected;
 *      - a template literal with NO static prefix (starts with `${`) can't be
 *        narrowed at all — the *entire namespace* is protected instead of
 *        guessing;
 *      - any other non-literal first argument (a ternary — `t(cond ? "a" :
 *        "b")`, see `ChatMessage`'s `ReadAloudButton` — or a lookup-table
 *        indirection — `t(STATE_LABEL_KEY[state])`, see `PipelineCard`) has
 *        every string literal found anywhere inside it marked used; if the
 *        expression contains no literal at all (a pure lookup), the *entire
 *        namespace* is protected instead of guessing.
 * 3. A call whose translator identifier was never bound by a local
 *    `useTranslations` in that file — either a genuine untyped prop (`t`
 *    received as a prop), or one only bound through a *type* annotation
 *    (`t: ReturnType<typeof useTranslations<"departments.handoff">>`, a real
 *    pattern — see `signalKindLabel`) that this regex-based tool doesn't
 *    parse — can't be namespace-resolved. Its literal (or, for a template, its
 *    static prefix) is protected as a *bare infix*: any catalog key equal to
 *    it, or containing it as a `.`-delimited segment anywhere in the path
 *    (leading, trailing or in the middle), is kept. This is the same "when in
 *    doubt, keep it" bias, just without a namespace to anchor the match to.
 * 4. Finally, as a last safety net independent of all of the above: a key that
 *    survives every step above as "unused" is still kept if its full dotted
 *    path appears verbatim as a quoted string literal *anywhere* in the
 *    scanned sources — not just inside a translator call. Catches a key
 *    stored as plain data and resolved through an indirection this tool can't
 *    trace at all (a `Record<X, MessageKey>` built with full paths as its
 *    values — see `DEPARTMENT_LABEL` in `healthPresentation.ts` — consumed by
 *    a `t()` call nowhere near the literal).
 *
 * Usage:
 *   node tools/i18n/prune-unused-keys.mjs           # dry run — prints the plan
 *   node tools/i18n/prune-unused-keys.mjs --apply    # writes cs.json + en.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");
const CATALOGS = {
  cs: join(WEB_ROOT, "i18n/messages/cs.json"),
  en: join(WEB_ROOT, "i18n/messages/en.json"),
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested directly — see prune-unused-keys.test.mjs)
// ---------------------------------------------------------------------------

/** Flattens a nested message catalog into dot-joined leaf key paths. */
export function flattenKeys(catalog, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

/** `joinNamespace("gates", "decision_.approve")` → `"gates.decision_.approve"`;
 * an empty namespace (the zero-arg `useTranslations()` root scope) is a no-op. */
export function joinNamespace(namespace, key) {
  return namespace ? `${namespace}.${key}` : key;
}

const TRANSLATOR_BINDING_RE =
  /\bconst\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:(["'])((?:\\.|(?!\2).)*)\2)?\s*\)/g;

/**
 * Finds every `const <id> = useTranslations(<ns>?)` (or `getTranslations`)
 * binding in a source file. Returns `{ id, namespace, start, end }[]` —
 * `namespace` is `""` for the zero-arg root-scope form, and `[start, end)` is
 * the binding's lexical scope (the enclosing block the `const` sits in, found
 * by brace-depth matching): a file with several components each doing
 * `const t = useTranslations(...)` rebinds `t` per component, not per file.
 */
export function extractTranslatorBindings(source) {
  const bindings = [];
  for (const match of source.matchAll(TRANSLATOR_BINDING_RE)) {
    const [, id, , namespace] = match;
    const start = match.index + match[0].length;
    const end = findEnclosingBlockEnd(source, start);
    bindings.push({ id, namespace: namespace ?? "", start, end });
  }
  return bindings;
}

/**
 * Scans forward from `fromIndex` and returns the index of the first
 * unmatched `}` — i.e. where the block containing `fromIndex` closes.
 * Skips over string/template literal contents and comments so braces inside
 * them (JSX text, object-shaped strings, `${}` interpolations) don't throw
 * off the count. Returns `source.length` for a binding at the top level
 * (module scope) that's never closed by a `}`.
 */
function findEnclosingBlockEnd(source, fromIndex) {
  let depth = 0;
  for (let i = fromIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const close = findQuoteClose(source, i, ch);
      i = close === -1 ? source.length : close;
      continue;
    }
    if (ch === "`") {
      const close = findTemplateClose(source, i);
      i = close === -1 ? source.length : close;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      i = close === -1 ? source.length : close + 1;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return source.length;
}

/** Picks the innermost binding for `id` whose scope contains `pos` (the
 * position of a call site), or `undefined` if `id` was never bound in scope
 * there (e.g. a `t` received as a prop). */
function resolveBinding(bindings, id, pos) {
  let best;
  for (const b of bindings) {
    if (b.id !== id) continue;
    if (pos < b.start || pos >= b.end) continue;
    if (!best || b.start > best.start) best = b;
  }
  return best;
}

/**
 * Splits a template literal's raw contents (without the surrounding
 * backticks) into its leading static prefix — the text before the first
 * `${`, or the whole thing if there's no interpolation at all.
 */
export function templateStaticPrefix(raw) {
  const i = raw.indexOf("${");
  return i === -1 ? raw : raw.slice(0, i);
}

/**
 * Scans `source` for calls into the given translator bindings and returns the
 * usage facts needed to decide which catalog keys are still referenced.
 *
 * - `exactKeys`: fully-qualified keys used with a string-literal argument.
 * - `prefixes`: fully-qualified prefixes used with a template-literal
 *   argument that has a non-empty static lead-in — every key starting with
 *   `prefix + "."` (or equal to the prefix with its trailing dot stripped) is
 *   protected.
 * - `protectedNamespaces`: namespaces that had at least one call this
 *   function couldn't narrow (a bare `${...}` template, or a non-literal
 *   argument) — every key in that namespace is protected.
 * - `bareSuffixes`: literal keys used through an identifier this file never
 *   bound via `useTranslations` (e.g. `t` received as a prop) — any catalog
 *   key equal to one, or ending in `.<suffix>`, is protected. Suffix-only,
 *   deliberately: a bare literal here is usually a short, generic leaf name,
 *   and infix-matching it anywhere in the path would over-protect wildly.
 * - `bareTemplateInfixes`: template-literal static prefixes used the same
 *   unbound way — any catalog key equal to one, or containing one as a
 *   `.`-delimited path segment *anywhere* (leading, trailing or mid-path),
 *   is protected. Infix, not suffix-only: unlike a bare literal, a template
 *   prefix is a qualified, multi-role sub-path (see `signalKindLabel`, whose
 *   `t` is resolved from a *type* annotation this tool doesn't parse, so
 *   `signalKind.${kind.id}` looks unbound even though it's always used under
 *   the `departments.handoff` namespace) — specific enough that matching it
 *   at any depth is safe.
 */
export function extractKeyUsages(source, bindings) {
  const exactKeys = new Set();
  const prefixes = new Set();
  const protectedNamespaces = new Set();
  // Two different "unbound identifier" fallbacks, deliberately not merged:
  // a *plain literal* fallback (`t("label")`) is usually a short, generic
  // leaf name — matching it as an infix anywhere in the catalog (not just the
  // leaf position) would protect huge unrelated swathes of it (e.g. "close"
  // shows up as the last segment of dozens of real keys, but also happens to
  // be a plausible *first* segment of some hypothetically unrelated one).
  // Suffix-only is the narrow, safe match for this case. A *template-literal
  // prefix* fallback (`t(\`signalKind.${x}\`)`) is a qualified, multi-role
  // sub-path (see `signalKindLabel`) — specific enough that infix matching
  // (leading, trailing or mid-path) is safe and necessary to catch it.
  const bareSuffixes = new Set();
  const bareTemplateInfixes = new Set();

  // Any identifier that looks like a translator call (`t(`, `t.rich(`, …) —
  // including ones this file never bound itself (props/hooks from elsewhere).
  // The trailing `(\s*)` (no lookahead on the next char) also matches a call
  // whose first argument isn't a literal at all, e.g. a lookup-table
  // indirection like `t(STATE_LABEL_KEY[state])`.
  const callRe = /\b(\w+)(?:\.(?:rich|markup|has|raw))?\(\s*/g;

  for (const match of source.matchAll(callRe)) {
    const [whole, id] = match;
    const startOfArg = match.index + whole.length; // index of the argument's first char
    const binding = resolveBinding(bindings, id, match.index);
    const namespace = binding?.namespace;
    const quote = /["'`]/.test(source[startOfArg]) ? source[startOfArg] : undefined;

    if (quote === undefined) {
      if (source[startOfArg] === ")") continue; // `id()` — nothing to use
      // A non-literal first argument: still look for string literals inside
      // it (a ternary — `t(isPlaying ? "readAloudStop" : "readAloud")`, a real
      // pattern in this codebase, see `ChatMessage`'s `ReadAloudButton` — is
      // fully resolvable this way). Only a genuine lookup-table indirection
      // with no literal anywhere in the expression (`t(STATE_LABEL_KEY[s])`)
      // falls back to protecting the whole namespace.
      const argEnd = findArgumentEnd(source, startOfArg);
      const argText = source.slice(startOfArg, argEnd);
      const literals = extractStringLiterals(argText);
      if (literals.length === 0) {
        // The root namespace ("" — `useTranslations()`) spans the *entire*
        // catalog, so protecting it here would make the whole run a no-op
        // (a real case: `PopoverRow`'s `t(label)`, `label: MessageKey` handed
        // down as a prop). Treat it the same as an unresolved identifier —
        // no information, so no protection, rather than over-protecting
        // everything.
        if (namespace) protectedNamespaces.add(namespace);
        continue;
      }
      for (const literal of literals) {
        if (namespace !== undefined) exactKeys.add(joinNamespace(namespace, literal));
        else bareSuffixes.add(literal);
      }
      continue;
    }

    if (quote === "`") {
      const close = findTemplateClose(source, startOfArg);
      if (close === -1) continue;
      const raw = source.slice(startOfArg + 1, close);
      const prefix = templateStaticPrefix(raw);
      if (prefix === "") {
        // No static lead-in at all — can't narrow, protect the whole
        // namespace, except the root namespace itself (see the identical
        // reasoning above — protecting "" would protect everything).
        if (namespace) protectedNamespaces.add(namespace);
        continue;
      }
      const trimmed = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
      if (namespace !== undefined) {
        prefixes.add(joinNamespace(namespace, trimmed));
      } else {
        bareTemplateInfixes.add(trimmed);
      }
    } else {
      const close = findQuoteClose(source, startOfArg, quote);
      if (close === -1) continue;
      const literal = source.slice(startOfArg + 1, close).replace(/\\(.)/g, "$1");
      if (namespace !== undefined) {
        exactKeys.add(joinNamespace(namespace, literal));
      } else {
        bareSuffixes.add(literal);
      }
    }
  }

  return { exactKeys, prefixes, protectedNamespaces, bareSuffixes, bareTemplateInfixes };
}

/**
 * Finds the end of a call's first argument, starting at its first character:
 * the first top-level (depth-0) `,` or `)`, skipping over nested
 * parens/brackets/braces and string/template contents so a nested call,
 * array, object or ternary doesn't end the scan early.
 */
function findArgumentEnd(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const close = findQuoteClose(source, i, ch);
      i = close === -1 ? source.length : close;
      continue;
    }
    if (ch === "`") {
      const close = findTemplateClose(source, i);
      i = close === -1 ? source.length : close;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return i;
      depth--;
    } else if (ch === "," && depth === 0) {
      return i;
    }
  }
  return source.length;
}

/** Every quoted string literal found anywhere inside `text` (e.g. both
 * branches of a ternary), unescaped. Doesn't recurse into template literals —
 * next-intl keys through a ternary are always plain strings in this codebase. */
function extractStringLiterals(text) {
  const out = [];
  const re = /(["'])((?:\\.|(?!\1).)*)\1/g;
  for (const m of text.matchAll(re)) out.push(m[2].replace(/\\(.)/g, "$1"));
  return out;
}

/** Finds the index of the unescaped closing quote matching `quoteChar`,
 * starting the search just after `openIndex`. */
function findQuoteClose(source, openIndex, quoteChar) {
  for (let i = openIndex + 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === quoteChar) return i;
    if (source[i] === "\n") return -1; // string literals don't span lines
  }
  return -1;
}

/** Finds the index of the unescaped closing backtick for a template literal
 * starting at `openIndex`, tolerating `${...}` interpolations (including
 * nested braces) in between. */
function findTemplateClose(source, openIndex) {
  let depth = 0;
  for (let i = openIndex + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (depth === 0 && ch === "`") return i;
    if (ch === "$" && source[i + 1] === "{") {
      depth++;
      i++;
      continue;
    }
    if (depth > 0) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
  }
  return -1;
}

/** True if `key` is protected by any of the usage facts gathered above. */
export function isKeyUsed(key, usage) {
  if (usage.exactKeys.has(key)) return true;
  for (const ns of usage.protectedNamespaces) {
    // The root namespace ("" — the zero-arg `useTranslations()` form) spans
    // the *entire* catalog, not a `"".<key>` prefix (which would never match
    // anything real and silently defeat the protection).
    if (ns === "") return true;
    if (key === ns || key.startsWith(`${ns}.`)) return true;
  }
  for (const prefix of usage.prefixes) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return true;
  }
  for (const suffix of usage.bareSuffixes) {
    if (key === suffix || key.endsWith(`.${suffix}`)) return true;
  }
  for (const infix of usage.bareTemplateInfixes) {
    if (
      key === infix ||
      key.startsWith(`${infix}.`) ||
      key.endsWith(`.${infix}`) ||
      key.includes(`.${infix}.`)
    ) {
      return true;
    }
  }
  return false;
}

/** Merges several per-file usage results into one aggregate. */
export function mergeUsages(usages) {
  const merged = {
    exactKeys: new Set(),
    prefixes: new Set(),
    protectedNamespaces: new Set(),
    bareSuffixes: new Set(),
    bareTemplateInfixes: new Set(),
  };
  for (const usage of usages) {
    for (const k of usage.exactKeys) merged.exactKeys.add(k);
    for (const k of usage.prefixes) merged.prefixes.add(k);
    for (const k of usage.protectedNamespaces) merged.protectedNamespaces.add(k);
    for (const k of usage.bareSuffixes) merged.bareSuffixes.add(k);
    for (const k of usage.bareTemplateInfixes) merged.bareTemplateInfixes.add(k);
  }
  return merged;
}

/** Deletes a dot-joined key path from a nested catalog object in place, then
 * prunes any object left empty by the deletion. */
export function deleteKeyPath(catalog, keyPath) {
  const parts = keyPath.split(".");
  const stack = [catalog];
  for (let i = 0; i < parts.length - 1; i++) {
    const next = stack[stack.length - 1][parts[i]];
    if (!next || typeof next !== "object") return; // already gone
    stack.push(next);
  }
  delete stack[stack.length - 1][parts[parts.length - 1]];
  // Walk back up, dropping objects that are now empty.
  for (let i = stack.length - 1; i > 0; i--) {
    if (Object.keys(stack[i]).length === 0) {
      delete stack[i - 1][parts[i - 1]];
    } else {
      break;
    }
  }
}

/**
 * Last-resort safety net: does `key`'s full dotted path appear verbatim as a
 * quoted string literal (single or double quotes) anywhere in `source` — not
 * necessarily inside a translator call at all? Catches a key stored as plain
 * data (`DEPARTMENT_LABEL`'s `Record<X, MessageKey>` in
 * `healthPresentation.ts`) and resolved through an indirection this tool
 * can't trace.
 */
export function hasRawLiteralOccurrence(key, source) {
  return source.includes(`"${key}"`) || source.includes(`'${key}'`);
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "out"]);

/** Recursively lists every `.ts`/`.tsx` file under `root`. */
export function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes("--apply");

  const files = listSourceFiles(WEB_ROOT);
  const sources = files.map((file) => readFileSync(file, "utf8"));

  const usages = sources.map((source) => {
    const bindings = extractTranslatorBindings(source);
    return extractKeyUsages(source, bindings);
  });
  const usage = mergeUsages(usages);

  const en = JSON.parse(readFileSync(CATALOGS.en, "utf8"));
  const cs = JSON.parse(readFileSync(CATALOGS.cs, "utf8"));
  const allKeys = new Set([...flattenKeys(en), ...flattenKeys(cs)]);

  const unused = [...allKeys]
    .filter((key) => !isKeyUsed(key, usage))
    .filter((key) => !sources.some((source) => hasRawLiteralOccurrence(key, source)))
    .sort();

  if (unused.length === 0) {
    console.log("[i18n prune] no unused keys found.");
    return;
  }

  console.log(`[i18n prune] ${unused.length} unused key(s):`);
  for (const key of unused) console.log(`  ${key}`);

  if (!apply) {
    console.log("\n[i18n prune] dry run only — pass --apply to write both catalogs.");
    return;
  }

  for (const key of unused) {
    deleteKeyPath(en, key);
    deleteKeyPath(cs, key);
  }
  writeFileSync(CATALOGS.en, `${JSON.stringify(en, null, 2)}\n`);
  writeFileSync(CATALOGS.cs, `${JSON.stringify(cs, null, 2)}\n`);
  console.log(`\n[i18n prune] removed ${unused.length} key(s) from cs.json and en.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
