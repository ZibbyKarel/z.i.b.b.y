import type {
  Company,
  InboxPr,
  RoadmapConfig,
  ScheduledTask,
  SystemConfig,
} from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { PR_AUTOMATION_MAX_STARTS_PER_TICK, PrAutomationService } from "./pr-automation.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const A = "a".repeat(40);
const B = "b".repeat(40);

function pr(over: Partial<InboxPr> = {}): InboxPr {
  return {
    source: "github",
    number: 7,
    title: "Add thing",
    url: "https://github.com/acme/app/pull/7",
    repo: "acme/app",
    author: "someone",
    createdAt: "2026-10-24T00:00:00.000Z",
    draft: false,
    ci: "passing",
    review: "none",
    mergeable: true,
    bucket: "to-review",
    blocker: "awaiting-review",
    section: "needs-your-review",
    projectId: "p1",
    headSha: A,
    headRef: "feat",
    ...over,
  };
}

const mine = (over: Partial<InboxPr> = {}) =>
  pr({
    bucket: "mine",
    review: "changes-requested",
    unresolvedThreads: 2,
    blocker: "changes-requested",
    section: "needs-action",
    ...over,
  });

function reviewTask(
  headSha: string | undefined,
  state: NonNullable<ScheduledTask["prReview"]>["state"],
  over: Partial<ScheduledTask> = {},
): ScheduledTask {
  return {
    id: `t_r_${state}_${headSha ?? "none"}`,
    status: "dispatched",
    createdAt: "2026-10-24T00:00:00.000Z",
    prReview: {
      repo: "acme/app",
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      state,
      ...(headSha ? { headSha } : {}),
    },
    ...over,
  } as ScheduledTask;
}

function addressTask(
  headSha: string,
  state: NonNullable<ScheduledTask["prAddressComments"]>["state"],
  over: Partial<ScheduledTask> = {},
  fix: Partial<NonNullable<ScheduledTask["prAddressComments"]>> = {},
): ScheduledTask {
  return {
    id: `t_a_${state}_${headSha}`,
    status: "dispatched",
    createdAt: "2026-10-24T00:00:00.000Z",
    prAddressComments: {
      repo: "acme/app",
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      head: "feat",
      base: "main",
      headSha,
      state,
      ...fix,
    },
    ...over,
  } as ScheduledTask;
}

