import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let cachedLoginShellPath: string | undefined;

/**
 * GUI-launched macOS apps inherit a minimal PATH (no Homebrew, no nvm), but
 * the API shells out to `claude`/`git`/`gh`. Resolve the real PATH once by
 * asking the user's own login shell for it — the dynamic equivalent of the
 * PATH the launchd plist otherwise needs edited in by hand.
 */
export async function resolveLoginShellPath(): Promise<string> {
  if (cachedLoginShellPath) return cachedLoginShellPath;
  const shell = process.env.SHELL ?? "/bin/zsh";
  try {
    const { stdout } = await execFileAsync(shell, ["-ilc", 'echo -n "$PATH"'], { timeout: 5000 });
    const shellPath = stdout.trim();
    const merged = new Set([...shellPath.split(":"), ...(process.env.PATH ?? "").split(":")].filter(Boolean));
    cachedLoginShellPath = [...merged].join(":");
  } catch {
    cachedLoginShellPath = process.env.PATH ?? "";
  }
  return cachedLoginShellPath;
}

export async function isHealthy(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForHealthy(
  url: string,
  { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number },
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Spawns a compiled Node entrypoint via Electron's own binary, so the
 * packaged app doesn't require a system-wide Node install. */
export function spawnNodeChild(scriptPath: string, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [scriptPath], {
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "pipe",
  });
}

export async function killChild(child: ChildProcess, timeoutMs = 5000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
