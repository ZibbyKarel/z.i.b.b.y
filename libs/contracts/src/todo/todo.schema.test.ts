import { describe, expect, it } from "vitest";
import { CreateTodoBodySchema, TODO_MAX_ITEMS, TodoItemSchema } from "./todo.schema";

describe("CreateTodoBodySchema", () => {
  it("trims the text", () => {
    expect(CreateTodoBodySchema.parse({ text: "  fix it  " })).toEqual({ text: "fix it" });
  });

  it("rejects blank and whitespace-only text", () => {
    expect(CreateTodoBodySchema.safeParse({ text: "" }).success).toBe(false);
    expect(CreateTodoBodySchema.safeParse({ text: "   \n " }).success).toBe(false);
  });

  it("caps the text at 2000 characters", () => {
    expect(CreateTodoBodySchema.safeParse({ text: "x".repeat(2000) }).success).toBe(true);
    expect(CreateTodoBodySchema.safeParse({ text: "x".repeat(2001) }).success).toBe(false);
  });

  it("is strict", () => {
    expect(CreateTodoBodySchema.safeParse({ text: "a", extra: 1 }).success).toBe(false);
  });
});

describe("TodoItemSchema", () => {
  it("requires an ISO createdAt", () => {
    const item = { id: "todo_a", text: "a", createdAt: "2026-10-24T10:00:00.000Z" };
    expect(TodoItemSchema.safeParse(item).success).toBe(true);
    expect(TodoItemSchema.safeParse({ ...item, createdAt: "yesterday" }).success).toBe(false);
  });

  it("caps the list at 200", () => {
    expect(TODO_MAX_ITEMS).toBe(200);
  });
});
