import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { resolveDataRoot } from "./data-dir";

/**
 * Two API processes may run against the SAME data root: the packaged ZibbyOS.app
 * (stable, never hot-reloads) and the dev server (`pnpm api:dev`, respawns on every
 * source edit — including edits ZibbyOS's own agents make while developing ZibbyOS).
 * Exactly one of them — the **primary** — owns autonomous work: tick watchers,
 * schedulers, the Slack listener, and boot-time recovery that rewrites run state.
 * The other is a **secondary**: it serves the API/UI over the shared files and runs
 * what it is explicitly asked to run, but never sweeps, recovers or re-labels runs
 * it doesn't own. A dev respawn therefore can't kill or "reconcile" the app's runs.
 *
 * Ownership is a lock file in the data root (`.instance.lock`). `ZIBBY_ROLE`:
 *   - `primary`   — must own the lock; boot fails if a live process holds it.
 *   - `secondary` — never takes the lock.
 *   - `auto` (default) — takes the lock when it is free or stale, else secondary.
 */
export type InstanceRole = "primary" | "secondary";

export interface InstanceLock {
  pid: number;
  role: "primary";
  port: number;
  label: string;
  startedAt: string;
}

export interface InitInstanceRoleOptions {
  port: number;
  /** How long `auto` waits for its own previous process (a dev respawn) to exit. */
  waitForStaleMs?: number;
}

const LOCK_FILE = ".instance.lock";
/** A pid whose process started this long AFTER the lock was written is a reused pid. */
const PID_REUSE_SLACK_MS = 60_000;
/** A mutex dir older than this was left by a crashed boot. */
const MUTEX_STALE_MS = 10_000;

let resolvedRole: InstanceRole | undefined;

export function instanceLockPath(): string {
  return path.join(resolveDataRoot(), LOCK_FILE);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else — still alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The pid's process start time, or undefined when `ps` can't tell. */
function processStartMs(pid: number): number | undefined {
  try {
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    const ms = Date.parse(out);
    return Number.isNaN(ms) ? undefined : ms;
  } catch {
    return undefined;
  }
}

/**
 * Whether the lock's writer is still running. A live pid that started well after
 * the lock was written is an unrelated process that reused the pid → stale.
 */
function isHolderAlive(lock: InstanceLock): boolean {
  if (!isPidAlive(lock.pid)) return false;
  const lockMs = Date.parse(lock.startedAt);
  const startMs = processStartMs(lock.pid);
  if (Number.isNaN(lockMs) || startMs === undefined) return true;
  return startMs <= lockMs + PID_REUSE_SLACK_MS;
}

export function readInstanceLock(): InstanceLock | undefined {
  try {
    const parsed = JSON.parse(readFileSync(instanceLockPath(), "utf8")) as Partial<InstanceLock>;
    return typeof parsed.pid === "number" ? (parsed as InstanceLock) : undefined;
  } catch {
    return undefined;
  }
}

/** The live holder of the primary lock other than this process, if any. */
function liveForeignHolder(): InstanceLock | undefined {
  const lock = readInstanceLock();
  if (!lock || lock.pid === process.pid) return undefined;
  return isHolderAlive(lock) ? lock : undefined;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run `fn` under a short-lived `mkdir` mutex next to the lock, so the
 * check-then-write of two processes booting at once can't interleave (both
 * seeing a stale lock and both becoming primary).
 */
function withLockMutex<T>(fn: () => T): T {
  const mutex = `${instanceLockPath()}.mutex`;
  mkdirSync(path.dirname(mutex), { recursive: true });
  const deadline = Date.now() + MUTEX_STALE_MS;
  for (;;) {
    try {
      mkdirSync(mutex);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = (() => {
        try {
          return Date.now() - statSync(mutex).mtimeMs;
        } catch {
          return 0;
        }
      })();
      if (age > MUTEX_STALE_MS || Date.now() > deadline)
        rmSync(mutex, { recursive: true, force: true });
      else sleepSync(50);
    }
  }
  try {
    return fn();
  } finally {
    rmdirSync(mutex);
  }
}

function writeLock(port: number): void {
  const lock: InstanceLock = {
    pid: process.pid,
    role: "primary",
    port,
    label:
      process.env.ZIBBY_INSTANCE_LABEL ?? (process.env.ZIBBY_ROLE === "primary" ? "app" : "dev"),
    startedAt: new Date().toISOString(),
  };
  writeFileSync(instanceLockPath(), `${JSON.stringify(lock, null, 2)}\n`);
  // A plain `exit` (no signal). The signal path — Nest's shutdown hooks re-raise
  // the signal, which skips `exit` — is covered by InstanceLockReleaser.
  process.on("exit", releaseInstanceLock);
}

/** Remove the lock if this process owns it — a successor may already have replaced it. */
export function releaseInstanceLock(): void {
  try {
    if (readInstanceLock()?.pid === process.pid) rmSync(instanceLockPath(), { force: true });
  } catch {
    // Best effort: a lock left behind is detected as stale by its dead pid.
  }
}

function conflictMessage(holder: InstanceLock): string {
  return (
    `ZIBBY_ROLE=primary, but pid ${holder.pid} (${holder.label}, port ${holder.port}) already owns ` +
    `${instanceLockPath()}. Stop it, or restart it with ZIBBY_ROLE=secondary.`
  );
}

/**
 * Resolve this process's role once, at boot, before Nest instantiates any module.
 * Throws for `ZIBBY_ROLE=primary` when another live process already owns the lock.
 */
export function initInstanceRole({
  port,
  waitForStaleMs = 8000,
}: InitInstanceRoleOptions): InstanceRole {
  const wanted = process.env.ZIBBY_ROLE ?? "auto";
  if (wanted === "secondary") return (resolvedRole = "secondary");

  // Only our own previous process (same port — a ts-node-dev respawn still draining
  // its shutdown hooks) is worth waiting for; any other live holder means secondary now.
  let holder = liveForeignHolder();
  if (holder && wanted !== "primary" && holder.port === port) {
    const deadline = Date.now() + waitForStaleMs;
    while (holder && Date.now() < deadline) {
      sleepSync(250);
      holder = liveForeignHolder();
    }
  }
  if (holder) {
    if (wanted === "primary") throw new Error(conflictMessage(holder));
    return (resolvedRole = "secondary");
  }

  return (resolvedRole = withLockMutex(() => {
    const racer = liveForeignHolder();
    if (racer) {
      if (wanted === "primary") throw new Error(conflictMessage(racer));
      return "secondary";
    }
    writeLock(port);
    return "primary";
  }));
}

/**
 * Whether this process owns autonomous work. A process that never called
 * {@link initInstanceRole} (unit/e2e tests booting a module directly) is primary,
 * so existing behaviour under test is unchanged.
 */
export function isPrimaryInstance(): boolean {
  return resolvedRole !== "secondary";
}

export function instanceRole(): InstanceRole {
  return resolvedRole ?? "primary";
}

/** Test-only: reset the memoised role. */
export function resetInstanceRoleForTest(): void {
  resolvedRole = undefined;
}

/**
 * Releases the primary lock at the END of a signal-driven shutdown, after every
 * runner's `onModuleDestroy` reaped its children — so a respawned successor only
 * becomes primary once this process has let go of its runs.
 */
@Injectable()
export class InstanceLockReleaser implements OnApplicationShutdown {
  onApplicationShutdown(): void {
    releaseInstanceLock();
  }
}
