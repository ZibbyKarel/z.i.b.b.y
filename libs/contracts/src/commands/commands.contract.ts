import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import {
  CommandIdSchema,
  CommandSchema,
  CreateCommandSchema,
  UpdateCommandSchema,
} from "./command.schema"

const c = initContract()

const IdParam = z.object({ id: CommandIdSchema })

/**
 * CRUD over custom Claude Code slash commands (`/<id>`). Mirrors `skillsContract`;
 * the backend implements it via `@ts-rest/nest` against a file-backed Markdown
 * storage service. The enabled commands are materialized into every run's
 * `.claude/commands/` by the runner so downloaded skills/agents that depend on a
 * command can resolve it.
 */
export const commandsContract = c.router(
  {
    createCommand: {
      method: "POST",
      path: "/commands",
      body: CreateCommandSchema,
      responses: { 201: CommandSchema, 409: ErrorSchema },
      summary: "Create a new command",
    },
    listCommands: {
      method: "GET",
      path: "/commands",
      responses: { 200: z.array(CommandSchema) },
      summary: "List all commands",
    },
    getCommand: {
      method: "GET",
      path: "/commands/:id",
      pathParams: IdParam,
      responses: { 200: CommandSchema, 404: ErrorSchema },
      summary: "Get a single command by id",
    },
    updateCommand: {
      method: "PATCH",
      path: "/commands/:id",
      pathParams: IdParam,
      body: UpdateCommandSchema,
      responses: { 200: CommandSchema, 404: ErrorSchema },
      summary: "Partially update an existing command",
    },
    deleteCommand: {
      method: "DELETE",
      path: "/commands/:id",
      pathParams: IdParam,
      responses: { 200: z.object({ id: CommandIdSchema }), 404: ErrorSchema },
      summary: "Delete a command",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type CommandsContract = typeof commandsContract
