import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiProvidersStore } from "./ai-providers.store";

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
    expect(await store.status()).toEqual({ openai: { configured: false } });
    expect(await store.env()).toEqual({});
    await store.writeOpenAiKey(key);
    expect(JSON.parse(await fs.readFile(path.join(dir, "openai.json"), "utf8"))).toEqual({
      apiKey: key,
    });
    const status = await store.status();
    expect(status).toEqual({ openai: { configured: true, keyHint: "…a1b2" } });
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
});
