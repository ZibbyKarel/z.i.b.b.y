import type { Route } from "next";
import type { CommandPaletteEntry, CommandPaletteLabels } from "./types";
import { GATE_SECTIONS, SETTINGS_SECTIONS } from "./staticSections";

/** Plain, hook-free shapes the builder needs from each domain — a narrow slice
 * of the real contract entity, so this module never imports `@zibby/contracts`
 * or a query hook and stays a pure function of its arguments. */
export interface CommandPaletteSources {
  departments: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string; department?: string }>;
  tasks: Array<{ id: string; title: string; department?: string }>;
  chains: Array<{ id: string; label: string }>;
  goals: Array<{ id: string; name?: string; objective: string }>;
  companies: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  /** Only pipelines with a known owning department are indexed — the route
   * (`/org/departments/<dept>/pipelines/<id>`) has no "unknown department" form. */
  pipelines: Array<{ id: string; name: string; department?: string }>;
  skills: Array<{ id: string; name: string }>;
  mcpServers: Array<{ id: string; name?: string }>;
  hooks: Array<{ id: string; name?: string; event: string }>;
  commands: Array<{ id: string; description?: string }>;
  automations: Array<{ id: string; name?: string }>;
  signals: Array<{ id: string; label: string }>;
  notes: Array<{ id: string; title: string; snippet?: string }>;
  /** Whether a pending approval exists to hand "Approve next" a target — the
   * action row is omitted entirely when there is nothing to approve. */
  hasPendingApproval: boolean;
}

/**
 * Assembles the full, ungrouped-yet-tagged row list from live data plus the two
 * static catalogs (settings/gate sections) and the two always-on actions. Pure:
 * no React, no i18n import, no navigation — `apps/web` supplies `labels` (already
 * resolved via `useTranslations`) and consumes `entry.href`/`entry.actionId` to
 * decide what a pick does. Unit-tested directly against fixtures.
 */
export function buildCommandPaletteIndex(
  sources: CommandPaletteSources,
  labels: CommandPaletteLabels,
): CommandPaletteEntry[] {
  const entries: CommandPaletteEntry[] = [];

  entries.push({
    id: "new-task",
    group: "actions",
    kind: "action",
    label: labels.actions.newTask,
    actionId: "new-task",
  });
  if (sources.hasPendingApproval) {
    entries.push({
      id: "approve-next",
      group: "actions",
      kind: "action",
      label: labels.actions.approveNext,
      actionId: "approve-next",
    });
  }
  entries.push({
    id: "toggle-theme",
    group: "actions",
    kind: "action",
    label: labels.actions.toggleTheme,
    actionId: "toggle-theme",
  });

  for (const d of sources.departments) {
    entries.push({
      id: d.id,
      group: "departments",
      kind: "department",
      label: d.name,
      href: `/org/departments/${d.id}/team` as Route,
    });
  }

  for (const p of sources.people) {
    entries.push({
      id: p.id,
      group: "people",
      kind: "person",
      label: p.name,
      meta: p.department,
      href: `/org/people/${p.id}` as Route,
    });
  }

  for (const t of sources.tasks) {
    entries.push({
      id: t.id,
      group: "tasks",
      kind: "task",
      label: t.title,
      meta: t.department,
      href: `/work/tasks/${t.id}` as Route,
    });
  }

  for (const c of sources.chains) {
    entries.push({
      id: c.id,
      group: "chains",
      kind: "chain",
      label: c.label,
      href: `/work/chains/${c.id}` as Route,
    });
  }

  for (const g of sources.goals) {
    entries.push({
      id: g.id,
      group: "goals",
      kind: "goal",
      label: g.name ?? g.objective,
      href: `/work/goals/${g.id}` as Route,
    });
  }

  for (const c of sources.companies) {
    entries.push({
      id: c.id,
      group: "companies",
      kind: "company",
      label: c.name,
      href: `/work/companies/${c.id}` as Route,
    });
  }

  for (const t of sources.teams) {
    entries.push({
      id: t.id,
      group: "teams",
      kind: "team",
      label: t.name,
      href: `/work/teams/${t.id}` as Route,
    });
  }

  for (const p of sources.projects) {
    entries.push({
      id: p.id,
      group: "projects",
      kind: "project",
      label: p.name,
      href: `/work/projects/${p.id}` as Route,
    });
  }

  for (const p of sources.pipelines) {
    if (!p.department) continue;
    entries.push({
      id: p.id,
      group: "pipelines",
      kind: "pipeline",
      label: p.name,
      meta: p.department,
      href: `/org/departments/${p.department}/pipelines/${p.id}` as Route,
    });
  }

  for (const s of sources.skills) {
    entries.push({
      id: s.id,
      group: "registries",
      kind: "skill",
      label: s.name,
      href: `/system/registries/skills/${s.id}` as Route,
    });
  }
  for (const m of sources.mcpServers) {
    entries.push({
      id: m.id,
      group: "registries",
      kind: "mcp",
      label: m.name ?? m.id,
      href: `/system/registries/mcp/${m.id}` as Route,
    });
  }
  for (const h of sources.hooks) {
    entries.push({
      id: h.id,
      group: "registries",
      kind: "hook",
      label: h.name ?? h.id,
      meta: h.event,
      href: `/system/registries/hooks/${h.id}` as Route,
    });
  }
  for (const c of sources.commands) {
    entries.push({
      id: c.id,
      group: "registries",
      kind: "command",
      label: `/${c.id}`,
      meta: c.description,
      href: `/system/registries/commands/${c.id}` as Route,
    });
  }

  for (const a of sources.automations) {
    entries.push({
      id: a.id,
      group: "automations",
      kind: "automation",
      label: a.name ?? a.id,
      // No per-automation deep link yet — the owning-department mapping
      // (PART-B §3) is ZB-11's to define; the global list is the closest
      // resolvable target today.
      href: "/system/settings/automations" as Route,
    });
  }

  for (const s of sources.signals) {
    entries.push({
      id: s.id,
      group: "signals",
      kind: "signal",
      label: s.label,
      href: `/policy/gates?section=signals&id=${s.id}` as Route,
    });
  }

  for (const n of sources.notes) {
    entries.push({
      id: n.id,
      group: "vault",
      kind: "note",
      label: n.title,
      meta: n.snippet,
      href: `/knowledge/vault?note=${encodeURIComponent(n.id)}` as Route,
    });
  }

  for (const section of SETTINGS_SECTIONS) {
    entries.push({
      id: section,
      group: "settings",
      kind: "setting",
      label: labels.settingsSection[section] ?? section,
      href: `/system/settings/${section}` as Route,
    });
  }

  for (const section of GATE_SECTIONS) {
    entries.push({
      id: section,
      group: "gates",
      kind: "gate",
      label: labels.gateSection[section] ?? section,
      href: `/policy/gates?section=${section}` as Route,
    });
  }

  return entries;
}
