import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable } from "@nestjs/common"
import { type ResearchDigest, ResearchDigestSchema, type ResearchItem } from "@zibby/contracts"
import { ActivityLogService } from "../activity/activity-log.service"
import { VaultService } from "../memory/vault.service"
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { FakeResearchAdapter } from "./fake.adapter"
import { rankSourceItems } from "./research-ranking"
import { ResearchConfigStore } from "./research-config.store"

/** DI token carrying the absolute path of the persisted latest-digest JSON file. */
export const RESEARCH_DIGEST_FILE = "RESEARCH_DIGEST_FILE"

/** Max items kept in a digest — the rest are noise once the top signal is surfaced. */
const DIGEST_LIMIT = 25

/** The vault note the digest is mirrored to (read by the morning briefing). */
const DIGEST_NOTE_ID = "intelligence/digest"

/**
 * The research / intelligence layer (M6). A digest pass reads the operator's
 * configured sources through the {@link FakeResearchAdapter} seam, ranks each
 * source's items by interest overlap ({@link rankSourceItems}), keeps the top
 * {@link DIGEST_LIMIT}, persists the result as machine-readable JSON (for the API)
 * AND as the vault note `intelligence/digest` (for the briefing + a human). No
 * source failure aborts the pass — the adapter yields `[]` on error.
 */
@Injectable()
export class ResearchService {
  private readonly log: ScopedLogger

  constructor(
    private readonly config: ResearchConfigStore,
    private readonly adapter: FakeResearchAdapter,
    private readonly vault: VaultService,
    private readonly activity: ActivityLogService,
    @Inject(RESEARCH_DIGEST_FILE) private readonly digestFile: string,
    logger: LoggerService,
  ) {
    this.log = logger.child(ResearchService.name)
  }

  /** The latest persisted digest; an empty digest before the first pass. */
  async latest(now: Date = new Date()): Promise<ResearchDigest> {
    const raw = await fs.readFile(this.digestFile, "utf8").catch(() => null)
    if (raw === null) return { generatedAt: now.toISOString(), items: [] }
    const parsed = ResearchDigestSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : { generatedAt: now.toISOString(), items: [] }
  }

  /**
   * Run a digest pass: fetch + rank every enabled source, keep the top items,
   * persist the JSON + vault note, record activity, and return the digest.
   */
  async refresh(now: Date = new Date()): Promise<ResearchDigest> {
    const config = await this.config.read()
    const sources = config.sources.filter((s) => s.enabled && (s.kind !== "finance" || config.financeWatch))
    const ranked: ResearchItem[] = []
    for (const source of sources) {
      const raw = await this.adapter.fetch(source).catch(() => [])
      ranked.push(...rankSourceItems(source, raw, config.interests))
    }
    const items = ranked
      .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title))
      .slice(0, DIGEST_LIMIT)
    const digest: ResearchDigest = { generatedAt: now.toISOString(), items }

    await this.persist(digest)
    await this.writeNote(digest, now).catch((err) => {
      this.log.warn("failed to mirror digest to vault", { error: (err as Error).message })
    })
    void this.activity.record({
      kind: "research-digest",
      summary: `research digest — ${items.length} item${items.length === 1 ? "" : "s"} from ${sources.length} source${sources.length === 1 ? "" : "s"}`,
      refs: { noteId: DIGEST_NOTE_ID },
    })
    this.log.info("research digest generated", { sources: sources.length, items: items.length })
    return digest
  }

  private async persist(digest: ResearchDigest): Promise<void> {
    await ensureDir(path.dirname(this.digestFile))
    await writeFileAtomic(this.digestFile, `${JSON.stringify(digest, null, 2)}\n`)
  }

  /** Mirror the digest to `intelligence/digest` as butler-readable bullets. */
  private async writeNote(digest: ResearchDigest, now: Date): Promise<void> {
    const date = now.toISOString().slice(0, 10)
    const lines: string[] = [`*Updated: ${date}*`, ""]
    if (digest.items.length === 0) {
      lines.push("Nothing relevant surfaced from the watched sources.")
    } else {
      lines.push("What's worth your attention from the world:", "")
      for (const item of digest.items) {
        lines.push(`- **${item.title}** — ${item.summary}`)
      }
    }
    const body = `${lines.join("\n")}\n`
    try {
      await this.vault.updateNote(DIGEST_NOTE_ID, { body })
    } catch {
      await this.vault.createNote({ id: DIGEST_NOTE_ID, title: "Intelligence Digest", tier: "memory", body })
    }
  }
}
