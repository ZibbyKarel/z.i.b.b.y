import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { AGENT_ID_REGEX, type ReviewRule } from "@zibby/contracts";
import matter from "gray-matter";
import { VAULT_DIR } from "../memory/vault.service";
import { ensureDir, resolveSafeFile, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { GLOBAL_SCOPE_KEY, ReviewRulesStore } from "./review-rules.store";

/** Cap on rules rendered into one note — the grounding block has a char budget. */
export const MAX_RENDERED_RULES = 25;

/**
 * Mirrors the ACTIVE learned rules into vault notes that `GroundingService` loads
 * unconditionally. Writes are fire-and-forget side effects of a rule's lifecycle
 * (the `ProjectVaultService` posture): a failed mirror is logged, never fatal —
 * rules are reinforcing, not blocking.
 */
@Injectable()
export class ReviewRulesVaultService {
  private readonly vaultDir: string;
  private readonly projectsDir: string;
  private readonly log: ScopedLogger;

  constructor(
    @Inject(VAULT_DIR) vaultDir: string,
    private readonly store: ReviewRulesStore,
    logger: LoggerService,
  ) {
    this.vaultDir = vaultDir;
    this.projectsDir = path.join(vaultDir, "projects");
    this.log = logger.child(ReviewRulesVaultService.name);
  }

  /** Rewrite one project's rules note from its active rules. */
  async render(projectId: string): Promise<void> {
    try {
      // M7: reject a projectId that could escape `projectsDir` (e.g. `../`)
      // instead of silently writing outside it — mirrors `ReviewRulesStore.fileOf`.
      const file = resolveSafeFile(this.projectsDir, projectId, "-review-rules.md", AGENT_ID_REGEX);
      if (!file) {
        this.log.warn("refusing to render review rules note for unsafe project id", { projectId });
        return;
      }

      const { project } = await this.store.listGrounded(projectId);
      // Defense-in-depth (mirrors `renderGlobal`'s re-filter below): never trust
      // an injected dependency's contract alone for the one guarantee — only
      // `active` rules ever reach a note — that keeps unapproved PR-derived
      // text (Law 4) out of every future prompt.
      const active = project.filter((r) => r.status === "active");
      await ensureDir(this.projectsDir);
      await writeFileAtomic(
        file,
        serialize(active, {
          title: `Naučená review pravidla — ${projectId}`,
          // M7: explicit ownership, so grounding's isolation filter can never leak
          // one project's rules into another project's run.
          project: projectId,
        }),
      );
    } catch (err) {
      this.log.warn("review rules note render failed", { projectId, error: String(err) });
    }
  }

  /** Rewrite the cross-project rules note. */
  async renderGlobal(): Promise<void> {
    try {
      const rules = (await this.store.list(GLOBAL_SCOPE_KEY)).filter((r) => r.status === "active");
      const file = path.join(this.vaultDir, "review-rules.md");
      await ensureDir(this.vaultDir);
      await writeFileAtomic(file, serialize(rules, { title: "Naučená review pravidla" }));
    } catch (err) {
      this.log.warn("global review rules note render failed", { error: String(err) });
    }
  }
}

/**
 * `rule.rule` / `rule.rationale` are model output distilled from attacker-
 * controllable PR comments (Law 4) — this note gets prepended verbatim into
 * every future run's prompt. Collapsing internal newlines/CR to a single space
 * guarantees each rendered rule stays on exactly the one `- ` line it was
 * written to: without an embedded newline, an attacker-chosen value can never
 * start a *new* line of its own, so it can never fake a markdown heading, a
 * ``` fence, or a YAML/frontmatter `---` delimiter (all of which require being
 * alone at the start of a line to take effect).
 */
function sanitizeInline(text: string): string {
  return text.replace(/\r\n|\r|\n/g, " ").trim();
}

function serialize(rules: ReviewRule[], frontmatter: Record<string, unknown>): string {
  const sorted = [...rules].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = sorted.slice(0, MAX_RENDERED_RULES);
  const dropped = sorted.length - shown.length;

  const lines: string[] = [`# ${String(frontmatter.title)}`, ""];
  if (shown.length === 0) {
    lines.push("Zatím žádné schválené pravidlo z review.", "");
  } else {
    lines.push("Tato pravidla vznikla z opakovaných review komentářů a operátor je schválil.", "");
    for (const rule of shown) {
      const text = sanitizeInline(rule.rule);
      const why = rule.rationale ? ` _(${sanitizeInline(rule.rationale)})_` : "";
      lines.push(`- ${text}${why}`);
    }
    lines.push("");
    if (dropped > 0)
      lines.push(`_Dalších ${dropped} pravidel se do rozpočtu promptu nevešlo._`, "");
  }

  return matter.stringify(lines.join("\n"), { ...frontmatter, type: "pattern" });
}
