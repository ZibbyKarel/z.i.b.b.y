import { Injectable } from "@nestjs/common";
import type { ClassifyTaskInput, RoutingAlternative, TaskRouting } from "@zibby/contracts";
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
  '{"targetKind":"agent"|"pipeline"|"subsystem","targetId":string,"confidence":number,"reason":string,"matchedTerms":string[],"loop":boolean,"objective":string,"runnerUp":{"targetKind":string,"targetId":string,"confidence":number,"reason":string}|null}',
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
  "- runnerUp is your SECOND-best target from the catalog, scored on the same 0..1",
  "  scale, or null when no other candidate is a plausible fit at all. Do NOT inflate",
  "  the gap between the two to look decisive — a genuinely close call must read as",
  "  close, because a small margin is what makes a human check the routing.",
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
  /**
   * NS2 F10: the model's second-best pick. `undefined` when the reply omitted the
   * field entirely (an old prompt, a partial reply); `null` when the model
   * explicitly said no other candidate fits. Both collapse to a `runnerUp: null`
   * verdict — the distinction has no consumer, and treating "didn't answer" as
   * "no alternative" is the conservative reading (no margin to compute → the
   * confidence floor is what decides, see `TaskClassifierService.isAmbiguous`).
   */
  runnerUp?: RouterAlternative | null;
}

/** NS2 F10: the runner-up as the model reports it, before catalog validation. */
interface RouterAlternative {
  targetKind: string;
  targetId: string;
  confidence: number;
  reason: string;
}

/** Confidences are compared, so they are pinned to the declared 0..1 scale first. */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * NS2 F10 — shape-check the raw `runnerUp` value off the parsed reply. Anything
 * that isn't a complete alternative (missing id, non-numeric confidence, explicit
 * `null`, field absent) becomes `null`: a half-parsed alternative would compute a
 * meaningless margin, and the confidence floor is the correct fallback signal.
 */
function parseAlternative(raw: unknown): RouterAlternative | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const { targetKind, targetId, confidence, reason } = obj;
  if (typeof targetKind !== "string" || typeof targetId !== "string" || targetId.length === 0) {
    return null;
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return {
    targetKind,
    targetId,
    confidence,
    reason: typeof reason === "string" ? reason : "",
  };
}

/**
 * The AI categorizer: runs a one-shot headless `claude -p` "router" that picks a
 * target from the stored catalog. Consistent with how agent/pipeline runs already
 * spawn `claude` (Max subscription, no API key) — but this is a short, captured
 * call rather than a streamed, sandboxed run.
 *
 * Returns `null` on any failure (CLI missing, timeout, non-JSON output, an id not
 * in the catalog, or — NS2 F10 — a reply with no usable `confidence`);
 * {@link TaskClassifierService} then falls back to the keyword scorer, so the
 * endpoint never hard-fails. Skips the spawn entirely under the test runner so the
 * e2e suite is deterministic and never burns quota — the same guard the usage
 * fetcher uses. That guard also means this leg is UNREACHABLE under vitest: the
 * keyword scorer is what produces every verdict there, so a test exercising this
 * class must go through the {@link runClaude} override.
 *
 * NS2 F10 — it also reports a `runnerUp` (the second-best catalog pick, same
 * 0..1 scale) so the classifier can judge ambiguity on the MARGIN between the two
 * rather than on an absolute self-assessment. This class only ever reports; it
 * never sets `ambiguous` — the thresholds live in the classifier.
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
      confidence: clamp01(verdict.confidence),
      reason: verdict.reason.trim() || "Routed by the classifier.",
      matchedTerms: verdict.matchedTerms.filter((t) => typeof t === "string"),
      candidates: candidates.map(toTaskTarget),
      // NS2 F10: the second-best pick, validated against the SAME catalog as the
      // winner — a hallucinated runner-up id is dropped to `null` rather than
      // rejecting the whole verdict, because the winner is independently sound and
      // a missing alternative degrades gracefully (no margin → the confidence floor
      // decides). `ambiguous` is deliberately NOT set here: this router reports, the
      // classifier judges (it owns the thresholds).
      runnerUp: this.resolveRunnerUp(verdict.runnerUp, candidates, chosen),
      ambiguous: false,
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
   * NS2 F10 — validate the model's runner-up against the catalog and project it onto
   * the contract shape. Dropped to `null` when: the model named none; the id/kind
   * isn't in the catalog (a hallucination); or it names the WINNER again (a
   * degenerate reply that would otherwise compute a zero margin and park every
   * task). Each of those means "no usable alternative", which is exactly what
   * `null` says.
   */
  protected resolveRunnerUp(
    reported: RouterAlternative | null | undefined,
    candidates: RoutableTarget[],
    chosen: RoutableTarget,
  ): RoutingAlternative | null {
    if (!reported) return null;
    if (reported.targetId === chosen.id && reported.targetKind === chosen.kind) return null;
    const match = candidates.find(
      (c) => c.id === reported.targetId && c.kind === reported.targetKind,
    );
    if (!match) {
      this.log.debug("router named an unknown runner-up — dropping it", {
        target: `${reported.targetKind}:${reported.targetId}`,
      });
      return null;
    }
    return {
      target: toTaskTarget(match),
      confidence: clamp01(reported.confidence),
      reason: reported.reason.trim() || "Runner-up named by the classifier.",
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
   *
   * `protected` for the same reason {@link runClaude} is: the `VITEST` guard in
   * {@link route} makes that entry point return `null` unconditionally under the
   * test runner, so parsing can only be exercised through a subclass.
   */
  protected parseVerdict(raw: string): RouterVerdict | null {
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
    // NS2 F10: a missing/non-numeric `confidence` makes the verdict UNUSABLE rather
    // than silently 0.5, which is what this used to do. That default was harmless
    // only while nothing read the number; now that a threshold hangs on it
    // (`TaskClassifierService.isAmbiguous`), 0.5 would turn a parse gap into a
    // routing decision — and, sitting mid-scale, into whichever decision the
    // constants happen to make it. Returning null routes to the deterministic
    // keyword scorer instead: an honest "the model didn't answer" outcome.
    if (typeof obj.confidence !== "number" || !Number.isFinite(obj.confidence)) {
      this.log.debug("router verdict has no usable confidence", {
        target: `${kind}:${id}`,
      });
      return null;
    }
    return {
      targetKind: kind,
      targetId: id,
      confidence: obj.confidence,
      reason: typeof obj.reason === "string" ? obj.reason : "",
      matchedTerms: Array.isArray(obj.matchedTerms) ? (obj.matchedTerms as string[]) : [],
      // Phase 11: tolerate both new fields' absence (old prompts / partial replies).
      loop: obj.loop === true,
      objective: typeof obj.objective === "string" ? obj.objective : undefined,
      runnerUp: parseAlternative(obj.runnerUp),
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
