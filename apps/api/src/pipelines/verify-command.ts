import { DEFAULT_VERIFY_CHECKS } from "@zibby/contracts"

/** The spawn spec a deterministic verify run uses (no model, no tokens, no gate). */
export interface VerifyCommand {
  command: string
  args: string[]
  spawnCwd?: string
}

/**
 * Assemble the deterministic verify command shared by the pipeline verify stage
 * (Phase 2.1) AND the goal `checks` verifier (Phase 10.2). The check list resolves
 * `commands` (explicit override) → `projectChecks` (the project's own checks) →
 * {@link DEFAULT_VERIFY_CHECKS}, joined with `&&` under one `/bin/sh -c`. Exit 0 →
 * satisfied; non-zero → not. Extracted into one place so a project that overrides
 * its `checks` behaves identically whether run inside a pipeline or a goal.
 */
export function buildVerifyCommand(opts: {
  commands?: string[]
  projectChecks?: string[]
  spawnCwd?: string
}): VerifyCommand {
  const commands = opts.commands ?? opts.projectChecks ?? [...DEFAULT_VERIFY_CHECKS]
  return {
    command: "/bin/sh",
    args: ["-c", commands.join(" && ")],
    ...(opts.spawnCwd ? { spawnCwd: opts.spawnCwd } : {}),
  }
}
