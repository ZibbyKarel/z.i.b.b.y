import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import type {
  CreateNoteInput,
  IndexEntry,
  MemoryGraph,
  MemoryTier,
  Note,
  SearchHit,
  UpdateNoteInput,
} from "@zibby/contracts"
import matter from "gray-matter"
import { resolveSafeFile, writeFileAtomic } from "../shared/file-storage/file-utils"
import { withPathLock } from "../shared/file-storage/file-lock"

/** DI token carrying the absolute path of the Obsidian vault directory. */
export const VAULT_DIR = "VAULT_DIR"

/** Raised when a note id does not resolve to a file in the vault. */
export class NoteNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Note "${id}" not found`)
    this.name = "NoteNotFoundError"
  }
}

/** Raised when a write-path id fails the basename/containment guard (→ 422). */
export class InvalidNoteIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid note id "${id}"`)
    this.name = "InvalidNoteIdError"
  }
}

/** Raised when creating a note whose id already exists in any tier (→ 409). */
export class DuplicateNoteError extends Error {
  constructor(public readonly id: string) {
    super(`Note "${id}" already exists`)
    this.name = "DuplicateNoteError"
  }
}

const WIKILINK = /\[\[([^\]]+)\]\]/g
const TIERS: MemoryTier[] = ["memory", "daily", "knowledge"]

/**
 * The project a note belongs to (M7 multi-project isolation), or undefined if it is
 * global. A note is project-owned when its frontmatter carries an explicit
 * `project: <id>` tag, or when it is a `type: project` profile note (whose `id`
 * frontmatter is the project it describes). Pure — exported for unit testing.
 */
export function ownerProjectOf(frontmatter: Record<string, unknown>): string | undefined {
  const explicit = frontmatter.project
  if (typeof explicit === "string" && explicit.length > 0) return explicit
  if (frontmatter.type === "project" && typeof frontmatter.id === "string" && frontmatter.id.length > 0) {
    return frontmatter.id
  }
  return undefined
}

/**
 * The same shape as `NoteIdSchema` in the contract: a filesystem-safe basename
 * (no separators, no leading dot). Mirrored here so `resolveSafeFile`'s guard
 * matches the contract's accept-set without importing zod into the service.
 */
const NOTE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/

