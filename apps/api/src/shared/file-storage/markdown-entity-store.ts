import matter from "gray-matter";
import { EntityFileStore } from "./entity-file-store";

/**
 * Base for the Markdown-backed stores (agents, skills, pipelines): one file per
 * entity whose YAML frontmatter carries the structured config and whose body is
 * the free-text `instructions`. Adds the gray-matter scaffold on top of
 * {@link EntityFileStore} so a subclass only declares the field mapping:
 * `toFrontmatter` (entity → frontmatter object), `bodyOf` (entity → Markdown
 * body) and `fromFrontmatter` (frontmatter + id + body → entity, or null when
 * the entity is structurally invalid).
 */
export abstract class MarkdownEntityStore<T> extends EntityFileStore<T> {
  /** Structured config to emit as YAML frontmatter. */
  protected abstract toFrontmatter(entity: T): Record<string, unknown>;
  /** The Markdown body (typically the entity's `instructions`). */
  protected abstract bodyOf(entity: T): string;
  /** Map parsed frontmatter + body back to an entity, or null if invalid. */
  protected abstract fromFrontmatter(
    data: Record<string, unknown>,
    id: string,
    body: string,
  ): T | null;

  protected serialize(entity: T): string {
    // Blank line after the frontmatter (skill-file style); trailing newline at EOF.
    return matter.stringify(`\n${this.bodyOf(entity)}\n`, this.toFrontmatter(entity));
  }

  protected tryParse(raw: string, id: string): T | null {
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch {
      return null;
    }
    return this.fromFrontmatter(parsed.data as Record<string, unknown>, id, parsed.content.trim());
  }
}
