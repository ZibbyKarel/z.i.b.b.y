import { Injectable, Logger } from "@nestjs/common"
import type { IndexEntry } from "@zibby/contracts"
import { tokenize } from "../tasks/keyword-scorer"
import { VaultService } from "./vault.service"

/** Fixed id of the operator's mission note — always grounded first when present. */
export const NORTH_STAR_ID = "north-star"

/** Per-note body budget (chars). Conservative — the block rides argv. */
const NOTE_BUDGET = 2000
/** Per-block budget (chars) across all grounded notes. */
const BLOCK_BUDGET = 8000
/** How many term-matched MOCs to include beyond the North Star + project note. */
const MOC_LIMIT = 2

/** Inputs for composing a run's grounding block. */
export interface GroundingInput {
  task: string
  projectId?: string
  matchedTerms?: string[]
}

/**
 * Multi-project isolation (M7): the candidate notes a run in `projectId` may ground
 * on — every global note (no owner) plus only its own project's notes. A run in
 * project A can therefore never term-match into project B's vault notes, and an
 * unattributed run (no projectId) sees only global notes. Pure — exported for tests.
 */
export function visibleToProject(entries: IndexEntry[], projectId: string | undefined): IndexEntry[] {
  return entries.filter((e) => !e.project || e.project === projectId)
}

/**
 * Score index entries by how many of `terms` appear (as whole tokens) in the
 * entry's id or title, then return the top `MOC_LIMIT`. Pure + deterministic
 * (ties broken by id) so it is unit-testable without a vault. Entries with no
 * overlap are dropped — grounding stays relevant, not exhaustive.
 */
export function selectIndexes(terms: string[], entries: IndexEntry[]): IndexEntry[] {
  const wanted = new Set(terms.map((t) => t.toLowerCase()))
  if (wanted.size === 0) return []
  return entries
    .map((entry) => {
      const tokens = new Set([...tokenize(entry.id), ...tokenize(entry.title)])
      let score = 0
      for (const term of wanted) if (tokens.has(term)) score++
      return { entry, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, MOC_LIMIT)
    .map((s) => s.entry)
}

/** Truncate `text` to `max` chars, appending a marker line when it was cut. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}\n…(truncated)`
}

/**
 * Composes the `## Grounding (vault)` block prepended to a run's system prompt
 * (Phase 4): the North Star, the top term-matched MOCs, and the project note —
 * each as `### <title>` + a budgeted body excerpt. Fail-open by design: any error
 * or an empty vault yields `""` so a memory hiccup never blocks a run.
 */
@Injectable()
export class GroundingService {
  private readonly logger = new Logger(GroundingService.name)

  constructor(private readonly vault: VaultService) {}

  async compose(input: GroundingInput): Promise<string> {
    try {
      const terms = input.matchedTerms?.length ? input.matchedTerms : tokenize(input.task)
      const sections: Array<{ title: string; body: string }> = []
      const seen = new Set<string>()

      const add = async (id: string): Promise<void> => {
        if (seen.has(id)) return
        try {
          const note = await this.vault.note(id)
          seen.add(id)
          sections.push({ title: note.title, body: note.body ?? "" })
        } catch {
          // Missing note (e.g. no north-star seeded) — skip, never throw.
        }
      }

      await add(NORTH_STAR_ID)
      const entries = await this.vault.index().catch((): IndexEntry[] => [])
      // M7 isolation: restrict the candidate set to this run's project before
      // term-matching, so a run can never ground on another project's notes.
      const visible = visibleToProject(entries, input.projectId)
      for (const entry of selectIndexes(terms, visible)) await add(entry.id)
      if (input.projectId) await add(input.projectId)

      if (sections.length === 0) return ""
      return this.render(sections)
    } catch (error) {
      this.logger.warn(`grounding compose failed, continuing without it: ${String(error)}`)
      return ""
    }
  }

  private render(sections: Array<{ title: string; body: string }>): string {
    const parts = ["## Grounding (vault)", ""]
    for (const s of sections) {
      parts.push(`### ${s.title}`, truncate(s.body.trim(), NOTE_BUDGET), "")
    }
    return truncate(parts.join("\n").trimEnd(), BLOCK_BUDGET)
  }
}
