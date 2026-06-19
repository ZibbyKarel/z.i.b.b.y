import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { retries: 3, baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "recovered";
    });
    const onRetry = vi.fn();
    expect(await withRetry(fn, { retries: 3, baseMs: 1, onRetry })).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // before the 2nd and 3rd attempts
    expect(onRetry.mock.calls[0]?.[0]).toBe(1);
  });

  it("rethrows the last error after exhausting attempts (total = retries + 1)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("persistent");
    });
    await expect(withRetry(fn, { retries: 2, baseMs: 1 })).rejects.toThrow("persistent");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops early when shouldRetry returns false (fail fast on a permanent error)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("400 bad request");
    });
    await expect(
      withRetry(fn, { retries: 5, baseMs: 1, shouldRetry: (e) => !String(e).includes("400") }),
    ).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses exponential delays (baseMs * 2^n)", async () => {
    const delays: number[] = [];
    const sleepSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      cb: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0);
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const fn = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(withRetry(fn, { retries: 3, baseMs: 100 })).rejects.toThrow();
    expect(delays).toEqual([100, 200, 400]);
    sleepSpy.mockRestore();
  });
});
