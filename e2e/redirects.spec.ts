import { expect, test } from "@playwright/test";
import { QUERY_REDIRECTS, ROUTE_MAP_REDIRECTS } from "./route-map-redirects";

/**
 * ZB-01 (D-009): loops over ROUTE-MAP.md §2's old→new route table
 * (`route-map-redirects.ts`, shared with `tools/zc-sweep/sweep.spec.ts`).
 */
test("ROUTE-MAP §2 redirects land on their new route", async () => {
  test.skip(ROUTE_MAP_REDIRECTS.length === 0, "no ROUTE-MAP redirect has shipped yet (ZB-01)");
});

for (const [from, to] of ROUTE_MAP_REDIRECTS) {
  test(`${from} redirects to ${to}`, async ({ page }) => {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to}$`));
  });
}

for (const [from, to] of QUERY_REDIRECTS) {
  test(`${from} redirects to ${to}`, async ({ page }) => {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  });
}
