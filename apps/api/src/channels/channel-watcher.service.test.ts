import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ModuleRef } from "@nestjs/core";
import type { CreateIntegrationInput, Integration } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsStore } from "../integrations/credentials.store";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import type { ChannelAdapter, PollContext, PollResult } from "./adapters/adapter";
import { MAX_ZIBBY_PR_READS } from "./adapters/adapter";
import { AdapterRegistry } from "./adapters/adapter-registry";
import { ChannelEventsService } from "./channel-events.service";
import { ChannelItemStore } from "./channel-item.store";
import { ChannelWatcherService } from "./channel-watcher.service";

/** A registry on the fake adapter (CHANNEL_FAKE_DIR is set per-test → fake mode). */
const makeRegistry = () => new AdapterRegistry();

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};
const fakeTrace = { run: (_ctx: unknown, fn: () => unknown) => fn() };

const slack = (id: string): CreateIntegrationInput => ({
  id,
  kind: "slack",
  projectId: "acme-app",
  config: { kind: "slack", channels: ["C1"] },
});

const github = (id: string): CreateIntegrationInput => ({
  id,
  kind: "github",
  projectId: "acme-app",
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"], username: "karel" },
});

/** A fake `ModuleRef.get` — the escape hatch `zibbyPrNumbersFor` resolves
 * `ZibbyPrLocator` through. `locator` absent simulates the provider not being
 * reachable (e.g. `ChannelsModule` alone, no `ReviewLearningModule` up) by throwing,
 * exercising the fail-open path. */
function fakeModuleRef(locator?: { numbersFor: (projectId: string) => Promise<number[]> }) {
  return {
    get: () => {
      if (!locator) throw new Error("ZibbyPrLocator not reachable in this test");
      return locator;
    },
  } as unknown as ModuleRef;
}

/** A registry whose `resolve` returns a spy adapter recording every `poll()` call
 * (including the `ctx` argument) instead of doing real work — used to assert what
 * `pollOne` hands the adapter, independent of any adapter's own poll behaviour. */
function spyRegistry(calls: Array<{ integrationId: string; ctx: PollContext | undefined }>) {
  const adapter: ChannelAdapter = {
    kind: "fake",
    test: async () => ({ ok: true, detail: "spy" }),
    poll: (integration: Integration, _creds, _cursor, ctx): Promise<PollResult> => {
      calls.push({ integrationId: integration.id, ctx });
      return Promise.resolve({ items: [], cursor: undefined });
    },
    send: async () => {},
  };
  return { resolve: () => adapter } as unknown as AdapterRegistry;
}

