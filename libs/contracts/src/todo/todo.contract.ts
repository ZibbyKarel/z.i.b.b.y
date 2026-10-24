import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { CreateTodoBodySchema, TodoItemSchema, TodoListSchema } from "./todo.schema";

const c = initContract();

/**
 * TODO — the operator's own quick notes for the Bridge TODO widget (a file-backed
 * list, NOT roadmap items). A task created with `todoId` removes its note.
 */
export const todoContract = c.router(
  {
    listTodo: {
      method: "GET",
      path: "/todo",
      responses: { 200: TodoListSchema },
      summary: "List the TODO notes, oldest first",
    },
    createTodo: {
      method: "POST",
      path: "/todo",
      body: CreateTodoBodySchema,
      responses: { 201: TodoItemSchema, 409: ErrorSchema },
      summary: "Add a TODO note (409 past the 200-item cap)",
    },
    deleteTodo: {
      method: "DELETE",
      path: "/todo/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      body: c.noBody(),
      responses: { 204: c.noBody(), 404: ErrorSchema },
      summary: "Delete a TODO note",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type TodoContract = typeof todoContract;
