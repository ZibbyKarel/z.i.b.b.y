import { expect, test } from "@playwright/test";

/**
 * Throughline: a gated agent's run pauses and surfaces a pending ApprovalCard in
 * the overview approvals queue; approving it shows the approved feedback. This is
 * the identity-core UI: ZIBBY never acts on its own — a human decides.
 */
test("approve a pending approval from the overview queue", async ({ page }) => {
  await page.goto("/overview");

  // The seeded gated run created a pending APPROVAL of kind "agent". The queue is
  // SHARED with the channel-reply approval (kind "channel", channels.spec), so
  // target the agent card by its stable kind-scoped testid — never a greedy
  // `.first()`, which (because the agent card is high-risk and the channel card is
  // not) used to silently approve the *channel* card and cross-contaminate that
  // spec. global-setup drains the queue, so there is exactly one agent card.
  // Cold-worker run startup can exceed the 10s default → headroom.
  const gatedCard = page.getByTestId("approval-card-agent");
  const approve = gatedCard.getByRole("button", { name: "Approve" });
  await expect(approve).toBeVisible({ timeout: 20000 });

  await approve.click();

  // Assert the DURABLE outcome, not the transient UI: approving resolves the
  // approval, so it leaves the `status=pending` queue and the card unmounts on the
  // next refetch. (The inline "Approved" alert is optimistic and disappears with the
  // card, so it's an inherently racy thing to assert — the queue removal is the real
  // proof the decision round-tripped and the agent was released to continue.)
  await expect(gatedCard).toHaveCount(0, { timeout: 20000 });
});
