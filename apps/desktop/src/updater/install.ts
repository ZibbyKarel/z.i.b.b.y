import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { promisify } from "node:util";
import { type AvailableUpdate, parseSha256File } from "./release";

const execFileAsync = promisify(execFile);

/**
 * `/Applications/ZibbyOS.app/Contents/MacOS/ZibbyOS` → `/Applications/ZibbyOS.app`.
 * Undefined when the app is not running from a bundle we can replace in place: a
 * mounted DMG, or a Gatekeeper-translocated (read-only, randomised) copy.
 */
export function installedBundlePath(execPath: string): string | undefined {
  const bundle = path.resolve(execPath, "..", "..", "..");
  if (!bundle.endsWith(".app")) return undefined;
  if (bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) return undefined;
  return bundle;
}

export async function canReplace(bundle: string): Promise<boolean> {
  try {
    await access(path.dirname(bundle), constants.W_OK);
    await access(bundle, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Download of ${url} failed: HTTP ${res.status}`);
  return res.text();
}

/** Streams `url` to `dest`, hashing on the way; resolves with the sha256 hex. */
async function downloadFile(
  url: string,
  dest: string,
  onProgress: (fraction: number) => void,
  expectedSize: number,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download of ${url} failed: HTTP ${res.status}`);
  const hash = createHash("sha256");
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      hash.update(chunk);
      received += chunk.length;
      if (expectedSize > 0) onProgress(Math.min(1, received / expectedSize));
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    meter,
    createWriteStream(dest),
  );
  return hash.digest("hex");
}

async function bundleVersion(bundle: string): Promise<string> {
  const { stdout } = await execFileAsync("plutil", [
    "-extract",
    "CFBundleShortVersionString",
    "raw",
    path.join(bundle, "Contents/Info.plist"),
  ]);
  return stdout.trim();
}

/**
 * Downloads, checksums and unpacks the update into `workDir`, then checks the result
 * really is the advertised version with an intact (ad-hoc) signature. Resolves with
 * the path of the unpacked `.app`, ready to be swapped in.
 */
export async function prepareUpdate(
  update: AvailableUpdate,
  workDir: string,
  onProgress: (fraction: number) => void,
): Promise<string> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const expected = parseSha256File(await downloadText(update.sha256Url));
  if (!expected) throw new Error("The release's checksum file is malformed.");

  const zipPath = path.join(workDir, "update.zip");
  const actual = await downloadFile(update.zipUrl, zipPath, onProgress, update.zipSize);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}.`);
  }

  const unpackDir = path.join(workDir, "unpacked");
  // ditto keeps the bundle's symlinks, permissions and signature intact (unzip does not).
  await execFileAsync("ditto", ["-x", "-k", zipPath, unpackDir]);
  const appName = (await readdir(unpackDir)).find((name) => name.endsWith(".app"));
  if (!appName) throw new Error("The downloaded archive contains no .app bundle.");
  const nextBundle = path.join(unpackDir, appName);

  const version = await bundleVersion(nextBundle);
  if (version !== update.version) {
    throw new Error(`The archive holds version ${version}, expected ${update.version}.`);
  }
  await execFileAsync("codesign", ["--verify", "--deep", "--strict", nextBundle]);
  await rm(zipPath, { force: true });
  return nextBundle;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export interface SwapScriptInput {
  pid: number;
  current: string;
  next: string;
  backup: string;
  logFile: string;
}

/**
 * The swap runs after the app has quit, from a detached shell: wait for our pid to
 * go, move the running bundle to `backup` (kept as a one-step rollback), move the new
 * one into place, relaunch. If the new bundle can't be moved in, the old one goes back.
 */
export function buildSwapScript({ pid, current, next, backup, logFile }: SwapScriptInput): string {
  return `#!/bin/bash
set -u
PID=${pid}
CURRENT=${shellQuote(current)}
NEXT=${shellQuote(next)}
BACKUP=${shellQuote(backup)}
exec >>${shellQuote(logFile)} 2>&1
echo "$(date -u +%FT%TZ) swap: waiting for pid $PID"
for _ in $(seq 1 240); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.5
done
if kill -0 "$PID" 2>/dev/null; then
  echo "swap: pid $PID still alive after 120s, aborting"
  exit 1
fi
mkdir -p "$(dirname "$BACKUP")"
rm -rf "$BACKUP"
if ! mv "$CURRENT" "$BACKUP"; then
  echo "swap: could not move the current bundle aside, relaunching it"
  open "$CURRENT"
  exit 1
fi
if mv "$NEXT" "$CURRENT"; then
  xattr -dr com.apple.quarantine "$CURRENT" 2>/dev/null || true
  echo "swap: installed, previous version kept at $BACKUP"
else
  echo "swap: could not move the new bundle in, restoring the previous one"
  mv "$BACKUP" "$CURRENT"
fi
open "$CURRENT"
`;
}

/** Writes the swap script and starts it detached, so it outlives the app's quit. */
export async function launchSwap(input: SwapScriptInput, scriptPath: string): Promise<void> {
  await writeFile(scriptPath, buildSwapScript(input), { mode: 0o755 });
  const child = spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
}
