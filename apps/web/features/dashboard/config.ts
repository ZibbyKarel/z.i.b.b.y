/**
 * Static dashboard configuration — navigation, target projects, option lists and
 * the (empty-system) quota readout. No domain content lives here: skills,
 * integrations, agents and pipelines all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { ListItem, SelectOption } from "@zibby/design-system";
import type { AgentSdkCredit, ClaudeLimits } from "../../domain";

export const PROJECTS = [
  "zibby-core",
  "home-ops",
  "media-vault",
  "~/cesta/k/projektu",
] as const;

export const NAV_ITEMS: ListItem[] = [
  { id: "overview",      label: "Přehled",          glyph: "grid",   href: "/overview" },
  { id: "skills",        label: "Skilly",            glyph: "spark",  href: "/skills" },
  { id: "agents",        label: "Agenti",            glyph: "bot",    href: "/agents" },
  { id: "pipelines",     label: "Orchestrace",       glyph: "flow",   href: "/pipelines" },
  { id: "integrations",  label: "Integrace",         glyph: "plug",   href: "/integrations" },
  { id: "automations",   label: "Automatizace",      glyph: "clock",  href: "/automations" },
  { id: "memory",        label: "Paměť",             glyph: "brain",  href: "/memory" },
  { id: "runs",          label: "Běžící agenti",     glyph: "pulse",  href: "/runs" },
];

export const SETTINGS_ITEM: ListItem = {
  id: "settings",
  label: "Nastavení systému",
  glyph: "gear",
  href: "/settings",
};

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  [...NAV_ITEMS, SETTINGS_ITEM].map((n) => [n.id, n.label]),
);

export const CONTEXT_OPTIONS: SelectOption[] = [
  { value: "home", label: "home" },
  { value: "work", label: "work" },
];

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
 * Quota widget data for a fresh system: nothing has run yet, so interactive
 * limits are at zero and the Agent SDK credit is full.
 */
export const CLAUDE_LIMITS: ClaudeLimits = {
  rolling: {
    label: "5h rolling",
    short: "5h",
    usedPct: 0,
    resetIn: "—",
    tokens: "0 / 200k",
  },
  weekly: {
    label: "Týdenní",
    short: "týden",
    usedPct: 0,
    resetIn: "Po 09:00",
    tokens: "0 / 5M",
  },
};

export const AGENT_SDK: AgentSdkCredit = {
  label: "Agent SDK kredit",
  total: 200,
  used: 0,
  remaining: 200,
  usedPct: 0,
  renew: "1. čer",
  byAgent: [],
  byPipeline: [],
  byContext: [],
  trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
