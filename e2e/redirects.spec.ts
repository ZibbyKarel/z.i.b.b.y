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
  // e.g. ["/agents", "/org/people"] once ZB-03 ships `/org/people`.
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

/** `/` and `/chat` are the one pair ZB-01 deliberately does NOT redirect yet —
 *  `/org` doesn't exist until ZB-02 (see `app/page.tsx`'s TODO). */
test("/ still renders the pre-ZB-02 /chat landing, not a broken /org redirect", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
});
