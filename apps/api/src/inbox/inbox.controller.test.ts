import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOperator } from "../../test/operator-token";
import { OperatorTokenGuard } from "../approvals/operator-token.guard";
import { OperatorTokenService } from "../approvals/operator-token.service";
import { GithubDiffError, InboxPrDiffService } from "./inbox-pr-diff.service";
import { ProjectNotFoundError } from "../projects/projects.errors";
import { InboxAddressCommentsService } from "./inbox-address-comments.service";
import { InboxRebaseService, PrRefusedError } from "./inbox-rebase.service";
import { InboxPrThreadsService, ThreadNotOnPrError } from "./inbox-pr-threads.service";
import { InboxReviewService } from "./inbox-review.service";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import type { INestApplication } from "@nestjs/common";

describe("InboxController getInboxPrDiff GitHub error mapping", () => {
  let app: INestApplication;
  let upstream = 500;
  let rebaseError: Error = new PrRefusedError("acme/app#7 comes from a fork");
  let addressError: Error | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InboxController],
      providers: [
        OperatorTokenService,
        OperatorTokenGuard,
        { provide: InboxService, useValue: {} },
        { provide: InboxReviewService, useValue: {} },
        {
          provide: InboxRebaseService,
          useValue: {
            start: async () => {
              throw rebaseError;
            },
          },
        },
        {
          provide: InboxAddressCommentsService,
          useValue: {
            start: async () => {
              if (addressError) throw addressError;
              return { taskId: "task_a1" };
            },
          },
        },
        {
          provide: InboxPrThreadsService,
          useValue: {
            reply: async () => {
              throw new ThreadNotOnPrError("PRRT_x", "acme/app", 7);
            },
          },
        },
        {
          provide: InboxPrDiffService,
          useValue: {
            getDiff: async () => {
              throw new GithubDiffError(upstream, "acme/app", 7);
            },
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    [404, 404],
    [401, 422],
    [403, 422],
    [500, 502],
    [429, 502],
  ])("maps GitHub %i to %i", async (gh, mapped) => {
    upstream = gh;
    const res = await request(app.getHttpServer()).get("/api/inbox/prs/acme/7/diff").expect(mapped);
    expect(res.body.message).toContain(String(gh));
  });

  it.each(["/api/inbox/prs/rebase", "/api/inbox/prs/address-comments"])(
    "POST %s without the operator token is 401",
    async (url) => {
      await request(app.getHttpServer())
        .post(url)
        .send({ projectId: "acme", repo: "acme/app", number: 7 })
        .expect(401);
    },
  );

  it("maps a refused rebase to 422 with its reason", async () => {
    const res = await withOperator(request(app.getHttpServer()).post("/api/inbox/prs/rebase"))
      .send({ projectId: "acme", repo: "acme/app", number: 7 })
      .expect(422);
    expect(res.body.message).toContain("fork");
  });

  it("maps an unknown project on rebase to 404", async () => {
    rebaseError = new ProjectNotFoundError("nope");
    await withOperator(request(app.getHttpServer()).post("/api/inbox/prs/rebase"))
      .send({ projectId: "nope", repo: "acme/app", number: 7 })
      .expect(404);
  });

  it("address-comments returns the service's 201 body", async () => {
    addressError = null;
    const res = await withOperator(
      request(app.getHttpServer()).post("/api/inbox/prs/address-comments"),
    )
      .send({ projectId: "acme", repo: "acme/app", number: 7 })
      .expect(201);
    expect(res.body).toEqual({ taskId: "task_a1" });
  });

  it("maps a refused address-comments start to 422 and an unknown project to 404", async () => {
    addressError = new PrRefusedError(
      "addressing review comments on acme/app#7 is already running",
    );
    const res = await withOperator(
      request(app.getHttpServer()).post("/api/inbox/prs/address-comments"),
    )
      .send({ projectId: "acme", repo: "acme/app", number: 7 })
      .expect(422);
    expect(res.body.message).toContain("already running");
    addressError = new ProjectNotFoundError("nope");
    await withOperator(request(app.getHttpServer()).post("/api/inbox/prs/address-comments"))
      .send({ projectId: "nope", repo: "acme/app", number: 7 })
      .expect(404);
  });

  it("replyInboxPrThread → 422 on ThreadNotOnPrError", async () => {
    const res = await withOperator(
      request(app.getHttpServer()).post("/api/inbox/prs/acme/7/threads/PRRT_x/reply"),
    )
      .send({ body: "hi" })
      .expect(422);
    expect(res.body.message).toContain("not on");
  });
});
