/**
 * The minion appearance model — what makes one employee look different from the next.
 * Ported from `design/ZibbyCorp/minion-art.js` (`specFor`, hash branch). A matching zod
 * schema lives in `@zibby/contracts`; keep the two in lockstep.
 */
export const MINION_WIDTHS = [38, 40, 42, 44, 46, 50, 52, 56] as const;
export const MINION_HEIGHTS = [50, 54, 58, 62, 66] as const;
export const MINION_HAIRS = ["tuft", "spikes", "sprout", "strands"] as const;
export const MINION_HATS = ["headphones", "hardhat", "beanie"] as const;

export type MinionHair = (typeof MINION_HAIRS)[number];
export type MinionHat = (typeof MINION_HATS)[number];

export interface MinionAppearance {
  /** Body width (design `w`), one of {@link MINION_WIDTHS}. */
  width: number;
  /** Body height (design `h`), one of {@link MINION_HEIGHTS}. */
  height: number;
  eyes: 1 | 2;
  hair: MinionHair;
  hat?: MinionHat;
  /** Index into the three skin yellows. */
  skin: 0 | 1 | 2;
  tie?: boolean;
}

/**
 * The design's `hashS` (`h = h*31 + code`) plus a murmur3 finalizer — without the
 * mix, seeds that differ only in their last character ("emp1", "emp2") share every
 * high bit and so the same hair/eyes/skin.
 */
function hashName(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const SEED_WIDTHS = [40, 46, 52, 38, 56, 44] as const;
const SEED_HEIGHTS = [54, 62, 50, 66, 58] as const;
const SEED_SKINS = [0, 1, 2] as const;

/**
 * Deterministic appearance from a seed (an agent id/name). Port of the design's
 * `specFor` hash branch: no role means no hat and no tie. The same seed always yields
 * the same minion.
 */
export function minionAppearanceFromSeed(seed: string): MinionAppearance {
  const h = hashName(seed);
  return {
    width: SEED_WIDTHS[h % 6] ?? 44,
    height: SEED_HEIGHTS[(h >>> 3) % 5] ?? 58,
    eyes: (h >>> 6) % 3 === 1 ? 1 : 2,
    hair: MINION_HAIRS[(h >>> 9) % 4] ?? "tuft",
    skin: SEED_SKINS[(h >>> 13) % 3] ?? 0,
  };
}

/** Zibby, the COO (design `ZBASE`). Rendered with the Zibby-only extras (`stache` + glow `lens`). */
export const ZIBBY_APPEARANCE: MinionAppearance = {
  width: 52,
  height: 62,
  eyes: 2,
  skin: 1,
  hair: "tuft",
  tie: true,
};
