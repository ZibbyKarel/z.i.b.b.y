import { z } from "zod";

/** Co lze připnout jako katalogovou entitu s vlastní detail stránkou.
 *  `employee` (D-015, ZB-03): pinning targets the hired instance, not the
 *  position, so it sorts a specific person first on `/org/people`. */
export const EntityPinKindSchema = z.enum(["agent", "workflow", "employee"]);
export type EntityPinKind = z.infer<typeof EntityPinKindSchema>;

/** Všechny druhy připnutí — katalogové entity, nebo libovolná stránka
 *  (sidebar "Pinned"). */
export const PinKindSchema = z.enum(["agent", "workflow", "employee", "page"]);
export type PinKind = z.infer<typeof PinKindSchema>;

/** Jedno připnutí entity: druh + její id. Žádné jméno/glyph — ty se dočtou
 *  live z katalogu (agent/workflow/chain), takže přejmenování entity se
 *  v panelu projeví hned, bez zvláštní synchronizace. */
export const EntityPinSchema = z.object({
  kind: EntityPinKindSchema,
  id: z.string().min(1),
});
export type EntityPin = z.infer<typeof EntityPinSchema>;

/** Jedno připnutí libovolné stránky: `id` je její href (pathname + search,
 *  bez přechodného `?approval=`) — to JE identita připnutí, žádné katalogové
 *  id. Na rozdíl od entit nese i operátorem zadané jméno při připnutí (stránka
 *  nemá živý zdroj pravdy pro jméno, na rozdíl od agenta/workflow/employee).
 *
 *  `id` must be an **app-internal path**: a single leading `/` not followed
 *  by another `/` or a `\` — `.startsWith("/")` alone would also admit a
 *  protocol-relative href (`//evil.host`, and browsers normalize a leading
 *  `/\` the same way), which renders as an off-site link. */
export const PagePinSchema = z.object({
  kind: z.literal("page"),
  id: z
    .string()
    .min(1)
    .regex(/^\/(?![/\\])/, "must be an app-internal path (starts with a single /)"),
  label: z.string().trim().min(1).max(80),
});
export type PagePin = z.infer<typeof PagePinSchema>;

/** Jedno připnutí — entita, nebo stránka. Discriminated union na `kind`. */
export const PinSchema = z.discriminatedUnion("kind", [EntityPinSchema, PagePinSchema]);
export type Pin = z.infer<typeof PinSchema>;

/** Celý seznam připnutých položek, v pořadí připnutí (append-only, viz plán). */
export const PinsSchema = z.array(PinSchema);
export type Pins = z.infer<typeof PinsSchema>;
