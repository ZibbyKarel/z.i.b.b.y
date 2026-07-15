import { describe, expect, it } from "vitest";
import { redact, safeStringify } from "./serialize";

describe("redact", () => {
  it("redacts a deny-listed key at top level and keeps a sibling non-secret key", () => {
    const out = redact({ password: "hunter2", username: "karel" });
    expect(out).toEqual({ password: "[redacted]", username: "karel" });
  });

  it("redacts every deny-listed key kind", () => {
    const out = redact({
      token: "t",
      apiKey: "a",
      api_key: "a2",
      secret: "s",
      env: { FOO: "bar" },
      headers: { Authorization: "Bearer x" },
      credentials: { user: "u", pass: "p" },
      note: "keep me",
    });
    expect(out).toEqual({
      token: "[redacted]",
      apiKey: "[redacted]",
      api_key: "[redacted]",
      secret: "[redacted]",
      env: "[redacted]",
      headers: "[redacted]",
      credentials: "[redacted]",
      note: "keep me",
    });
  });

  it("matches deny-listed keys as a substring (e.g. slackApiToken, botPassword)", () => {
    const out = redact({ slackApiToken: "x", botPassword: "y", displayName: "z" });
    expect(out).toEqual({
      slackApiToken: "[redacted]",
      botPassword: "[redacted]",
      displayName: "z",
    });
  });

  it("is case-insensitive on the key", () => {
    const out = redact({ Token: "t", PASSWORD: "p", Name: "n" });
    expect(out).toEqual({ Token: "[redacted]", PASSWORD: "[redacted]", Name: "n" });
  });

  it("recurses into nested objects", () => {
    const out = redact({
      integration: { id: "1", credentials: { token: "abc" }, kind: "slack" },
    });
    expect(out).toEqual({
      integration: { id: "1", credentials: "[redacted]", kind: "slack" },
    });
  });

  it("recurses into arrays, including arrays of objects", () => {
    const out = redact({
      servers: [
        { name: "a", secret: "s1" },
        { name: "b", secret: "s2" },
      ],
      tags: ["password", "token"], // plain strings in an array are not keys, so untouched
    });
    expect(out).toEqual({
      servers: [
        { name: "a", secret: "[redacted]" },
        { name: "b", secret: "[redacted]" },
      ],
      tags: ["password", "token"],
    });
  });

  it("does not mutate the original value", () => {
    const original = { password: "hunter2", nested: { token: "abc" } };
    const snapshot = JSON.parse(JSON.stringify(original)) as unknown;
    redact(original);
    expect(original).toEqual(snapshot);
  });

  it("guards against cycles instead of blowing the stack", () => {
    const obj: Record<string, unknown> = { name: "x" };
    obj.self = obj;
    expect(() => redact(obj)).not.toThrow();
    const out = redact(obj) as Record<string, unknown>;
    expect(out.name).toBe("x");
    expect(out.self).toBe("[Circular]");
  });

  it("passes through non-plain values (Date, null, primitives) unredacted", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    expect(redact(date)).toBe(date);
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
    expect(redact("plain string")).toBe("plain string");
    expect(redact(true)).toBe(true);
  });

  it("redacts kebab-case api-key (not just apikey/api_key)", () => {
    const out = redact({ "api-key": "sk-live-123", name: "keep me" });
    expect(out).toEqual({ "api-key": "[redacted]", name: "keep me" });
  });

  it("redacts a deny-listed own-enumerable field on a non-plain class instance", () => {
    class Config {
      constructor(
        public token: string,
        public name: string,
      ) {}
    }
    const instance = new Config("secret-token", "svc");
    const out = redact(instance);
    expect(out).toEqual({ token: "[redacted]", name: "svc" });
  });

  it("redacts a deny-listed own-enumerable field on an Error instance nested in a value", () => {
    const err = new Error("boom") as Error & { apiKey?: string };
    err.apiKey = "sk-live-456";
    const out = redact({ cause: err }) as { cause: Record<string, unknown> };
    // Error's `message`/`stack` are own but non-enumerable, so they never
    // appear here — only the custom own-enumerable `apiKey` does, and it's
    // redacted.
    expect(out.cause).toEqual({ apiKey: "[redacted]" });
  });

  it("passes a Date value through unchanged so it still serializes to its ISO string", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const out = redact({ createdAt: date }) as { createdAt: Date };
    expect(out.createdAt).toBe(date);
    expect(safeStringify(out)).toBe('{"createdAt":"2026-01-01T00:00:00.000Z"}');
  });
});
