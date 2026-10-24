const MAX_TITLE = 80;

/**
 * Derive a task title from a TODO note: the first non-empty line, whitespace
 * collapsed, cut to {@link MAX_TITLE} characters with a trailing "…". Mention
 * tokens (`@Name` / `#Name` / `/Name`) are ordinary text and survive untouched.
 */
export function todoTaskTitle(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const collapsed = line.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_TITLE ? `${collapsed.slice(0, MAX_TITLE - 1)}…` : collapsed;
}