describe("PrAutomationService (todo-16)", () => {
  let prs: InboxPr[];
  let tasks: ScheduledTask[];
  let configs: Record<string, Partial<RoadmapConfig>>;
  let company: Company | undefined;
  let inbox: { listPrs: ReturnType<typeof vi.fn> };
  let review: { start: ReturnType<typeof vi.fn>; listPrFiles: ReturnType<typeof vi.fn> };
  let address: { start: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let taskCounter: number;

  const make = (sys: Partial<SystemConfig> = {}) =>
    new PrAutomationService(
      inbox as never,
      review as never,
      address as never,
      { list: async () => tasks } as never,
      {
        readConfig: async (id: string) => {
          if (id === "broken") throw new Error("unsafe id");
          return {
            autoSync: null,
            autoPlay: null,
            autoReview: null,
            autoAddressComments: null,
            ...configs[id],
          };
        },
      } as never,
      {
        get: async (id: string) => ({ id, name: id, path: `/repos/${id}` }),
        list: async () =>
          Object.keys(configs).map((id) => ({ id, name: id, path: `/repos/${id}` })),
      } as never,
      { resolveCompany: async () => company } as never,
      activity as never,
      fakeSystemConfigStore(sys),
      { register: () => {} } as never,
      fakeLogger as never,
    );

  beforeEach(() => {
    prs = [pr()];
    tasks = [];
    configs = { p1: { autoReview: true, autoAddressComments: true } };
    company = undefined;
    taskCounter = 0;
    inbox = { listPrs: vi.fn(async () => ({ prs, errors: [] })) };
    review = {
      start: vi.fn(async () => ({ taskId: `task_${++taskCounter}` })),
      listPrFiles: vi.fn(async () => [{ filename: "src/util.ts", additions: 3, deletions: 1 }]),
    };
    address = { start: vi.fn(async () => ({ taskId: `task_${++taskCounter}` })) };
    activity = { record: vi.fn(async () => {}) };
  });

  describe("auto review", () => {
    it("starts a review at the level chosen from the PR's files, stamped auto", async () => {
      review.listPrFiles.mockResolvedValue([
        { filename: "src/App.tsx", additions: 1, deletions: 0 },
      ]);
      const result = await make().tick();
      expect(result).toEqual({ started: 1 });
      expect(review.listPrFiles).toHaveBeenCalledWith("p1", "acme/app", 7);
      expect(review.start).toHaveBeenCalledWith(
        { projectId: "p1", repo: "acme/app", number: 7, title: "Add thing", level: "browser" },
        { auto: true, headSha: A },
      );
    });

    it("a failed files fetch falls back to quick", async () => {
      review.listPrFiles.mockRejectedValue(new Error("HTTP 500"));
      await make().tick();
      expect(review.start).toHaveBeenCalledWith(expect.objectContaining({ level: "quick" }), {
        auto: true,
        headSha: A,
      });
    });

    it("records a pr-automation-started activity with the spec's summary and refs", async () => {
      await make().tick();
      expect(activity.record).toHaveBeenCalledWith({
        kind: "pr-automation-started",
        summary: "auto review (tested) acme/app#7",
        refs: { projectId: "p1", taskId: "task_1", itemId: "acme/app#7" },
      });
    });

    it("does nothing when the effective autoReview is off (the global default)", async () => {
      configs = { p1: {} };
      await make().tick();
      expect(review.start).not.toHaveBeenCalled();
    });

    it("inherits autoReview from the company's roadmapDefaults", async () => {
      configs = { p1: {} };
      company = { id: "co", name: "Co", roadmapDefaults: { autoReview: true } };
      await make().tick();
      expect(review.start).toHaveBeenCalledTimes(1);
    });

    it("a project's explicit false beats the company default", async () => {
      configs = { p1: { autoReview: false } };
      company = { id: "co", name: "Co", roadmapDefaults: { autoReview: true } };
      await make().tick();
      expect(review.start).not.toHaveBeenCalled();
    });

    it.each([
      ["a draft", { draft: true }],
      ["the operator's own PR", { bucket: "mine" as const }],
      ["an unknown head", { headSha: undefined }],
    ])("skips %s", async (_label, over) => {
      prs = [pr(over)];
      await make().tick();
      expect(review.start).not.toHaveBeenCalled();
    });

    it.each(["running", "awaiting-approval", "posted", "discarded", "failed"] as const)(
      "skips when a review task for the same head exists (%s)",
      async (state) => {
        tasks = [reviewTask(A, state)];
        await make().tick();
        expect(review.start).not.toHaveBeenCalled();
      },
    );

    it.each(["running", "awaiting-approval"] as const)(
      "skips while any review of the PR is %s, even of an older head",
      async (state) => {
        tasks = [reviewTask(B, state)];
        await make().tick();
        expect(review.start).not.toHaveBeenCalled();
      },
    );

    it.each(["posted", "failed", "discarded"] as const)(
      "starts again once the head changed (old head %s)",
      async (state) => {
        tasks = [reviewTask(B, state)];
        await make().tick();
        expect(review.start).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ["a fork PR with a UI file", undefined, "src/App.tsx", "thorough"],
      ["a fork PR with code", undefined, "src/util.ts", "thorough"],
      ["a same-repo PR with a UI file", "feat", "src/App.tsx", "browser"],
      ["a same-repo PR with code", "feat", "src/util.ts", "tested"],
      ["a fork PR with docs only", undefined, "README.md", "quick"],
    ] as const)(
      "I1 — %s (head ref %s, file %s) → %s: an auto review never runs fork PR code",
      async (_label, headRef, filename, level) => {
        prs = [pr({ headRef })];
        review.listPrFiles.mockResolvedValue([{ filename, additions: 1, deletions: 0 }]);
        await make().tick();
        expect(review.start).toHaveBeenCalledWith(expect.objectContaining({ level }), {
          auto: true,
          headSha: A,
        });
      },
    );

    it("a review of another PR does not block this one", async () => {
      const other = reviewTask(A, "running");
      tasks = [{ ...other, prReview: { repo: "acme/app", number: 8, url: "u", state: "running" } }];
      await make().tick();
      expect(review.start).toHaveBeenCalledTimes(1);
    });
  });

  describe("auto address comments", () => {
    beforeEach(() => {
      prs = [mine()];
    });

    it("starts address-comments on the operator's PR with changes requested, auto: true", async () => {
      const result = await make().tick();
      expect(result).toEqual({ started: 1 });
      expect(address.start).toHaveBeenCalledWith(
        { projectId: "p1", repo: "acme/app", number: 7, title: "Add thing" },
        { auto: true },
      );
      expect(review.start).not.toHaveBeenCalled();
      expect(activity.record).toHaveBeenCalledWith({
        kind: "pr-automation-started",
        summary: "auto address comments acme/app#7",
        refs: { projectId: "p1", taskId: "task_1", itemId: "acme/app#7" },
      });
    });

    it("does nothing when the effective autoAddressComments is off", async () => {
      configs = { p1: { autoReview: true } };
      await make().tick();
      expect(address.start).not.toHaveBeenCalled();
    });

    it.each([
      ["a PR to review", { bucket: "to-review" as const }],
      ["no changes requested", { review: "approved" as const }],
      ["no unresolved threads", { unresolvedThreads: 0 }],
      ["unknown unresolved threads", { unresolvedThreads: undefined }],
      ["an unknown head", { headSha: undefined }],
    ])("skips %s", async (_label, over) => {
      prs = [mine(over)];
      configs = { p1: { autoAddressComments: true } };
      await make().tick();
      expect(address.start).not.toHaveBeenCalled();
    });

    it.each(["pushed", "failed", "discarded"] as const)(
      "skips when an address task for the same head exists (%s)",
      async (state) => {
        tasks = [addressTask(A, state)];
        await make().tick();
        expect(address.start).not.toHaveBeenCalled();
      },
    );

    it.each(["running", "awaiting-approval"] as const)(
      "skips while any address task of the PR is %s",
      async (state) => {
        tasks = [addressTask(B, state)];
        await make().tick();
        expect(address.start).not.toHaveBeenCalled();
      },
    );

    it("a running address task whose task died no longer blocks a new head", async () => {
      tasks = [addressTask(B, "running", { status: "failed" })];
      await make().tick();
      expect(address.start).toHaveBeenCalledTimes(1);
    });

    it("does not restart on the head its own approved push created (fixedSha)", async () => {
      tasks = [addressTask(B, "pushed", {}, { fixedSha: A })];
      await make().tick();
      expect(address.start).not.toHaveBeenCalled();
    });

    it("restarts when someone pushed a later head after its own push", async () => {
      const C = "c".repeat(40);
      tasks = [addressTask(B, "pushed", {}, { fixedSha: C })];
      await make().tick();
      expect(address.start).toHaveBeenCalledTimes(1);
    });

    it("starts again once the head changed", async () => {
      tasks = [addressTask(B, "pushed")];
      await make().tick();
      expect(address.start).toHaveBeenCalledTimes(1);
    });
  });

  it(`throttles to ${PR_AUTOMATION_MAX_STARTS_PER_TICK} starts per tick, in inbox order`, async () => {
    expect(PR_AUTOMATION_MAX_STARTS_PER_TICK).toBe(3);
    prs = [1, 2, 3, 4, 5].map((n) => pr({ number: n }));
    const result = await make().tick();
    expect(result).toEqual({ started: 3 });
    expect(review.start.mock.calls.map((c) => (c[0] as { number: number }).number)).toEqual([
      1, 2, 3,
    ]);
    // The first three are now in flight; the next tick starts the other two.
    tasks = [1, 2, 3].map((number) => ({
      ...reviewTask(A, "running"),
      id: `t_${number}`,
      prReview: { repo: "acme/app", number, url: "u", state: "running" as const, headSha: A },
    }));
    expect(await make().tick()).toEqual({ started: 2 });
    expect(
      review.start.mock.calls.slice(3).map((c) => (c[0] as { number: number }).number),
    ).toEqual([4, 5]);
  });

  it("m1 — no project has either toggle on → GitHub is not queried at all", async () => {
    configs = { p1: { autoReview: false }, p2: {} };
    expect(await make().tick()).toEqual({ started: 0 });
    expect(inbox.listPrs).not.toHaveBeenCalled();
  });

  it("m1 — a company default alone switches the inbox read on", async () => {
    configs = { p1: {} };
    company = { id: "co", name: "Co", roadmapDefaults: { autoAddressComments: true } };
    await make().tick();
    expect(inbox.listPrs).toHaveBeenCalledTimes(1);
  });

  it("fails open per PR: one start throwing does not stop the tick", async () => {
    prs = [pr({ number: 1 }), pr({ number: 2 })];
    review.start.mockRejectedValueOnce(new Error("boom"));
    const result = await make().tick();
    expect(result).toEqual({ started: 1 });
    expect(review.start).toHaveBeenCalledTimes(2);
  });

  it("an unreadable project config skips that PR only", async () => {
    prs = [pr({ number: 1, projectId: "broken" }), pr({ number: 2 })];
    const svc = make();
    const result = await svc.tick();
    expect(result).toEqual({ started: 1 });
  });

  it("listPrs rejecting → { started: 0 }, no throw", async () => {
    inbox.listPrs.mockRejectedValue(new Error("github down"));
    await expect(make().tick()).resolves.toEqual({ started: 0 });
    expect(review.start).not.toHaveBeenCalled();
  });

  it("unreadable task storage → no starts (dedupe impossible, fail closed)", async () => {
    const svc = new PrAutomationService(
      inbox as never,
      review as never,
      address as never,
      {
        list: async () => {
          throw new Error("disk");
        },
      } as never,
      { readConfig: async () => ({ autoReview: true }) } as never,
      { get: async (id: string) => ({ id }), list: async () => [{ id: "p1" }] } as never,
      { resolveCompany: async () => undefined } as never,
      activity as never,
      fakeSystemConfigStore(),
      { register: () => {} } as never,
      fakeLogger as never,
    );
    await expect(svc.tick()).resolves.toEqual({ started: 0 });
    expect(review.start).not.toHaveBeenCalled();
  });

  describe("heartbeat", () => {
    it("roadmapTickMs: 0 → does not schedule", () => {
      vi.useFakeTimers();
      try {
        const svc = make({ roadmapTickMs: 0 });
        const spy = vi.spyOn(svc, "tick");
        svc.onModuleInit();
        vi.advanceTimersByTime(10 * 60_000);
        expect(spy).not.toHaveBeenCalled();
        expect(svc.watcherHealth().status).toBe("disabled");
        svc.onModuleDestroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a positive roadmapTickMs schedules the tick", () => {
      vi.useFakeTimers();
      try {
        const svc = make({ roadmapTickMs: 60_000 });
        const spy = vi.spyOn(svc, "tick").mockResolvedValue({ started: 0 });
        svc.onModuleInit();
        vi.advanceTimersByTime(60_000);
        expect(spy).toHaveBeenCalledTimes(1);
        svc.onModuleDestroy();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
