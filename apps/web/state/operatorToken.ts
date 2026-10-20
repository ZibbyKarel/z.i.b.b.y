export const OPERATOR_TOKEN_STORAGE_KEY = "zibby.operatorToken";

/** The operator-only credential that lets this browser decide approvals; empty when unset. */
export function readOperatorToken(): string {
  try {
    return typeof window === "undefined"
      ? ""
      : (localStorage.getItem(OPERATOR_TOKEN_STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

export function writeOperatorToken(value: string): void {
  try {
    const v = value.trim();
    if (v) localStorage.setItem(OPERATOR_TOKEN_STORAGE_KEY, v);
    else localStorage.removeItem(OPERATOR_TOKEN_STORAGE_KEY);
  } catch {
    /* storage blocked — the next decision gets a 401 and the UI says so */
  }
}

/** True for the API's 401 on a guarded write (ts-rest throws `{ status, body }`). */
export function isOperatorTokenError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 401;
}
