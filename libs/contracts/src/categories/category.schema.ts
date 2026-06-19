import { z } from "zod";

/**
 * Allowed shape of a category `name`. The name is the human-facing label *and*
 * the value agents reference in their frontmatter `category` field, so it stays
 * free-form (spaces, diacritics, `&` are all fine) — but it must never contain a
 * path separator or line break, both because it travels in a URL path param
 * (`DELETE /agents/categories/:name`) and as defense in depth for the manifest
 * storage layer.
 */
export const CATEGORY_NAME_MAX = 64;
export const CATEGORY_NAME_REGEX = /^[^/\\\r\n]+$/;

export const CategoryNameSchema = z
  .string()
  .min(1)
  .max(CATEGORY_NAME_MAX)
  .regex(CATEGORY_NAME_REGEX, "name may not contain '/', '\\' or line breaks")
  .refine((s) => s.trim().length > 0, "name may not be blank");

/**
 * Glyph rendered next to the category. Kept a free-form string on purpose — the
 * closed icon set lives in the web app, so the API must not 400 on a glyph name
 * it hasn't shipped yet (same rationale as the agent `glyph` field).
 */
export const CategoryGlyphSchema = z.string().min(1).max(64);

/**
 * A single agent-catalog category: the taxonomy entry that groups agents. Agents
 * link to it by storing its `name` in their frontmatter `category` field; the
 * list of categories itself lives in a manifest the backend owns, independent of
 * any individual agent (so an empty category can exist before its first agent).
 */
export const CategorySchema = z.object({
  name: CategoryNameSchema,
  glyph: CategoryGlyphSchema,
});
export type Category = z.infer<typeof CategorySchema>;

/** Body accepted by `createCategory` — the full entity. */
export const CreateCategorySchema = CategorySchema;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
