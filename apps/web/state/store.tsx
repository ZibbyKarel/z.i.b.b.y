"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Pipeline, Skill } from "../domain";
import { slug } from "../utils/slug";
import type { EntityFormValues } from "../components/EntityFormModal/EntityFormModal";

/**
 * In-memory catalog store for the entities that have no backend yet — skills and
 * pipelines. The system starts completely empty; the user creates each one through
 * the UI and these actions append to client state so the dashboard stays
 * interactive. Agents and integrations are NOT here: both are persisted by the API
 * and read through their `features/<domain>/queries` hooks (the TanStack cache is
 * their shared source of truth).
 */
interface CatalogState {
  skills: Skill[];
  pipelines: Pipeline[];
}

interface CatalogStore extends CatalogState {
  addSkill: (values: EntityFormValues, fallbackDesc: string) => void;
  addPipeline: (values: EntityFormValues, fallbackDesc: string) => void;
}

const CatalogContext = createContext<CatalogStore | null>(null);

const EMPTY: CatalogState = {
  skills: [],
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

  const addPipeline = useCallback((values: EntityFormValues, fallbackDesc: string) => {
    const id = slug(values.name ?? "", "novy");
    setState((s) => ({
      ...s,
      pipelines: [
        ...s.pipelines,
        {
          id: `${id}-${s.pipelines.length}`,
          name: values.name?.trim() || id,
          lastRun: "—",
          lastState: "done",
          desc: values.desc?.trim() || fallbackDesc,
          file: `~/zibby/pipelines/${id}.pipeline.md`,
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
      addPipeline,
    }),
    [state, addSkill, addPipeline],
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
