import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { spawnClaudeCli } from "../shared/spawn-claude-cli";

/** How long the headless `claude -p` namer may take before we fall back. */
const NAMER_TIMEOUT_MS = 8000;

/** The namer returns ONLY a title — anything else is discarded (Law 4). */
const TitleSchema = z.object({ title: z.string().min(1).max(80) }).strict();

/** Operator descriptions can be long; the namer only ever sees a capped slice. */
const TEXT_MAX_CHARS = 2000;

const NAMER_SYSTEM_PROMPT = [
  "You name a task from its description for an autonomous assistant's task list.",
  "Write a SHORT title — at most about 8 words, no trailing period — that captures",
  "what the task is about. Match the language of the description (e.g. Czech in,",
  "Czech out). Do not add quotes or commentary.",
  "",
  'Reply with ONLY a JSON object, no prose and no code fences: {"title":string}',
].join("\n");

/**
 * Derives a short task title from the operator's free-text description via a headless
 * `claude -p --model haiku` call. Copies {@link ClaudeCliBriefer}'s shape EXACTLY —
 * 8s timeout, `--output-format json`, the SAME `process.env.VITEST` guard so tests
 * never spawn claude, envelope-unwrap + fence-tolerant parse — and validates the
 * result against a strict one-key schema. NEVER blocks: any failure returns `null`
 * and the caller keeps its deterministic fallback title.
 */
@Injectable()
export class ClaudeCliTaskNamer {
  private readonly log: ScopedLogger;

  constructor(logger: LoggerService) {
    this.log = logger.child(ClaudeCliTaskNamer.name);
  }

  /** Returns a derived title, or null to fall back to a deterministic one. */
  async name(text: string): Promise<string | null> {
    if (process.env.VITEST) return null;
    if (text.trim().length === 0) return null;

    let raw: string;
    try {
      raw = await this.runClaude(this.buildPrompt(text));
    } catch (err) {
      this.log.debug("namer CLI call failed", { error: (err as Error).message });
      return null;
    }

    const obj = this.parse(raw);
    if (!obj) return null;
    const parsed = TitleSchema.safeParse(obj);
    if (!parsed.success) {
      this.log.debug("namer title failed schema (rejected)", {});
      return null;
    }
    return parsed.data.title.trim();
  }

  private buildPrompt(text: string): string {
    return [NAMER_SYSTEM_PROMPT, "", "DESCRIPTION:", text.slice(0, TEXT_MAX_CHARS)].join("\n");
  }

  protected runClaude(prompt: string): Promise<string> {
    return spawnClaudeCli({
      args: ["-p", prompt, "--output-format", "json", "--model", "haiku"],
      timeoutMs: NAMER_TIMEOUT_MS,
      label: "namer",
    });
  }

  /** Unwrap the `{ result }` envelope and parse the inner title JSON (fence-tolerant). */
  private parse(raw: string): unknown {
    const inner = this.extractResultText(raw);
    if (inner === null) return null;
    const start = inner.indexOf("{");
    const end = inner.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(inner.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private extractResultText(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    try {
      const envelope = JSON.parse(trimmed) as { result?: unknown };
      if (typeof envelope.result === "string") return envelope.result;
      if (envelope && typeof envelope === "object" && "title" in envelope) return trimmed;
    } catch {
      // Not JSON — treat the raw text as the candidate.
    }
    return trimmed;
  }
}

/**
 * The always-available deterministic fallback: the first non-empty line of the
 * description, collapsed and truncated to a readable length. Used when the operator
 * left the title blank and the Haiku namer was unavailable or rejected.
 */
export function deriveTitleFallback(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const collapsed = (firstLine ?? text.trim()).replace(/\s+/g, " ");
  if (collapsed.length <= 80) return collapsed;
  return `${collapsed.slice(0, 79)}…`;
}
