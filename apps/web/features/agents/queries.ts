import { useQueryClient } from "@tanstack/react-query";
import type { Agent, Category } from "@zibby/contracts";
import { apiClient } from "../../state/api";

/** Shared cache key for the agent list — the TanStack cache is the FE source of truth. */
const AGENTS_KEY = ["agents"] as const;

/** Shared cache key for the category taxonomy. */
const CATEGORIES_KEY = ["categories"] as const;

/**
 * Live agent catalog from `GET /api/agents` — the contract {@link Agent} entity is
 * the single shape used end to end (no separate UI type). Backed by the shared
 * `["agents"]` cache, so every screen that calls this (agents, pipelines, overview)
 * reads one source and re-renders together on a mutation.
 */
export function useAgents(): Agent[] {
  const { data } = apiClient.agents.listAgents.useQuery({
    queryKey: AGENTS_KEY,
  });
  return data?.body ?? [];
}

/** Create an agent (`POST /api/agents`); refreshes the catalog on success. */
export function useCreateAgent() {
  const qc = useQueryClient();
  const mutation = apiClient.agents.createAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
  return {
    ...mutation,
    createAgent: (
      draft: Agent,
      options?: { onSuccess?: (id: string) => void },
    ) =>
      mutation.mutate(
        { body: draft },
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
    updateAgent: ({ id, ...body }: Agent) =>
      mutation.mutate({ params: { id }, body }),
  };
}

/**
 * Live category taxonomy from `GET /api/agents/categories`. Backed by the shared
 * `["categories"]` cache so the agents screen and the agent editor read one source.
 */
export function useCategories(): Category[] {
  const { data } = apiClient.categories.listCategories.useQuery({
    queryKey: CATEGORIES_KEY,
  });
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
    createCategory: (
      category: Category,
      options?: { onSuccess?: () => void },
    ) =>
      mutation.mutate(
        { body: category },
        { onSuccess: () => options?.onSuccess?.() },
      ),
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
      mutation.mutate(
        { params: { id } },
        { onSuccess: () => options?.onSuccess?.() },
      ),
  };
}
