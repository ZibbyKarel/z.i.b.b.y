import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface InstanceLock {
  pid: number;
  role?: string;
  port: number;
  label?: string;
  startedAt?: string;
}

export interface ForeignOwner {
  pid: number;
  port: number;
}

/**
 * Pure check: does the lock file content describe a live instance on a port
 * other than `ownPort`? `isAlive` is injected so it's testable.
 */
export function findForeignOwner(
  raw: string | undefined,
  ownPort: number,
  isAlive: (pid: number, startedAt?: string) => boolean,
): ForeignOwner | undefined {
  if (!raw) return undefined;
  let lock: Partial<InstanceLock>;
  try {
    lock = JSON.parse(raw) as Partial<InstanceLock>;
  } catch {
    return undefined;
  }
  if (typeof lock.pid !== "number" || typeof lock.port !== "number") return undefined;
  if (lock.port === ownPort || !isAlive(lock.pid, lock.startedAt)) return undefined;
  return { pid: lock.pid, port: lock.port };
}

/**
 * Whether the lock's writer still runs. Mirrors the API's check
 * (apps/api/src/shared/instance-role.ts): a live pid whose process started well
 * after the lock was written is an unrelated process that reused the pid.
 */
export function isPidAlive(pid: number, startedAt?: string): boolean {
  try {
    process.kill(pid, 0);
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    if ((err as NodeJS.ErrnoException).code !== "EPERM") return false;
  }
  const lockMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (Number.isNaN(lockMs)) return true;
  try {
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2000,
    });
    const startMs = Date.parse(out.trim());
    return Number.isNaN(startMs) || startMs <= lockMs + 60_000;
  } catch {
    return true;
  }
}

export function readLockFile(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
