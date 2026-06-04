import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import type { IndexEntry, MemoryGraph, MemoryTier, Note, SearchHit } from "@zibby/contracts"
import matter from "gray-matter"

/** DI token carrying the absolute path of the Obsidian vault directory. */
export const VAULT_DIR = "VAULT_DIR"

/** Raised when a note id does not resolve to a file in the vault. */
export class NoteNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Note "${id}" not found`)
    this.name = "NoteNotFoundError"
  }
}

const WIKILINK = /\[\[([^\]]+)\]\]/g
const TIERS: MemoryTier[] = ["memory", "daily", "knowledge"]

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
    return chosen.map((n) => ({ id: n.id, title: n.title, tier: n.tier }))
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
