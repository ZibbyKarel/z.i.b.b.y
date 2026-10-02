import { expect, test } from "@playwright/test";

/**
 * ZB-14 — Information Architecture "Flow A: Submitting a task", steps 02-03
 * (`design/ZibbyCorp/Information Architecture.dc.html`): the operator submits a
 * task on `/work/tasks/new` with an explicit department entry (the COO
 * classifier override, prefilled via `?entry=`), the parent task is created, and
 * it appears in `/work/tasks`.
 *
 * NOT covered here, and why: a department's workflow actually running the task
 * needs a real `claude` agent run, and this sandbox has no working `claude` CLI.
 * Signal-driven follow-up work is an automation concern now (see
 * `docs/api/automations.md`). This spec asserts only what is deterministic from
 * the create-task request itself: the task is created, its detail page opens,
 * and it is listed.
 */
test("new task with an explicit department entry: the task appears in Tasks", async ({ page }) => {
  const unique = Date.now().toString(36);

  await page.goto("/work/tasks/new?entry=dev");

  const title = `Flow A task ${unique}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Brief").fill("A Flow A smoke-spec task, routed to a department.");

  await page.getByRole("button", { name: "Create task" }).click();

  // Submit routes to `/work/tasks/[id]` on success (`NewTaskScreen.submit`'s
  // `onSuccess`) — the durable outcome, not a transient toast.
  await expect(page).toHaveURL(/\/work\/tasks\/.+/, { timeout: 20000 });

  // The task is listed in `/work/tasks` by its title.
  await page.goto("/work/tasks");
  await expect(page.getByText(title, { exact: false })).toBeVisible({ timeout: 20000 });
});
