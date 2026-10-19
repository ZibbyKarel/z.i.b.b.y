import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GithubDiffError, InboxPrDiffService } from "./inbox-pr-diff.service";
import { ProjectNotFoundError } from "../projects/projects.errors";
import { InboxRebaseService, RebaseRefusedError } from "./inbox-rebase.service";
import { InboxReviewService } from "./inbox-review.service";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";
import type { INestApplication } from "@nestjs/common";

describe("InboxController getInboxPrDiff GitHub error mapping", () => {
  let app: INestApplication;
  let upstream = 500;
  let rebaseError: Error = new RebaseRefusedError("acme/app#7 comes from a fork");

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InboxController],
      providers: [
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

  it("maps a refused rebase to 422 with its reason", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/inbox/prs/rebase")
      .send({ projectId: "acme", repo: "acme/app", number: 7 })
      .expect(422);
    expect(res.body.message).toContain("fork");
  });

  it("maps an unknown project on rebase to 404", async () => {
    rebaseError = new ProjectNotFoundError("nope");
    await request(app.getHttpServer())
      .post("/api/inbox/prs/rebase")
      .send({ projectId: "nope", repo: "acme/app", number: 7 })
      .expect(404);
  });
});
