import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { Project } from "@zibby/contracts";
import matter from "gray-matter";
import { ensureDir, writeFileAtomic } from "../shared/file-storage";
import { VAULT_DIR } from "../memory/vault.service";

/**
 * Mirrors project profiles into the vault as human-readable Markdown notes so
 * agents can ground on project context. Writes are fire-and-forget side effects
 * of project mutations — failures are swallowed so the registry op always wins.
 */
@Injectable()
export class ProjectVaultService {
  private readonly projectsDir: string;

  constructor(@Inject(VAULT_DIR) vaultDir: string) {
    this.projectsDir = path.join(vaultDir, "projects");
  }

  async write(project: Project): Promise<void> {
    try {
      await ensureDir(this.projectsDir);
      const file = path.join(this.projectsDir, `${project.id}.md`);
      await writeFileAtomic(file, serialize(project));
    } catch {
      // Vault write is a best-effort mirror; never fail the registry op.
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.projectsDir, `${id}.md`));
    } catch {
      // Ignore missing file.
    }
  }
}

function serialize(project: Project): string {
  const frontmatter: Record<string, unknown> = {
    title: project.name,
    type: "project",
    id: project.id,
    // M7: explicit ownership tag — scopes the profile note to its project so
    // grounding's isolation filter (`ownerProjectOf`) never leaks it to another.
    project: project.id,
    path: project.path,
    ...(project.desc ? { desc: project.desc } : {}),
    ...(project.category ? { category: project.category } : {}),
    ...(project.autonomy_policy ? { autonomy_policy: project.autonomy_policy } : {}),
    ...(project.daily_rhythm ? { daily_rhythm: project.daily_rhythm } : {}),
  };

  const lines: string[] = [`# ${project.name}`, ""];
  if (project.desc) lines.push(`> ${project.desc}`, "");

  // Phase 70 DEFERRED: this grounding-note mirror renders the project's own raw
  // `identity.people` (and, above, its own raw `autonomy_policy`) — NOT the
  // company-merged effective roster. `serialize`/`write` are synchronous
  // fire-and-forget side effects of a plain project mutation, so resolving the
  // company here would mean threading an async company lookup through every
  // `ProjectVaultService.write` call site for a document that's advisory grounding
  // text, not a decision-making read path (unlike the budget guard / channel
  // triage VIP check / integrations listing, which Phase 70 does route through
  // `ResolvedProjectService`). Revisit alongside Phase 71/72's web-side effective
  // vs. raw distinction, which needs the same "make this async" shape anyway.
  const people = project.identity?.people ?? [];
  if (people.length > 0) {
    lines.push("## Team", "");
    lines.push("| Name | Role | VIP |");
    lines.push("|------|------|-----|");
    for (const person of people) {
      lines.push(`| ${person.name} | ${person.role} | ${person.vip ? "✓" : ""} |`);
    }
    lines.push("");
  }

  if (project.autonomy_policy) {
    const p = project.autonomy_policy;
    lines.push("## Autonomy Policy", "");
    if (p.respond_as) lines.push(`- **respond_as**: ${p.respond_as}`);
    if (p.vip_escalation) lines.push(`- **vip_escalation**: true`);
    if (p.can_do_alone?.length) lines.push(`- **can_do_alone**: ${p.can_do_alone.join(", ")}`);
    if (p.always_ask?.length) lines.push(`- **always_ask**: ${p.always_ask.join(", ")}`);
    lines.push("");
  }

  if (project.daily_rhythm) {
    const r = project.daily_rhythm;
    lines.push("## Daily Rhythm", "");
    if (r.standup_time) lines.push(`- **standup**: ${r.standup_time}`);
    if (r.active_hours) lines.push(`- **active hours**: ${r.active_hours}`);
    if (r.format) lines.push(`- **format**: ${r.format}`);
    lines.push("");
  }

  return matter.stringify(lines.join("\n"), frontmatter);
}
