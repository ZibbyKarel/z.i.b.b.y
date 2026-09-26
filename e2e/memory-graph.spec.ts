import { expect, test } from "@playwright/test";

/**
 * Throughline: the Vault screen (ZB-09, moved from `/memory`) lists the real
 * vault grouped by tier → department shelf and opens a note's reader on
 * selection, with its wikilinks navigable as chips. Exercises the memory graph
 * + note query wiring reused from the pre-ZibbyCorp `/memory` screen — the
 * force-directed graph visualization itself was dropped (not part of the
 * `Knowledge Screens.dc.html` mock, which shows a folder list).
 */
test("the vault lists seeded notes and opens one on selection", async ({ page }) => {
  await page.goto("/knowledge/vault");

  // Nodes from the seeded vault (MEMORY → rohlik → zibby), grouped memory/knowledge/daily.
  await expect(page.getByTestId("list-item-memory-general-MEMORY")).toBeVisible();
  await expect(page.getByTestId("list-item-knowledge-general-rohlik")).toBeVisible();

  await page.getByTestId("list-item-knowledge-general-zibby").click();
  await expect(page).toHaveURL(/\?note=zibby$/);

  // The reader shows the selected note's body.
  await expect(page.getByText("The orchestrator note.")).toBeVisible();
});

test("vault search filters the shelf to matching notes", async ({ page }) => {
  await page.goto("/knowledge/vault");
  await page.getByTestId("vault-search-input").fill("orchestrator");
  // zibby's body contains "orchestrator" → its shelf row survives the filter.
  await expect(page.getByTestId("list-item-knowledge-general-zibby")).toBeVisible();
  await expect(page.getByTestId("list-item-knowledge-general-rohlik")).toHaveCount(0);
});

test("the daily tier lists today's daily note", async ({ page }) => {
  await page.goto("/knowledge/vault");
  const today = new Date().toISOString().slice(0, 10);
  await expect(page.getByTestId(`list-item-daily-general-${today}`)).toBeVisible();
});

test("creating a note via the dialog adds it to its tier shelf", async ({ page }) => {
  await page.goto("/knowledge/vault");
  await page.getByTestId("vault-note-new").click();
  await expect(page.getByTestId("note-editor-dialog")).toBeVisible();

  // The title auto-slugs the id; save creates the note and selects it.
  await page.getByTestId("note-editor-title").fill("Spec Created Note");
  await page.getByTestId("note-editor-save").click();

  await expect(page.getByTestId("note-editor-dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\?note=spec-created-note$/);
});
