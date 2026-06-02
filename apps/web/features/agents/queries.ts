import type { Agent, Category } from "@zibby/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { IconName } from "@zibby/design-system";
import type { AgentCategory, AgentDef, ModelName, ThinkingLevel } from "../../domain";
import { apiClient } from "../../state/api";
import { agentFile, mkAgentBody } from "./agentDraft";

/** Shared cache key for the agent list — the TanStack cache is the FE source of truth. */
const AGENTS_KEY = ["agents"] as const;

/** Shared cache key for the category taxonomy. */
const CATEGORIES_KEY = ["categories"] as const;

/**
 * Map a backend {@link Agent} (thin, frontmatter-backed) onto the rich UI
 * {@link AgentDef}. Fields the API does not persist are derived: `file` from the
 * id, and `state`/`runs` are runtime-only defaults. `description` carries the
 * agent's role; `instructions` is the editable Markdown body.
 */
export function toAgentDef(a: Agent): AgentDef {
  return {
    id: a.id,
    name: a.name ?? a.id,
    glyph: (a.glyph as IconName | undefined) ?? "bot",
    role: a.description ?? "",
    model: (a.model as ModelName | undefined) ?? "sonnet",
    thinking: (a.thinking as ThinkingLevel | undefined) ?? "medium",
    tools: a.tools ?? ["read"],
    category: a.category as AgentCategory | undefined,
    enabled: a.enabled,
    state: "idle",
    runs: 0,
    file: agentFile(a.id),
    body: a.instructions,
  };
}

/** Map a UI {@link AgentDef} draft onto the contract create/update body. */
function toAgentBody(d: AgentDef) {
  const instructions = d.body && d.body.trim().length > 0 ? d.body : mkAgentBody(d);
  return {
    name: d.name.trim() || d.id,
    description: d.role.trim() ? d.role.trim() : undefined,
    glyph: d.glyph,
    model: d.model,
    thinking: d.thinking,
    tools: d.tools,
    category: d.category,
    enabled: d.enabled,
    instructions,
  };
}

/**
 * Live agent catalog from `GET /api/agents`, mapped to the UI shape. Backed by
 * the shared `["agents"]` cache, so every screen that calls this (agents,
 * pipelines, overview) reads one source and re-renders together on a mutation.
 */
export function useAgents(): AgentDef[] {
  const { data } = apiClient.agents.listAgents.useQuery({ queryKey: AGENTS_KEY });
  return (data?.body ?? []).map(toAgentDef);
}

/** Create an agent (`POST /api/agents`); refreshes the catalog on success. */
export function useCreateAgent() {
  const qc = useQueryClient();
  const mutation = apiClient.agents.createAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
  return {
    ...mutation,
    createAgent: (draft: AgentDef, options?: { onSuccess?: (id: string) => void }) =>
      mutation.mutate(
        { body: { id: draft.id, ...toAgentBody(draft) } },
        { onSuccess: () => options?.onSuccess?.(draft.id) },
      ),
  };
}

/** Patch an agent (`PATCH /api/agents/:id`); refreshes the catalog on success. */
export function useUpdateAgent() {
  const qc = useQueryClient();
  const mutation = apiClient.agents.updateAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
  return {
    ...mutation,
    updateAgent: (draft: AgentDef) =>
      mutation.mutate({ params: { id: draft.id }, body: toAgentBody(draft) }),
    setEnabled: (id: string, enabled: boolean) =>
      mutation.mutate({ params: { id }, body: { enabled } }),
  };
}

/**
 * Live category taxonomy from `GET /api/agents/categories`. Backed by the shared
 * `["categories"]` cache so the agents screen and the agent editor read one source.
 */
export function useCategories(): Category[] {
  const { data } = apiClient.categories.listCategories.useQuery({ queryKey: CATEGORIES_KEY });
  return data?.body ?? [];
}

/** Create a category (`POST /api/agents/categories`); refreshes the taxonomy on success. */
export function useCreateCategory() {
  const qc = useQueryClient();
  const mutation = apiClient.categories.createCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
  return {
    ...mutation,
    createCategory: (category: Category, options?: { onSuccess?: () => void }) =>
      mutation.mutate({ body: category }, { onSuccess: () => options?.onSuccess?.() }),
  };
}

/**
 * Delete a category (`DELETE /api/agents/categories/:name`). The API refuses
 * (409) while any agent still references it, so only empty categories are
 * removable; refreshes the taxonomy on success.
 */
export function useDeleteCategory() {
  const qc = useQueryClient();
  const mutation = apiClient.categories.deleteCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
  return {
    ...mutation,
    deleteCategory: (name: string) => mutation.mutate({ params: { name } }),
  };
}

/** Delete an agent (`DELETE /api/agents/:id`); refreshes the catalog on success. */
export function useDeleteAgent() {
  const qc = useQueryClient();
  const mutation = apiClient.agents.deleteAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
  return {
    ...mutation,
    deleteAgent: (id: string, options?: { onSuccess?: () => void }) =>
      mutation.mutate({ params: { id } }, { onSuccess: () => options?.onSuccess?.() }),
  };
}
