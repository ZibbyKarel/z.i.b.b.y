import fs from "node:fs";
import path from "node:path";

export interface Ctx {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/** Run-wide state lives in $ZIBBY_RUN_DIR/spend (fallback: <cwd>/spend). */
export const stateDir = (ctx: Ctx): string =>
  path.resolve(ctx.cwd, ctx.env.ZIBBY_RUN_DIR ?? ctx.cwd, "spend");

export const writeJson = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};

export const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));

/** Read a state file written by an earlier phase, with an actionable error when it is absent. */
export function readState(ctx: Ctx, name: string): unknown {
  const file = path.join(stateDir(ctx), name);
  if (!fs.existsSync(file)) throw new Error(`missing ${file} (run the earlier phase first)`);
  return readJson(file);
}

/**
 * Invalid input: the message goes to stderr AND into the produced file (so the next
 * stage, i.e. the agent behind the loop back-edge, reads it), exit code 1.
 */
export function fail(ctx: Ctx, out: string, message: string): number {
  const text = `# ${out} - INVALID INPUT\n\n${message}\n`;
  fs.writeFileSync(path.resolve(ctx.cwd, out), text);
  console.error(message);
  return 1;
}

/** Last fenced ```json block of a markdown document, or null. */
export function lastJsonBlock(md: string): string | null {
  const blocks = [...md.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  return blocks.at(-1)?.[1] ?? null;
}

export const day = (d: string): number => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0
    ? 0
    : s.length % 2
      ? (s[m] as number)
      : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** cs-CZ money: "12 345 Kč" (plain spaces, rounded to whole Kč). */
export function kc(n: number): string {
  const r = Math.round(n);
  const g = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${r < 0 ? "-" : ""}${g} Kč`;
}

export const pct = (n: number): string => `${Math.round(n)} %`;

export const mdCell = (s: string): string => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
