import { Injectable } from "@nestjs/common";
import type { ClassifyTaskInput, TaskRouting } from "@zibby/contracts";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { spawnClaudeCli } from "../shared/spawn-claude-cli";
import { type RoutableTarget, type TaskRouter, toTaskTarget } from "./task-router";

/** How long the headless `claude -p` router may take before we give up and fall back. */
const ROUTER_TIMEOUT_MS = 8000;

/** Cap the task text we hand the router so a giant paste can't bloat the prompt. */
const MAX_TASK_CHARS = 4000;

/**
 * The frozen router system prompt. The catalog is the only volatile part and is
 * appended to the user turn, so this string stays identical across calls.
 */
const ROUTER_SYSTEM_PROMPT = [
  "You are a task router for an agentic OS. Given a task description and a catalog",
  "of available agents, pipelines and subsystems, choose the SINGLE best target to handle it.",
  "",
  "Reply with ONLY a JSON object, no prose and no code fences:",
  '{"targetKind":"agent"|"pipeline"|"subsystem","targetId":string,"confidence":number,"reason":string,"matchedTerms":string[],"loop":boolean,"objective":string}',
  "",
  "- targetId MUST be one of the ids in the catalog — never invent one.",
  '- A "subsystem" row is a whole delegation, not a specific unit: pick it when the task',
  "  clearly fits that subsystem's mandate but no single agent/pipeline in the catalog is",
  "  obviously the best fit — the task is then routed again INSIDE that subsystem to pick",
  "  the specific pipeline or agent. Prefer a concrete agent/pipeline whenever one matches",
  "  well; only fall back to a subsystem row for the broader, mandate-level match.",
  "- confidence is your calibrated 0..1 belief the choice is correct.",
  "- reason is one short sentence a human can read.",
  "- matchedTerms are the catalog/task words that justify the choice.",
  '- loop is true ONLY when the task asks to iterate until a condition holds (e.g. "keep going until the tests pass"); otherwise false.',
  "- objective: when loop is true, a one-line statement of the outcome to drive toward; else an empty string.",
  "- Always still pick a targetKind+targetId — loop is an annotation on that pick, NOT a new target kind.",
].join("\n");

interface RouterVerdict {
  targetKind: "agent" | "pipeline" | "subsystem";
  targetId: string;
  confidence: number;
  reason: string;
  matchedTerms: string[];
  /** Phase 11: the model's iterate-until-satisfied signal (annotation on the maker pick). */
  loop?: boolean;
  /** Phase 11: a one-line objective the model offers when `loop` is true (tolerated, optional). */
  objective?: string;
}

/**
 * The AI categorizer: runs a one-shot headless `claude -p` "router" that picks a
 * target from the stored catalog. Consistent with how agent/pipeline runs already
 * spawn `claude` (Max subscription, no API key) — but this is a short, captured
 * call rather than a streamed, sandboxed run.
 *
 * Returns `null` on any failure (CLI missing, timeout, non-JSON output, an id not
 * in the catalog); {@link TaskClassifierService} then falls back to the keyword
 * scorer, so the endpoint never hard-fails. Skips the spawn entirely under the
 * test runner so the e2e suite is deterministic and never burns quota — the same
 * guard the usage fetcher uses.
 */
@Injectable()
export class ClaudeCliRouter implements TaskRouter {
  private readonly log: ScopedLogger;

  constructor(logger: LoggerService) {
    this.log = logger.child(ClaudeCliRouter.name);
  }

