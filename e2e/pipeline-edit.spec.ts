import { expect, test } from "@playwright/test";

/**
 * Throughline: open the seeded pipeline and enter its inline editor. Editing is now
 * in place on the detail page (the old "Edit pipeline" modal was removed) — clicking
 * "Edit" swaps the read-only phase-chain canvas for the editable one plus the
 * name/description fields. Loop authoring (a back-edge with `then: park`) is a drag
 * on that canvas; loop *execution* and the retry visualization are covered by the
 * fast API e2e. Here it's the detail → authoring-surface UI path.
 */
test("open a pipeline and enter its inline editor", async ({ page }) => {
  await page.goto("/pipelines");

  // Select Demo Pipe explicitly — the detail panel defaults to the first
  // pipeline in the list, which need not be the seeded one.
  await page.getByText("Demo Pipe").first().click();
  await expect(page).toHaveURL(/\/pipelines\/demo-pipe/);

  // The detail renders the read-only phase-chain canvas.
  await expect(page.getByText(/phase chain/)).toBeVisible();

  // "Edit" enters inline edit mode: the pre-filled name field and Save appear.
  await page.getByRole("button", { name: "Edit" }).click();
  const nameField = page.getByLabel("Pipeline name");
  await expect(nameField).toBeVisible();
  await expect(nameField).toHaveValue("Demo Pipe");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

  // Cancel returns to the read-only detail. No mutation, so a re-run against a
  // reused server is idempotent.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});
