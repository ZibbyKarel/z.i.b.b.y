import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type Pins, PinsSchema } from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

export const PINS_FILE = "PINS_FILE";

/**
 * Připnuté targety pro Overview "Panel rychlého spuštění", persistované jako
 * `data/pins.json` — stejná pozice jako `SystemConfigStore`: jeden malý
 * operátorem vlastněný dokument, ne kolekce pojmenovaných entit
 * (`EntityFileStore`). Synchronní load v konstruktoru ze stejného důvodu jako
 * `SystemConfigStore` (viz jeho komentář) — chybějící/porušený soubor →
 * prázdný seznam, nikdy chyba.
 */
@Injectable()
export class PinsStore {
  private readonly dir: string;
  private pins: Pins;

  constructor(@Inject(PINS_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
    this.pins = PinsStore.load(file);
  }

  private static load(file: string): Pins {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return [];
    }
    const parsed = PinsSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : [];
  }

  async read(): Promise<Pins> {
    return this.pins;
  }

  /** Replace the whole list, deduped by (kind, id) — last occurrence wins. */
  async write(next: Pins): Promise<Pins> {
    const validated = PinsSchema.parse(next);
    const seen = new Map<string, Pins[number]>();
    for (const pin of validated) seen.set(`${pin.kind}:${pin.id}`, pin);
    const deduped = [...seen.values()];
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(deduped, null, 2)}\n`);
    this.pins = deduped;
    return deduped;
  }
}
