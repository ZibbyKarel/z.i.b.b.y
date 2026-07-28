import { type DecompositionArtifact, DecompositionArtifactSchema } from "@zibby/contracts";

/**
 * Phase 125g — pull the decomposition agent's terminal artifact out of its raw
 * run log. The decomposition agent is instructed (see the `roadmap-decomposer`
 * agent definition) to answer with NOTHING but a single JSON array; in
 * practice a run log can still carry tool-call chatter, a leading/trailing
 * markdown code fence, or reasoning text around it. Rather than assume the
 * artifact is the log's last line (too brittle against pretty-printed JSON or
 * a fence), this scans the WHOLE log once for the LAST top-level,
 * bracket-balanced `[...]` span — string-aware, so a `]` or `[` inside a
 * quoted description never miscounts. The *last* span is preferred because
 * the agent's final answer is, by construction, the last thing in the log.
 *
 * Bounded (only the tail of a very long log is scanned) and NEVER throws —
 * mirrors `adf-to-markdown.ts`'s posture toward a field this deterministic
 * either owns (Law 4: this artifact is agent-produced, i.e. exactly as
 * untrusted as an imported issue body — a malformed reply degrades to "no
 * artifact", never a crash that would strand the reconcile loop).
 */
const MAX_SCAN_CHARS = 200_000;

/** Find the last top-level (bracket-depth-0-to-1-and-back) `[...]` span in `text`, or null. */
function lastTopLevelJsonArray(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  let match: string | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "]") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          match = text.slice(start, i + 1);
          start = -1;
        }
      }
    }
  }
  return match;
}

/**
 * Parse + validate a decomposition run's raw log content into a
 * {@link DecompositionArtifact}. Returns `null` on anything short of a valid
 * artifact — no JSON array found, malformed JSON, or a shape that fails
 * {@link DecompositionArtifactSchema} — so the caller can mark the run
 * `failed` exactly like "no artifact" already does for an ordinary roadmap
 * item's run (master plan: "No artifact / run errored -> failed").
 */
export function extractDecompositionArtifact(log: string): DecompositionArtifact | null {
  const text = log.length > MAX_SCAN_CHARS ? log.slice(-MAX_SCAN_CHARS) : log;
  const candidate = lastTopLevelJsonArray(text);
  if (candidate === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  const result = DecompositionArtifactSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
