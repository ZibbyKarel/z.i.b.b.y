import fs from "node:fs";
import path from "node:path";

export interface Ctx {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface CostLine {
  at: string;
  source: "image" | "vision";
  provider: string;
  model: string;
  costUsd: number;
  durationMs: number;
  page?: number;
}

export function bookDirOf(ctx: Ctx): string {
  const dir = ctx.env.PF_BOOK_DIR ?? path.join(ctx.env.ZIBBY_RUN_DIR ?? ctx.cwd, "book");
  return path.resolve(ctx.cwd, dir);
}

/** costs.jsonl lives in the current stage folder (cwd); the runner sums it. */
export function appendCost(ctx: Ctx, line: Omit<CostLine, "at">): void {
  const full: CostLine = { at: new Date().toISOString(), ...line };
  fs.appendFileSync(path.join(ctx.cwd, "costs.jsonl"), JSON.stringify(full) + "\n");
}

export const nn = (n: number): string => String(n).padStart(2, "0");

export const envNum = (ctx: Ctx, name: string, def: number): number => {
  const v = ctx.env[name];
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};

export const writeJson = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};

export const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));
