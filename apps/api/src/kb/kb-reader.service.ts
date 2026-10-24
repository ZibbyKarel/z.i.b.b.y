import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import type {
  KnowledgeBaseSource,
  MemoryGraph,
  TeamKbDigest,
  TeamKbDigestItem,
} from "@zibby/contracts";
import matter from "gray-matter";
import { tokenize } from "../tasks/keyword-scorer";

/**
 * One search result over a team's knowledge base. `path` is always
 * repo-relative to the knowledge-base root (forward-slash-joined) — never an
 * absolute host path, so a hit never leaks the operator's filesystem layout
 * into model context or a citation.
 */
export interface KbHit {
  readonly noteId: string;
  readonly title: string;
  readonly path: string;
  readonly snippet: string;
}

/** The full (budget-capped) body of one note, returned by `read()`. */
export interface KbNote {
  readonly path: string;
  readonly title: string;
  readonly body: string;
}

/** One markdown note in the read-only browser list. */
export interface KbNoteSummary {
  readonly id: string;
  readonly title: string;
  readonly folder: string;
}

/** One note opened by repo-relative path: capped body plus raw wikilink targets. */
export interface KbNoteView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly links: string[];
}

/** Per-line budget (chars) for {@link KbReaderService.tailLines}. */
export const KB_LINE_MAX_CHARS = 300;

/** Snippet budget (chars) — a search hit never floods a prompt. */
export const KB_SNIPPET_MAX_CHARS = 500;
/** Note-body budget (chars) for `read()` — one huge note can't flood a run. */
export const KB_BODY_MAX_CHARS = 4000;
/** Label budget (chars) for a graph node title. */
export const KB_GRAPH_LABEL_MAX_CHARS = 120;
/** Appended to a body truncated at {@link KB_BODY_MAX_CHARS} — a visible marker. */
const TRUNCATION_MARKER = "\n\n…[truncated]";

const WIKI_DIR = "wiki";
const WIKI_INDEX_REL = "wiki/INDEX.md";
const TEAM_CONTEXT_REL = "team-context.md";
const WIKILINK = /\[\[([^\]]+)\]\]/g;

/** Default `limit` for `search()` when the caller doesn't pass one. */
const DEFAULT_SEARCH_LIMIT = 10;

/** One file discovered by {@link KbReaderService.walk}, already containment- and symlink-checked. */
interface KbEntry {
  /** Repo-relative path, forward-slash-joined (e.g. "wiki/notes/partner-portal.md"). */
  relPath: string;
  /** Absolute path — guaranteed to live inside the KB root, never a symlink. */
  absPath: string;
  /** Lookup id for `read()` — the basename without extension, mirroring `VaultService`. */
  id: string;
  isVtt: boolean;
}

/** A fully-parsed KB entry, ready to be scored/snippeted. */
interface ScannedNote extends KbEntry {
  title: string;
  frontmatter: Record<string, unknown>;
  /** "" for `.vtt` — those are indexed by filename only, never parsed. */
  body: string;
  links: string[];
}

/** Max items per digest list. */
export const KB_DIGEST_MAX_ITEMS = 30;

const QUESTION_HEADINGS = new Set([
  "open questions",
  "open question",
  "otevřené otázky",
  "otázky",
  "questions",
  "open items",
  "otevřené body",
  "registr otevřených otázek",
]);
const DECISION_HEADINGS = new Set([
  "decisions",
  "decision",
  "agreements",
  "rozhodnutí",
  "dohody",
  "dohodnuto",
]);
const HEADING_LINE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_LINE = /^(?:[-*+]|\d+[.)])\s+(.*)$/;
const CHECKED_TASK = /^\[[xX]\](?:\s|$)/;
const OPEN_TASK = /^\[ \](?:\s|$)/;

/**
 * Pure section parser for the team-KB digest: top-level list items under
 * "open questions" / "decisions" style headings (any level; a section runs to
 * the next heading of the same or higher level). Checked tasks, nested and
 * empty items are skipped; text is capped at {@link KB_LINE_MAX_CHARS}.
 */
export function extractDigestSections(body: string): { questions: string[]; decisions: string[] } {
  const out = { questions: [] as string[], decisions: [] as string[] };
  let kind: "questions" | "decisions" | null = null;
  let level = 0;
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      const lvl = heading[1]?.length ?? 0;
      const name = (heading[2] ?? "").trim().replace(/:$/, "").trim().toLowerCase();
      if (QUESTION_HEADINGS.has(name)) {
        kind = "questions";
        level = lvl;
      } else if (DECISION_HEADINGS.has(name)) {
        kind = "decisions";
        level = lvl;
      } else if (kind !== null && lvl <= level) {
        kind = null;
      }
      continue;
    }
    if (kind === null) continue;
    const item = LIST_LINE.exec(line);
    if (!item) continue;
    let text = (item[1] ?? "").trim();
    if (CHECKED_TASK.test(text)) continue;
    if (OPEN_TASK.test(text)) text = text.slice(3).trim();
    if (text.length === 0) continue;
    out[kind].push(text.slice(0, KB_LINE_MAX_CHARS));
  }
  return out;
}

