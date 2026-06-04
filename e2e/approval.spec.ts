import { expect, test } from "@playwright/test";

/**
 * Throughline: a gated agent's run pauses and surfaces a pending ApprovalCard in
 * the overview approvals queue; approving it shows the approved feedback. This is
 * the identity-core UI: ZIBBY never acts on its own — a human decides.
 */
test("approve a pending approval from the overview queue", async ({ page }) => {
  await page.goto("/overview");

  // The seeded gated run created a pending approval.
  const approve = page.getByRole("button", { name: "Approve" }).first();
  await expect(approve).toBeVisible();

  await approve.click();

  // The card confirms the decision (the agent continues).
  await expect(page.getByText(/Approved/)).toBeVisible();
});
