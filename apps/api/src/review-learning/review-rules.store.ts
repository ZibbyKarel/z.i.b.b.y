import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type ReviewRule,
  type ReviewRuleOccurrence,
  ReviewRuleSchema,
  type ReviewRuleStatus,
} from "@zibby/contracts";
import { ensureDir, resolveSafeFile, safeJson, writeFileAtomic } from "../shared/file-storage";
import { InvalidReviewScopeKeyError } from "./review-rules.errors";

/** DI token carrying the absolute path of the directory holding the per-project files. */
export const REVIEW_RULES_DIR = "REVIEW_RULES_DIR";

/**
 * Filename stem for globally-scoped rules. Leading underscore, so it can never
 * collide with a project id (project ids are kebab slugs).
 */
export const GLOBAL_SCOPE_KEY = "_global";

/**
 * Filename-safe scope key: a project id, or {@link GLOBAL_SCOPE_KEY}. Deliberately
 * permits a leading underscore (unlike the stricter kebab {@link import("@zibby/contracts").REVIEW_RULE_ID_REGEX})
 * so `_global` itself validates, while still rejecting path separators and a
 * leading `.` (so `..` can never even reach the `resolveSafeFile` containment
 * check as a valid-looking id).
 */
const SCOPE_KEY_REGEX = /^[a-zA-Z0-9_](?:[a-zA-Z0-9._-]*[a-zA-Z0-9_])?$/;

/** Occurrences needed before a rule is worth the operator's attention. */
const PROPOSE_AT = 2;

/** What one distilled comment contributes. */
export interface ReviewRuleInput {
  slug: string;
  rule: string;
  rationale?: string;
  occurrence: ReviewRuleOccurrence;
}

/**
 * The learned-rule store: one `<projectId>.json` per project plus `_global.json`,
 * each holding `{ rules, cursor }`. Tolerant parse (a corrupt file reads as empty,
 * never fatal) and atomic writes, mirroring `GateRulesStorageService`.
 *
 * The lifecycle lives here rather than in the pass, so "when does a comment become
 * a proposal" has exactly one implementation: an occurrence is counted at most once
 * (by `commentId`), a rule reaches `proposed` on its {@link PROPOSE_AT}th distinct
 * occurrence, and a `retired` rule keeps absorbing occurrences without ever being
 * proposed again.
 */
@Injectable()
export class ReviewRulesStore {
  private readonly dir: string;

  constructor(@Inject(REVIEW_RULES_DIR) dir: string) {
    this.dir = path.resolve(dir);
  }

  /** Every rule in one scope file (a project id, or {@link GLOBAL_SCOPE_KEY}). */
  async list(scopeKey: string): Promise<ReviewRule[]> {
    return (await this.read(scopeKey)).rules;
  }

  /** The active rules a run of `projectId` should be grounded on. */
  async listGrounded(projectId: string): Promise<{ project: ReviewRule[]; global: ReviewRule[] }> {
    const isActive = (r: ReviewRule): boolean => r.status === "active";
    return {
      project: (await this.list(projectId)).filter(isActive),
      global: (await this.list(GLOBAL_SCOPE_KEY)).filter(isActive),
    };
  }

  /**
   * File one distilled comment. Returns the rule ONLY when this call is what moved
   * it to `proposed` — the caller parks exactly one approval per rule, never one
   * per comment.
   */
  async record(projectId: string, input: ReviewRuleInput, now: Date): Promise<ReviewRule | null> {
    const file = await this.read(projectId);
    const globals = await this.read(GLOBAL_SCOPE_KEY);
    const stamp = now.toISOString();

    // A promoted rule lives in the global file; reinforce it there, don't fork a
    // project-scoped duplicate under the same slug. Dedup is scoped to THIS
    // rule's own occurrences — a commentId that happens to appear on some other
    // rule in the same file must never block a genuinely new occurrence here.
    const inGlobal = globals.rules.find((r) => r.id === input.slug);
    if (inGlobal) {
      if (hasComment(inGlobal, input.occurrence.commentId)) return null;
      inGlobal.occurrences.push(input.occurrence);
      inGlobal.updatedAt = stamp;
      await this.write(GLOBAL_SCOPE_KEY, globals);
      return null;
    }

    const existing = file.rules.find((r) => r.id === input.slug);
    if (!existing) {
      file.rules.push({
        id: input.slug,
        scope: "project",
        rule: input.rule,
        ...(input.rationale ? { rationale: input.rationale } : {}),
        status: "observed",
        occurrences: [input.occurrence],
        createdAt: stamp,
        updatedAt: stamp,
      });
      await this.write(projectId, file);
      return null;
    }

    if (hasComment(existing, input.occurrence.commentId)) return null;

    existing.occurrences.push(input.occurrence);
    existing.updatedAt = stamp;
    const promotes = existing.status === "observed" && existing.occurrences.length >= PROPOSE_AT;
    if (promotes) existing.status = "proposed";
    await this.write(projectId, file);
    return promotes ? existing : null;
  }

