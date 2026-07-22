import { z } from "zod";

/** Co lze připnout na Overview — katalogové entity s vlastní detail stránkou. */
export const PinKindSchema = z.enum(["agent", "pipeline"]);
export type PinKind = z.infer<typeof PinKindSchema>;

/** Jedno připnutí: druh entity + její id. Žádné jméno/glyph — ty se dočtou
 *  live z katalogu (agent/pipeline/chain), takže přejmenování entity se
 *  v panelu projeví hned, bez zvláštní synchronizace. */
export const PinSchema = z.object({
  kind: PinKindSchema,
  id: z.string().min(1),
});
export type Pin = z.infer<typeof PinSchema>;

/** Celý seznam připnutých položek, v pořadí připnutí (append-only, viz plán). */
export const PinsSchema = z.array(PinSchema);
export type Pins = z.infer<typeof PinsSchema>;
