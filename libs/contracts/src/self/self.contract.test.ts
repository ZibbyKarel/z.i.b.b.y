import { describe, expect, it } from "vitest";
import { SelfPrSchema, SelfStatusSchema, SelfUpdateResultSchema, selfContract } from "../index";

const okStatus = {
  currentBranch: "main",
  defaultBranch: "main",
  behind: 0,
  ahead: 0,
  dirty: false,
  upToDate: true,
  openPrCount: 0,
  prs: [],
  ghAvailable: true,
};

describe("selfContract", () => {
  it("exposes GET /api/self/status returning 200", () => {
    expect(selfContract.getSelfStatus.method).toBe("GET");
    expect(selfContract.getSelfStatus.path).toBe("/api/self/status");
    expect(selfContract.getSelfStatus.responses).toHaveProperty("200");
  });

  it("exposes POST /api/self/update returning 200/409", () => {
    expect(selfContract.updateSelf.method).toBe("POST");
    expect(selfContract.updateSelf.path).toBe("/api/self/update");
    expect(selfContract.updateSelf.responses).toHaveProperty("200");
    expect(selfContract.updateSelf.responses).toHaveProperty("409");
  });
});

describe("SelfPrSchema", () => {
  it("round-trips a well-formed PR", () => {
    const pr = { number: 42, title: "Fix the thing", url: "https://github.com/o/r/pull/42" };
    expect(SelfPrSchema.safeParse(pr).success).toBe(true);
  });

  it("rejects a missing url", () => {
    expect(SelfPrSchema.safeParse({ number: 1, title: "x" }).success).toBe(false);
  });
});

describe("SelfStatusSchema", () => {
  it("accepts an up-to-date, gh-available payload with no open PRs", () => {
    expect(SelfStatusSchema.safeParse(okStatus).success).toBe(true);
  });

  it("accepts a behind payload carrying open PRs and a fetchedAt timestamp", () => {
    const parsed = SelfStatusSchema.safeParse({
      ...okStatus,
      behind: 3,
      upToDate: false,
      openPrCount: 1,
      prs: [{ number: 7, title: "Add feature", url: "https://github.com/o/r/pull/7" }],
      fetchedAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts the benign not-a-repo fallback (empty branches, gh unavailable)", () => {
    const parsed = SelfStatusSchema.safeParse({
      currentBranch: "",
      defaultBranch: "",
      behind: 0,
      ahead: 0,
      dirty: false,
      upToDate: true,
      openPrCount: 0,
      prs: [],
      ghAvailable: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a negative behind/ahead or a non-ISO fetchedAt", () => {
    expect(SelfStatusSchema.safeParse({ ...okStatus, behind: -1 }).success).toBe(false);
    expect(SelfStatusSchema.safeParse({ ...okStatus, ahead: -1 }).success).toBe(false);
    expect(SelfStatusSchema.safeParse({ ...okStatus, fetchedAt: "not-a-date" }).success).toBe(
      false,
    );
  });

  it("rejects a missing ghAvailable", () => {
    const rest: Record<string, unknown> = { ...okStatus };
    delete rest.ghAvailable;
    expect(SelfStatusSchema.safeParse(rest).success).toBe(false);
  });
});

describe("SelfUpdateResultSchema", () => {
  it("accepts a no-op result (already up to date)", () => {
    expect(SelfUpdateResultSchema.safeParse({ updated: false, behind: 0 }).success).toBe(true);
  });

  it("accepts a successful pull result with an optional message", () => {
    expect(
      SelfUpdateResultSchema.safeParse({ updated: true, behind: 0, message: "pulled 3 commits" })
        .success,
    ).toBe(true);
  });

  it("rejects a negative behind", () => {
    expect(SelfUpdateResultSchema.safeParse({ updated: false, behind: -1 }).success).toBe(false);
  });
});
