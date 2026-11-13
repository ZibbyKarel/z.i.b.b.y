import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_BLUECODE_KEY, withBlueCodeDir } from "./bluecode-fixture";
import { bluecodeProbe } from "./bluecode-provider";
import { AiProvidersStore, BlueCodeError } from "./ai-providers.store";

describe("AiProvidersStore", () => {
  let dir: string;
  let store: AiProvidersStore;
  const key = "sk-test-abcdefghijklmnopqrstuvwxyz-a1b2";

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-providers-test-"));
    store = new AiProvidersStore(dir);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes openai.json, reports only a hint, and exposes the env var", async () => {
    expect((await store.status()).openai).toEqual({ configured: false });
    expect(await store.env()).toEqual({});
    await store.writeOpenAiKey(key);
    expect(JSON.parse(await fs.readFile(path.join(dir, "openai.json"), "utf8"))).toEqual({
      apiKey: key,
    });
    const status = await store.status();
    expect(status.openai).toEqual({ configured: true, keyHint: "…a1b2" });
    expect(JSON.stringify(status)).not.toContain(key);
    expect(await store.env()).toEqual({ OPENAI_API_KEY: key });
  });

  it("clears idempotently and tolerates a malformed file", async () => {
    await store.writeOpenAiKey(key);
    await store.clearOpenAiKey();
    await store.clearOpenAiKey();
    expect((await store.status()).openai.configured).toBe(false);
    await fs.writeFile(path.join(dir, "openai.json"), "{ nope", "utf8");
    expect(await store.readOpenAiKey()).toBeNull();
  });

  describe("BlueCode (A34)", () => {
    const baseUrl = "https://bluecode.example.test/projects/p1/v1";
    const wellKnown = {
      config: {
        provider: {
          "tensic-project-p1": { models: { "llmfactory:local:GLM-5.3": { name: "GLM" } } },
        },
      },
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const mockGateway = (opts: { keyStatus?: number; well?: unknown } = {}) => {
      const calls: string[] = [];
      vi.stubGlobal("fetch", async (url: string) => {
        calls.push(url);
        return url.endsWith("/models")
          ? json({}, opts.keyStatus ?? 200)
          : json(opts.well ?? wellKnown);
      });
      return calls;
    };
    afterEach(() => vi.unstubAllGlobals());

    it("verifies the key, snapshots the models, writes 0600 and reports a hint", async () => {
      const calls = mockGateway();
      await store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY });
      expect(calls).toEqual([
        `${baseUrl}/models`,
        "https://bluecode.example.test/projects/p1/.well-known/opencode",
      ]);
      const file = path.join(dir, "bluecode.json");
      expect(JSON.parse(await fs.readFile(file, "utf8"))).toMatchObject({
        baseUrl,
        apiKey: FAKE_BLUECODE_KEY,
        models: { "llmfactory:local:GLM-5.3": { name: "GLM" } },
      });
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
      const status = await store.status();
      expect(status.bluecode).toEqual({
        configured: true,
        keyHint: "…0000",
        baseUrl,
        modelCount: 1,
      });
      expect(JSON.stringify(status)).not.toContain(FAKE_BLUECODE_KEY);
    });

    it("refreshes without a key, and refuses when none is stored", async () => {
      mockGateway();
      await expect(store.writeBlueCode({ baseUrl })).rejects.toThrow(BlueCodeError);
      await store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY });
      await store.writeBlueCode({ baseUrl });
      expect(JSON.parse(await fs.readFile(path.join(dir, "bluecode.json"), "utf8")).apiKey).toBe(
        FAKE_BLUECODE_KEY,
      );
    });

    it("rejects a refused key and an unreadable or empty model list, writing nothing", async () => {
      mockGateway({ keyStatus: 401 });
      await expect(store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY })).rejects.toThrow(
        /rejected the key/,
      );
      mockGateway({ well: { config: { provider: { p: { models: {} } } } } });
      await expect(store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY })).rejects.toThrow(
        /model list/,
      );
      expect((await store.status()).bluecode.configured).toBe(false);
    });

    it("clears idempotently, probe file included", async () => {
      mockGateway();
      await store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY });
      const probe = path.join(dir, "bluecode-probe.json");
      expect((await fs.stat(probe)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await fs.readFile(probe, "utf8")).provider.bluecode.options.apiKey).toBe(
        FAKE_BLUECODE_KEY,
      );
      await store.clearBlueCode();
      await store.clearBlueCode();
      expect((await store.status()).bluecode).toEqual({ configured: false });
      await expect(fs.stat(probe)).rejects.toThrow();
    });

    it("bluecodeProbe re-creates a missing probe file (0600) and is null when unconfigured", async () => {
      const bc = await withBlueCodeDir(true);
      try {
        const probe = path.join(bc.dir, "bluecode-probe.json");
        await fs.rm(probe);
        expect(bluecodeProbe(bc.dir)?.env.OPENCODE_CONFIG).toBe(probe);
        expect((await fs.stat(probe)).mode & 0o777).toBe(0o600);
        expect(await fs.readFile(probe, "utf8")).toContain(FAKE_BLUECODE_KEY);
      } finally {
        await bc.restore();
      }
      const none = await withBlueCodeDir(false);
      try {
        expect(bluecodeProbe(none.dir)).toBeNull();
      } finally {
        await none.restore();
      }
    });

    it("refuses a keyless refresh for a different base URL", async () => {
      mockGateway();
      await store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY });
      await expect(
        store.writeBlueCode({ baseUrl: "https://evil.example.test/projects/p1/v1" }),
      ).rejects.toThrow(/Re-enter the API key/);
    });

    it("strips unknown model keys and rejects bad ids / not exactly one provider", async () => {
      const entry = {
        name: "GLM",
        reasoning: true,
        headers: { "X-Evil": "1" },
        options: { baseURL: "https://evil.test" },
        provider: "x",
        npm: "evil-pkg",
        variants: { low: {} },
      };
      mockGateway({ well: { config: { provider: { p: { models: { "a:b": entry } } } } } });
      await store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY });
      const saved = JSON.parse(await fs.readFile(path.join(dir, "bluecode.json"), "utf8"));
      expect(saved.models["a:b"]).toEqual({ name: "GLM", reasoning: true, variants: { low: {} } });

      for (const well of [
        { config: { provider: { p: { models: { "bad id": entry } } } } },
        { config: { provider: {} } },
        {
          config: {
            provider: { p: { models: { a: entry } }, q: { models: { b: entry } } },
          },
        },
      ]) {
        mockGateway({ well });
        await expect(store.writeBlueCode({ baseUrl, apiKey: FAKE_BLUECODE_KEY })).rejects.toThrow(
          BlueCodeError,
        );
      }
    });
  });
});
