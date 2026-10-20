import { OPERATOR_TOKEN_ENV, OPERATOR_TOKEN_FILE_ENV } from "../approvals/operator-token.service";

/**
 * process.env minus the operator-only credential (Laws 1 & 4): no agent process may
 * decide approvals. Pass `extra` to layer per-run env on top; the two keys are
 * deleted LAST so `extra` can never reintroduce them. Every `claude` spawn uses this.
 */
export function agentBaseEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env[OPERATOR_TOKEN_ENV];
  delete env[OPERATOR_TOKEN_FILE_ENV];
  return env;
}
