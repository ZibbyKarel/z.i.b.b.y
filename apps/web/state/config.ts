/**
 * Static dashboard configuration — navigation, option lists and icon/tool
 * picker inventories. No domain content or default values live here: skills,
 * integrations, agents and pipelines all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { IconName, SelectOption } from "@zibby/design-system";
import type { Route } from "next";

/**
 * Navigation entry without a display label — the label is resolved from the
 * `nav.<id>` message catalog at render time (see AppShell), so no UI text lives
 * in this data module.
 */
export interface NavConfig {
  id: string;
  glyph: IconName;
  /** A statically-typed app route (Next `typedRoutes`) — a typo fails `tsc`. */
  href: Route;
}

export const NAV_ITEMS = [
  // F8d: "overview" (`/overview`) and "runs" (`/runs`) are deleted — `/chat` is
  // home now (O2/O3) and `/archiv` (F2) is the surviving task archive. Neither
  // carries a nav-rail entry of its own; `/chat` is reached via ⌘J from
  // anywhere, `/archiv` via `ChatTasksPanel`'s own "Archiv" link.
  { id: "projects", glyph: "code", href: "/projects" },
  { id: "companies", glyph: "branch", href: "/companies" },
  { id: "teams", glyph: "grid", href: "/teams" },
  { id: "agents", glyph: "bot", href: "/agents" },
  { id: "pipelines", glyph: "flow", href: "/pipelines" },
  { id: "automations", glyph: "clock", href: "/automations" },
  { id: "skills", glyph: "spark", href: "/system/registries/skills" as Route },
  { id: "commands", glyph: "bolt", href: "/system/registries/commands" as Route },
  { id: "hooks", glyph: "checkpoint", href: "/system/registries/hooks" as Route },
  // B3a (docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md):
  // the handoff signal-kind registry — a config-ish catalog, placed with hooks/mcp.
  { id: "signals", glyph: "pulse", href: "/signals" },
  { id: "mcp", glyph: "server", href: "/system/registries/mcp" as Route },
  { id: "memory", glyph: "brain", href: "/memory" },
] as const satisfies readonly NavConfig[];

export const SETTINGS_ITEM = {
  id: "settings",
  glyph: "gear",
  href: "/system/settings/general" as Route,
} as const satisfies NavConfig;

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
 * ZB-01: `NAV_ITEMS`' flat catalog list becomes the ZibbyCorp 7-section IA
 * (`ROUTE-MAP.md` §1) for the `AppHeader` section nav + `SubNav` sub-tabs.
 * `NAV_ITEMS`/`SETTINGS_ITEM` stay put — `ChatToolDock` (the `/chat` dock's own
 * leaf-level tool list) still reads them and is out of scope until ZB-13.
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
