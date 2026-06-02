import { createReadStream, promises as fs } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Injectable, Logger } from "@nestjs/common"

/** A single assistant turn's billable token cost, stamped with when it happened. */
export interface UsageEvent {
  at: number // epoch ms
  tokens: number // input + output
}

/** Token totals bucketed into the rolling 5-hour and weekly windows. */
export interface UsageWindows {
  rolling5hTokens: number
  weekly7dTokens: number
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Sum events into the 5-hour and weekly windows ending at `now`. Pure and
 * synchronous so the bucketing is unit-testable without touching the filesystem.
 */
export function sumWindows(events: UsageEvent[], now: number): UsageWindows {
  const win5 = now - FIVE_HOURS_MS
  const win7 = now - SEVEN_DAYS_MS
  let rolling5hTokens = 0
  let weekly7dTokens = 0
  for (const e of events) {
    if (e.at >= win7) {
      weekly7dTokens += e.tokens
      if (e.at >= win5) rolling5hTokens += e.tokens
    }
  }
  return { rolling5hTokens, weekly7dTokens }
}

/**
 * Reads real Claude usage from the local Claude Code transcripts under
 * `~/.claude/projects/**​/*.jsonl`. Each assistant turn carries a `timestamp` and
 * a `message.usage` block; we sum `input_tokens + output_tokens` (the billable,
 * non-cached tokens the configured caps were sized around) into the rolling and
 * weekly windows.
 *
 * Account-wide on purpose: Claude's rate limits span all projects, so we scan
 * every project directory, not just this repo's. Transcripts are append-only, so
 * a file last modified more than a week ago cannot hold an in-window event — we
 * skip those by mtime, which keeps the scan cheap. Results are cached briefly so
 * a 15s frontend poll doesn't re-walk the disk every tick. Per-request dedupe by
 * `requestId` guards against a turn appearing in more than one transcript.
 */
@Injectable()
export class ClaudeUsageReader {
  private readonly logger = new Logger(ClaudeUsageReader.name)
  private readonly projectsDir = join(homedir(), ".claude", "projects")
  private readonly cacheTtlMs = 20_000
  private cache: { at: number; windows: UsageWindows } | null = null

  /** Override point for tests; production reads the wall clock. */
  protected now(): number {
    return Date.now()
  }

  async read(): Promise<UsageWindows> {
    const now = this.now()
    if (this.cache && now - this.cache.at < this.cacheTtlMs) {
      return this.cache.windows
    }
    const windows = await this.scan(now)
    this.cache = { at: now, windows }
    return windows
  }

  private async scan(now: number): Promise<UsageWindows> {
    const cutoff = now - SEVEN_DAYS_MS
    const events: UsageEvent[] = []
    const seen = new Set<string>()
    try {
      const files = await this.recentTranscripts(cutoff)
      for (const file of files) {
        await this.collect(file, events, seen)
      }
    } catch (err) {
      // No transcripts (fresh machine, CI) → zero usage, not an error.
      this.logger.debug(`usage scan skipped: ${(err as Error).message}`)
    }
    return sumWindows(events, now)
  }

  /** Transcript files modified since `cutoff` (append-only ⇒ mtime ≈ last event). */
  private async recentTranscripts(cutoff: number): Promise<string[]> {
    const projects = await fs.readdir(this.projectsDir, { withFileTypes: true })
    const out: string[] = []
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const dir = join(this.projectsDir, project.name)
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch {
        continue
      }
      for (const name of entries) {
        if (!name.endsWith(".jsonl")) continue
        const path = join(dir, name)
        try {
          const stat = await fs.stat(path)
          if (stat.mtimeMs >= cutoff) out.push(path)
        } catch {
          // raced deletion / unreadable — skip
        }
      }
    }
    return out
  }

  /** Stream one transcript, pushing in-scope assistant usage events. */
  private async collect(file: string, events: UsageEvent[], seen: Set<string>): Promise<void> {
    const rl = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    })
    try {
      for await (const line of rl) {
        // Cheap pre-filter before the JSON parse cost.
        if (!line.includes('"usage"') || !line.includes('"assistant"')) continue
        let entry: unknown
        try {
          entry = JSON.parse(line)
        } catch {
          continue
        }
        const event = this.toEvent(entry, seen)
        if (event) events.push(event)
      }
    } finally {
      rl.close()
    }
  }

  private toEvent(entry: unknown, seen: Set<string>): UsageEvent | null {
    if (typeof entry !== "object" || entry === null) return null
    const e = entry as Record<string, unknown>
    if (e.type !== "assistant") return null
    const message = e.message as Record<string, unknown> | undefined
    const usage = message?.usage as Record<string, unknown> | undefined
    if (!usage) return null

    const requestId = typeof e.requestId === "string" ? e.requestId : null
    if (requestId) {
      if (seen.has(requestId)) return null
      seen.add(requestId)
    }

    const at = Date.parse(typeof e.timestamp === "string" ? e.timestamp : "")
    if (Number.isNaN(at)) return null

    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0
    return { at, tokens: input + output }
  }
}
