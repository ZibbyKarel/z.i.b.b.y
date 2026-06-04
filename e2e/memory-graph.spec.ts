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
