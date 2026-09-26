import { expect, request, test } from "@playwright/test";

const API = "http://localhost:3333";

/**
 * ZB-14 — Information Architecture "Flow A: Submitting a task", steps 02-03
 * (`design/ZibbyCorp/Information Architecture.dc.html`): the operator picks a
 * chain on `/work/tasks/new` (COO classifier override), the parent task is
 * created, and it appears in `/work/tasks` with its route lit up as a
 * `ChainRouteStrip` on the detail page.
 *
 * NOT covered here, and why:
 * - Step 04 (a department's pipeline actually running the subtask) and step 05
 *   (the ASK gate firing a `handoff-proposal` approval, then resuming into the
 *   next department) both need a real `claude` agent run to progress past the
 *   entry step. This sandbox has no working `claude` CLI, so the dispatched
 *   run for the entry department can start (the scheduler persists the parent
 *   and fires step 0 synchronously — see `PART-B.md` ZB-05a item 5) but cannot
 *   be relied on to advance further within a deterministic test timeout.
 * - Step 06 (final artifact logged to Activity, distilled into the vault) is
 *   downstream of the same run.
 * This spec asserts only what's deterministic from the create-task request
 * itself: the parent task exists, is listed, and its detail shows the full
 * chain route with the entry step.
 */
test("new task with a chain: parent task appears in Tasks with its chain route", async ({
  page,
}) => {
  // Unique id AND label — a retry (or a re-run against the same `.e2e-data`)
  // must never leave two chains with the same visible label, or the dropdown
  // option below becomes ambiguous (`strict mode violation`).
  const unique = Date.now().toString(36);
  const chainId = `flow-a-${unique}`;
  const chainLabel = `Flow A Chain ${unique}`;
  const ctx = await request.newContext({ baseURL: API });
  await ctx.put(`/api/handoff/chains/${chainId}`, {
    data: {
      label: chainLabel,
      description: "rnd -> dev, for the Flow A smoke spec",
      entry: "rnd",
      steps: [{ department: "dev", gate: "auto" }],
      enabled: true,
    },
  });
  await ctx.dispose();

  await page.goto("/work/tasks/new");

  const title = `Flow A task ${unique}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Brief").fill("A Flow A smoke-spec task, routed through a real chain.");

  await page.getByLabel("Chain").click();
  await page.getByRole("option", { name: chainLabel, exact: true }).click();

  await page.getByRole("button", { name: "Create task" }).click();

  // Submit routes to `/work/tasks/[id]` on success (`NewTaskScreen.submit`'s
  // `onSuccess`) — the durable outcome, not a transient toast.
  await expect(page).toHaveURL(/\/work\/tasks\/.+/, { timeout: 20000 });

  // The chain route strip renders with the entry department's step. Its code
  // cell reads "Sub {n} · {code}" (`ChainRouteStrip`'s `FullStep`), not just
  // the bare department code.
  const strip = page.getByTestId("chain-route-strip-root");
  await expect(strip).toBeVisible();
  await expect(page.getByTestId("chain-route-strip-step-code").first()).toHaveText("Sub 1 · RND");

  // The parent task is listed in `/work/tasks` by its title.
  await page.goto("/work/tasks");
  await expect(page.getByText(title, { exact: false })).toBeVisible({ timeout: 20000 });
});
