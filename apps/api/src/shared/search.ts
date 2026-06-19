/**
 * Free-text matching shared by the resource `search` endpoints (agents, skills,
 * projects, automations). Each storage service lists its entities and filters
 * them through {@link matchesQuery}, projecting the entity onto the handful of
 * fields a user would search by (id, name, description, …). The match is
 * case-insensitive substring; a blank/whitespace query matches nothing so the
 * search dropdown stays empty until the user actually types.
 */

/** True when `query` is a case-insensitive substring of any provided field. */
export function matchesQuery(fields: Array<string | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return false;
  return fields.some((field) => field !== undefined && field.toLowerCase().includes(needle));
}

/**
 * Filter `items` to those whose projected `fields` contain `query`. Order is
 * preserved from the input list (callers list in a stable, sorted order).
 */
export function searchByText<T>(
  items: T[],
  query: string,
  fields: (item: T) => Array<string | undefined>,
): T[] {
  if (query.trim() === "") return [];
  return items.filter((item) => matchesQuery(fields(item), query));
}
