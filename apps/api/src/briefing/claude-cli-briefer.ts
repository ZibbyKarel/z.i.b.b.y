import { Injectable } from "@nestjs/common";
import type { Briefing } from "@zibby/contracts";
import { z } from "zod";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { spawnClaudeCli } from "../shared/spawn-claude-cli";
import { envelopeInbound } from "../shared/text/untrusted-envelope";

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
 * keeps the deterministic headline. It sees the assembled section data (already
 * capped upstream) — `didForYou[].summary` can be an agent run's own log tail,
 * which can verbatim-echo text the agent processed from an already-enveloped
 * Tier-1 channel dispatch, so each summary is enveloped (Law 4) before it enters
 * the prompt rather than assumed trusted.
 */
@Injectable()
export class ClaudeCliBriefer {
  private readonly log: ScopedLogger;

  constructor(logger: LoggerService) {
    this.log = logger.child(ClaudeCliBriefer.name);
  }

  /**
   * Returns a butler-voiced headline, or null to fall back to the deterministic one.
   * An optional `focus` (from the briefing automation's prompt) steers the voice —
   * tone, emphasis, how to write it — without ever touching the deterministic data.
   */
  async headline(briefing: Briefing, focus?: string): Promise<string | null> {
    if (process.env.VITEST) return null;

    let raw: string;
    try {
      raw = await this.runClaude(this.buildPrompt(briefing, focus));
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

  /**
   * Deterministic section data + first lines. `didForYou[].summary` can trace back
   * to an agent's own run-log tail (second-order untrusted, see the class doc), so
   * each summary is enveloped (Law 4) before it enters the prompt.
   */
  private buildPrompt(b: Briefing, focus?: string): string {
    const sections = {
      counts: b.counts,
      needsYou: b.needsYou.slice(0, 5).map((n) => ({ kind: n.kind, summary: n.summary })),
      didForYou: b.didForYou.slice(0, 5).map((d) => envelopeInbound(d.summary)),
      watching: b.watching,
    };
    // Operator steering (e.g. "keep it terse", "lead with what needs me"). It's
    // system-authored config, not inbound channel data, so it can shape the voice.
    const steer = focus?.trim()
      ? ["", `OPERATOR PREFERENCE (shape the voice, never the facts): ${focus.trim()}`]
      : [];
    return [BRIEFER_SYSTEM_PROMPT, ...steer, "", "SECTIONS:", JSON.stringify(sections)].join("\n");
  }

  protected runClaude(prompt: string): Promise<string> {
    return spawnClaudeCli({
      args: ["-p", prompt, "--output-format", "json", "--model", "haiku"],
      timeoutMs: BRIEFER_TIMEOUT_MS,
      label: "briefer",
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
