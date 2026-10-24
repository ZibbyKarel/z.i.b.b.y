import type { PrReviewLevel } from "@zibby/contracts";

/** One entry of `GET /repos/{repo}/pulls/{n}/files` — only what the level choice reads. */
export interface PrFileChange {
  filename: string;
  additions: number;
  deletions: number;
}

const UI_FILE = /\.(tsx|jsx|vue|svelte|css|scss|html)$/i;
const SENSITIVE_PATH = /(auth|security|secret|token|crypto|permission|migration|contract|schema)/i;
const DOC_OR_CONFIG = /\.(md|mdx|txt|rst|ya?ml|json|toml|ini|lock)$/i;
const MAX_LINES_BEFORE_THOROUGH = 500;
const MAX_FILES_BEFORE_THOROUGH = 20;

const isDocOrConfig = (filename: string): boolean =>
  DOC_OR_CONFIG.test(filename) || /(^|\/)docs\//.test(filename);

/**
 * todo-16 — which `pr-review-*` workflow an auto-started review runs, chosen from the PR's
 * changed files. Deterministic, first match wins:
 *
 * 1. `browser` — any UI file (the UI changed, so click through it);
 * 2. `thorough` — any security/contract-sensitive path or `.sql`, more than 500 changed lines in
 *    total, or more than 20 files;
 * 3. `tested` — any file that is not documentation or config;
 * 4. `quick` — docs/config only, including an empty list.
 */
export function selectReviewLevel(files: ReadonlyArray<PrFileChange>): PrReviewLevel {
  if (files.some((f) => UI_FILE.test(f.filename))) return "browser";
  const changedLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  if (
    files.length > MAX_FILES_BEFORE_THOROUGH ||
    changedLines > MAX_LINES_BEFORE_THOROUGH ||
    files.some((f) => SENSITIVE_PATH.test(f.filename) || /\.sql$/i.test(f.filename))
  ) {
    return "thorough";
  }
  if (files.some((f) => !isDocOrConfig(f.filename))) return "tested";
  return "quick";
}
