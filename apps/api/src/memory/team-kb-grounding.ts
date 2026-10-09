import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import { envelopeInbound } from "../shared/text/untrusted-envelope";

/** Per-file char cap — the grounding block rides argv and is tail-truncated at 8000. */
const FILE_CAP = 1500;
const KB_FILES = ["team-context.md", path.join("wiki", "INDEX.md")];

/**
 * Read `rel` under `root` without ever following a symlink (any path component) or
 * escaping the root. `null` for missing / unreadable / refused. Read-only.
 */
async function readSafe(root: string, rel: string): Promise<string | null> {
  let current = root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return null;
  }
  const withSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!current.startsWith(withSep)) return null;
  const stat = await fs.lstat(current);
  if (!stat.isFile()) return null;
  return fs.readFile(current, "utf8");
}

/** True when the file has at least one non-empty, non-heading line (not just a template). */
function hasContent(text: string): boolean {
  return text.split("\n").some((l) => l.trim() !== "" && !l.trim().startsWith("#"));
}

/**
 * Body of the `### Team knowledge base (...)` grounding section — `team-context.md`
 * and `wiki/INDEX.md`, each capped and wrapped in the untrusted-data envelope (Law 4:
 * KB content is external). `null` when there is nothing worth grounding or on any
 * error (fail-open).
 */
export async function composeTeamKbSection(
  source: KnowledgeBaseSource,
): Promise<{ title: string; body: string } | null> {
  try {
    const root = path.resolve(source.path);
    const parts: string[] = [];
    for (const rel of KB_FILES) {
      const text = await readSafe(root, rel).catch(() => null);
      if (!text || !hasContent(text)) continue;
      parts.push(
        `#### ${rel.split(path.sep).join("/")}`,
        envelopeInbound(text.slice(0, FILE_CAP)),
        "",
      );
    }
    if (parts.length === 0) return null;
    parts.push("More is searchable with the `search_team_kb` / `read_team_kb_note` tools.");
    return { title: `Team knowledge base (${path.basename(root)})`, body: parts.join("\n") };
  } catch {
    return null;
  }
}
