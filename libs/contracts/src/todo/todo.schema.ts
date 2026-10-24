import { z } from "zod";

/** The most notes the TODO list holds; a POST past it is a 409. */
export const TODO_MAX_ITEMS = 200;

/** Longest note text. */
export const TODO_TEXT_MAX = 2000;

const TodoTextSchema = z.string().trim().min(1).max(TODO_TEXT_MAX);

/**
 * One quick note in the Bridge TODO widget. The `text` carries the same
 * `@Name` / `#Name` / `/Name` mention tokens the chat composer writes.
 */
export const TodoItemSchema = z.object({
  id: z.string().min(1),
  text: TodoTextSchema,
  createdAt: z.iso.datetime(),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const TodoListSchema = z.object({ items: z.array(TodoItemSchema) });
export type TodoList = z.infer<typeof TodoListSchema>;

export const CreateTodoBodySchema = z.strictObject({ text: TodoTextSchema });
export type CreateTodoBody = z.infer<typeof CreateTodoBodySchema>;
