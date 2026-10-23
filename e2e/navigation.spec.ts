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
    ["workforce", "AI"],
    ["activity", "Activity"],
    ["knowledge", "Knowledge"],
    ["governance", "Governance"],
    ["system", "Settings"],
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
  await expect(page).toHaveURL(/\/system\/settings\/general$/);
});

test("AI and Settings sub-menus list their items; no header cog", async ({ page }) => {
  await page.goto("/workforce/agents");
  const subnav = page.getByTestId("subnav-root");
  for (const label of ["Agents", "Skills", "Commands", "MCP", "Hooks"]) {
    await expect(subnav).toContainText(label);
  }

  await page.goto("/system/settings/general");
  for (const label of ["General", "Activity", "Runtime", "Status"]) {
    await expect(subnav).toContainText(label);
  }
  await subnav.getByTestId("subnav-item-/system/settings/status").click();
  await expect(page).toHaveURL(/\/system\/settings\/status$/);
  await expect(page.getByTestId("app-shell-settings-cog")).toHaveCount(0);
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
