import { DEFAULT_VERIFY_CHECKS } from "@zibby/contracts";

/** The spawn spec a deterministic verify run uses (no model, no tokens, no gate). */
export interface VerifyCommand {
  command: string;
  args: string[];
  spawnCwd?: string;
}

/**
 * Assemble the deterministic verify command shared by the workflow verify stage
 * (Phase 2.1) AND the goal `checks` verifier (Phase 10.2). The check list resolves
 * `commands` (explicit override) → `projectChecks` (the project's own checks) →
 * {@link DEFAULT_VERIFY_CHECKS}, joined with `&&` under one `/bin/sh -c`. Exit 0 →
 * satisfied; non-zero → not. Extracted into one place so a project that overrides
 * its `checks` behaves identically whether run inside a workflow or a goal.
 */
export function resolveVerifyChecks(opts: {
  commands?: string[];
  projectChecks?: string[];
}): string[] {
  return opts.commands ?? opts.projectChecks ?? [...DEFAULT_VERIFY_CHECKS];
}

/**
 * Wrap the joined checks so they run in a throwaway detached worktree of HEAD
 * (committed state only, no untracked/dirty files), installing from the lockfile
 * first. The checks' exit code is propagated; cleanup never overrides it.
 */
function cleanCheckoutScript(checks: string): string {
  return `src=$(pwd)
co=$(mktemp -d "\${TMPDIR:-/tmp}/zibby-verify.XXXXXX") || exit 97
if ! git -C "$src" worktree add --detach --quiet "$co" HEAD; then rmdir "$co"; echo "verify: clean checkout of HEAD failed" >&2; exit 97; fi
echo "verify: clean checkout of $(git -C "$co" rev-parse HEAD)"
(
  cd "$co" || exit 97
  if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --prefer-offline || exit $?
  elif [ -f package-lock.json ]; then npm ci || exit $?
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile || exit $?
  fi
  ${checks}
)
code=$?
git -C "$src" worktree remove --force "$co" >/dev/null 2>&1 || { rm -rf "$co"; git -C "$src" worktree prune; }
exit $code`;
}

export function buildVerifyCommand(opts: {
  commands?: string[];
  projectChecks?: string[];
  spawnCwd?: string;
  cleanCheckout?: boolean;
}): VerifyCommand {
  const joined = resolveVerifyChecks(opts).join(" && ");
  return {
    command: "/bin/sh",
    args: ["-c", opts.cleanCheckout ? cleanCheckoutScript(joined) : joined],
    ...(opts.spawnCwd ? { spawnCwd: opts.spawnCwd } : {}),
  };
}
