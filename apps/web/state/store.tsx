"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Skill, Workflow } from "../domain";
import { slug } from "../utils/slug";
import type { EntityFormValues } from "../components/EntityFormModal/EntityFormModal";

/**
 * In-memory catalog store for the entities that have no backend yet — skills and
 * workflows. The system starts completely empty; the user creates each one through
 * the UI and these actions append to client state so the dashboard stays
 * interactive. Agents and integrations are NOT here: both are persisted by the API
 * and read through their `features/<domain>/queries` hooks (the TanStack cache is
 * their shared source of truth).
 */
interface CatalogState {
  skills: Skill[];
  workflows: Workflow[];
}

interface CatalogStore extends CatalogState {
  addSkill: (values: EntityFormValues, fallbackDesc: string) => void;
  addWorkflow: (values: EntityFormValues, fallbackDesc: string) => void;
}

const CatalogContext = createContext<CatalogStore | null>(null);

const EMPTY: CatalogState = {
  skills: [],
  workflows: [],
};

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatalogState>(EMPTY);

  const addSkill = useCallback((values: EntityFormValues, fallbackDesc: string) => {
    const id = slug(values.name ?? "", "novy");
    setState((s) => ({
      ...s,
      skills: [
        ...s.skills,
        {
          id: `${id}-${s.skills.length}`,
          name: values.name?.trim() || id,
          glyph: "spark",
          desc: values.desc?.trim() || fallbackDesc,
          file: `~/zibby/skills/${id}/SKILL.md`,
        },
      ],
    }));
  }, []);

  const addWorkflow = useCallback((values: EntityFormValues, fallbackDesc: string) => {
    const id = slug(values.name ?? "", "novy");
    setState((s) => ({
      ...s,
      workflows: [
        ...s.workflows,
        {
          id: `${id}-${s.workflows.length}`,
          name: values.name?.trim() || id,
          lastRun: "—",
          lastState: "done",
          desc: values.desc?.trim() || fallbackDesc,
          file: `~/zibby/workflows/${id}.workflow.md`,
          phases: [
            {
              type: "agent" as const,
              agent: "Agent",
              consumes: "task.md",
              produces: "output.md",
              model: "sonnet",
              thinking: "medium",
            },
          ],
          outputs: [],
        },
      ],
    }));
  }, []);

  const value = useMemo<CatalogStore>(
    () => ({
      ...state,
      addSkill,
      addWorkflow,
    }),
    [state, addSkill, addWorkflow],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogStore {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
