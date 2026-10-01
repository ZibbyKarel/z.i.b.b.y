import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Ctx } from "./ctx.ts";

export const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));

export const tmpCtx = (env: NodeJS.ProcessEnv = {}): Ctx => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pf-"));
  return { cwd, env: { ZIBBY_RUN_DIR: cwd, ...env } };
};

export const fixture = (name: string, file: string): string => path.join(FIXTURES, name, file);
