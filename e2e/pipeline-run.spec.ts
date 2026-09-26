import { expect, test } from "@playwright/test";

/**
 * Throughline: the seeded pipeline is listed on its owning department's pipeline
 * board, its detail renders the PhaseChain (the contract → DS visualization of the
 * handoff chain), and "Run pipeline" opens the standard New Task composer pre-locked
 * to that pipeline — the operator describes the task and it dispatches straight
 * through the pipeline. Run *correctness* (handoff, loop fuse) is covered by the fast
 * API e2e; here it's the list → detail → dispatch UI path.
 *
 * ZB-06/ZB-13: the old standalone `/pipelines` catalog is gone — `/pipelines/[id]`
 * now resolves the pipeline's owning department server-side and redirects to
 * `/org/departments/<dept>/pipelines/<id>` (ROUTE-MAP §2); the seeded "Demo Pipe"
 * (`e2e/global-setup.ts`) is owned by the `dev` department, so this goes straight
 * there instead of round-tripping through the old catalog.
 */
test("open a pipeline, see its phase chain, and run it via the task composer", async ({ page }) => {
  await page.goto("/org/departments/dev/pipelines/demo-pipe");

  // The detail panel shows the phase chain for the selected pipeline.
  await expect(page.getByText(/phase chain/)).toBeVisible();

  // "Run pipeline" opens the standard composer with this pipeline pre-selected as the
  // dispatch target (a pre-fill, not a lock — classification still runs and the operator
  // can change it). The plan preview names the chosen target.
  await page.getByRole("button", { name: "Run pipeline" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("ZIBBY will hand this to Demo Pipe")).toBeVisible();

  // Describe the task and dispatch it straight through the pipeline.
  await dialog.getByTestId("command-line-input").fill("run the demo pipe");
  await dialog.getByRole("button", { name: "Run", exact: true }).click();

  // Dispatched → navigated to the run. `/archiv` (kept as a page-level redirect for
  // its `?run=` deep links, ROUTE-MAP §2) forwards straight to the run's own detail
  // route.
  await expect(page).toHaveURL(/\/activity\/runs\//);
});
