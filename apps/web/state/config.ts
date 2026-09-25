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
  { id: "skills", glyph: "spark", href: "/skills" },
  { id: "commands", glyph: "bolt", href: "/commands" },
  { id: "hooks", glyph: "checkpoint", href: "/hooks" },
  // B3a (docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md):
  // the handoff signal-kind registry — a config-ish catalog, placed with hooks/mcp.
  { id: "signals", glyph: "pulse", href: "/signals" },
  { id: "mcp", glyph: "server", href: "/mcp" },
  { id: "memory", glyph: "brain", href: "/memory" },
] as const satisfies readonly NavConfig[];

export const SETTINGS_ITEM = {
  id: "settings",
  glyph: "gear",
  href: "/settings",
} as const satisfies NavConfig;

/**
 * A section sub-tab. `href` is a real ZibbyCorp route once its screen phase ships
 * (ZB-02..ZB-11); until then it is "the closest existing current route" (ZB-01's
 * rule) — usually the section's own fallback, except the three `work` tabs
 * (`companies`, `teams`, `projects`) that already have a distinct legacy screen.
 */
export interface SubTabConfig {
  id: string;
  href: Route;
}

export interface SectionConfig {
  id: string;
  glyph: IconName;
  /** Section-level fallback route (AppHeader's section nav) — the ZB-01 mapping,
   *  updated as each section ships: org→/org (ZB-02), work→/projects,
   *  activity→/activity/log (ZB-07), policy→/settings?tab=gates, knowledge→/memory,
   *  ledger→/settings, system→/settings. */
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
    href: "/projects",
    tabs: [
      { id: "tasks", href: "/work/tasks" as Route },
      { id: "chains", href: "/projects" },
      { id: "goals", href: "/projects" },
      { id: "companies", href: "/companies" },
      { id: "teams", href: "/teams" },
      { id: "projects", href: "/projects" },
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
    // `?tab=` targets aren't in Next's typed-route union — same cast pattern as
    // the project profile's own `?tab=` links (e.g. `GatesTab.tsx`).
    href: "/settings?tab=gates" as Route,
    tabs: [
      { id: "approvals", href: "/settings?tab=gates" as Route },
      { id: "gates", href: "/settings?tab=gates" as Route },
      { id: "patterns", href: "/settings?tab=gates" as Route },
    ],
  },
  {
    id: "knowledge",
    glyph: "brain",
    href: "/memory",
    tabs: [
      { id: "vault", href: "/memory" },
      { id: "distill", href: "/memory" },
    ],
  },
  {
    id: "ledger",
    glyph: "dollar",
    href: "/settings",
    tabs: [
      { id: "budgets", href: "/settings" },
      { id: "spend", href: "/settings" },
    ],
  },
  {
    id: "system",
    glyph: "gear",
    href: "/settings",
    tabs: [
      { id: "settings", href: "/settings" },
      { id: "registries", href: "/skills" },
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
  ["/work/tasks", "work"],
  ["/projects", "work"],
  ["/companies", "work"],
  ["/teams", "work"],
  ["/activity", "activity"],
  ["/archiv", "activity"],
  ["/runs", "activity"],
  ["/signals", "policy"],
  ["/memory", "knowledge"],
  ["/skills", "system"],
  ["/mcp", "system"],
  ["/hooks", "system"],
  ["/commands", "system"],
  ["/settings", "system"],
];

/** `?tab=gates`/`?tab=mandate` on `/settings` currently belong to Policy, not
 * System (ROUTE-MAP §3) — the one case a bare prefix match gets wrong. */
const SETTINGS_POLICY_TABS = new Set(["gates", "mandate"]);

export function sectionForPath(pathname: string, searchParams?: URLSearchParams): SectionId {
  if (pathname === "/settings" && SETTINGS_POLICY_TABS.has(searchParams?.get("tab") ?? "")) {
    return "policy";
  }
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
