/** Env var carrying the operator token value (operator-only; never reaches an agent). */
export const OPERATOR_TOKEN_ENV = "ZIBBY_OPERATOR_TOKEN";
/** Env var overriding the operator token file path (absolute; dotenv does not expand `~`). */
export const OPERATOR_TOKEN_FILE_ENV = "ZIBBY_OPERATOR_TOKEN_FILE";

/**
 * process.env minus the operator-only credential (Laws 1 & 4): no agent process may
 * decide approvals. Pass `extra` to layer per-run env on top; the two keys are
 * deleted LAST so `extra` can never reintroduce them. Every `claude` spawn and every
 * git child (a hook in an agent worktree runs with git's env) uses this.
 */
export function agentBaseEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env[OPERATOR_TOKEN_ENV];
  delete env[OPERATOR_TOKEN_FILE_ENV];
  return env;
}