  async route(
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
    preamble?: string,
  ): Promise<TaskRouting | null> {
    if (process.env.VITEST) return null;
    if (candidates.length === 0) return null;

    let raw: string;
    try {
      raw = await this.runClaude(this.buildPrompt(input, candidates, preamble));
    } catch (err) {
      this.log.debug("router CLI call failed", { error: (err as Error).message });
      return null;
    }

    const verdict = this.parseVerdict(raw);
    if (!verdict) return null;

    const chosen = candidates.find(
      (c) => c.id === verdict.targetId && c.kind === verdict.targetKind,
    );
    if (!chosen) {
      this.log.debug("router chose an unknown target", {
        target: `${verdict.targetKind}:${verdict.targetId}`,
      });
      return null;
    }

    return {
      target: toTaskTarget(chosen),
      confidence: Math.min(1, Math.max(0, verdict.confidence)),
      reason: verdict.reason.trim() || "Routed by the classifier.",
      matchedTerms: verdict.matchedTerms.filter((t) => typeof t === "string"),
      candidates: candidates.map(toTaskTarget),
      // Phase 11: carry the model's loop annotation through as the mode overlay. The
      // target stays the maker; the classifier synthesizes the goal proposal + paths.
      mode: verdict.loop ? "loop" : "single",
      proposedGoal: null,
      paths: [],
      // Phase 108: the router itself never invents a grant proposal — that's
      // computed downstream by TaskClassifierService.enrich() (it resolves the
      // target agent's optionalTools, which this router has no access to).
      // Always [] here; enrich() overwrites it unconditionally.
      toolGrants: [],
    };
  }

  /**
   * Serialize the task + catalog into the `-p` user turn. F2b: an optional
   * `preamble` (a subsystem's mandate + owned-unit list) is injected between
   * the frozen system prompt and the task line — extra context for a
   * stage-2 scoped call, absent for the top-level catalog.
   */
  private buildPrompt(
    input: ClassifyTaskInput,
    candidates: RoutableTarget[],
    preamble?: string,
  ): string {
    const catalog = candidates
      .map((c) => `${c.kind}  ${c.id} | ${c.category ?? "-"} | ${c.search}`)
      .join("\n");
    const paths = input.paths?.length ? `\nPATHS: ${input.paths.join(", ")}` : "";
    const text = input.text.slice(0, MAX_TASK_CHARS);
    const parts = [ROUTER_SYSTEM_PROMPT];
    if (preamble) parts.push("", preamble);
    parts.push("", `TASK: ${text}${paths}`, "", "CATALOG:", catalog);
    return parts.join("\n");
  }

  /**
   * Spawn `claude -p … --output-format json`, capture stdout, and resolve its
   * trimmed text. Rejects on a non-zero exit, a spawn error, or the timeout
   * (killing the child). Overridable for tests; production uses the real CLI.
   */
  protected runClaude(prompt: string): Promise<string> {
    return spawnClaudeCli({
      args: ["-p", prompt, "--output-format", "json", "--model", "haiku"],
      timeoutMs: ROUTER_TIMEOUT_MS,
      label: "router",
    });
  }

  /**
   * Parse the router's answer. `--output-format json` wraps the assistant text in
   * a `{ result: "…" }` envelope; the inner text is the verdict JSON (possibly
   * fenced). Returns null on anything that isn't a usable verdict.
   */
  private parseVerdict(raw: string): RouterVerdict | null {
    const inner = this.extractResultText(raw);
    if (inner === null) return null;
    const obj = this.parseJsonObject(inner);
    if (!obj) return null;

    const kind = obj.targetKind;
    const id = obj.targetId;
    if (
      (kind !== "agent" && kind !== "pipeline" && kind !== "subsystem") ||
      typeof id !== "string" ||
      id.length === 0
    ) {
      return null;
    }
    return {
      targetKind: kind,
      targetId: id,
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
      reason: typeof obj.reason === "string" ? obj.reason : "",
      matchedTerms: Array.isArray(obj.matchedTerms) ? (obj.matchedTerms as string[]) : [],
      // Phase 11: tolerate both new fields' absence (old prompts / partial replies).
      loop: obj.loop === true,
      objective: typeof obj.objective === "string" ? obj.objective : undefined,
    };
  }

  /** Unwrap the `{ result }` envelope; tolerate plain text that is already the verdict. */
  private extractResultText(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    try {
      const envelope = JSON.parse(trimmed) as { result?: unknown };
      if (typeof envelope.result === "string") return envelope.result;
      // Already the verdict object, not an envelope.
      if (envelope && typeof envelope === "object" && "targetId" in envelope) return trimmed;
    } catch {
      // Not JSON at all — treat the raw text as the candidate verdict.
    }
    return trimmed;
  }

  /** Parse a JSON object out of text, stripping ``` fences and surrounding prose. */
  private parseJsonObject(text: string): Record<string, unknown> | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
