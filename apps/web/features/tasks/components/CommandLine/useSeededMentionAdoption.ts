import { useEffect } from "react";

/**
 * Calls `onAdopt` with the first resolvable `@Name` of a prefilled brief. The
 * agent/workflow/department catalogs load async, so it re-checks whenever `rows`
 * changes while `pending`; the caller turns `pending` off on adoption or user edit.
 */
export function useSeededMentionAdoption<R extends { name: string }, T>(
  pending: boolean,
  rows: readonly (readonly R[])[],
  text: string,
  isMentioned: (text: string, name: string) => boolean,
  toTarget: (row: R) => T,
  onAdopt: (target: T) => void,
) {
  useEffect(() => {
    if (!pending) return;
    const typed = rows
      .flat()
      .filter((r) => isMentioned(text, r.name))
      .reduce<R | undefined>(
        (best, r) => (!best || r.name.length > best.name.length ? r : best),
        undefined,
      );
    if (typed) onAdopt(toTarget(typed));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the catalog changes
  }, [rows]);
}
