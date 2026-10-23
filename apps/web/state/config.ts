/**
 * Static dashboard configuration — navigation, option lists and icon/tool
 * picker inventories. No domain content or default values live here: skills,
 * integrations, agents and workflows all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { IconName, SelectOption } from "@zibby/design-system";
import type { Route } from "next";

/** A section sub-tab. */
export interface SubTabConfig {
  id: string;
  href: Route;
  /** Path prefix owning this tab when `href` is only its first sub-page
   *  (e.g. `/foo` for a tab at `/foo/first`); defaults to `href`. */
  matchPrefix?: string;
}

export interface SectionConfig {
  id: string;
  glyph: IconName;
  /** Section-level fallback route (AppHeader's section nav) — its first tab. */
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
    id: "dashboard",
    glyph: "compass",
    href: "/dashboard" as Route,
    tabs: [
      { id: "map", href: "/dashboard" as Route },
      // Roadmap items + GitHub PRs awaiting the operator (docs/plans/inbox-ui-spec.md).
      { id: "overview", href: "/dashboard/inbox" as Route },
      { id: "issues", href: "/dashboard/inbox/issues" as Route },
      { id: "pull-requests", href: "/dashboard/inbox/pull-requests" as Route },
      { id: "briefings", href: "/dashboard/briefings" as Route },
    ],
  },
  {
    id: "work",
    glyph: "flow",
    href: "/work/tasks" as Route,
    tabs: [
      { id: "tasks", href: "/work/tasks" as Route },
      { id: "goals", href: "/work/goals" as Route },
      { id: "workflows", href: "/work/workflows" as Route },
      { id: "automations", href: "/work/automations" as Route },
    ],
  },
  {
    id: "companies",
    glyph: "grid",
    href: "/companies" as Route,
    tabs: [
      { id: "companies", href: "/companies" as Route },
      { id: "teams", href: "/teams" as Route },
      { id: "projects", href: "/projects" as Route },
    ],
  },
  {
    id: "workforce",
    glyph: "bot",
    href: "/workforce/agents" as Route,
    // Departments have no tab — the dashboard map is their entry point.
    // Registries keep their `/system/registries/*` routes but belong to this section.
    tabs: [
      { id: "agents", href: "/workforce/agents" as Route },
      { id: "skills", href: "/system/registries/skills" as Route },
      { id: "commands", href: "/system/registries/commands" as Route },
      { id: "mcp", href: "/system/registries/mcp" as Route },
      { id: "hooks", href: "/system/registries/hooks" as Route },
    ],
  },
  {
    id: "activity",
    glyph: "pulse",
    href: "/activity/log",
    tabs: [
      { id: "log", href: "/activity/log" },
      { id: "runs", href: "/activity/runs" },
      { id: "channels", href: "/activity/channels" as Route },
    ],
  },
  {
    id: "knowledge",
    glyph: "brain",
    href: "/knowledge/vault",
    tabs: [
      { id: "vault", href: "/knowledge/vault" },
      { id: "graph", href: "/knowledge/graph" },
      { id: "distill", href: "/knowledge/distill" },
    ],
  },
  {
    id: "governance",
    glyph: "shield",
    href: "/governance/approvals" as Route,
    tabs: [
      { id: "approvals", href: "/governance/approvals" as Route },
      { id: "gates", href: "/governance/gates" as Route },
      { id: "patterns", href: "/governance/patterns" as Route },
      { id: "budgets", href: "/governance/budgets" as Route },
      { id: "spend", href: "/governance/spend" as Route },
    ],
  },
  {
    id: "system",
    glyph: "gear",
    href: "/system/settings/general" as Route,
    // The four settings sections, promoted from the old in-screen tab row.
    tabs: [
      { id: "general", href: "/system/settings/general" as Route },
      { id: "runtime", href: "/system/settings/runtime" as Route },
      { id: "activity", href: "/system/settings/activity" as Route },
      { id: "status", href: "/system/settings/status" as Route },
    ],
  },
] as const satisfies readonly SectionConfig[];

export type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * Reverse lookup — which section a pathname belongs to, for the `AppHeader`
 * section nav's active-item highlight (`usePathname()`). First match wins, so
 * specific prefixes go before generic ones. Falls back to `"dashboard"`.
 */
const PATH_SECTION: readonly (readonly [prefix: string, section: SectionId])[] = [
  ["/dashboard", "dashboard"],
  ["/work", "work"],
  ["/companies", "companies"],
  ["/teams", "companies"],
  ["/projects", "companies"],
  ["/workforce", "workforce"],
  ["/activity", "activity"],
  ["/knowledge", "knowledge"],
  ["/governance", "governance"],
  ["/system/registries", "workforce"],
  ["/system", "system"],
];

export function sectionForPath(pathname: string): SectionId {
  const match = PATH_SECTION.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1] ?? "dashboard";
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
