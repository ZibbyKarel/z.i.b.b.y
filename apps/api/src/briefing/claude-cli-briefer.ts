import { spawn } from "node:child_process";
import { Injectable } from "@nestjs/common";
import type { Briefing } from "@zibby/contracts";
import { z } from "zod";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** How long the headless `claude -p` briefer may take before we fall back. */
const BRIEFER_TIMEOUT_MS = 8000;

/** The briefer returns ONLY a headline — anything else is discarded (Law 4). */
const HeadlineSchema = z.object({ headline: z.string().max(200) }).strict();

const BRIEFER_SYSTEM_PROMPT = [
  "You are a butler writing a single-line morning briefing headline for the",
  "operator of an autonomous assistant. You are given the deterministic section",
  "data (counts + the first lines). Summarise it in ONE warm, concise sentence —",
  "what needs them, what you handled. If nothing needs them, say so plainly.",
  "",
  'Reply with ONLY a JSON object, no prose and no code fences: {"headline":string}',
].join("\n");

/**
 * The optional butler-voice pass over an assembled briefing (Phase 6.2). Copies
 * {@link ClaudeCliTriager}'s shape EXACTLY — 8s timeout, `--model haiku
 * --output-format json`, the SAME `process.env.VITEST` guard so tests never spawn
 * claude, envelope-unwrap + fence-tolerant parse — and validates the result against
 * a strict one-key schema. NEVER blocks: any failure returns `null` and the caller
 * keeps the deterministic headline. It only ever sees the assembled section data
 * (already sanitized/capped upstream), never raw channel text.
 */
@Injectable()
export class ClaudeCliBriefer {
  private readonly log: ScopedLogger;

  constructor(logger: LoggerService) {
    this.log = logger.child(ClaudeCliBriefer.name);
  }

  /** Returns a butler-voiced headline, or null to fall back to the deterministic one. */
  async headline(briefing: Briefing): Promise<string | null> {
    if (process.env.VITEST) return null;

    let raw: string;
    try {
      raw = await this.runClaude(this.buildPrompt(briefing));
    } catch (err) {
      this.log.debug("briefer CLI call failed", { error: (err as Error).message });
      return null;
    }

    const obj = this.parse(raw);
    if (!obj) return null;
    const parsed = HeadlineSchema.safeParse(obj);
    if (!parsed.success) {
      this.log.debug("briefer headline failed schema (rejected)", {});
      return null;
    }
    return parsed.data.headline;
  }

  /** Operator-system data only (counts + first lines) — never raw inbound text. */
  private buildPrompt(b: Briefing): string {
    const sections = {
      counts: b.counts,
      needsYou: b.needsYou.slice(0, 5).map((n) => ({ kind: n.kind, summary: n.summary })),
      didForYou: b.didForYou.slice(0, 5).map((d) => d.summary),
      watching: b.watching,
    };
    return [BRIEFER_SYSTEM_PROMPT, "", "SECTIONS:", JSON.stringify(sections)].join("\n");
  }

  protected runClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.env.CLAUDE_BIN ?? "claude",
        ["-p", prompt, "--output-format", "json", "--model", "haiku"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`briefer timed out after ${BRIEFER_TIMEOUT_MS}ms`));
      }, BRIEFER_TIMEOUT_MS);
      timer.unref?.();

      child.stdout?.on("data", (buf: Buffer) => {
        stdout += buf.toString("utf8");
      });
      child.stderr?.on("data", (buf: Buffer) => {
        stderr += buf.toString("utf8");
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
      });
    });
  }

  /** Unwrap the `{ result }` envelope and parse the inner headline JSON (fence-tolerant). */
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
      if (envelope && typeof envelope === "object" && "headline" in envelope) return trimmed;
    } catch {
      // Not JSON — treat the raw text as the candidate.
    }
    return trimmed;
  }
}
