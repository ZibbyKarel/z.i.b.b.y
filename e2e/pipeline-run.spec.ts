import { expect, test } from "@playwright/test";

/**
 * Throughline: the seeded pipeline is listed, its detail renders the PhaseChain
 * (the contract → DS visualization of the handoff chain), and launching a run from
 * the run modal confirms. Run *correctness* (handoff, loop fuse) is covered by the
 * fast API e2e; here it's the create → list → detail → run UI path.
 */
test("open a pipeline, see its phase chain, and launch a run", async ({ page }) => {
  await page.goto("/pipelines");

  await expect(page.getByText("Demo Pipe").first()).toBeVisible();

  // The detail panel shows the phase chain for the selected pipeline.
  await expect(page.getByText(/phase chain/)).toBeVisible();

  // Launch a run via the run modal.
  await page.getByRole("button", { name: "Run pipeline" }).click();
  await page.getByRole("button", { name: /Run · max/ }).click();

  await expect(page.getByText("Pipeline launched in the background")).toBeVisible();
});
