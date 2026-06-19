import { expect, test } from "@playwright/test";

/**
 * Accountability (Phase 6): /overview shows the butler's briefing card and the
 * activity feed. Generating a briefing persists it, flips the card to its ready
 * state, and records a `briefing-generated` activity entry — so after generating,
 * the feed is guaranteed non-empty (no dependency on seeded-run timing, which the
 * approval/channels specs already cover and which flakes on a cold worker).
 */
test("the overview briefing card generates a briefing and the activity feed records it", async ({
  page,
}) => {
  await page.goto("/overview");

  // The briefing card renders with a headline (the GET always assembles one).
  await expect(page.getByTestId("briefing-card")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("briefing-headline")).toBeVisible();

  // Generating persists a briefing and flips the card to its ready state.
  await page.getByTestId("briefing-generate").click();
  await expect(page.getByTestId("briefing-ready")).toBeVisible({ timeout: 20000 });

  // That generate recorded a `briefing-generated` entry, so the feed is non-empty.
  await expect(page.getByTestId("activity-feed")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("activity-feed-item").first()).toBeVisible({ timeout: 20000 });
});