/**
 * A frontmatter `date` — falling back to `last_compiled`, which compiled KB notes carry instead —
 * as a string (a YAML-parsed Date is ISO-formatted, date part only).
 */
function dateOf(frontmatter: Record<string, unknown>): string | undefined {
  return dateValue(frontmatter.date) ?? dateValue(frontmatter.last_compiled);
}

function dateValue(raw: unknown): string | undefined {
  if (raw instanceof Date)
    return Number.isNaN(raw.getTime()) ? undefined : raw.toISOString().slice(0, 10);
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** A frontmatter `tags` value, filtered down to actual strings (tolerant of foreign data). */
function tagsOf(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags;
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
}

/** A frontmatter `aliases` value, same tolerance posture as {@link tagsOf}. */
function aliasesOf(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.aliases;
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
}

/** Wikilink targets (`[[target]]`, `[[target|alias]]`, `[[target#x]]`) in a note body. */
function extractLinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(WIKILINK)) {
    const target = m[1]?.split("|")[0]?.split("#")[0]?.trim();
    if (target) out.add(target);
  }
  return [...out];
}

/**
 * `KnowledgeBaseSource` is a discriminated union today with a single member —
 * `kind: "vault"` — but a future `confluence` member won't be a filesystem
 * path at all. This switch's `never`-typed default keeps that future addition
 * from silently treating a non-vault source as a directory: it fails soft.
 */
function rootPathOf(source: KnowledgeBaseSource): string | null {
  switch (source.kind) {
    case "vault":
      return source.path;
    default: {
      const _exhaustive: never = source.kind;
      return _exhaustive;
    }
  }
}

/**
 * Containment check, the `resolveSafeFile` shape
 * (`apps/api/src/shared/file-storage/file-utils.ts:56-66`): `candidate` (an
 * already `path.resolve`d path) must be the root itself or live strictly
 * beneath it.
 */
function isWithinRoot(root: string, candidate: string): boolean {
  const withSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate === root || candidate.startsWith(withSep);
}

/**
 * Pure, filesystem-level, read-only reader over ONE team knowledge-base root.
 * No Nest request context, no MCP, no multi-team scoping — Task 7 wraps this.
 *
 * Never writes: no `fs.writeFile`/`mkdir`/`rename`/`unlink`/`appendFile`
 * anywhere in this file. A missing, unreadable, or non-directory root — or a
 * future non-vault source kind — yields `[]`/`null`, never a throw: a
 * misconfigured team KB must never break a run.
 */
@Injectable()
export class KbReaderService {
  async search(
    source: KnowledgeBaseSource,
    query: string,
    limit = DEFAULT_SEARCH_LIMIT,
  ): Promise<KbHit[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const notes = await this.scan(source);
    if (notes.length === 0) return [];

    const scored = notes
      .map((note, index) => ({ note, index, score: this.score(note, terms) }))
      .filter((s) => s.score > 0)
      // Index-first order is already baked into `notes` (scan() sorts it); the
      // explicit `index` tiebreak keeps that ordering self-documenting instead
      // of leaning on `Array.sort`'s stability alone.
      .sort((a, b) => b.score - a.score || a.index - b.index);

    return scored.slice(0, Math.max(0, limit)).map((s) => ({
      noteId: s.note.id,
      title: s.note.title,
      path: s.note.relPath,
      snippet: this.snippetFor(s.note, terms),
    }));
  }

  async read(source: KnowledgeBaseSource, noteId: string): Promise<KbNote | null> {
    const notes = await this.scan(source);
    // `.vtt` sources are raw verbatim transcripts of real people speaking —
    // never parsed, and never handed back through `read()` either.
    const found = notes.find((n) => n.id === noteId && !n.isVtt);
    if (!found) return null;
    return { path: found.relPath, title: found.title, body: this.capBody(found.body) };
  }

  /**
   * Markdown notes for the read-only KB browser: `.vtt` transcripts and
   * `_templates/` are excluded (same filter as {@link graph}). `id` is the
   * repo-relative path, `folder` its top-level directory ("" at the root).
   */
  async notes(source: KnowledgeBaseSource): Promise<KbNoteSummary[]> {
    return (await this.browsable(source)).map((n) => ({
      id: n.relPath,
      title: n.title,
      folder: n.relPath.includes("/") ? (n.relPath.split("/")[0] ?? "") : "",
    }));
  }

