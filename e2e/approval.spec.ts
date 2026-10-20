import { expect, test } from "@playwright/test";

/**
 * Throughline: a gated agent's run pauses and surfaces a pending approval; confirming
 * it resumes the run. This is the identity-core UI: ZIBBY never acts on its own — a
 * human decides.
 *
 * ZB-13: the old `/chat` task gutter (`ChatTasksPanel`/`ChatTaskRow`) is deleted along
 * with the rest of the immersive chat UI. Pending approvals now surface in the
 * shell-global "NEEDS YOU" rail (`AppShell`'s `NeedsYouRail`, mounted on every page)
 * as an `ApprovalCard` — single-click approve is available right there (D-014/O-13),
 * so this exercises the same identity-core throughline against the current surface.
 */
test("confirm a pending approval from the NEEDS YOU rail", async ({ page }) => {
  await page.goto("/dashboard");

  // The activity dock starts collapsed: open the "Needs you" panel first.
  await page
    .getByTestId("activity-dock-button")
    .and(page.getByRole("button", { name: /^(Potřebuje tě|Needs you)/ }))
    .click();

  // The seeded gated run is the only pending approval owned by "Gated Agent"
  // (`e2e/global-setup.ts`'s agent id is "gated-agent", its display `name` —
  // the approval's `skill` field, `ApprovalCard`'s `agentName` — is "Gated
  // Agent") — filter on that stable name rather than a greedy `.first()` (the
  // shared rail can carry other pending approvals from other specs in the
  // same worker).
  const gatedCard = page
    .getByTestId("approval-card-root")
    .filter({ has: page.getByTestId("approval-card-name").getByText("Gated Agent") });
  await expect(gatedCard).toBeVisible({ timeout: 20000 });

  const approve = gatedCard.getByTestId("approval-card-approve");
  await expect(approve).toBeVisible({ timeout: 20000 });
  await approve.click();

  // Assert the DURABLE outcome, not the transient UI: approving resolves the approval
  // and resumes the run, so the rail's pending-approvals query refetches without it.
  await expect(gatedCard).toHaveCount(0, { timeout: 20000 });
});

/**
 * Operator-token guard in a real browser: without the token an approve click is rejected
 * (401 → the "operator token" toast) and the approval stays pending.
 */
test("approve without the operator token shows the 401 hint", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.removeItem("zibby.operatorToken"));
  await page.goto("/dashboard");
  await page
    .getByTestId("activity-dock-button")
    .and(page.getByRole("button", { name: /^(Potřebuje tě|Needs you)/ }))
    .click();
  const card = page.getByTestId("approval-card-root").first();
  await expect(card).toBeVisible({ timeout: 20000 });
  const pendingBefore = await request.get("http://localhost:3333/api/approvals", {
    params: { status: "pending" },
  });
  const before = ((await pendingBefore.json()) as unknown[]).length;
  await card.getByTestId("approval-card-approve").click();
  await expect(page.getByText(/operator token/i)).toBeVisible({ timeout: 10000 });
  const after = await request.get("http://localhost:3333/api/approvals", {
    params: { status: "pending" },
  });
  expect(((await after.json()) as unknown[]).length).toBe(before);
});
