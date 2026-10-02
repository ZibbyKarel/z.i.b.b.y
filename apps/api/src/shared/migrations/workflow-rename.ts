import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * One-shot, idempotent data migration for the "pipeline" → "workflow" rename.
 *
 * Runs at API boot (see `main.ts`) BEFORE any Nest module reads the data root.
 * Steps, each safe to re-run after an interruption (the marker is written last):
 *
 *  1. `pipelines/` → `workflows/` (merged, runs/ and assets/ included).
 *  2. `workflows/*.pipeline.md` → `*.workflow.md`.
 *  3. Frontmatter of `workflows/*.workflow.md` and `goals/*.goal.md` — only the
 *     known keys/values (`type: pipeline`, `kind: pipeline`, `pipeline:`, `pipelineId:`).
 *  4. Persisted JSON / JSONL — known KEYS (`pipelineRunId`, `pipelineId`, …) and
 *     exact known VALUES (`kind|type|… : "pipeline"`, `"pipeline-stage"`,
 *     `"pipeline-started"`, …) are rewritten. Free text (summaries, prompts, logs,
 *     artifact bodies) is never string-replaced.
 *  5. The `AUTO:PIPELINES` markers of the generated self-knowledge note.
 *
 * `roadmap/`, `vault/`, skills, agents and credential dirs are never touched.
 */

export const MIGRATION_MARKER = ".workflow-rename.done";

/** Keys whose exact value `pipeline` / `pipeline-<x>` is an enum value, not prose. */
const ENUM_KEYS = new Set([
  "kind",
  "type",
  "targetKind",
  "makerKind",
  "actorKind",
  "entityKind",
  "ownerKind",
]);

/** Top-level dirs the JSON walk never enters. */
const SKIP_DIRS = new Set([
  "roadmap",
  "vault",
  "skills",
  "agents",
  "hooks",
  "commands",
  "mcp-servers",
  "mcp-credentials",
  "credentials",
  "project-secrets",
  "node_modules",
  ".git",
]);

export interface WorkflowRenameResult {
  /** True when the marker already existed (nothing was done). */
  skipped: boolean;
  /** Files whose content was rewritten. */
  rewritten: number;
  /** Entries moved/renamed (dir merge + `*.pipeline.md`). */
  moved: number;
}

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false,
  );

async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}

/** Moves `src` into `dst`, merging directories; never overwrites an existing file. */
async function mergeDir(src: string, dst: string): Promise<number> {
  if (!(await exists(dst))) {
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    return 1;
  }
  let moved = 0;
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dst, ent.name);
    if (!(await exists(to))) {
      await fs.rename(from, to);
      moved++;
    } else if (ent.isDirectory() && (await fs.stat(to)).isDirectory()) {
      moved += await mergeDir(from, to);
    }
    // else: both sides have the file — keep the new one, leave the old in place.
  }
  await fs.rmdir(src).catch(() => undefined); // only succeeds when fully merged
  return moved;
}

/** `pipeline` / `pipeline-stage` / `pipeline-started` → `workflow…` (exact enum values only). */
function renameEnumValue(v: string): string {
  return v === "pipeline" || v.startsWith("pipeline-")
    ? `workflow${v.slice("pipeline".length)}`
    : v;
}

function renameKey(key: string, inActivityView: boolean): string {
  const m = /^pipeline(RunIds?|Ids?)$/.exec(key);
  if (m) return `workflow${m[1]}`;
  if (inActivityView && key === "pipelines") return "workflows";
  return key;
}

/** Deep-rewrites known keys/values; returns the (possibly new) value. */
function rewriteValue(value: unknown, activityView: boolean, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => rewriteValue(v, activityView, parentKey));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[renameKey(k, activityView)] = rewriteValue(v, activityView, k);
    }
    return out;
  }
  if (typeof value === "string") {
    if (parentKey && ENUM_KEYS.has(parentKey)) return renameEnumValue(value);
    // A JSON document stored as a string (e.g. an approval's `detail`).
    if (parentKey === "detail" && value.startsWith("{")) {
      try {
        const inner: unknown = JSON.parse(value);
        const next = JSON.stringify(rewriteValue(inner, activityView));
        return next === JSON.stringify(inner) ? value : next;
      } catch {
        return value;
      }
    }
  }
  return value;
}

