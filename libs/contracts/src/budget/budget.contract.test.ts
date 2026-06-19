import { describe, expect, it } from "vitest";
import {
  BudgetStatusSchema,
  GlobalBudgetSchema,
  ProjectBudgetSchema,
  budgetContract,
} from "../index";

describe("budgetContract", () => {
  it("reads status under GET /api/budget", () => {
    expect(budgetContract.getBudget.method).toBe("GET");
    expect(budgetContract.getBudget.path).toBe("/api/budget");
  });

  it("reads + replaces config under /api/budget/config", () => {
    expect(budgetContract.getBudgetConfig.method).toBe("GET");
    expect(budgetContract.getBudgetConfig.path).toBe("/api/budget/config");
    expect(budgetContract.updateBudgetConfig.method).toBe("PUT");
    expect(budgetContract.updateBudgetConfig.path).toBe("/api/budget/config");
  });
});

describe("GlobalBudgetSchema", () => {
  it("accepts an empty config (no global pause)", () => {
    expect(GlobalBudgetSchema.safeParse({}).success).toBe(true);
  });

  it("accepts pause thresholds in [0,100]", () => {
    expect(
      GlobalBudgetSchema.safeParse({ pauseAtRollingPct: 90, pauseAtWeeklyPct: 80 }).success,
    ).toBe(true);
  });

  it("rejects a threshold above 100", () => {
    expect(GlobalBudgetSchema.safeParse({ pauseAtRollingPct: 120 }).success).toBe(false);
  });

  it("rejects an unknown key (strict)", () => {
    expect(GlobalBudgetSchema.safeParse({ pauseAtDailyTokens: 1000 }).success).toBe(false);
  });
});

describe("ProjectBudgetSchema", () => {
  it("accepts positive int run counts + concurrency", () => {
    expect(
      ProjectBudgetSchema.safeParse({ dailyRuns: 2, weeklyRuns: 10, maxConcurrent: 1 }).success,
    ).toBe(true);
  });

  it("accepts a partial budget (only one axis set)", () => {
    expect(ProjectBudgetSchema.safeParse({ dailyRuns: 5 }).success).toBe(true);
  });

  it("rejects a zero or negative cap", () => {
    expect(ProjectBudgetSchema.safeParse({ dailyRuns: 0 }).success).toBe(false);
    expect(ProjectBudgetSchema.safeParse({ maxConcurrent: -1 }).success).toBe(false);
  });

  it("rejects a non-integer cap", () => {
    expect(ProjectBudgetSchema.safeParse({ weeklyRuns: 1.5 }).success).toBe(false);
  });

  it("rejects an unknown key (strict)", () => {
    expect(ProjectBudgetSchema.safeParse({ dailyTokens: 1000 }).success).toBe(false);
  });
});

describe("BudgetStatusSchema", () => {
  it("accepts a full status payload", () => {
    const status = {
      global: {
        rolling: { usedPct: 42, resetsAt: null },
        weekly: { usedPct: 12, resetsAt: null },
        stale: false,
        pauseAtRollingPct: 90,
        paused: false,
      },
      projects: [
        {
          projectId: "alpha",
          name: "Alpha",
          daily: { used: 1, cap: 2 },
          weekly: { used: 3 },
          running: 1,
          maxConcurrent: 1,
          queued: 1,
          held: 0,
        },
      ],
    };
    expect(BudgetStatusSchema.safeParse(status).success).toBe(true);
  });
});
