import type { ReviewRule } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { ReviewLearningController } from "./review-learning.controller";
import { InvalidReviewScopeKeyError } from "./review-rules.errors";
import { GLOBAL_SCOPE_KEY } from "./review-rules.store";

const RULE: ReviewRule = {
  id: "no-any",
  scope: "project",
  rule: "Nepoužívej any.",
  status: "active",
  occurrences: [
    {
      commentId: "rc-1",
      prUrl: "https://github.com/acme/app/pull/7",
      commentUrl: "https://github.com/acme/app/pull/7#discussion_r1",
      author: "kolega",
      at: "2026-07-29T09:00:00.000Z",
      excerpt: "any je zakázaný",
    },
  ],
  createdAt: "2026-07-29T09:00:00.000Z",
  updatedAt: "2026-07-29T09:00:00.000Z",
};

function makeController(promoted: ReviewRule | null, listed: ReviewRule[] = [RULE]) {
  const store = {
    list: vi.fn(async () => listed),
    promoteToGlobal: vi.fn(async () => promoted),
  };
  const vault = { render: vi.fn(async () => {}), renderGlobal: vi.fn(async () => {}) };
  return { controller: new ReviewLearningController(store as never, vault as never), store, vault };
}

describe("ReviewLearningController", () => {
  it("lists one scope's rules", async () => {
    const { controller, store } = makeController(null);

    const res = await controller.list({ query: { scope: "acme" } } as never);

    expect(res).toEqual({ status: 200, body: [RULE] });
    expect(store.list).toHaveBeenCalledWith("acme");
  });

  // Important 1: `store.list` throws `InvalidReviewScopeKeyError` for a scope key
  // that fails `resolveSafeFile`'s regex (e.g. path traversal) — before this fix
  // that propagated as an unmodelled 500 through `AllExceptionsFilter`, even
  // though the contract's `strictStatusCodes: true` says that can't happen.
  it("404s an unsafe scope instead of leaking a 500, and reads nothing else", async () => {
    const store = {
      list: vi.fn(async () => {
        throw new InvalidReviewScopeKeyError("../x");
      }),
      promoteToGlobal: vi.fn(async () => null),
    };
    const vault = { render: vi.fn(async () => {}), renderGlobal: vi.fn(async () => {}) };
    const controller = new ReviewLearningController(store as never, vault as never);

    const res = await controller.list({ query: { scope: "../x" } } as never);

    expect(res.status).toBe(404);
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(store.promoteToGlobal).not.toHaveBeenCalled();
  });

  it("promotes an active rule and re-renders both notes", async () => {
    const globalRule = { ...RULE, scope: "global" as const };
    const { controller, vault } = makeController(globalRule);

    const res = await controller.promote({
      params: { projectId: "acme", ruleId: "no-any" },
    } as never);

    expect(res).toEqual({ status: 200, body: globalRule });
    expect(vault.render).toHaveBeenCalledWith("acme");
    expect(vault.renderGlobal).toHaveBeenCalled();
  });

  it("404s an unknown rule and renders nothing", async () => {
    const { controller, vault } = makeController(null);

    const res = await controller.promote({
      params: { projectId: "acme", ruleId: "ghost" },
    } as never);

    expect(res.status).toBe(404);
    expect(vault.render).not.toHaveBeenCalled();
  });

  // Law 4: `ReviewRulesStore.promoteToGlobal` itself does not check `status` — it
  // moves whatever rule id it is given. The controller is the one place that must
  // refuse to widen a rule an operator has not approved yet, since doing so would
  // let unapproved, PR-authored rule text reach the global grounding note.
  it("404s a not-yet-active rule without ever calling promoteToGlobal", async () => {
    const observed = { ...RULE, status: "observed" as const };
    const { controller, store, vault } = makeController(observed, [observed]);

    const res = await controller.promote({
      params: { projectId: "acme", ruleId: "no-any" },
    } as never);

    expect(res).toEqual({ status: 404, body: { message: "review rule not found" } });
    expect(store.promoteToGlobal).not.toHaveBeenCalled();
    expect(vault.render).not.toHaveBeenCalled();
    expect(vault.renderGlobal).not.toHaveBeenCalled();
  });

  // M7: `projectId` is a caller-supplied path parameter. A traversal payload or
  // the `_global` pseudo-project key must 404 before it ever reaches the store
  // (and, through it, the filesystem) — never merely "fail safely" once inside.
  it("404s a path-traversal projectId before touching the store", async () => {
    const { controller, store, vault } = makeController(null);

    const res = await controller.promote({
      params: { projectId: "../../etc", ruleId: "no-any" },
    } as never);

    expect(res).toEqual({ status: 404, body: { message: "review rule not found" } });
    expect(store.list).not.toHaveBeenCalled();
    expect(store.promoteToGlobal).not.toHaveBeenCalled();
    expect(vault.render).not.toHaveBeenCalled();
  });

  it("404s the global scope key used as a projectId before touching the store", async () => {
    const { controller, store, vault } = makeController(null);

    const res = await controller.promote({
      params: { projectId: GLOBAL_SCOPE_KEY, ruleId: "no-any" },
    } as never);

    expect(res).toEqual({ status: 404, body: { message: "review rule not found" } });
    expect(store.list).not.toHaveBeenCalled();
    expect(store.promoteToGlobal).not.toHaveBeenCalled();
    expect(vault.render).not.toHaveBeenCalled();
  });
});
