import { Injectable } from "@nestjs/common";
import type { Note } from "@zibby/contracts";
import { VaultService, localDate } from "./vault.service";

const REPORT_ID = "vault-lint";
const STALE_DAYS = 90;
const MAX_TAGS = 15;
/** Notes that are legitimately unlinked, or are machine-written. */
const NOT_ORPHAN = /^(north-star|self-knowledge|vault-log|vault-lint)/i;
const MOC = /(^|[-_ ])(index|moc)$/i;

export interface VaultLintResult {
  brokenLinks: number;
  orphans: number;
  stale: number;
  missingUpdated: number;
  tagBloat: number;
}

/** Frontmatter `updated` as `YYYY-MM-DD` (YAML may parse it to a Date), or undefined. */
function updatedOf(fm: Record<string, unknown>): string | undefined {
  const u = fm.updated;
  if (u instanceof Date)
    return Number.isNaN(u.getTime()) ? undefined : u.toISOString().slice(0, 10);
  return typeof u === "string" && /^\d{4}-\d{2}-\d{2}/.test(u) ? u.slice(0, 10) : undefined;
}

const list = (items: string[]): string => (items.length ? items.join("\n") : "- none");

/** Report-only vault health check; writes `knowledge/vault-lint.md`, never touches other notes. */
@Injectable()
export class VaultLintService {
  constructor(private readonly vault: VaultService) {}

  async run(now = new Date()): Promise<VaultLintResult> {
    const notes = await this.vault.allNotes();
    const report = lint(notes, now);
    const body = render(report, localDate(now));
    const exists = notes.some((n) => n.id === REPORT_ID);
    if (exists) await this.vault.updateNote(REPORT_ID, { title: "Vault lint", body });
    else
      await this.vault.createNote({
        id: REPORT_ID,
        tier: "knowledge",
        title: "Vault lint",
        tags: ["report"],
        body,
      });
    return {
      brokenLinks: report.broken.length,
      orphans: report.orphans.length,
      stale: report.stale.length,
      missingUpdated: report.missing.length,
      tagBloat: report.tagBloat.length,
    };
  }
}

interface Report {
  broken: string[];
  orphans: string[];
  stale: string[];
  missing: string[];
  tagBloat: string[];
}

/** Pure lint over a note set (exported for tests). */
export function lint(notes: Note[], now: Date): Report {
  const ids = new Set(notes.map((n) => n.id));
  const inbound = new Set<string>();
  for (const n of notes) {
    for (const t of n.links) if (t !== n.id) inbound.add(t);
  }
  const cutoff = localDate(new Date(now.getTime() - STALE_DAYS * 86_400_000));
  const r: Report = { broken: [], orphans: [], stale: [], missing: [], tagBloat: [] };
  for (const n of notes) {
    for (const t of n.links) if (!ids.has(t)) r.broken.push(`- [[${n.id}]] → \`${t}\``);
    if (n.tier !== "daily" && !NOT_ORPHAN.test(n.id) && !MOC.test(n.id) && !inbound.has(n.id)) {
      r.orphans.push(`- [[${n.id}]]`);
    }
    if (n.tier === "daily") continue;
    const u = updatedOf(n.frontmatter);
    if (u === undefined) r.missing.push(`- [[${n.id}]]`);
    else if (u < cutoff) r.stale.push(`- [[${n.id}]] (${u})`);
    if (Array.isArray(n.frontmatter.tags) && n.frontmatter.tags.length > MAX_TAGS) {
      r.tagBloat.push(`- [[${n.id}]] (${n.frontmatter.tags.length} tags)`);
    }
  }
  return r;
}

function render(r: Report, date: string): string {
  return [
    `Generated ${date}. Report only — no notes were modified.`,
    "",
    `## Broken wikilinks (${r.broken.length})`,
    list(r.broken),
    "",
    `## Orphans (${r.orphans.length})`,
    list(r.orphans),
    "",
    `## Stale notes, updated over ${STALE_DAYS} days ago (${r.stale.length})`,
    list(r.stale),
    "",
    `## Missing \`updated\` (${r.missing.length})`,
    `${r.missing.length} notes have no \`updated\` stamp yet.`,
    "",
    `## More than ${MAX_TAGS} tags (${r.tagBloat.length})`,
    list(r.tagBloat),
    "",
  ].join("\n");
}
