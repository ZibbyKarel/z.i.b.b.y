/** Outcome of scanning a chunk of run output for a usage-limit signal. */
export interface LimitDetection {
  /** A usage-limit / rate-limit signal was present in the text. */
  hit: boolean
  /** The reset time (epoch ms) when the output carried one, else null. */
  resetsAt: number | null
}

const NO_HIT: LimitDetection = { hit: false, resetsAt: null }

/**
 * Patterns that mark a usage/rate limit in a `claude` run's output, in priority
 * order — the first that matches wins (the most specific, which also carries the
 * reset epoch, is tried first).
 */
const PATTERNS = [
  /** Claude Code's own message, with a trailing reset epoch (seconds). */
  /Claude(?:\s+AI)?\s+usage\s+limit\s+reached\s*\|\s*(\d+)/i,
  /** Same message without a parseable reset. */
  /Claude(?:\s+AI)?\s+usage\s+limit\s+reached/i,
  /** Generic rate-limit phrasing. */
  /\b(?:rate[- ]?limit(?:ed|ing)?|too\s+many\s+requests)\b/i,
  /** A bare HTTP 429. */
  /\b(?:HTTP\s*)?429\b/,
] as const

/**
 * Scan a chunk of `claude` run output for a usage-limit signal (Layer 2 of the
 * limit tracker). Pure. When the most specific pattern matches it also extracts
 * the reset epoch and returns it as `resetsAt` (epoch ms); the looser patterns
 * only flag the hit. A hit busts the limits cache so the next read re-fetches the
 * authoritative percentages.
 */
export function detectLimit(text: string): LimitDetection {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const epochSeconds = match[1]
    return {
      hit: true,
      resetsAt: epochSeconds === undefined ? null : Number(epochSeconds) * 1000,
    }
  }
  return NO_HIT
}
