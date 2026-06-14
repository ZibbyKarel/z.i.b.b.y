import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import { CreateHookSchema, HookIdSchema, HookSchema, UpdateHookSchema } from "./hook.schema"

const c = initContract()

const IdParam = z.object({ id: HookIdSchema })

/**
 * CRUD over custom Claude Code hooks. Mirrors `skillsContract`; the backend
 * implements it via `@ts-rest/nest` against a file-backed (JSON) storage service.
 * The enabled hooks are merged into every run's `--settings` by the runner — the
 * locked approval hook always wins (Law 1), so this catalog can only ADD hooks.
 */
export const hooksContract = c.router(
  {
    createHook: {
      method: "POST",
      path: "/hooks",
      body: CreateHookSchema,
      responses: { 201: HookSchema, 409: ErrorSchema },
      summary: "Create a new hook",
    },
    listHooks: {
      method: "GET",
      path: "/hooks",
      responses: { 200: z.array(HookSchema) },
      summary: "List all hooks",
    },
    getHook: {
      method: "GET",
      path: "/hooks/:id",
      pathParams: IdParam,
      responses: { 200: HookSchema, 404: ErrorSchema },
      summary: "Get a single hook by id",
    },
    updateHook: {
      method: "PATCH",
      path: "/hooks/:id",
      pathParams: IdParam,
      body: UpdateHookSchema,
      responses: { 200: HookSchema, 404: ErrorSchema },
      summary: "Partially update an existing hook",
    },
    deleteHook: {
      method: "DELETE",
      path: "/hooks/:id",
      pathParams: IdParam,
      responses: { 200: z.object({ id: HookIdSchema }), 404: ErrorSchema },
      summary: "Delete a hook",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type HooksContract = typeof hooksContract
