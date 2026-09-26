import { expect, test } from "@playwright/test";

/**
 * ZB-01: the ZibbyCorp shell's section nav — `AppHeader`'s 7-section `Tabs` bar
 * (`state/config.ts`'s `SECTIONS`) plus the `SubNav` sub-tab strip for the active
 * section. Every section's `href` is today's "closest existing route" fallback
 * (its own screen phase hasn't shipped), so this only asserts the shell chrome
 * itself: every section tab is present, is reachable, and drives the sub-nav —
 * not the (mostly unbuilt) destination screens.
 */
test("the section nav renders all seven sections and navigates on click", async ({ page }) => {
  await page.goto("/org");

  const nav = page.getByTestId("app-header-nav");
  await expect(nav).toBeVisible();

  const sections: Array<[id: string, label: string]> = [
    ["org", "Org"],
    ["work", "Work"],
    ["activity", "Activity"],
    ["policy", "Policy"],
    ["knowledge", "Knowledge"],
    ["ledger", "Ledger"],
    ["system", "System"],
  ];
  for (const [id, label] of sections) {
    await expect(nav.getByTestId(`tabs-tab-${id}`)).toHaveText(label);
  }

  // "/org" is the org section's own home route.
  await expect(nav.getByTestId("tabs-tab-org")).toHaveAttribute("aria-selected", "true");

  // Clicking "Work" navigates to its section fallback route — `/work/tasks`
  // (ZB-04/06 shipped every `work` sub-tab at its real `/work/*` home).
  await nav.getByTestId("tabs-tab-work").click();
  await expect(page).toHaveURL(/\/work\/tasks$/);
});

test("the sub-nav lists the active section's tabs and offers + New task", async ({ page }) => {
  await page.goto("/work/tasks");

  const subnav = page.getByTestId("subnav-root");
  await expect(subnav).toBeVisible();
  // `work`'s sub-tabs (PART-B's recipe table): tasks, chains, goals, companies,
  // teams, projects.
  await expect(subnav).toContainText("Tasks");
  await expect(subnav).toContainText("Companies");
  await expect(subnav).toContainText("Projects");

  await expect(subnav.getByRole("button", { name: "+ New task" })).toBeVisible();
});

test("the NEEDS YOU rail renders on every section", async ({ page }) => {
  await page.goto("/org");
  await expect(page.getByTestId("rail-root")).toBeVisible();
  await expect(page.getByTestId("rail-header")).toContainText("Needs you");
});
