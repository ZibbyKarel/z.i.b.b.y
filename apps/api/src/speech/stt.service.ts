import { type ChildProcess, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Injectable, type OnModuleDestroy, Optional } from "@nestjs/common";
import type { SpeechStatus, SpeechTranscribeInput, SpeechTranscribeResult } from "@zibby/contracts";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** whisper-server is not usable (no binary / model / ffmpeg, failed to start). Maps to `503`. */
export class SttUnavailableError extends Error {
  constructor(reason: string) {
    super(`Speech-to-text unavailable: ${reason}`);
    this.name = "SttUnavailableError";
  }
}

/** whisper-server answered but could not transcribe the clip (bad audio). Maps to `422`. */
export class SttTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttTranscriptionError";
  }
}

type SttStatus = SpeechStatus["stt"];

const DEFAULT_LANGUAGE = "cs";
const START_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 120_000;
/** A GUI-launched app (Finder) has a minimal PATH — Homebrew's bins must still be found. */
const EXTRA_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

async function exists(path: string, mode: number = constants.F_OK): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

function searchPath(): string[] {
  return [...(process.env.PATH ?? "").split(delimiter).filter(Boolean), ...EXTRA_BIN_DIRS];
}

/** Absolute path of an executable `name` on PATH (+ Homebrew dirs), or `null`. A path with a slash is checked as-is. */
async function which(name: string): Promise<string | null> {
  if (name.includes("/")) return (await exists(name, constants.X_OK)) ? name : null;
  for (const dir of searchPath()) {
    const candidate = join(dir, name);
    if (await exists(candidate, constants.X_OK)) return candidate;
  }
  return null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Drop whisper's non-speech artefacts (`[BLANK_AUDIO]`, `[Music]`) and normalise whitespace. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Local speech-to-text over whisper.cpp's `whisper-server` (Decision B2/B3).
 * `WHISPER_URL` points at an external daemon; otherwise the server is spawned
 * lazily on the first transcription (binary: `WHISPER_BIN` ?? `whisper-server`,
 * model: `WHISPER_MODEL` ?? `~/Library/Application Support/ZibbyOS/models/…`),
 * bound to 127.0.0.1 on a free port, reused afterwards, respawned if it died and
 * killed with the module. Missing pieces surface as `status().available=false`.
 */
@Injectable()
export class SttService implements OnModuleDestroy {
  private readonly log?: ScopedLogger;
  private child?: ChildProcess;
  private url?: string;
  private starting?: Promise<string>;
  private destroyed = false;

  constructor(@Optional() logger?: LoggerService) {
    this.log = logger?.child(SttService.name);
  }

  private modelPath(): string {
    return (
      process.env.WHISPER_MODEL ??
      join(
        homedir(),
        "Library",
        "Application Support",
        "ZibbyOS",
        "models",
        "ggml-large-v3-turbo.bin",
      )
    );
  }

  /** Why local STT cannot run, or `null` when it can (external daemon counts as runnable). */
  private async unavailableReason(): Promise<string | null> {
    if (process.env.WHISPER_URL) return null;
    const bin = process.env.WHISPER_BIN ?? "whisper-server";
    if (!(await which(bin))) return `${bin} not found — brew install whisper.cpp`;
    const model = this.modelPath();
    if (!(await exists(model))) return `whisper model not found at ${model}`;
    if (!(await which("ffmpeg"))) return "ffmpeg not found — brew install ffmpeg";
    return null;
  }

  async status(): Promise<SttStatus> {
    const reason = await this.unavailableReason();
    return reason ? { available: false, reason } : { available: true };
  }

  private async spawnServer(): Promise<string> {
    const reason = await this.unavailableReason();
    if (reason) throw new SttUnavailableError(reason);
    const bin = (await which(process.env.WHISPER_BIN ?? "whisper-server")) as string;
    const port = await freePort();
    // A destroy during the awaited startup above must not spawn afterwards.
    if (this.destroyed) throw new SttUnavailableError("service is shutting down");
    const child = spawn(
      bin,
      [
        "-m",
        this.modelPath(),
        "-l",
        DEFAULT_LANGUAGE,
        "--convert",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        // --convert writes temp WAVs to `.` by default; a Finder-launched API has cwd `/`.
        "--tmp-dir",
        tmpdir(),
      ],
      {
        cwd: tmpdir(),
        stdio: ["ignore", "ignore", "pipe"],
        // whisper-server shells out to ffmpeg for --convert.
        env: { ...process.env, PATH: searchPath().join(delimiter) },
      },
    );
    let stderrTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-1000);
    });
    this.child = child;
    const url = `http://127.0.0.1:${port}`;
    // Never orphan a 1.6 GB whisper-server when the API dies without onModuleDestroy.
    const killOnExit = () => child.kill();
    process.once("exit", killOnExit);
    let spawnError: Error | undefined;
    const forget = () => {
      process.off("exit", killOnExit);
      if (this.child === child) {
        this.child = undefined;
        this.url = undefined;
      }
    };
    child.once("exit", forget);
    // EACCES / ENOENT arrive asynchronously; unhandled they would crash the API.
    child.once("error", (error) => {
      spawnError = error;
      forget();
    });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnError)
        throw new SttUnavailableError(`cannot start whisper-server: ${spawnError.message}`);
      if (this.destroyed) {
        child.kill();
        throw new SttUnavailableError("service is shutting down");
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new SttUnavailableError(
          `whisper-server exited during startup: ${stderrTail.trim().slice(-300)}`,
        );
      }
      try {
        await fetch(url, { signal: AbortSignal.timeout(2000) });
        this.url = url;
        this.log?.info("whisper-server ready", { url });
        return url;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    child.kill();
    forget();
    throw new SttUnavailableError("whisper-server did not become ready in time");
  }

  /** Base URL of a live server — the external one, the running child, or a fresh spawn. */
  private async ensureServer(): Promise<string> {
    if (process.env.WHISPER_URL) return process.env.WHISPER_URL.replace(/\/$/, "");
    if (this.url && this.child) return this.url;
    this.starting ??= this.spawnServer().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  async transcribe(input: SpeechTranscribeInput): Promise<SpeechTranscribeResult> {
    const base = await this.ensureServer();
    const mime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(input.audioBase64, "base64")], { type: mime }),
      `dictation.${EXT_BY_MIME[mime] ?? "webm"}`,
    );
    form.append("response_format", "json");
    form.append("temperature", "0.0");
    form.append("language", input.language ?? DEFAULT_LANGUAGE);

    let res: Response;
    try {
      res = await fetch(`${base}/inference`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A hung or dead spawned server must not poison later calls: drop it so the next call respawns.
      if (!process.env.WHISPER_URL) this.dropServer();
      throw new SttUnavailableError(error instanceof Error ? error.message : String(error));
    }
    if (!res.ok) throw new SttTranscriptionError(`whisper-server returned HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
    if (typeof body?.error === "string") throw new SttTranscriptionError(body.error);
    return { text: cleanTranscript(typeof body?.text === "string" ? body.text : "") };
  }

  private dropServer(): void {
    this.child?.kill();
    this.child = undefined;
    this.url = undefined;
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.dropServer();
  }
}
