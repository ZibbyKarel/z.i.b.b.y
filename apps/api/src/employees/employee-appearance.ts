import { Logger } from "@nestjs/common";
import {
  MINION_HAIRS,
  MINION_HEIGHTS,
  MINION_WIDTHS,
  type MinionAppearance,
} from "@zibby/contracts";

const logger = new Logger("EmployeeAppearance");

type RoleLook = Pick<MinionAppearance, "hat" | "tie">;

/**
 * Role look, derived from the position's catalog `category` (never random):
 *
 * | category               | hat        | tie  |
 * | ---------------------- | ---------- | ---- |
 * | Core Development       | headphones |      |
 * | Infrastructure         | hardhat    |      |
 * | Quality & Security     | beanie     |      |
 * | Meta & Orchestration   | hardhat    |      |
 * | Specialized Domains    | headphones |      |  (data / AI / niche engineering)
 * | Business & Product     | -          | true |
 * | Developer Experience   | beanie     |      |
 * | Research & Analysis    | -          |      |
 * | Roadmap                | -          |      |
 * | (unknown / missing)    | -          |      |
 */
const CATEGORY_LOOK: Readonly<Record<string, RoleLook>> = {
  "Core Development": { hat: "headphones" },
  Infrastructure: { hat: "hardhat" },
  "Quality & Security": { hat: "beanie" },
  "Meta & Orchestration": { hat: "hardhat" },
  "Data & AI": { hat: "headphones" },
  "Specialized Domains": { hat: "headphones" },
  "Business & Product": { tie: true },
  "Developer Experience": { hat: "beanie" },
};

export function roleLook(category: string | undefined): RoleLook {
  return (category !== undefined ? CATEGORY_LOOK[category] : undefined) ?? {};
}

/** FNV-1a 32-bit — small, stable, dependency-free. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const EYES = [1, 2] as const;
const SKINS = [0, 1, 2] as const;

const TOTAL =
  MINION_WIDTHS.length * MINION_HEIGHTS.length * EYES.length * MINION_HAIRS.length * SKINS.length;

function comboAt(index: number, look: RoleLook): MinionAppearance {
  let i = index;
  const width = MINION_WIDTHS[i % MINION_WIDTHS.length] as number;
  i = Math.floor(i / MINION_WIDTHS.length);
  const height = MINION_HEIGHTS[i % MINION_HEIGHTS.length] as number;
  i = Math.floor(i / MINION_HEIGHTS.length);
  const eyes = EYES[i % EYES.length] as 1 | 2;
  i = Math.floor(i / EYES.length);
  const hair = MINION_HAIRS[i % MINION_HAIRS.length] as MinionAppearance["hair"];
  i = Math.floor(i / MINION_HAIRS.length);
  const skin = SKINS[i % SKINS.length] as 0 | 1 | 2;
  return { width, height, eyes, hair, skin, ...look };
}

function key(a: MinionAppearance): string {
  return [a.width, a.height, a.eyes, a.hair, a.skin, a.hat ?? "-", a.tie ? 1 : 0].join("|");
}

/**
 * Allocate a Minion look that is not in `taken`. hat/tie come from the role
 * (`category`); the free dimensions (960 combos) are walked from a start index
 * hashed from `seed`, taking the first whole appearance not already taken.
 * Deterministic. If everything is taken, falls back to the hash combo.
 */
export function allocateAppearance(
  input: { seed: string; category?: string; agentId: string },
  taken: readonly MinionAppearance[],
): MinionAppearance {
  const look = roleLook(input.category);
  const used = new Set(taken.map(key));
  const start = hash(input.seed) % TOTAL;
  for (let n = 0; n < TOTAL; n++) {
    const candidate = comboAt((start + n) % TOTAL, look);
    if (!used.has(key(candidate))) return candidate;
  }
  logger.warn(`Minion appearance space exhausted for "${input.seed}" (${input.agentId})`);
  return comboAt(start, look);
}
