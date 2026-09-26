/**
 * ROUTE-MAP.md §2's old→new route table, and its query-string counterpart.
 * Plain data — no `test()` calls — so both `redirects.spec.ts` (the `pnpm e2e`
 * gate) and `tools/zc-sweep/sweep.spec.ts` (the ZB-14 validation sweep, which
 * also screenshots the landed page) can import it without re-registering
 * Playwright tests into whichever file imports it.
 *
 * ZB-01 (D-009): the rule is to add a redirect (`apps/web/next.config.mjs`)
 * only once its target route is real — every §2 entry targets a screen phase
 * (ZB-02..ZB-11) that hasn't shipped yet at first, so this list started empty.
 * Each later screen phase adds its redirect to `next.config.mjs` AND its entry
 * here, in the same commit.
 */
export const ROUTE_MAP_REDIRECTS: ReadonlyArray<[from: string, to: string]> = [
  // ZB-02: `/org` ships, so `/` and `/chat` both land there now.
  ["/", "/org"],
  ["/chat", "/org"],
  // ZB-03 (D-015): the employee directory and position registry replace the
  // old `/agents` catalog; the old pipeline catalog has no single pipeline to
  // resolve, so it goes straight to the org map. `/agents/:id` and
  // `/pipelines/:id` are id-dependent (server-side lookup against seeded
  // data) and are left uncovered here — this table only fits static pairs
  // (the sweep covers them separately, with its own seeded ids).
  ["/agents", "/org/people"],
  ["/pipelines", "/org"],
  // ZB-07: the activity screens ship — `/archiv`/`/runs` land on the runs list,
  // `/activity` on its default `log` tab.
  ["/archiv", "/activity/runs"],
  ["/runs", "/activity/runs"],
  ["/activity", "/activity/log"],
  // ZB-09: the memory feature moved to Knowledge → Vault.
  ["/memory", "/knowledge/vault"],
  // ZB-06: goals/companies/teams/projects moved under `/work/*`.
  ["/companies", "/work/companies"],
  ["/companies/new", "/work/companies/new"],
  ["/teams", "/work/teams"],
  ["/teams/new", "/work/teams/new"],
  ["/projects", "/work/projects"],
  ["/projects/new", "/work/projects/new"],
  // ZB-11: `/skills` `/mcp` `/hooks` `/commands` moved under the global
  // registries; the bare `/settings` lands on its default `general` section.
  ["/skills", "/system/registries/skills"],
  ["/mcp", "/system/registries/mcp"],
  ["/hooks", "/system/registries/hooks"],
  ["/commands", "/system/registries/commands"],
  ["/settings", "/system/settings/general"],
];

// ZB-08: the signal-kind registry and the ex-settings gates/mandate tabs moved
// under Policy → Gates (`?section=`). Destinations carry a query string, so
// these use an exact-URL assertion instead of the ROUTE-MAP table's
// end-anchored regex (a literal `?` there would be read as a regex quantifier).
export const QUERY_REDIRECTS: ReadonlyArray<[from: string, to: string]> = [
  ["/signals", "/policy/gates?section=signals"],
  ["/signals/new", "/policy/gates?section=signals&new=1"],
  ["/signals/abc", "/policy/gates?section=signals&id=abc"],
  ["/settings?tab=gates", "/policy/gates"],
  ["/settings?tab=mandate", "/policy/gates?section=mandate"],
  // ZB-11: the remaining `/settings?tab=` values move to their own
  // `/system/settings/<section>` route (ROUTE-MAP §3).
  ["/settings?tab=preferences", "/system/settings/general"],
  ["/settings?tab=tasks", "/system/settings/general"],
  ["/settings?tab=automations", "/system/settings/automations"],
  ["/settings?tab=chat", "/system/settings/coo"],
  ["/settings?tab=activity", "/system/settings/activity"],
  ["/settings?tab=runtime", "/system/settings/runtime"],
  ["/settings?tab=machine", "/system/settings/machine"],
  ["/settings?tab=selfKnowledge", "/knowledge/distill"],
  ["/settings?tab=system", "/system/settings/status"],
];
