import type { DepartmentId } from "@zibby/contracts";

/**
 * Every department's knowledge shelf id is prefixed with this. `vault/departments/<id>/MOC.md`
 * is impossible in this vault: note ids are file basenames, unique across the WHOLE
 * vault (`NOTE_ID` regex forbids path separators,
 * `libs/contracts/src/memory/memory.schema.ts:96-98`; duplicate check is vault-wide,
 * `vault.service.ts:333-357`), and `createNote` writes only into the three flat tier
 * dirs (`resolveNoteFile`, `vault.service.ts:313-317`). Ten files all named `MOC.md`
 * would collide on id `MOC`. The corrected layout is one flat knowledge-tier note per
 * department: `knowledge/department-<id>-moc.md` (id `department-<id>-moc`). This id ends
 * in `-moc`, so `VaultService.index()` already treats it as a retrieval entry point
 * (`/(^|[-_ ])(index|moc)$/i`, `vault.service.ts:186`) — zero index-side changes needed.
 */
export const SHELF_ID_PREFIX = "department-";

/** The flat knowledge-tier note id for a department's shelf (`department-<id>-moc`). */
export function departmentShelfId(id: DepartmentId): string {
  return `${SHELF_ID_PREFIX}${id}-moc`;
}

/**
 * A readable daily-line wikilink to a department's shelf — alias form
 * (`[[department-<id>-moc|<id>]]`) so the rendered daily note reads as the short
 * department id while the graph edge still points at the real shelf note.
 */
export function shelfDailyLink(id: DepartmentId): string {
  return `[[${departmentShelfId(id)}|${id}]]`;
}
