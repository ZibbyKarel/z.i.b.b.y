import { expect, test } from "@playwright/test";

/**
 * The shell's section nav — `AppHeader`'s 8-section `Tabs` bar
 * (`state/config.ts`'s `SECTIONS`) plus the `SubNav` sub-tab strip for the active
 * section.
 */
test("the section nav renders all eight sections and navigates on click", async ({ page }) => {
  await page.goto("/dashboard");

  const nav = page.getByTestId("app-header-nav");
  await expect(nav).toBeVisible();

  const sections: Array<[id: string, label: string]> = [
    ["dashboard", "Dashboard"],
    ["work", "Work"],
    ["companies", "Companies"],
    ["workforce", "Workforce"],
    ["activity", "Activity"],
    ["knowledge", "Knowledge"],
    ["governance", "Governance"],
    ["system", "System"],
  ];
  for (const [id, label] of sections) {
    await expect(nav.getByTestId(`tabs-tab-${id}`)).toHaveText(label);
  }

  await expect(nav.getByTestId("tabs-tab-dashboard")).toHaveAttribute("aria-selected", "true");

  await nav.getByTestId("tabs-tab-work").click();
  await expect(page).toHaveURL(/\/work\/tasks$/);
  await nav.getByTestId("tabs-tab-workforce").click();
  await expect(page).toHaveURL(/\/workforce\/agents$/);
  await nav.getByTestId("tabs-tab-governance").click();
  await expect(page).toHaveURL(/\/governance\/approvals$/);
  await nav.getByTestId("tabs-tab-system").click();
  await expect(page).toHaveURL(/\/system\/registries\/skills$/);
});

test("the header cog opens Settings and the screen lists its sections", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByTestId("app-shell-settings-cog").click();
  await expect(page).toHaveURL(/\/system\/settings\/general$/);
  await expect(page.getByRole("tab", { name: "General" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Status" })).toBeVisible();
});

test("the sub-nav lists the active section's tabs and offers + New task", async ({ page }) => {
  await page.goto("/work/tasks");

  const subnav = page.getByTestId("subnav-root");
  await expect(subnav).toBeVisible();
  // `work`'s sub-tabs: tasks, goals, workflows, automations.
  await expect(subnav).toContainText("Tasks");
  await expect(subnav).toContainText("Workflows");
  await expect(subnav).toContainText("Automations");

  await expect(subnav.getByRole("button", { name: "New task" })).toBeVisible();
});

test("the NEEDS YOU rail renders on every section", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^(Potřebuje tě|Needs you)/ }).click();
  await expect(page.getByTestId("rail-root").first()).toBeVisible();
  await expect(page.getByTestId("rail-header")).toContainText("Needs you");
});