async function rewriteJsonFile(file: string): Promise<boolean> {
  const raw = await fs.readFile(file, "utf8");
  if (!/pipeline/.test(raw)) return false;
  const base = path.basename(file);
  if (file.endsWith(".jsonl")) {
    let changed = false;
    const lines = raw.split("\n").map((line) => {
      if (!/pipeline/.test(line)) return line;
      try {
        const parsed: unknown = JSON.parse(line);
        const next = JSON.stringify(rewriteValue(parsed, false));
        if (next === JSON.stringify(parsed)) return line;
        changed = true;
        return next;
      } catch {
        return line; // not JSON (free text) — leave byte-for-byte
      }
    });
    if (changed) await writeAtomic(file, lines.join("\n"));
    return changed;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const next = rewriteValue(parsed, base === "activity-view.json");
  if (JSON.stringify(next) === JSON.stringify(parsed)) return false;
  const pretty = /^\s*[{[]\s*\n/.test(raw);
  const text =
    JSON.stringify(next, null, pretty ? 2 : undefined) + (raw.endsWith("\n") ? "\n" : "");
  await writeAtomic(file, text);
  return true;
}

async function walkJson(
  dir: string,
  rel: string,
  depth: number,
  visit: (f: string) => Promise<void>,
) {
  if (depth > 6) return;
  let ents;
  try {
    ents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const isRuns = rel === "workflows/runs";
  for (const ent of ents) {
    const full = path.join(dir, ent.name);
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) && depth === 0) continue;
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      if (isRuns) {
        // A run dir holds a project workspace: only its `run.json` aggregate is ours.
        const agg = path.join(full, "run.json");
        if (await exists(agg)) await visit(agg);
        continue;
      }
      await walkJson(full, childRel, depth + 1, visit);
    } else if (ent.isFile() && /\.jsonl?$/.test(ent.name)) {
      await visit(full);
    }
  }
}

/** Frontmatter-only rewrite of the known keys/values. */
function rewriteFrontmatter(text: string): string {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(text);
  if (!m) return text;
  const fm = (m[2] ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(
          /^(\s*(?:-\s+)?(?:kind|type|targetKind|makerKind):\s*)(["']?)pipeline\2(\s*)$/,
          "$1$2workflow$2$3",
        )
        .replace(/^(\s*(?:-\s+)?)pipeline(Id|RunId)?(\s*:)/, "$1workflow$2$3"),
    )
    .join("\n");
  return `${m[1]}${fm}${m[3]}${text.slice(m[0].length)}`;
}

async function rewriteMarkdownFrontmatter(file: string): Promise<boolean> {
  const raw = await fs.readFile(file, "utf8");
  const next = rewriteFrontmatter(raw);
  if (next === raw) return false;
  await writeAtomic(file, next);
  return true;
}

export async function migrateWorkflowRename(
  root: string,
  log: (msg: string) => void = () => undefined,
): Promise<WorkflowRenameResult> {
  const marker = path.join(root, MIGRATION_MARKER);
  if (await exists(marker)) return { skipped: true, rewritten: 0, moved: 0 };
  if (!(await exists(root))) return { skipped: true, rewritten: 0, moved: 0 };

  let moved = 0;
  let rewritten = 0;

  // 1. pipelines/ → workflows/
  const oldDir = path.join(root, "pipelines");
  const newDir = path.join(root, "workflows");
  if (await exists(oldDir)) moved += await mergeDir(oldDir, newDir);

  // 2. *.pipeline.md → *.workflow.md
  if (await exists(newDir)) {
    for (const name of await fs.readdir(newDir)) {
      if (!name.endsWith(".pipeline.md")) continue;
      const to = path.join(newDir, name.replace(/\.pipeline\.md$/, ".workflow.md"));
      if (await exists(to)) continue; // the new file wins; leave the old one
      await fs.rename(path.join(newDir, name), to);
      moved++;
    }
    // 3a. workflow definitions' frontmatter
    for (const name of await fs.readdir(newDir)) {
      if (
        name.endsWith(".workflow.md") &&
        (await rewriteMarkdownFrontmatter(path.join(newDir, name)))
      ) {
        rewritten++;
      }
    }
  }
  // 3b. goals' frontmatter (maker.kind)
  const goalsDir = path.join(root, "goals");
  if (await exists(goalsDir)) {
    for (const name of await fs.readdir(goalsDir)) {
      if (
        name.endsWith(".goal.md") &&
        (await rewriteMarkdownFrontmatter(path.join(goalsDir, name)))
      ) {
        rewritten++;
      }
    }
  }

  // 4. JSON / JSONL
  await walkJson(root, "", 0, async (f) => {
    if (await rewriteJsonFile(f)) rewritten++;
  });

  // 5. generated self-knowledge markers
  const sk = path.join(root, "vault", "knowledge", "self-knowledge.md");
  if (await exists(sk)) {
    const raw = await fs.readFile(sk, "utf8");
    const next = raw.replace(/<!-- AUTO:PIPELINES:(START|END) -->/g, "<!-- AUTO:WORKFLOWS:$1 -->");
    if (next !== raw) {
      await writeAtomic(sk, next);
      rewritten++;
    }
  }

  await writeAtomic(marker, `${new Date().toISOString()}\n`);
  log(`workflow-rename migration done: moved ${moved}, rewrote ${rewritten} file(s)`);
  return { skipped: false, rewritten, moved };
}