/** Escape a string for safe interpolation into a `RegExp`. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Turn an id (`zibby-index`) into a readable title (`Zibby Index`). */
function humanizeId(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

interface RawNote {
  id: string
  path: string
  tier: MemoryTier
  title: string
  frontmatter: Record<string, unknown>
  links: string[]
  body: string
}

/**
 * Read access to the Obsidian vault. Index-first retrieval (explicit search, not
 * vector embeddings — more reliable and token-efficient, the Karpathy approach).
 * Reads are free; the only write is the safe `daily/` append. A small cache keyed
 * on the most recent scan keeps repeated graph/search calls cheap on a big vault.
 */
@Injectable()
export class VaultService implements OnModuleInit {
  private readonly dir: string
  private cache: { at: number; notes: RawNote[] } | null = null
  private static readonly CACHE_MS = 5000

  constructor(@Inject(VAULT_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async index(): Promise<IndexEntry[]> {
    const notes = await this.scan()
    // Prefer explicit index/MOC notes as entry points; fall back to everything.
    const entryPoints = notes.filter((n) => /(^|[-_ ])(index|moc)$/i.test(n.id))
    const chosen = entryPoints.length > 0 ? entryPoints : notes
    return chosen.map((n) => {
      const project = ownerProjectOf(n.frontmatter)
      return { id: n.id, title: n.title, tier: n.tier, ...(project ? { project } : {}) }
    })
  }

  async note(id: string): Promise<Note> {
    const notes = await this.scan()
    const found = notes.find((n) => n.id === id)
    if (!found) throw new NoteNotFoundError(id)
    const backlinks = notes.filter((n) => n.links.includes(id)).map((n) => n.id)
    return {
      id: found.id,
      path: found.path,
      tier: found.tier,
      title: found.title,
      frontmatter: found.frontmatter,
      links: found.links,
      backlinks,
      body: found.body,
    }
  }

  async graph(): Promise<MemoryGraph> {
    const notes = await this.scan()
    const ids = new Set(notes.map((n) => n.id))
    const nodes = notes.map((n) => ({ id: n.id, label: n.title, tier: n.tier }))
    const edges: MemoryGraph["edges"] = []
    for (const n of notes) {
      for (const target of n.links) {
        if (ids.has(target)) edges.push({ from: n.id, to: target })
      }
    }
    return { nodes, edges }
  }

  async search(q: string): Promise<SearchHit[]> {
    const query = q.trim().toLowerCase()
    if (!query) return []
    const notes = await this.scan()
    const hits: Array<SearchHit & { score: number }> = []
    for (const n of notes) {
      const inTitle = n.title.toLowerCase().includes(query)
      const idx = n.body.toLowerCase().indexOf(query)
      if (!inTitle && idx < 0) continue
      const at = idx < 0 ? 0 : idx
      const snippet = n.body.slice(Math.max(0, at - 30), at + 90).replace(/\s+/g, " ").trim()
      hits.push({ id: n.id, title: n.title, tier: n.tier, snippet, score: inTitle ? 2 : 1 })
    }
    return hits
      .sort((a, b) => b.score - a.score)
      .map((h) => ({ id: h.id, title: h.title, tier: h.tier, snippet: h.snippet }))
  }

  /** Safe episodic write: append `text` to today's `daily/<YYYY-MM-DD>.md`. */
  async appendDaily(text: string): Promise<Note> {
    const date = new Date().toISOString().slice(0, 10)
    const dailyDir = path.join(this.dir, "daily")
    await fs.mkdir(dailyDir, { recursive: true })
    const file = path.join(dailyDir, `${date}.md`)
    const stamp = new Date().toISOString().slice(11, 16)
    await fs.appendFile(file, `\n- ${stamp} ${text}\n`, "utf8")
    this.cache = null
    return this.note(date)
  }

  /** Absolute dir for a tier: `memory` is the vault root; the others are subdirs. */
  private tierDir(tier: MemoryTier): string {
    return tier === "memory" ? this.dir : path.join(this.dir, tier)
  }

  /**
   * Resolve `{tier, id}` to an absolute `.md` path inside that tier's (flat) dir,
   * guarded by the `NOTE_ID` regex + containment check. Throws on a bad id so the
   * controller can map it to 422. Always resolves against the tier dir — never the
   * vault root — so the flat-dir containment check in `resolveSafeFile` holds.
   */
  private resolveNoteFile(tier: MemoryTier, id: string): string {
    const file = resolveSafeFile(this.tierDir(tier), id, ".md", NOTE_ID)
    if (file === null) throw new InvalidNoteIdError(id)
    return file
  }

  /**
   * Create a note in `tier`. Ids are unique across the *whole* vault, so a
   * collision in any tier is a 409 — a per-dir check would shadow notes that
   * `note(id)` could never reach.
   */
  async createNote(input: CreateNoteInput): Promise<Note> {
    const file = this.resolveNoteFile(input.tier, input.id)
    const existing = (await this.scan()).find((n) => n.id === input.id)
    if (existing) throw new DuplicateNoteError(input.id)
    const data: Record<string, unknown> = { ...(input.frontmatter ?? {}) }
    if (input.title !== undefined) data.title = input.title
    await fs.mkdir(path.dirname(file), { recursive: true })
    await writeFileAtomic(file, matter.stringify(input.body, data))
    this.cache = null
    return this.note(input.id)
  }

  /**
   * Patch a note in place. Frontmatter merges per key (patch wins; unknown
   * operator keys are preserved — never normalize a real Obsidian note's
   * metadata); `body` is replaced only when provided. tier/id are immutable.
   */
  async updateNote(id: string, patch: UpdateNoteInput): Promise<Note> {
    const found = (await this.scan()).find((n) => n.id === id)
    if (!found) throw new NoteNotFoundError(id)
    const abs = path.join(this.dir, found.path)
    const parsed = matter(await fs.readFile(abs, "utf8"))
    const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) }
    if (patch.frontmatter) Object.assign(data, patch.frontmatter)
    if (patch.title !== undefined) data.title = patch.title
    const body = patch.body !== undefined ? patch.body : parsed.content
    await writeFileAtomic(abs, matter.stringify(body, data))
    this.cache = null
    return this.note(id)
  }

  /** Append `text` to an existing note (atomic, frontmatter preserved). */
  async appendToNote(id: string, text: string): Promise<Note> {
    const found = (await this.scan()).find((n) => n.id === id)
    if (!found) throw new NoteNotFoundError(id)
    const abs = path.join(this.dir, found.path)
    const parsed = matter(await fs.readFile(abs, "utf8"))
    const body = `${parsed.content.replace(/\s+$/, "")}\n\n${text}\n`
    await writeFileAtomic(abs, matter.stringify(body, parsed.data))
    this.cache = null
    return this.note(id)
  }

  /**
   * Idempotently ensure a `- [[target]]` list line exists in MOC `mocId`. A
   * missing MOC is auto-created in `knowledge/` (the recorder links learned notes
   * from project MOCs that may not exist yet). An existing line for `target` is
   * replaced in place (label refresh); otherwise the line is appended.
   */
  async updateIndex(mocId: string, target: string, label?: string): Promise<Note> {
    // Serialize per-MOC: this is a read-modify-write on one file, and two runs
    // finishing on the same project would otherwise race the same MOC line and one
    // link would be lost (Phase 8.2). Different MOCs still run concurrently.
    return withPathLock(`moc:${mocId}`, async () => {
      let moc = (await this.scan()).find((n) => n.id === mocId)
      if (!moc) {
        await this.createNote({
          id: mocId,
          tier: "knowledge",
          title: humanizeId(mocId),
          body: `Index for ${humanizeId(mocId)}.\n`,
        })
        moc = (await this.scan()).find((n) => n.id === mocId)
        if (!moc) throw new NoteNotFoundError(mocId)
      }
      const abs = path.join(this.dir, moc.path)
      const parsed = matter(await fs.readFile(abs, "utf8"))
      const desired = label ? `- [[${target}]] — ${label}` : `- [[${target}]]`
      // Match a wiki-link to `target`: `[[target]]`, `[[target|alias]]`, `[[target#x]]`.
      const linkRe = new RegExp(`\\[\\[${escapeRegExp(target)}(\\]\\]|\\||#)`)
      const lines = parsed.content.split("\n")
      const idx = lines.findIndex((l) => linkRe.test(l))
      let newLines: string[]
      if (idx >= 0) {
        newLines = [...lines]
        newLines[idx] = desired
      } else {
        newLines = [...lines]
        while (newLines.length > 0 && newLines[newLines.length - 1]?.trim() === "") newLines.pop()
        newLines.push(desired)
      }
      await writeFileAtomic(abs, matter.stringify(`${newLines.join("\n")}\n`, parsed.data))
      this.cache = null
      return this.note(mocId)
    })
  }

  /** Scan the vault for `.md` files, parsed and cached briefly. */
  private async scan(): Promise<RawNote[]> {
    if (this.cache && Date.now() - this.cache.at < VaultService.CACHE_MS) return this.cache.notes
    const notes: RawNote[] = []
    for (const file of await this.walk(this.dir)) {
      const raw = await fs.readFile(file, "utf8").catch(() => null)
      if (raw === null) continue
      let parsed: matter.GrayMatterFile<string>
      try {
        parsed = matter(raw)
      } catch {
        continue
      }
      const rel = path.relative(this.dir, file)
      const id = path.basename(file, ".md")
      const tier = this.tierOf(rel)
      const data = parsed.data as Record<string, unknown>
      const title = typeof data.title === "string" ? data.title : id
      notes.push({
        id,
        path: rel,
        tier,
        title,
        frontmatter: data,
        links: this.extractLinks(parsed.content),
        body: parsed.content.trim(),
      })
    }
    this.cache = { at: Date.now(), notes }
    return notes
  }

  private tierOf(rel: string): MemoryTier {
    const top = rel.split(path.sep)[0]
    const tier = TIERS.find((t) => t === top)
    // A note at the vault root (e.g. MEMORY.md) is curated memory.
    return tier ?? "memory"
  }

  private extractLinks(body: string): string[] {
    const out = new Set<string>()
    for (const m of body.matchAll(WIKILINK)) {
      const target = m[1]?.split("|")[0]?.split("#")[0]?.trim()
      if (target) out.add(target)
    }
    return [...out]
  }

  private async walk(dir: string): Promise<string[]> {
    const out: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue
        out.push(...(await this.walk(full)))
      } else if (entry.name.endsWith(".md")) {
        out.push(full)
      }
    }
    return out
  }
}
