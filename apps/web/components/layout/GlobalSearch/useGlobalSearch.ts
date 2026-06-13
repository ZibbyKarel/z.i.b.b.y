"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SearchMenuSection } from "@zibby/design-system";
import { useAgentsSearchQuery } from "../../../features/agents/queries";
import { useSkillsSearchQuery } from "../../../features/skills/queries";
import { useProjectsSearchQuery } from "../../../features/projects/queries";
import { useAutomationsSearchQuery } from "../../../features/automations/queries";
import { useIntegrationsQuery } from "../../../features/integrations/queries";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";

/** Section ids double as the navigation target for a chosen result. */
const ROUTES = {
  agents: "/agents",
  skills: "/skills",
  projects: "/projects",
  integrations: "/integrations",
  automations: "/automations",
} as const;

/** How long to wait after the last keystroke before hitting the search APIs. */
const DEBOUNCE_MS = 200;

export function useGlobalSearch() {
  const t = useTranslations("search");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const query = useDebouncedValue(value, DEBOUNCE_MS);

  const agents = useAgentsSearchQuery(query);
  const skills = useSkillsSearchQuery(query);
  const projects = useProjectsSearchQuery(query);
  const automations = useAutomationsSearchQuery(query);

  // Integrations have no dedicated search endpoint, so the full list is fetched
  // and filtered client-side (a small, bounded catalog).
  const { data: integrations = [] } = useIntegrationsQuery();
  const needle = query.trim().toLowerCase();
  const integrationHits = useMemo(
    () =>
      needle === ""
        ? []
        : integrations.filter((i) =>
            [i.id, i.name, i.kind].some((f) => f?.toLowerCase().includes(needle)),
          ),
    [integrations, needle],
  );

  const sections = useMemo<SearchMenuSection[]>(
    () => [
      {
        id: "agents",
        label: t("agents"),
        items: (agents.data ?? []).map((a) => ({
          id: a.id,
          title: a.name ?? a.id,
          subtitle: a.description,
          glyph: "bot",
        })),
      },
      {
        id: "skills",
        label: t("skills"),
        items: (skills.data ?? []).map((s) => ({
          id: s.id,
          title: s.name ?? s.id,
          subtitle: s.desc,
          glyph: "spark",
        })),
      },
      {
        id: "projects",
        label: t("projects"),
        items: (projects.data ?? []).map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.path,
          glyph: "code",
        })),
      },
      {
        id: "integrations",
        label: t("integrations"),
        items: integrationHits.map((i) => ({
          id: i.id,
          title: i.name ?? i.id,
          subtitle: i.kind,
          glyph: "plug",
        })),
      },
      {
        id: "automations",
        label: t("automations"),
        items: (automations.data ?? []).map((a) => ({
          id: a.id,
          title: a.name ?? a.id,
          subtitle: a.trigger.type === "cron" ? t("trigger.cron") : t("trigger.event"),
          glyph: "clock",
        })),
      },
    ],
    [t, agents.data, skills.data, projects.data, automations.data, integrationHits],
  );

  const loading =
    agents.isFetching || skills.isFetching || projects.isFetching || automations.isFetching;

  const handleSelect = (sectionId: string) => {
    const route = ROUTES[sectionId as keyof typeof ROUTES];
    if (route) router.push(route);
    setOpen(false);
    setValue("");
  };

  return {
    value,
    setValue,
    open,
    setOpen,
    sections,
    loading,
    handleSelect,
    placeholder: t("placeholder"),
    ariaLabel: t("ariaLabel"),
    emptyLabel: t("empty"),
  };
}
