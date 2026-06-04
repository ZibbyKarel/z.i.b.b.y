import { expect, test } from "@playwright/test";

/**
 * Throughline: create-was-seeded skill → run it from its tile via the RunModal →
 * the launched confirmation appears. Exercises the skills query + start-run
 * mutation wiring through the DS tile + modal.
 */
test("run a skill from its tile", async ({ page }) => {
  await page.goto("/skills");

  await expect(page.getByText("Demo Skill", { exact: true })).toBeVisible();

  // Open the RunModal from the tile's Run button.
  await page.getByRole("button", { name: "Run", exact: true }).first().click();

  // Compose a prompt and launch.
  await page.getByRole("textbox").first().fill("summarise the inbox");
  await page.getByRole("button", { name: "Run agent" }).click();

  // The background-launch confirmation.
  await expect(page.getByText("Agent launched in the background")).toBeVisible();
});
