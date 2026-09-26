/**
 * Static dashboard configuration — navigation, option lists and icon/tool
 * picker inventories. No domain content or default values live here: skills,
 * integrations, agents and pipelines all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { IconName, SelectOption } from "@zibby/design-system";
import type { Route } from "next";

/**
 * A section sub-tab. `href` is a real ZibbyCorp route once its screen phase ships
 * (ZB-02..ZB-11); until then it is "the closest existing current route" (ZB-01's
 * rule) — usually the section's own fallback. ZB-06 shipped `goals`/`companies`/
 * `teams`/`projects` at their real `/work/*` homes.
 */
export interface SubTabConfig {
  id: string;
  href: Route;
}

export interface SectionConfig {
  id: string;
  glyph: IconName;
  /** Section-level fallback route (AppHeader's section nav) — the ZB-01 mapping,
   *  updated as each section ships: org→/org (ZB-02), work→/work/tasks (ZB-04/06),
   *  activity→/activity/log (ZB-07), policy→/policy/approvals (ZB-08),
   *  knowledge→/knowledge/vault (ZB-09), ledger→/ledger/budgets (ZB-10),
   *  system→/system/settings/general (ZB-11). */
  href: Route;
  tabs: readonly SubTabConfig[];
}

/**
 * ZB-01: the old flat `NAV_ITEMS` catalog list became the ZibbyCorp 7-section IA
 * (`ROUTE-MAP.md` §1) for the `AppHeader` section nav + `SubNav` sub-tabs.
 * `NAV_ITEMS`/`SETTINGS_ITEM` were removed in ZB-13 along with their last reader,
 * the old `ChatToolDock` leaf-level tool list.
 */
export const SECTIONS = [
  {
    id: "org",
    glyph: "compass",
    href: "/org",
    tabs: [
      // ZB-02: the map ships. ZB-03: `/org/people` (the employee directory) ships too.
      { id: "map", href: "/org" },
      { id: "people", href: "/org/people" },
    ],
  },
  {
    id: "work",
    glyph: "flow",
    href: "/work/tasks" as Route,
    tabs: [
      { id: "tasks", href: "/work/tasks" as Route },
      { id: "chains", href: "/work/chains" as Route },
      { id: "goals", href: "/work/goals" as Route },
      { id: "companies", href: "/work/companies" as Route },
      { id: "teams", href: "/work/teams" as Route },
      { id: "projects", href: "/work/projects" as Route },
    ],
  },
  {
    id: "activity",
    glyph: "pulse",
    href: "/activity/log",
    tabs: [
      { id: "log", href: "/activity/log" },
      { id: "runs", href: "/activity/runs" },
      { id: "inbox", href: "/activity/inbox" },
      { id: "briefings", href: "/activity/briefings" },
    ],
  },
  {
    id: "policy",
    glyph: "shield",
    href: "/policy/approvals",
    tabs: [
      { id: "approvals", href: "/policy/approvals" },
      // Not yet in the typed-route union until a build/dev regenerates
      // `.next/types` for these freshly-added pages (ZB-08) — same cast
      // pattern as the other freshly-added routes in this table.
      { id: "gates", href: "/policy/gates" as Route },
      { id: "patterns", href: "/policy/patterns" as Route },
    ],
  },
  {
    id: "knowledge",
    glyph: "brain",
    href: "/knowledge/vault",
    tabs: [
      { id: "vault", href: "/knowledge/vault" },
      { id: "distill", href: "/knowledge/distill" },
    ],
  },
  {
    id: "ledger",
    glyph: "dollar",
    href: "/ledger/budgets",
    tabs: [
      { id: "budgets", href: "/ledger/budgets" },
      { id: "spend", href: "/ledger/spend" as Route },
    ],
  },
  {
    id: "system",
    glyph: "gear",
    href: "/system/settings/general" as Route,
    tabs: [
      { id: "settings", href: "/system/settings/general" as Route },
      { id: "registries", href: "/system/registries/skills" as Route },
    ],
  },
] as const satisfies readonly SectionConfig[];

export type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * Reverse lookup — which section a legacy pathname belongs to, for the
 * `AppHeader` section nav's active-item highlight (`usePathname()`). Checked as
 * a prefix match, longest-path entries are irrelevant here since every legacy
 * route is a single top-level segment. Falls back to `"org"` (today's `/chat`
 * home) for anything unmatched.
 */
const PATH_SECTION: readonly (readonly [prefix: string, section: SectionId])[] = [
  ["/agents", "org"],
  ["/pipelines", "org"],
  ["/automations", "org"],
  ["/chat", "org"],
  // ZB-03 (D-015/D-009): the employee directory + department pages (org) and
  // the moved position registry (system).
  ["/org", "org"],
  ["/system", "system"],
  // ZB-06: goals/companies/teams/projects moved under /work/*; the bare
  // top-level prefixes are kept as redirect targets only (D-009), not routes.
  ["/work", "work"],
  ["/activity", "activity"],
  ["/archiv", "activity"],
  ["/runs", "activity"],
  ["/signals", "policy"],
  ["/memory", "knowledge"],
  ["/knowledge", "knowledge"],
  ["/ledger", "ledger"],
];

export function sectionForPath(pathname: string): SectionId {
  const match = PATH_SECTION.find(([prefix]) => pathname.startsWith(prefix));
  return match?.[1] ?? "org";
}

export const MODEL_OPTIONS: SelectOption[] = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

export const THINKING_OPTIONS: SelectOption[] = [
  { value: "high", label: "high" },
  { value: "medium", label: "medium" },
  { value: "low", label: "low" },
];

/**
 * Agent catalog categories are now a dynamic, user-managed taxonomy served by
 * `GET /api/agents/categories` (see `features/agents/queries.ts`) — names and
 * glyphs live there, not in this static config. The shipped defaults are seeded
 * by the backend on first run.
 */

/** Glyphs offered in the category and agent editor icon pickers. */
export const AGENT_GLYPHS: IconName[] = [
  "compass",
  "code",
  "flask",
  "doc",
  "check",
  "search",
  "bot",
  "brain",
  "shield",
  "spark",
  "film",
  "cart",
  "server",
  "flow",
  "gear",
];

/** Tools an agent can be granted in the editor. */
export const AGENT_TOOLS = ["read", "write", "bash", "git", "web"] as const;
