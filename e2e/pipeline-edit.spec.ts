import { expect, test } from "@playwright/test";

/**
 * Throughline: open the seeded pipeline, edit it (add a back-edge loop with
 * `then: park` to the last phase), save the PATCH, and see the loop render on
 * the PhaseChain (the retry arc with its max counter). Loop *execution*
 * (retries, parking, resume) is covered by the fast API e2e; here it's the
 * authoring UI → contract → visualization path.
 */
test("edit a pipeline: add a loop and see the retry arc", async ({ page }) => {
  await page.goto("/pipelines");

  await expect(page.getByText("Demo Pipe").first()).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit pipeline" })).toBeVisible();

  // Turn the loop on for the LAST phase; the editor defaults to a back-edge to
  // phase 1 with maxRetries 3 and then:'park'. Idempotent: a re-run against a
  // reused server finds the loop already on and must not toggle it off.
  const toggle = page.getByLabel("Loop on failure (back-edge)").last();
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await expect(page.getByLabel("Max retries").last()).toHaveValue("3");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog", { name: "Edit pipeline" })).toBeHidden();

  // The PhaseChain now renders the back-edge arc with its retry counter.
  await expect(page.getByText("retry · max 3")).toBeVisible();
});
