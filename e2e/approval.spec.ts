import { expect, test } from "@playwright/test";

/**
 * Throughline: a gated agent's run pauses and surfaces a pending ApprovalCard in
 * the overview approvals queue; approving it shows the approved feedback. This is
 * the identity-core UI: ZIBBY never acts on its own — a human decides.
 */
test("approve a pending approval from the overview queue", async ({ page }) => {
  await page.goto("/overview");

  // The seeded gated run created a pending approval. Starting that run on a cold
  // CI worker can land a hair over the 10s default, so give the queue headroom.
  const approve = page.getByRole("button", { name: "Approve" }).first();
  await expect(approve).toBeVisible({ timeout: 20000 });

  await approve.click();

  // The card confirms the decision (the agent continues). The decision round-trip
  // adds more cold-start latency, so give this assertion headroom too — this test
  // is a borderline-timing flake on main as well, not specific to any one branch.
  await expect(page.getByText(/Approved/)).toBeVisible({ timeout: 20000 });
});