  /** Move one rule through its lifecycle; returns null when the rule is unknown. */
  async setStatus(
    scopeKey: string,
    ruleId: string,
    status: ReviewRuleStatus,
    approvalRef?: string,
  ): Promise<ReviewRule | null> {
    const file = await this.read(scopeKey);
    const rule = file.rules.find((r) => r.id === ruleId);
    if (!rule) return null;
    rule.status = status;
    rule.updatedAt = new Date().toISOString();
    if (approvalRef) rule.approvalRef = approvalRef;
    await this.write(scopeKey, file);
    return rule;
  }

  /** Move a rule out of its project file into the global one, occurrences intact. */
  async promoteToGlobal(projectId: string, ruleId: string): Promise<ReviewRule | null> {
    const file = await this.read(projectId);
    const index = file.rules.findIndex((r) => r.id === ruleId);
    const rule = index === -1 ? undefined : file.rules[index];
    if (!rule) return null;

    file.rules.splice(index, 1);
    await this.write(projectId, file);

    const globals = await this.read(GLOBAL_SCOPE_KEY);
    const promoted: ReviewRule = { ...rule, scope: "global", updatedAt: new Date().toISOString() };
    globals.rules = [...globals.rules.filter((r) => r.id !== ruleId), promoted];
    await this.write(GLOBAL_SCOPE_KEY, globals);
    return promoted;
  }

  /** The repo-wide `since` cursor for this project's last successful pass. */
  async cursor(projectId: string): Promise<string | undefined> {
    return (await this.read(projectId)).cursor;
  }

  async setCursor(projectId: string, cursor: string): Promise<void> {
    const file = await this.read(projectId);
    file.cursor = cursor;
    await this.write(projectId, file);
  }

  /**
   * Tolerant per-item parse: a single malformed rule is dropped, never fatal to
   * the other rules in the same file (mirrors `GateRulesStorageService.list()`).
   * Whole-file tolerance (falling back to `{ rules: [] }`) is reserved for when
   * the file can't even be parsed as JSON, or isn't shaped like `{ rules, cursor? }`
   * at all — never for "one of N rules happens to be invalid", since the next
   * write would otherwise silently discard every other still-valid rule.
   */
  private async read(scopeKey: string): Promise<{ rules: ReviewRule[]; cursor?: string }> {
    const raw = await fs.readFile(this.fileOf(scopeKey), "utf8").catch(() => null);
    if (raw === null) return { rules: [] };
    const parsed = safeJson(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return { rules: [] };
    const obj = parsed as Record<string, unknown>;
    const rawRules = Array.isArray(obj.rules) ? obj.rules : [];
    const rules: ReviewRule[] = [];
    for (const item of rawRules) {
      const result = ReviewRuleSchema.safeParse(item);
      if (result.success) rules.push(result.data);
    }
    return { rules, ...cursorOf(obj) };
  }

  private async write(
    scopeKey: string,
    file: { rules: ReviewRule[]; cursor?: string },
  ): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.fileOf(scopeKey), JSON.stringify(file, null, 2));
  }

  /**
   * Map a scope key to `<dir>/<scopeKey>.json`, rejecting anything that could
   * escape `dir` (e.g. a `projectId` containing `../`) instead of silently
   * writing/reading outside it — mirrors `RoadmapStore`'s use of
   * `resolveSafeFile`, the established precedent for a caller-supplied id
   * turned directly into a filename in this codebase.
   */
  private fileOf(scopeKey: string): string {
    const file = resolveSafeFile(this.dir, scopeKey, ".json", SCOPE_KEY_REGEX);
    if (!file) throw new InvalidReviewScopeKeyError(scopeKey);
    return file;
  }
}

/** Has this ONE rule already absorbed this comment? Scoped per-rule so a commentId
 * that happens to collide on some other rule in the same file can never block a
 * genuinely new occurrence on this one — dedup keeps counts honest per rule, not
 * per file. */
function hasComment(rule: ReviewRule, commentId: string): boolean {
  return rule.occurrences.some((o) => o.commentId === commentId);
}

function cursorOf(obj: Record<string, unknown>): { cursor?: string } {
  return typeof obj.cursor === "string" && obj.cursor.length > 0 ? { cursor: obj.cursor } : {};
}
