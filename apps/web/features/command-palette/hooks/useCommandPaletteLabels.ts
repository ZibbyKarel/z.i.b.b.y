import { useTranslations } from "next-intl";
import type { CommandPaletteLabels } from "../types";
import { GATE_SECTIONS, SETTINGS_SECTIONS } from "../staticSections";

/** Resolves every string {@link buildCommandPaletteIndex} needs from the
 * `commandPalette` catalog — kept as its own hook so the pure builder never
 * imports `next-intl` directly. */
export function useCommandPaletteLabels(): CommandPaletteLabels {
  const t = useTranslations("commandPalette");
  return {
    kind: {
      department: t("kind.department"),
      person: t("kind.person"),
      task: t("kind.task"),
      chain: t("kind.chain"),
      goal: t("kind.goal"),
      company: t("kind.company"),
      team: t("kind.team"),
      project: t("kind.project"),
      pipeline: t("kind.pipeline"),
      skill: t("kind.skill"),
      mcp: t("kind.mcp"),
      hook: t("kind.hook"),
      command: t("kind.command"),
      automation: t("kind.automation"),
      signal: t("kind.signal"),
      note: t("kind.note"),
      setting: t("kind.setting"),
      gate: t("kind.gate"),
      action: t("kind.action"),
    },
    group: {
      actions: t("group.actions"),
      departments: t("group.departments"),
      people: t("group.people"),
      tasks: t("group.tasks"),
      chains: t("group.chains"),
      goals: t("group.goals"),
      companies: t("group.companies"),
      teams: t("group.teams"),
      projects: t("group.projects"),
      pipelines: t("group.pipelines"),
      registries: t("group.registries"),
      automations: t("group.automations"),
      signals: t("group.signals"),
      vault: t("group.vault"),
      settings: t("group.settings"),
      gates: t("group.gates"),
    },
    settingsSection: Object.fromEntries(
      SETTINGS_SECTIONS.map((id) => [id, t(`settingsSection.${id}`)]),
    ),
    gateSection: Object.fromEntries(GATE_SECTIONS.map((id) => [id, t(`gateSection.${id}`)])),
    actions: {
      newTask: t("actions.newTask"),
      approveNext: t("actions.approveNext"),
      toggleTheme: t("actions.toggleTheme"),
    },
  };
}
