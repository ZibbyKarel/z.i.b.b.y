import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "./agent.schema"
import { CategoryNameSchema, CategorySchema, CreateCategorySchema } from "./category.schema"

const c = initContract()

/**
 * The agent-catalog taxonomy. Categories are stored separately from agents (a
 * manifest the backend owns), so a category can exist with zero agents — which
 * is what the "Add category" flow creates before any agent is filed under it.
 *
 * The routes deliberately nest under `/agents/categories`. `listCategories`
 * (`GET /agents/categories`) collides with the agents resource's
 * `GET /agents/:id` at the path level, so the backend mounts the categories
 * controller *first*; an e2e test guards that ordering. `createCategory` and
 * `deleteCategory` carry an extra segment / differ in method, so they never
 * collide.
 */
export const categoriesContract = c.router(
  {
    listCategories: {
      method: "GET",
      path: "/agents/categories",
      responses: {
        200: z.array(CategorySchema),
      },
      summary: "List all agent categories",
    },

    createCategory: {
      method: "POST",
      path: "/agents/categories",
      body: CreateCategorySchema,
      responses: {
        201: CategorySchema,
        409: ErrorSchema,
      },
      summary: "Create a new agent category",
    },

    deleteCategory: {
      method: "DELETE",
      path: "/agents/categories/:name",
      pathParams: z.object({ name: CategoryNameSchema }),
      responses: {
        200: z.object({ name: CategoryNameSchema }),
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary: "Delete an empty agent category (409 if any agent still uses it)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
)

export type CategoriesContract = typeof categoriesContract
