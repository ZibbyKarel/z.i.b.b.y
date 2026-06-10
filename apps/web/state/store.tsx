"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Integration, Pipeline, Skill } from "../domain";
import { slug } from "../utils/slug";
import type { EntityFormValues } from "../components/EntityFormModal/EntityFormModal";

/**
 * In-memory catalog store for the entities that have no backend yet — skills,
 * integrations and pipelines. The system starts completely empty; the user
 * creates each one through the UI and these actions append to client state so
 * the dashboard stays interactive. Agents are NOT here: they are persisted by
 * the API and read through `features/agents/queries.ts` (the TanStack cache is
 * their shared source of truth).
 */
interface CatalogState {
  skills: Skill[];
  integrations: Integration[];
  pipelines: Pipeline[];
}

interface CatalogStore extends CatalogState {
  addSkill: (values: EntityFormValues, fallbackDesc: string) => void;
  addIntegration: (values: EntityFormValues, fallbackDesc: string) => void;
  addPipeline: (values: EntityFormValues, fallbackDesc: string) => void;
}

const CatalogContext = createContext<CatalogStore | null>(null);

const EMPTY: CatalogState = {
  skills: [],
  integrations: [],
  pipelines: [],
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

  const addIntegration = useCallback((values: EntityFormValues, fallbackDesc: string) => {
    const id = slug(values.name ?? "", "novy");
    setState((s) => ({
      ...s,
      integrations: [
        ...s.integrations,
        {
          id: `${id}-${s.integrations.length}`,
          name: values.name?.trim() || id,
          glyph: "plug",
          desc: values.desc?.trim() || fallbackDesc,
          status: "disconnected",
          file: `~/zibby/integrations/${id}.json`,
        },
      ],
    }));
  }, []);

  const addPipeline = useCallback((values: EntityFormValues, fallbackDesc: string) => {
    const id = slug(values.name ?? "", "novy");
    const budget = Number.parseInt(values.budget ?? "", 10);
    setState((s) => ({
      ...s,
      pipelines: [
        ...s.pipelines,
        {
          id: `${id}-${s.pipelines.length}`,
          name: values.name?.trim() || id,
          budget: Number.isFinite(budget) ? budget : 25,
          lastRun: "—",
          lastState: "done",
          desc: values.desc?.trim() || fallbackDesc,
          file: `~/zibby/pipelines/${id}.pipeline.md`,
          phases: [
            {
              agent: "Agent",
              consumes: "task.md",
              produces: "output.md",
              model: "sonnet",
              thinking: "medium",
            },
          ],
        },
      ],
    }));
  }, []);

  const value = useMemo<CatalogStore>(
    () => ({
      ...state,
      addSkill,
      addIntegration,
      addPipeline,
    }),
    [state, addSkill, addIntegration, addPipeline],
  );

  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogStore {
  const ctx = useContext(CatalogContext);
  if (!ctx)
    throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
