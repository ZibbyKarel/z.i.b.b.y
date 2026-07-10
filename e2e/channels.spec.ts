import { expect, test } from "@playwright/test";

/**
 * Throughline (Phase 5.3): a seeded inbound message is ingested and triaged by the
 * watcher unprompted, surfaces as a pending channel approval, and approving it
 * flips the inbox item to handled. The autonomy contract end to end — ZIBBY
 * prepares the reply but a human releases it.
 */
test("a triaged inbound message surfaces an approval; approving it handles the item", async ({
  page,
}) => {
  // The watcher (fast tick seeded via system config) ingests + triages the seeded
  // Tier-3 fixture. The inbox lives on the owning project's detail page now
  // (integrations tab, addressable via `?tab=`) — there is no standalone /integrations
  // route. The seeded integration is owned by `demo-project`, so its item shows here.
  await page.goto("/projects/demo-project?tab=integrations");
  const inbox = page.getByTestId("inbox-panel");
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await expect(inbox.getByText("needs approval")).toBeVisible({ timeout: 20000 });

  // The drafted reply is waiting as a channel approval (kind "channel") in the
  // overview queue. Target it by its stable kind-scoped testid so the shared queue
  // (which also holds the agent approval, approval.spec) can't cross-contaminate.
  await page.goto("/overview");
  const channelCard = page.getByTestId("approval-card-channel");
  const approve = channelCard.getByRole("button", { name: "Approve" });
  await expect(approve).toBeVisible({ timeout: 20000 });
  await approve.click();

  // Back on the project inbox, the item is now handled (the reply was sent on approve).
  await page.goto("/projects/demo-project?tab=integrations");
  await expect(page.getByTestId("inbox-panel").getByText("handled").first()).toBeVisible({
    timeout: 20000,
  });
});