  /**
   * One note by repo-relative path — the browser's open-note call. Goes through
   * the same walk-validated scan as every other read (containment + symlink
   * refusal), so the path is only ever MATCHED against walked entries, never
   * resolved on disk: `..`, absolute paths, templates, `.vtt` and symlinks all
   * simply don't match and yield null.
   */
  async readPath(source: KnowledgeBaseSource, relPath: string): Promise<KbNoteView | null> {
    const found = await this.findByPath(source, relPath);
    if (!found) return null;
    return {
      id: found.relPath,
      title: found.title,
      body: this.capBody(found.body),
      links: found.links,
    };
  }

  /**
   * The last `count` non-empty, non-heading, non-comment lines of a note (uncapped by the body budget — a
   * log's newest entries are at its END), each trimmed and capped at
   * {@link KB_LINE_MAX_CHARS}. [] when the note is missing.
   */
  async tailLines(source: KnowledgeBaseSource, relPath: string, count: number): Promise<string[]> {
    const found = await this.findByPath(source, relPath);
    if (!found) return [];
    return (
      found.body
        .split("\n")
        .map((l) => l.trim())
        // Headings and HTML comments are the log's preamble, not entries.
        .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("<!--"))
        .slice(-Math.max(0, count))
        .map((l) => l.slice(0, KB_LINE_MAX_CHARS))
    );
  }

  /**
   * Open questions and agreements lifted from the meeting-note sections of the
   * browsable notes. Newest-dated notes first, undated after (noteId desc);
   * items keep document order within a note; each list capped at
   * {@link KB_DIGEST_MAX_ITEMS}. Fails soft to empty lists.
   */
  async digest(source: KnowledgeBaseSource): Promise<TeamKbDigest> {
    const notes = (await this.browsable(source)).map((n) => ({
      note: n,
      date: dateOf(n.frontmatter),
    }));
    notes.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return a.note.relPath < b.note.relPath ? 1 : a.note.relPath > b.note.relPath ? -1 : 0;
    });
    const questions: TeamKbDigestItem[] = [];
    const decisions: TeamKbDigestItem[] = [];
    for (const { note, date } of notes) {
      const sections = extractDigestSections(note.body);
      const toItem = (text: string): TeamKbDigestItem => ({
        text,
        noteId: note.relPath,
        noteTitle: note.title,
        ...(date ? { date } : {}),
      });
      questions.push(...sections.questions.map(toItem));
      decisions.push(...sections.decisions.map(toItem));
    }
    return {
      questions: questions.slice(0, KB_DIGEST_MAX_ITEMS),
      decisions: decisions.slice(0, KB_DIGEST_MAX_ITEMS),
    };
  }

  private async browsable(source: KnowledgeBaseSource): Promise<ScannedNote[]> {
    return (await this.scan(source)).filter(
      (n) => !n.isVtt && !n.relPath.startsWith("_templates/"),
    );
  }

  private async findByPath(
    source: KnowledgeBaseSource,
    relPath: string,
  ): Promise<ScannedNote | null> {
    // Cheap pre-filter; the real guarantee is that only walked entries can match.
    if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes("..")) return null;
    return (await this.browsable(source)).find((n) => n.relPath === relPath) ?? null;
  }

  /**
   * The wiki-link graph of the KB's markdown notes (`.vtt` transcripts are not
   * nodes). Node id = repo-relative path (unique), label = title capped at
   * {@link KB_GRAPH_LABEL_MAX_CHARS}. A `[[target]]` resolves by basename id or
   * by extensionless relative path; unresolved/self links are dropped.
   * Same containment/symlink chokepoint as every other read here.
   */
  async graph(source: KnowledgeBaseSource): Promise<MemoryGraph> {
    // Templates (`_templates/`) are scaffolding, not knowledge — keep them off the graph.
    const notes = await this.browsable(source);
    const byTarget = new Map<string, string>();
    for (const n of notes) {
      byTarget.set(n.relPath.replace(/\.md$/, ""), n.relPath);
      if (!byTarget.has(n.id)) byTarget.set(n.id, n.relPath);
    }
    const edges: MemoryGraph["edges"] = [];
    for (const n of notes) {
      for (const link of n.links) {
        const to = byTarget.get(link);
        if (to && to !== n.relPath) edges.push({ from: n.relPath, to });
      }
    }
    return {
      nodes: notes.map((n) => ({
        id: n.relPath,
        label: n.title.slice(0, KB_GRAPH_LABEL_MAX_CHARS),
        tier: "knowledge" as const,
      })),
      edges,
    };
  }

  /** Score one note against tokenized query `terms`. Higher is more relevant. */
  private score(note: ScannedNote, terms: string[]): number {
    const titleTokens = new Set(tokenize(note.title));
    if (note.isVtt) {
      let score = 0;
      for (const term of terms) if (titleTokens.has(term)) score += 2;
      return score;
    }
    const curatedTokens = new Set(
      [...tagsOf(note.frontmatter), ...aliasesOf(note.frontmatter)].flatMap((t) => tokenize(t)),
    );
    const bodyLower = note.body.toLowerCase();
    let score = 0;
    for (const term of terms) {
      // A term in the title or an aliases/tags field outranks one only in the body.
      if (titleTokens.has(term) || curatedTokens.has(term)) score += 2;
      else if (bodyLower.includes(term)) score += 1;
    }
    return score;
  }

  /** A ≤{@link KB_SNIPPET_MAX_CHARS}-char window of body text around the first matched term. */
  private snippetFor(note: ScannedNote, terms: string[]): string {
    if (note.isVtt || note.body.length === 0) return "";
    const lower = note.body.toLowerCase();
    let at = -1;
    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx >= 0) {
        at = idx;
        break;
      }
    }
    const start = at < 0 ? 0 : Math.max(0, at - 60);
    return note.body
      .slice(start, start + KB_SNIPPET_MAX_CHARS)
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Truncate a note body to {@link KB_BODY_MAX_CHARS}, appending a visible marker. */
  private capBody(body: string): string {
    if (body.length <= KB_BODY_MAX_CHARS) return body;
    return `${body.slice(0, KB_BODY_MAX_CHARS - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
  }

  /**
   * Walk + parse the whole KB, ordered index-first: `team-context.md`, then
   * `wiki/INDEX.md`, then the notes it links to, then the rest of `wiki/`,
   * then everything else (meetings/*.vtt). Fails soft to `[]` for a missing,
   * unreadable, non-directory, or non-vault source.
   */
  private async scan(source: KnowledgeBaseSource): Promise<ScannedNote[]> {
    const rootPath = rootPathOf(source);
    if (rootPath === null) return [];
    const root = path.resolve(rootPath);
    const stat = await fs.stat(root).catch(() => null);
    if (!stat || !stat.isDirectory()) return [];

    const entries = await this.walk(root, root);
    const notes: ScannedNote[] = [];
    for (const entry of entries) {
      if (entry.isVtt) {
        notes.push({
          ...entry,
          title: path.basename(entry.relPath),
          frontmatter: {},
          body: "",
          links: [],
        });
        continue;
      }
      const raw = await fs.readFile(entry.absPath, "utf8").catch(() => null);
      if (raw === null) continue;
      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(raw);
      } catch {
        continue;
      }
      const data = parsed.data as Record<string, unknown>;
      const title = typeof data.title === "string" && data.title.length > 0 ? data.title : entry.id;
      notes.push({
        ...entry,
        title,
        frontmatter: data,
        body: parsed.content.trim(),
        links: extractLinks(parsed.content),
      });
    }
    return this.orderIndexFirst(notes);
  }

  private orderIndexFirst(notes: ScannedNote[]): ScannedNote[] {
    const wikiIndex = notes.find((n) => n.relPath === WIKI_INDEX_REL);
    const linkedIds = new Set(wikiIndex?.links ?? []);
    const rankOf = (n: ScannedNote): number => {
      if (n.relPath === TEAM_CONTEXT_REL) return 0;
      if (n.relPath === WIKI_INDEX_REL) return 1;
      if (linkedIds.has(n.id)) return 2;
      if (n.relPath.startsWith(`${WIKI_DIR}/`)) return 3;
      return 4;
    };
    return [...notes].sort((a, b) => rankOf(a) - rankOf(b) || a.relPath.localeCompare(b.relPath));
  }

  /**
   * Recursively list `.md`/`.vtt` files under `dir`, skipping dot-directories
   * (mirrors `VaultService.walk()`). Every candidate path is containment-
   * checked against `root` (the `resolveSafeFile` shape) and `fs.lstat`'d
   * before being trusted — a symlink (file OR directory) is refused outright,
   * never followed, so a symlink inside the KB pointing outside it can never
   * be read. This is the single chokepoint every file this service touches
   * passes through.
   */
  private async walk(root: string, dir: string): Promise<KbEntry[]> {
    const out: KbEntry[] = [];
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const full = path.resolve(dir, dirent.name);
      if (!isWithinRoot(root, full)) continue;
      const stat = await fs.lstat(full).catch(() => null);
      if (!stat || stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        out.push(...(await this.walk(root, full)));
        continue;
      }
      if (!stat.isFile()) continue;
      const relPath = path.relative(root, full).split(path.sep).join("/");
      if (dirent.name.endsWith(".md")) {
        out.push({ relPath, absPath: full, id: path.basename(dirent.name, ".md"), isVtt: false });
      } else if (dirent.name.endsWith(".vtt")) {
        out.push({ relPath, absPath: full, id: path.basename(dirent.name, ".vtt"), isVtt: true });
      }
    }
    return out;
  }
}
