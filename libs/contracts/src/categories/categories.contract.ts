import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import { CategoryNameSchema, CategorySchema, CreateCategorySchema } from "./category.schema"

const c = initContract()

/**
 * The catalog resources that carry a category taxonomy. Each keeps its own,
 * independent list of categories (agents are not filed under the same taxonomy as
 * skills or projects), so the contract is produced per resource by the factory
 * below and mounted under that resource's URL space.
 */
export type CategorizedResource = "agents" | "skills" | "projects"

/**
 * Build the categories sub-router for a given catalog resource. Categories are
 * stored separately from the entities they group (a manifest the backend owns),
 * so a category can exist with zero members — which is what the "Add category"
 * flow creates before any entity is filed under it.
 *
 * The routes deliberately nest under `/<resource>/categories`. `listCategories`
 * (`GET /<resource>/categories`) collides with the resource's `GET /<resource>/:id`
 * at the path level, so the backend mounts the categories controller *first*; an
 * e2e/integration test guards that ordering. `createCategory` and `deleteCategory`
 * carry an extra segment / differ in method, so they never collide.
 */
export function makeCategoriesContract(resource: CategorizedResource) {
  return c.router(
    {
      listCategories: {
        method: "GET",
        path: `/${resource}/categories`,
        responses: {
          200: z.array(CategorySchema),
        },
        summary: `List all ${resource} categories`,
      },

      createCategory: {
        method: "POST",
        path: `/${resource}/categories`,
        body: CreateCategorySchema,
        responses: {
          201: CategorySchema,
          409: ErrorSchema,
        },
        summary: `Create a new ${resource} category`,
      },

      deleteCategory: {
        method: "DELETE",
        path: `/${resource}/categories/:name`,
        pathParams: z.object({ name: CategoryNameSchema }),
        responses: {
          200: z.object({ name: CategoryNameSchema }),
          404: ErrorSchema,
          409: ErrorSchema,
        },
        summary: `Delete an empty ${resource} category (409 if any entity still uses it)`,
      },
    },
    {
      pathPrefix: "/api",
      strictStatusCodes: true,
    },
  )
}

/** Agent-catalog taxonomy — the original categories resource (`/api/agents/categories`). */
export const categoriesContract = makeCategoriesContract("agents")
export type CategoriesContract = typeof categoriesContract

/** Skill-catalog taxonomy (`/api/skills/categories`). */
export const skillCategoriesContract = makeCategoriesContract("skills")
export type SkillCategoriesContract = typeof skillCategoriesContract

/** Project-registry taxonomy (`/api/projects/categories`). */
export const projectCategoriesContract = makeCategoriesContract("projects")
export type ProjectCategoriesContract = typeof projectCategoriesContract