describe("ChannelWatcherService", () => {
  let root: string;
  let integrationsDir: string;
  let credentialsDir: string;
  let channelsDir: string;
  let fakeDir: string;
  let integrations: IntegrationsStorageService;
  let credentials: CredentialsStore;
  let store: ChannelItemStore;
  let events: ChannelEventsService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-test-"));
    integrationsDir = path.join(root, "integrations");
    credentialsDir = path.join(root, "credentials");
    channelsDir = path.join(root, "channels");
    fakeDir = path.join(root, "fake");
    integrations = new IntegrationsStorageService(
      integrationsDir,
      path.join(root, "integration-state"),
    );
    credentials = new CredentialsStore(credentialsDir);
    store = new ChannelItemStore(channelsDir);
    events = new ChannelEventsService();
    await Promise.all([
      integrations.onModuleInit(),
      credentials.onModuleInit(),
      store.onModuleInit(),
    ]);
    process.env.CHANNEL_FAKE_DIR = fakeDir;
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    delete process.env.CHANNEL_FAKE_DIR;
  });

  /** Seed a fixture message file for an integration under the fake dir. */
  async function seed(integrationId: string, name: string, text: string) {
    const dir = path.join(fakeDir, integrationId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, name),
      JSON.stringify({ text, receivedAt: "2026-06-12T00:00:00.000Z" }),
    );
  }

  function makeWatcher(registry: AdapterRegistry, moduleRef: ModuleRef = fakeModuleRef()) {
    return new ChannelWatcherService(
      integrations,
      credentials,
      registry,
      store,
      events,
      fakeLogger as never,
      fakeTrace as never,
      { record: async () => {} } as never,
      fakeSystemConfigStore(),
      // F6c watcher-health registry double — registration is exercised in the
      // base/e2e specs, not here.
      { register: () => {} } as never,
      moduleRef,
    );
  }

  it("persists polled messages as `new` and advances the cursor after persist", async () => {
    await integrations.create(slack("team"));
    await credentials.write("team", { token: "xoxb-1" });
    await seed("team", "001.json", "bug report");
    const watcher = makeWatcher(makeRegistry());

    const ids = await watcher.tick();
    expect(ids.length).toBe(1);
    const items = await store.list({ integrationId: "team" });
    expect(items[0]!.state).toBe("new");
    expect(items[0]!.text).toBe("bug report");
    expect(await store.readCursor("team")).toBe("001.json");
  });

  it("does not duplicate on a second tick (dedup + cursor honored)", async () => {
    await integrations.create(slack("team"));
    await credentials.write("team", { token: "xoxb-1" });
    await seed("team", "001.json", "first");
    const watcher = makeWatcher(makeRegistry());

    await watcher.tick();
    const second = await watcher.tick();
    expect(second).toEqual([]); // nothing new ingested
    expect((await store.list({ integrationId: "team" })).length).toBe(1);
  });

  it("skips disabled and credential-less integrations", async () => {
    await integrations.create({ ...slack("disabled"), enabled: false });
    await credentials.write("disabled", { token: "xoxb-1" });
    await seed("disabled", "001.json", "ignored");

    await integrations.create(slack("nocreds"));
    await seed("nocreds", "001.json", "ignored");

    const watcher = makeWatcher(makeRegistry());
    expect(await watcher.tick()).toEqual([]);
    expect((await store.list()).length).toBe(0);
  });

  it("isolates a failing integration: it stamps lastError and the others still ingest", async () => {
    await integrations.create(slack("bad"));
    await credentials.write("bad", { token: "xoxb-1" });
    await integrations.create(slack("good"));
    await credentials.write("good", { token: "xoxb-1" });
    await seed("good", "001.json", "works");

    // A registry whose adapter throws for "bad" but is the real fake for "good".
    const real = makeRegistry();
    const registry = {
      resolve: (kind: "slack" | "email") => {
        const adapter = real.resolve(kind);
        return {
          ...adapter,
          poll: vi.fn((integration, creds, cursor) =>
            integration.id === "bad"
              ? Promise.reject(new Error("boom"))
              : adapter.poll(integration, creds, cursor),
          ),
        };
      },
    } as unknown as AdapterRegistry;

    const watcher = makeWatcher(registry);
    const ids = await watcher.tick();
    expect(ids).toEqual(["good-001"]);
    expect((await integrations.get("bad")).status).toBe("error");
    expect((await integrations.get("bad")).lastError).toContain("boom");
    expect((await integrations.get("good")).status).toBe("connected");
  });

  it("T7 — two rapid timer-driven firings run tick() once (TickingWatcherBase guard)", async () => {
    const watcher = makeWatcher(makeRegistry());
    let resolveFirst: () => void = () => {};
    const deferred = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const tickSpy = vi.spyOn(watcher, "tick").mockImplementation(async () => {
      await deferred;
      return [];
    });
    // `tick()` itself stays public/unguarded (existing tests above call it directly);
    // the guard sits only on the timer-driven path — simulate two `setInterval`
    // firings via the base's protected entry point.
    const guardedTick = () =>
      (watcher as unknown as { guardedTick(): Promise<void> }).guardedTick();

    const first = guardedTick();
    const second = guardedTick();
    await second; // skipped — resolves without waiting on the first
    expect(tickSpy).toHaveBeenCalledTimes(1);

    resolveFirst();
    await first;
    expect(tickSpy).toHaveBeenCalledTimes(1); // still once — the skipped firing never ran tick()
  });

  it("passes zibbyPrNumbers to a github integration's poll, but not a slack integration's (phase-126a)", async () => {
    await integrations.create(github("gh"));
    await credentials.write("gh", { token: "ghp" });
    await integrations.create(slack("team"));
    await credentials.write("team", { token: "xoxb-1" });

    const calls: Array<{ integrationId: string; ctx: PollContext | undefined }> = [];
    const moduleRef = fakeModuleRef({ numbersFor: async () => [7, 9] });
    const watcher = makeWatcher(spyRegistry(calls), moduleRef);

    await watcher.tick();

    expect(calls.find((c) => c.integrationId === "gh")?.ctx).toEqual({ zibbyPrNumbers: [7, 9] });
    expect(calls.find((c) => c.integrationId === "team")?.ctx).toBeUndefined();
  });

  it("fails open when ZibbyPrLocator throws — the poll still runs, with an empty PR-number set", async () => {
    await integrations.create(github("gh"));
    await credentials.write("gh", { token: "ghp" });

    const calls: Array<{ integrationId: string; ctx: PollContext | undefined }> = [];
    // No locator registered — fakeModuleRef()'s `.get` throws, exercising the
    // fail-open path in `zibbyPrNumbersFor`.
    const watcher = makeWatcher(spyRegistry(calls), fakeModuleRef());

    const ids = await watcher.tick();

    expect(ids).toEqual([]); // no crash, no exhausted-retry error
    expect(calls[0]?.ctx).toEqual({ zibbyPrNumbers: [] });
    expect((await integrations.get("gh")).status).toBe("connected");
  });

  it("caps the PR-number set — the adapter turns each number into its own request", async () => {
    await integrations.create(github("gh"));
    await credentials.write("gh", { token: "ghp" });

    const overCap = Array.from({ length: MAX_ZIBBY_PR_READS + 5 }, (_, i) => i + 1);
    const calls: Array<{ integrationId: string; ctx: PollContext | undefined }> = [];
    const watcher = makeWatcher(
      spyRegistry(calls),
      fakeModuleRef({ numbersFor: async () => overCap }),
    );

    await watcher.tick();

    expect(calls[0]?.ctx?.zibbyPrNumbers).toHaveLength(MAX_ZIBBY_PR_READS);
    expect(calls[0]?.ctx?.zibbyPrNumbers).toEqual(overCap.slice(0, MAX_ZIBBY_PR_READS));
  });
});
