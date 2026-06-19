import { describe, expect, it } from "vitest";
import {
  CategorySchema,
  categoriesContract,
  projectCategoriesContract,
  skillCategoriesContract,
} from "../index";

describe("categoriesContract", () => {
  it("lists categories under GET /api/agents/categories", () => {
    expect(categoriesContract.listCategories.method).toBe("GET");
    expect(categoriesContract.listCategories.path).toBe("/api/agents/categories");
    expect(categoriesContract.listCategories.responses).toHaveProperty("200");
  });

  it("creates a category via POST /api/agents/categories with a 409 conflict status", () => {
    expect(categoriesContract.createCategory.method).toBe("POST");
    expect(categoriesContract.createCategory.path).toBe("/api/agents/categories");
    expect(categoriesContract.createCategory.responses).toHaveProperty("201");
    expect(categoriesContract.createCategory.responses).toHaveProperty("409");
  });

  it("deletes a category via DELETE /api/agents/categories/:name (404 + 409)", () => {
    expect(categoriesContract.deleteCategory.method).toBe("DELETE");
    expect(categoriesContract.deleteCategory.path).toBe("/api/agents/categories/:name");
    expect(categoriesContract.deleteCategory.responses).toHaveProperty("404");
    expect(categoriesContract.deleteCategory.responses).toHaveProperty("409");
  });

  it("nests the skill taxonomy under /api/skills/categories", () => {
    expect(skillCategoriesContract.listCategories.path).toBe("/api/skills/categories");
    expect(skillCategoriesContract.deleteCategory.path).toBe("/api/skills/categories/:name");
  });

  it("nests the project taxonomy under /api/projects/categories", () => {
    expect(projectCategoriesContract.listCategories.path).toBe("/api/projects/categories");
    expect(projectCategoriesContract.deleteCategory.path).toBe("/api/projects/categories/:name");
  });
});

describe("category schema", () => {
  it("accepts a free-form name with spaces and diacritics", () => {
    expect(CategorySchema.safeParse({ name: "Nákupy & domácnost", glyph: "cart" }).success).toBe(
      true,
    );
  });

  it("rejects a blank name, a path separator, or a line break", () => {
    expect(CategorySchema.safeParse({ name: "   ", glyph: "cart" }).success).toBe(false);
    expect(CategorySchema.safeParse({ name: "a/b", glyph: "cart" }).success).toBe(false);
    expect(CategorySchema.safeParse({ name: "a\nb", glyph: "cart" }).success).toBe(false);
  });

  it("requires a non-empty glyph", () => {
    expect(CategorySchema.safeParse({ name: "Dev", glyph: "" }).success).toBe(false);
  });
});
