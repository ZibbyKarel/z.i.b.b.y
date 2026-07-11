/**
 * The daemon could not be reached at all — connection refused, DNS failure, or any
 * other network-level `fetch` rejection that isn't an HTTP response. Controllers map
 * this to `503` (ARCHITECTURE §3 / D-0005 in `~/Workspace/tts`).
 */
export class SpeakdUnreachableError extends Error {
  constructor(cause: string) {
    super(`speakd unreachable: ${cause}`);
    this.name = "SpeakdUnreachableError";
  }
}

/** The request's `AbortSignal.timeout` fired before speakd answered. Maps to `503`. */
export class SpeakdTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`speakd request timed out after ${timeoutMs}ms`);
    this.name = "SpeakdTimeoutError";
  }
}

/**
 * speakd answered with a non-2xx status and its `{error:{code,message}}` envelope
 * (or, if that body was unparseable, a generic status-derived message). `status` is
 * the daemon's own HTTP status — the controller passes through `400`/`409`/`422`
 * verbatim and folds everything else (notably the daemon's `503 loading`) to `503`
 * (see `speechContract`'s doc comment for the status-code rationale). `message` is
 * kept as the daemon's own text (not wrapped) since the controller forwards it
 * verbatim in the `{message}` response body — `status`/`code` carry the rest of the
 * context for logs.
 */
export class SpeakdDaemonError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpeakdDaemonError";
  }
}
