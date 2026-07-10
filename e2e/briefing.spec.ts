import { expect, test } from "@playwright/test";

/**
 * Accountability (Phase 6): /overview shows the butler's briefing card and the
 * live activity log. Generating a briefing persists it, flips the card to its ready
 * state, and records a `briefing-generated` activity entry — which surfaces in the
 * overview's right-rail live log (the on-overview activity view; the standalone
 * `ActivityFeed` component now lives on the project detail page).
 */
test("the overview briefing card generates a briefing and the live log records it", async ({
  page,
}) => {
  await page.goto("/overview");

  // The briefing card renders with a headline (the GET always assembles one).
  await expect(page.getByTestId("briefing-card")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("briefing-headline")).toBeVisible();

  // Generating persists a briefing and flips the card to its ready state.
  await page.getByTestId("briefing-generate").click();
  await expect(page.getByTestId("briefing-ready")).toBeVisible({ timeout: 20000 });

  // That generate recorded a `briefing-generated` entry, so the right-rail live log
  // is non-empty and shows the grouped "Briefing" line.
  const log = page.getByTestId("right-rail-log");
  await expect(log).toBeVisible({ timeout: 20000 });
  await expect(log.getByText("Briefing").first()).toBeVisible({ timeout: 20000 });
});
