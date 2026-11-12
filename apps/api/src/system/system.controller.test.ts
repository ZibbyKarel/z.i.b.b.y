import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { OperatorTokenService } from "../approvals/operator-token.service";
import { fakeSystemConfigStore } from "./system-config.fixture";
import { SystemController } from "./system.controller";

describe("SystemController.putConfig (operator-only engine switch)", () => {
  const op = { "x-zibby-operator-token": "tok" };
  const make = () => {
    const store = fakeSystemConfigStore();
    const tokens = { token: () => "tok" } as unknown as OperatorTokenService;
    return { store, c: new SystemController(store, tokens) };
  };

  it("401s an engine or model change without the operator token", async () => {
    const { store, c } = make();
    const cur = store.current();
    await expect(c.putConfig({ ...cur, aiEngine: "opencode" }, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      c.putConfig(
        { ...cur, opencodeModel: "opencode/big-pickle" },
        { "x-zibby-operator-token": "bad" },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(store.current().aiEngine).toBe(cur.aiEngine);
  });

  it("401s a model-family change without the token (A31)", async () => {
    const { store, c } = make();
    const cur = store.current();
    await expect(c.putConfig({ ...cur, modelFamily: "openai" }, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await c.putConfig({ ...cur, modelFamily: "openai" }, op);
    expect(store.current().modelFamily).toBe("openai");
  });

  it("401s a tier-mapping change without the token (A20), not a no-op resave", async () => {
    const { store, c } = make();
    const cur = store.current();
    const tiers = { opus: "opencode/big-pickle" };
    await expect(c.putConfig({ ...cur, opencodeTierModels: tiers }, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await c.putConfig({ ...cur, opencodeTierModels: tiers }, op);
    await expect(
      c.putConfig({ ...store.current(), maxConcurrentRuns: 2 }, {}),
    ).resolves.toMatchObject({ opencodeTierModels: tiers });
  });

  it("saves an engine change with the token and any other change without it", async () => {
    const { store, c } = make();
    const cur = store.current();
    await expect(c.putConfig({ ...cur, aiEngine: "opencode" }, op)).resolves.toMatchObject({
      aiEngine: "opencode",
    });
    await expect(
      c.putConfig({ ...store.current(), maxConcurrentRuns: 3 }, {}),
    ).resolves.toMatchObject({ maxConcurrentRuns: 3 });
  });
});
