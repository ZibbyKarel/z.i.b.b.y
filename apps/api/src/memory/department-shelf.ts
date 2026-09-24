import type { SubsystemId } from "@zibby/contracts";

/**
 * Every subsystem's knowledge shelf id is prefixed with this. `vault/subsystems/<id>/MOC.md`
 * is impossible in this vault: note ids are file basenames, unique across the WHOLE
 * vault (`NOTE_ID` regex forbids path separators,
 * `libs/contracts/src/memory/memory.schema.ts:96-98`; duplicate check is vault-wide,
 * `vault.service.ts:333-357`), and `createNote` writes only into the three flat tier
 * dirs (`resolveNoteFile`, `vault.service.ts:313-317`). Ten files all named `MOC.md`
 * would collide on id `MOC`. The corrected layout is one flat knowledge-tier note per
 * subsystem: `knowledge/subsystem-<id>-moc.md` (id `subsystem-<id>-moc`). This id ends
 * in `-moc`, so `VaultService.index()` already treats it as a retrieval entry point
 * (`/(^|[-_ ])(index|moc)$/i`, `vault.service.ts:186`) — zero index-side changes needed.
 */
export const SHELF_ID_PREFIX = "subsystem-";

/** The flat knowledge-tier note id for a subsystem's shelf (`subsystem-<id>-moc`). */
export function subsystemShelfId(id: SubsystemId): string {
  return `${SHELF_ID_PREFIX}${id}-moc`;
}

/**
 * A readable daily-line wikilink to a subsystem's shelf — alias form
 * (`[[subsystem-<id>-moc|<id>]]`) so the rendered daily note reads as the short
 * subsystem id while the graph edge still points at the real shelf note.
 */
export function shelfDailyLink(id: SubsystemId): string {
  return `[[${subsystemShelfId(id)}|${id}]]`;
}
