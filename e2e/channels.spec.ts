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
  // The watcher (small live tick) ingests + triages the seeded Tier-3 fixture.
  await page.goto("/integrations");
  const inbox = page.getByTestId("inbox-panel");
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await expect(inbox.getByText("needs approval")).toBeVisible({ timeout: 20000 });

  // The drafted reply is waiting as a channel approval in the overview queue.
  await page.goto("/overview");
  const channelCard = page
    .locator("div")
    .filter({ hasText: "channel-reply" })
    .filter({ has: page.getByRole("button", { name: "Approve" }) })
    .last();
  const approve = channelCard.getByRole("button", { name: "Approve" });
  await expect(approve).toBeVisible({ timeout: 20000 });
  await approve.click();

  // Back on the inbox, the item is now handled (the reply was sent on approve).
  await page.goto("/integrations");
  await expect(
    page.getByTestId("inbox-panel").getByText("handled").first(),
  ).toBeVisible({ timeout: 20000 });
});
