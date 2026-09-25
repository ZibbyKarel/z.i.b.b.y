import { expect, test } from "@playwright/test";

/**
 * ZB-01 (D-009): loops over ROUTE-MAP.md §2's old→new route table. The rule is
 * to add a redirect (`apps/web/next.config.mjs`) only once its target route is
 * real — every §2 entry targets a screen phase (ZB-02..ZB-11) that hasn't
 * shipped yet, so this list is empty today and the loop below runs zero times.
 * Each later screen phase adds its redirect to `next.config.mjs` AND its entry
 * here, in the same commit — from then on this spec actually exercises it.
 */
const ROUTE_MAP_REDIRECTS: ReadonlyArray<[from: string, to: string]> = [
  // ZB-02: `/org` ships, so `/` and `/chat` both land there now.
  ["/", "/org"],
  ["/chat", "/org"],
  // ZB-03 (D-015): the employee directory and position registry replace the
  // old `/agents` catalog; the old pipeline catalog has no single pipeline to
  // resolve, so it goes straight to the org map. `/agents/:id` and
  // `/pipelines/:id` are id-dependent (server-side lookup against seeded
  // data) and are left uncovered here — this table only fits static pairs.
  ["/agents", "/org/people"],
  ["/pipelines", "/org"],
  // ZB-07: the activity screens ship — `/archiv`/`/runs` land on the runs list,
  // `/activity` on its default `log` tab.
  ["/archiv", "/activity/runs"],
  ["/runs", "/activity/runs"],
  ["/activity", "/activity/log"],
];

test("ROUTE-MAP §2 redirects land on their new route", async () => {
  test.skip(ROUTE_MAP_REDIRECTS.length === 0, "no ROUTE-MAP redirect has shipped yet (ZB-01)");
});

for (const [from, to] of ROUTE_MAP_REDIRECTS) {
  test(`${from} redirects to ${to}`, async ({ page }) => {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to}$`));
  });
}
