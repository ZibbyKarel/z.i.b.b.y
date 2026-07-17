import { Injectable, Logger } from "@nestjs/common";
import type { IndexEntry, Note, SubsystemId } from "@zibby/contracts";
import { tokenize } from "../tasks/keyword-scorer";
import { subsystemShelfId } from "./subsystem-shelf";
import { VaultService } from "./vault.service";

/** Fixed id of the operator's mission note — always grounded first when present. */
export const NORTH_STAR_ID = "north-star";

/**
 * Fixed id of the machine-generated self-knowledge note (Fáze 1 — agents,
 * pipelines, gate rules, channels). Always grounded second, right after the
 * North Star, so every run carries current core knowledge about ZIBBY itself —
 * the same always-loaded pattern as the North Star, no new composition point.
 */
export const SELF_KNOWLEDGE_ID = "self-knowledge";

/** Per-note body budget (chars). Conservative — the block rides argv. */
const NOTE_BUDGET = 2000;
/** Per-block budget (chars) across all grounded notes. */
const BLOCK_BUDGET = 8000;
/** How many term-matched MOCs to include beyond the North Star + project note. */
const MOC_LIMIT = 2;
/** How many 1-hop wikilink-expanded notes to include beyond the matched MOCs (F4b). */
const EXPANSION_LIMIT = 2;

/** Inputs for composing a run's grounding block. */
export interface GroundingInput {
  task: string;
  projectId?: string;
  matchedTerms?: string[];
  /** The owning subsystem (F4a) — when present, its knowledge shelf is grounded
   * right after the self-knowledge note, ahead of term-matched MOCs. Missing
   * owner or missing shelf note is silently skipped (fail-open). */
  ownerSubsystem?: SubsystemId;
}

/**
 * Multi-project isolation (M7): the candidate notes a run in `projectId` may ground
 * on — every global note (no owner) plus only its own project's notes. A run in
 * project A can therefore never term-match into project B's vault notes, and an
 * unattributed run (no projectId) sees only global notes. Pure — exported for tests.
 */
export function visibleToProject(
  entries: IndexEntry[],
  projectId: string | undefined,
): IndexEntry[] {
  return entries.filter((e) => !e.project || e.project === projectId);
}

/**
 * Score one index entry against `wanted` terms: 1 point per term found (as a
 * whole token) in the entry's id/title, PLUS 2 points per term found in its
 * curated `tags`/`aliases` — curated frontmatter outweighs an incidental title
 * word (F4b: "scored above raw substring"). Pure, exported for tests.
 */
export function scoreEntry(entry: IndexEntry, wanted: ReadonlySet<string>): number {
  const titleTokens = new Set([...tokenize(entry.id), ...tokenize(entry.title)]);
  const curatedTokens = new Set([
    ...(entry.tags ?? []).flatMap((t) => [...tokenize(t)]),
    ...(entry.aliases ?? []).flatMap((t) => [...tokenize(t)]),
  ]);
  let score = 0;
  for (const term of wanted) {
    if (titleTokens.has(term)) score += 1;
    if (curatedTokens.has(term)) score += 2;
  }
  return score;
}

/**
 * Score index entries by term overlap ({@link scoreEntry}), then return the top
 * `MOC_LIMIT`. Pure + deterministic (ties broken by id) so it is unit-testable
 * without a vault. Entries with no overlap are dropped — grounding stays
 * relevant, not exhaustive.
 */
export function selectIndexes(terms: string[], entries: IndexEntry[]): IndexEntry[] {
  const wanted = new Set(terms.map((t) => t.toLowerCase()));
  if (wanted.size === 0) return [];
  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, wanted) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, MOC_LIMIT)
    .map((s) => s.entry);
}

/**
 * 1-hop wikilink expansion (F4b, index-first — no vectors): from the notes
 * already grounded (`mocs` — the shelf + term-matched MOCs actually loaded),
 * union every note they link to, keep only ids present in `visible` (M7 project
 * isolation already applied there — a global shelf's links pass through) and not
 * already in `alreadySeen`, score the survivors the same way `selectIndexes`
 * does, and return the top `EXPANSION_LIMIT` ids (deterministic, ties broken by
 * id). Pure — exported for tests.
 */
export function selectLinkedNotes(
  terms: string[],
  mocs: Note[],
  visible: IndexEntry[],
  alreadySeen: ReadonlySet<string>,
): string[] {
  const wanted = new Set(terms.map((t) => t.toLowerCase()));
  if (wanted.size === 0) return [];
  const visibleById = new Map(visible.map((e) => [e.id, e]));
  const linked = new Set(mocs.flatMap((m) => m.links));
  return [...linked]
    .filter((id) => !alreadySeen.has(id) && visibleById.has(id))
    .map((id) => {
      const entry = visibleById.get(id);
      // Non-null: filtered above by `visibleById.has(id)`.
      return { id, score: scoreEntry(entry as IndexEntry, wanted) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, EXPANSION_LIMIT)
    .map((s) => s.id);
}

/** Truncate `text` to `max` chars, appending a marker line when it was cut. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\n…(truncated)`;
}

/**
 * Composes the `## Grounding (vault)` block prepended to a run's system prompt
 * (Phase 4): the North Star, the top term-matched MOCs, and the project note —
 * each as `### <title>` + a budgeted body excerpt. Fail-open by design: any error
 * or an empty vault yields `""` so a memory hiccup never blocks a run.
 */
@Injectable()
export class GroundingService {
  private readonly logger = new Logger(GroundingService.name);

  constructor(private readonly vault: VaultService) {}

  async compose(input: GroundingInput): Promise<string> {
    try {
      const terms = input.matchedTerms?.length ? input.matchedTerms : tokenize(input.task);
      const sections: Array<{ title: string; body: string }> = [];
      const seen = new Set<string>();

      const add = async (id: string): Promise<Note | null> => {
        if (seen.has(id)) return null;
        try {
          const note = await this.vault.note(id);
          seen.add(id);
          sections.push({ title: note.title, body: note.body ?? "" });
          return note;
        } catch {
          // Missing note (e.g. no north-star seeded) — skip, never throw.
          return null;
        }
      };

      await add(NORTH_STAR_ID);
      await add(SELF_KNOWLEDGE_ID);
      const mocs: Note[] = [];
      const shelf = input.ownerSubsystem ? await add(subsystemShelfId(input.ownerSubsystem)) : null;
      if (shelf) mocs.push(shelf);
      const entries = await this.vault.index().catch((): IndexEntry[] => []);
      // M7 isolation: restrict the candidate set to this run's project before
      // term-matching, so a run can never ground on another project's notes.
      const visible = visibleToProject(entries, input.projectId);
      for (const entry of selectIndexes(terms, visible)) {
        const moc = await add(entry.id);
        if (moc) mocs.push(moc);
      }
      // F4b: 1-hop wikilink expansion over the notes just grounded, before the
      // project note (index-first — no vectors, reuses the same scan cache).
      for (const id of selectLinkedNotes(terms, mocs, visible, seen)) await add(id);
      if (input.projectId) await add(input.projectId);

      if (sections.length === 0) return "";
      return this.render(sections);
    } catch (error) {
      this.logger.warn(`grounding compose failed, continuing without it: ${String(error)}`);
      return "";
    }
  }

  private render(sections: Array<{ title: string; body: string }>): string {
    const parts = ["## Grounding (vault)", ""];
    for (const s of sections) {
      parts.push(`### ${s.title}`, truncate(s.body.trim(), NOTE_BUDGET), "");
    }
    return truncate(parts.join("\n").trimEnd(), BLOCK_BUDGET);
  }
}
