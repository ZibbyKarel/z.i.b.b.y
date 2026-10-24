import { PROJECT_HEALTH_ERROR_MAX } from "@zibby/contracts";

/** The outcome of one health GET — `ok` iff the final response was 2xx. */
export interface CheckUrlResult {
  ok: boolean;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
}

/** Default per-check timeout (ms). */
export const CHECK_URL_TIMEOUT_MS = 10_000;

/**
 * GET `url` once (TODO 11): `redirect: "follow"`, aborted after `timeoutMs`.
 * Never throws — a non-2xx, a timeout, or a network error (even a synchronous
 * throw from `fetchImpl`) all come back as `{ ok: false, error }`. The response
 * body is never read or stored; it is cancelled so the socket is released.
 */
export async function checkUrl(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = CHECK_URL_TIMEOUT_MS,
): Promise<CheckUrlResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const started = performance.now();
  const elapsed = () => Math.max(0, Math.round(performance.now() - started));
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const latencyMs = elapsed();
    // Discard the body without reading it — we only care about the status.
    await res.body?.cancel().catch(() => {});
    return res.ok
      ? { ok: true, httpStatus: res.status, latencyMs }
      : { ok: false, httpStatus: res.status, latencyMs, error: `HTTP ${res.status}` };
  } catch (err) {
    const error = timedOut
      ? `timeout after ${timeoutMs} ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, latencyMs: elapsed(), error: error.slice(0, PROJECT_HEALTH_ERROR_MAX) };
  } finally {
    clearTimeout(timer);
  }
}
