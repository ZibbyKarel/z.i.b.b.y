import {
  CategoryConflictError,
  type CategoryManifestStore,
  CategoryNotFoundError,
} from "./category-manifest-store"

/**
 * Build the `@ts-rest/nest` handler implementation for a categories sub-router.
 * Every category contract (agents/skills/projects) has the same three routes, so
 * the handler logic is identical apart from which entity store backs the "still
 * in use" check and the noun used in the 409 message. This keeps each resource's
 * categories controller a thin wrapper.
 *
 * A category is deletable only while empty: removing one that entities still
 * reference would orphan them from the catalog's grouping (the contract surfaces
 * that as a 409).
 */
export function makeCategoryHandlers(deps: {
  store: CategoryManifestStore
  /** How many entities currently sit in the named category. */
  countInCategory: (name: string) => Promise<number>
  /** Singular noun for the 409 message, e.g. "skill" / "project". */
  noun: string
}) {
  const { store, countInCategory, noun } = deps
  return {
    listCategories: async () => ({ status: 200 as const, body: await store.list() }),

    createCategory: async ({ body }: { body: { name: string; glyph: string } }) => {
      try {
        const category = await store.create(body)
        return { status: 201 as const, body: category }
      } catch (error) {
        if (error instanceof CategoryConflictError) {
          return { status: 409 as const, body: { message: error.message } }
        }
        throw error
      }
    },

    deleteCategory: async ({ params: { name } }: { params: { name: string } }) => {
      const inUse = await countInCategory(name)
      if (inUse > 0) {
        return {
          status: 409 as const,
          body: { message: `Category "${name}" still has ${inUse} ${noun}(s) and cannot be deleted` },
        }
      }
      try {
        await store.delete(name)
        return { status: 200 as const, body: { name } }
      } catch (error) {
        if (error instanceof CategoryNotFoundError) {
          return { status: 404 as const, body: { message: error.message } }
        }
        throw error
      }
    },
  }
}
