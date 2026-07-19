import { expect, test } from "@playwright/test";

/**
 * Throughline: a gated agent's run pauses and surfaces a pending approval; confirming
 * it resumes the run. This is the identity-core UI: ZIBBY never acts on its own — a
 * human decides.
 *
 * F8d: `/overview`'s standalone approvals queue is gone. The seeded gated AGENT run
 * (unlike the seeded CHANNEL approval in channels.spec) is a real entry in the
 * unified runs feed, so it still surfaces in `/chat`'s task gutter (`ChatTasksPanel`) —
 * opening its row renders the same `RunDetail` (`RunApprovalGate`) the old `/runs`
 * screen used, just inline beside the panel instead of on its own page (Phase 100).
 */
test("confirm a pending approval from the chat task gutter", async ({ page }) => {
  await page.goto("/chat");

  // The seeded gated run is the only active task owned by "gated-agent" — filter on
  // that stable owner text rather than a greedy `.first()` (the shared task gutter
  // can carry other active runs from other specs in the same worker). Testid is
  // `ChatTaskRowTestId.Row` (`apps/web/features/chat/components/ChatTaskRow.tsx`).
  const gatedRow = page.getByTestId("chat-task-row").filter({ hasText: "gated-agent" });
  await expect(gatedRow).toBeVisible({ timeout: 20000 });
  await gatedRow.click();

  // `ChatTaskDetailColumnTestId.Panel` — the inline detail column's animated panel.
  const detailPanel = page.getByTestId("chat-task-detail-panel");
  await expect(detailPanel).toBeVisible({ timeout: 20000 });

  // `RunApprovalGate` (`apps/web/features/runs/components/RunApprovalGate.tsx`) has no
  // dedicated testid of its own — select its "Confirm" action by accessible name,
  // scoped to the detail panel so it can't collide with anything else on the page.
  const confirm = detailPanel.getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeVisible({ timeout: 20000 });
  await confirm.click();

  // Assert the DURABLE outcome, not the transient UI: confirming resolves the
  // approval and resumes the run, so `RunApprovalGate` (gated on `approvalForRun`
  // finding a still-pending entry) unmounts on the next refetch.
  await expect(confirm).toHaveCount(0, { timeout: 20000 });
});
