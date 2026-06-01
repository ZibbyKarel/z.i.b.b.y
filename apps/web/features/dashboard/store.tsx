"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AgentDef, ContextName, Integration, ModelName, Pipeline, Skill, ThinkingLevel } from "../../domain";
import type { EntityFormValues } from "./components/EntityFormModal";

/**
 * In-memory dashboard store. The system starts completely empty — no demo skills,
 * integrations, agents or pipelines — and the user creates each one through the
 * UI. In production these actions would POST to API routes that write the
 * backing files (SKILL.md, *.json, *.agent.md, *.pipeline.md); here they append
 * to client state so the dashboard is fully interactive.
 */
interface DashboardState {
  skills: Skill[];
  integrations: Integration[];
  agents: AgentDef[];
  pipelines: Pipeline[];
}

interface DashboardStore extends DashboardState {
  addSkill: (values: EntityFormValues) => void;
  addIntegration: (values: EntityFormValues) => void;
  addAgent: (values: EntityFormValues) => void;
  addPipeline: (values: EntityFormValues) => void;
}

const DashboardContext = createContext<DashboardStore | null>(null);

const EMPTY: DashboardState = {
  skills: [],
  integrations: [],
  agents: [],
  pipelines: [],
};

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "novy";

const asContext = (v: string | undefined): ContextName =>
  v === "work" ? "work" : "home";

export function DashboardStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardState>(EMPTY);

  const addSkill = useCallback((values: EntityFormValues) => {
    const id = slug(values.name ?? "");
    const ctx = asContext(values.ctx);
    setState((s) => ({
      ...s,
      skills: [
        ...s.skills,
        {
          id: `${id}-${s.skills.length}`,
          name: values.name?.trim() || id,
          glyph: "spark",
          desc: values.desc?.trim() || "Nový skill",
          ctx,
          file: `~/zibby/skills/${id}/SKILL.md`,
        },
      ],
    }));
  }, []);

  const addIntegration = useCallback((values: EntityFormValues) => {
    const id = slug(values.name ?? "");
    const ctx = asContext(values.ctx);
    setState((s) => ({
      ...s,
      integrations: [
        ...s.integrations,
        {
          id: `${id}-${s.integrations.length}`,
          name: values.name?.trim() || id,
          glyph: "plug",
          desc: values.desc?.trim() || "Nová integrace",
          ctx,
          status: "disconnected",
          file: `~/zibby/integrations/${id}.json`,
        },
      ],
    }));
  }, []);

  const addAgent = useCallback((values: EntityFormValues) => {
    const id = slug(values.name ?? "");
    const ctx = asContext(values.ctx);
    setState((s) => ({
      ...s,
      agents: [
        ...s.agents,
        {
          id: `${id}-${s.agents.length}`,
          name: values.name?.trim() || id,
          glyph: "bot",
          role: values.role?.trim() || "Nový agent",
          model: (values.model as ModelName) || "sonnet",
          thinking: (values.thinking as ThinkingLevel) || "medium",
          tools: ["read"],
          ctx,
          state: "idle",
          file: `~/zibby/agents/${id}.agent.md`,
        },
      ],
    }));
  }, []);

  const addPipeline = useCallback((values: EntityFormValues) => {
    const id = slug(values.name ?? "");
    const ctx = asContext(values.ctx);
    const budget = Number.parseInt(values.budget ?? "", 10);
    setState((s) => ({
      ...s,
      pipelines: [
        ...s.pipelines,
        {
          id: `${id}-${s.pipelines.length}`,
          name: values.name?.trim() || id,
          ctx,
          budget: Number.isFinite(budget) ? budget : 25,
          lastRun: "—",
          lastState: "done",
          desc: values.desc?.trim() || "Nová pipeline",
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

  const value = useMemo<DashboardStore>(
    () => ({ ...state, addSkill, addIntegration, addAgent, addPipeline }),
    [state, addSkill, addIntegration, addAgent, addPipeline],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardStore(): DashboardStore {
  const ctx = useContext(DashboardContext);
  if (!ctx)
    throw new Error(
      "useDashboardStore must be used within DashboardStoreProvider",
    );
  return ctx;
}
