import { expect, test } from "@playwright/test";

/**
 * Throughline: the Memory screen renders the force-directed wiki-link graph from
 * the real vault, and clicking a node opens its note (with body). Exercises the
 * memory graph + note query wiring and the SVG graph composite.
 */
test("memory graph renders and a node opens its note", async ({ page }) => {
  await page.goto("/memory");

  await expect(page.getByTestId("memory-graph")).toBeVisible();
  // Nodes from the seeded vault (MEMORY → rohlik → zibby).
  await expect(page.getByTestId("memory-node-rohlik")).toBeVisible();

  // The click handler is on the node <g>, which sits under a transparent layout
  // div — dispatch the DOM click straight to the element to bypass hit-testing.
  await page.getByTestId("memory-node-zibby").dispatchEvent("click");

  // The note viewer shows the selected note's body.
  await expect(page.getByText("The orchestrator note.")).toBeVisible();
});

/**
 * Phase 4 write surfaces: search opens a note, the tier filter prunes the graph,
 * the daily timeline lists today's note, and creating a note adds a graph node.
 */
test("memory search opens a matching note", async ({ page }) => {
  await page.goto("/memory");
  await page.getByTestId("memory-search-input").fill("orchestrator");
  // zibby's body contains "orchestrator" → its hit appears and opens the note.
  await page.getByTestId("memory-search-hit-zibby").click();
  // The note viewer's path caption is unique to the open note (the hit snippet
  // would also contain the body text, so assert on the path instead).
  await expect(page.getByText("knowledge/zibby.md · knowledge")).toBeVisible();
});

test("the knowledge tier filter hides the memory-tier node", async ({ page }) => {
  await page.goto("/memory");
  await expect(page.getByTestId("memory-node-MEMORY")).toBeVisible();
  await page.getByTestId("memory-tier-knowledge").click();
  await expect(page.getByTestId("memory-node-MEMORY")).toHaveCount(0);
  // knowledge-tier nodes survive.
  await expect(page.getByTestId("memory-node-rohlik")).toBeVisible();
});

test("the daily timeline lists today's daily note", async ({ page }) => {
  await page.goto("/memory");
  const today = new Date().toISOString().slice(0, 10);
  await expect(page.getByTestId(`memory-daily-${today}`)).toBeVisible();
});

test("creating a note via the dialog adds a graph node", async ({ page }) => {
  await page.goto("/memory");
  await page.getByTestId("memory-note-new").click();
  await expect(page.getByTestId("note-editor-dialog")).toBeVisible();

  // The title auto-slugs the id; save creates the note and the graph gains its node.
  await page.getByTestId("note-editor-title").fill("Spec Created Note");
  await page.getByTestId("note-editor-save").click();

  await expect(page.getByTestId("note-editor-dialog")).toHaveCount(0);
  await expect(page.getByTestId("memory-node-spec-created-note")).toBeVisible();
});
