import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReviewRuleOccurrence } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ReviewRulesStore } from "../src/review-learning/review-rules.store";

const NOW = new Date("2026-07-29T09:00:00.000Z");

function occurrence(commentId: string): ReviewRuleOccurrence {
  return {
    commentId,
    prUrl: "https://github.com/acme/app/pull/7",
    commentUrl: `https://github.com/acme/app/pull/7#${commentId}`,
    author: "kolega",
    at: NOW.toISOString(),
    excerpt: "any je zakázaný",
  };
}

/**
 * Task 11 — the routes wired through real `@ts-rest/nest` HTTP dispatch, not the
 * `ReviewLearningController` unit tests (which call `list`/`promote` directly and
 * so never exercise `handler()`'s `tsRestHandler` route map or the module's
 * `controllers` registration). Mutation-tested: gutting the route map to stubs
 * (`listReviewRules` always `[]`, `promoteReviewRule` always 404) turns this red —
 * see the Task 11 report for the observed failure.
 */
describe("Review-learning API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "review-learning-e2e-"));
    process.env.REVIEW_RULES_DIR = path.join(dir, "review-rules");
    process.env.VAULT_DIR = path.join(dir, "vault");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.REVIEW_RULES_DIR;
    delete process.env.VAULT_DIR;
  });

  it("lists an empty scope as 200 []", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/review-rules")
      .query({ scope: "acme" })
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it("404s an unsafe scope instead of an unmodelled 500", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/review-rules")
      .query({ scope: "../x" })
      .expect(404);
    expect(res.body.message).toBeTruthy();
  });

  it("404s promoting an unknown rule", async () => {
    await request(app.getHttpServer()).post("/api/review-rules/acme/ghost/promote").expect(404);
  });

  it("promotes an active rule through real HTTP, and it moves scope for real", async () => {
    const store = app.get(ReviewRulesStore);
    await store.record(
      "acme",
      { slug: "no-any", rule: "Nepoužívej any.", occurrence: occurrence("rc-1") },
      NOW,
    );
    await store.record(
      "acme",
      { slug: "no-any", rule: "Nepoužívej any.", occurrence: occurrence("rc-2") },
      NOW,
    );
    // A `proposed` rule must not be promotable — only an operator approval reaches
    // `active` in the real flow. Simulate that approval directly via `setStatus`.
    const proposed = await store.list("acme");
    expect(proposed.find((r) => r.id === "no-any")?.status).toBe("proposed");
    await store.setStatus("acme", "no-any", "active");

    const promoteRes = await request(app.getHttpServer())
      .post("/api/review-rules/acme/no-any/promote")
      .expect(200);
    expect(promoteRes.body).toMatchObject({ id: "no-any", scope: "global", status: "active" });

    const globalRes = await request(app.getHttpServer())
      .get("/api/review-rules")
      .query({ scope: "_global" })
      .expect(200);
    expect(globalRes.body).toEqual([expect.objectContaining({ id: "no-any", scope: "global" })]);

    const projectRes = await request(app.getHttpServer())
      .get("/api/review-rules")
      .query({ scope: "acme" })
      .expect(200);
    expect(projectRes.body).toEqual([]);

    // Both vault notes were actually re-rendered on disk, not just claimed by a stub.
    const globalNote = await fs.readFile(path.join(dir, "vault", "review-rules.md"), "utf8");
    expect(globalNote).toContain("Nepoužívej any.");
    const projectNote = await fs.readFile(
      path.join(dir, "vault", "projects", "acme-review-rules.md"),
      "utf8",
    );
    expect(projectNote).not.toContain("Nepoužívej any.");
  });

  it("404s re-promoting the same rule (already moved out of the project scope)", async () => {
    await request(app.getHttpServer()).post("/api/review-rules/acme/no-any/promote").expect(404);
  });
});
