import { describe, expect, it, vi } from "vitest";
import { checkUrl } from "./check-url";

const URL_ = "https://acme.dev/health";

describe("checkUrl", () => {
  it("a 2xx response is ok with its httpStatus and a latency", async () => {
    const fetchImpl = vi.fn(async () => new Response("ignored", { status: 200 }));
    const result = await checkUrl(URL_, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.error).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.latencyMs)).toBe(true);
    // GET, follows redirects, with an abort signal for the timeout.
    expect(fetchImpl).toHaveBeenCalledWith(
      URL_,
      expect.objectContaining({ method: "GET", redirect: "follow", signal: expect.anything() }),
    );
  });

  it("a non-2xx response is down with error 'HTTP <status>'", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    const result = await checkUrl(URL_, fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, httpStatus: 503, error: "HTTP 503" });
  });

  it("a rejected fetch is down with the error message — never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: ECONNREFUSED");
    });
    const result = await checkUrl(URL_, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBeUndefined();
    expect(result.error).toBe("fetch failed: ECONNREFUSED");
  });

  it("a synchronously throwing fetch is down too", async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error("boom");
    });
    const result = await checkUrl(URL_, fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, error: "boom" });
  });

  it("a request outliving the timeout is aborted: error 'timeout after <n> ms'", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const result = await checkUrl(URL_, fetchImpl as unknown as typeof fetch, 20);
    expect(result).toMatchObject({ ok: false, error: "timeout after 20 ms" });
    expect(result.httpStatus).toBeUndefined();
  });

  it("caps a long network error message at 500 chars", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("x".repeat(2000));
    });
    const result = await checkUrl(URL_, fetchImpl as unknown as typeof fetch);
    expect(result.error).toHaveLength(500);
  });
});
