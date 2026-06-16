import { expect, test } from "@playwright/test";

/**
 * Throughline: the seeded pipeline is listed, its detail renders the PhaseChain
 * (the contract → DS visualization of the handoff chain), and "Run pipeline" opens
 * the standard New Task composer pre-locked to that pipeline — the operator
 * describes the task and it dispatches straight through the pipeline. Run
 * *correctness* (handoff, loop fuse) is covered by the fast API e2e; here it's the
 * create → list → detail → dispatch UI path.
 */
test("open a pipeline, see its phase chain, and run it via the task composer", async ({
  page,
}) => {
  await page.goto("/pipelines");

  await expect(page.getByText("Demo Pipe").first()).toBeVisible();

  // The detail panel shows the phase chain for the selected pipeline.
  await expect(page.getByText(/phase chain/)).toBeVisible();

  // "Run pipeline" opens the standard composer, pre-locked to this pipeline (its
  // name heads the dialog — routing is pre-decided, no classify preview).
  await page.getByRole("button", { name: "Run pipeline" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Demo Pipe")).toBeVisible();

  // Describe the task and dispatch it straight through the pipeline.
  await dialog.getByLabel("Task", { exact: true }).fill("run the demo pipe");
  await dialog.getByRole("button", { name: "Run", exact: true }).click();

  // Dispatched → navigated to the run.
  await expect(page).toHaveURL(/\/runs\?run=/);
});
