import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import type { SpeechStatus, SpeechTranscribeInput, SpeechTranscribeResult } from "@zibby/contracts";
import { pcmToWav } from "./dictation-stream.session";

const run = promisify(execFile);

/** Hex is not usable (not running, no ffmpeg, unreachable, model not ready). Maps to `503`. */
export class SttUnavailableError extends Error {
  constructor(reason: string) {
    super(`Speech-to-text unavailable: ${reason}`);
    this.name = "SttUnavailableError";
  }
}

/** Hex answered but could not transcribe the clip (bad audio, unsupported language). Maps to `422`. */
export class SttTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttTranscriptionError";
  }
}

type SttStatus = SpeechStatus["stt"];

const DEFAULT_LANGUAGE = "cs";
const DEFAULT_MODEL = "parakeet_v3";
const REQUEST_TIMEOUT_MS = 120_000;
const FFMPEG_TIMEOUT_MS = 30_000;
/** A GUI-launched app (Finder) has a minimal PATH — Homebrew's bins must still be found. */
const EXTRA_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

/** Absolute path of `ffmpeg` on PATH (+ Homebrew dirs), or `null`. */
export async function findFfmpeg(): Promise<string | null> {
  const dirs = [...(process.env.PATH ?? "").split(delimiter).filter(Boolean), ...EXTRA_BIN_DIRS];
  for (const dir of dirs) {
    const candidate = join(dir, "ffmpeg");
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Hex's data dir — the same override Hex itself honours. */
function hexDir(): string {
  return (
    process.env.HEX_APPLICATION_SUPPORT_DIR ??
    join(homedir(), "Library", "Application Support", "hex")
  );
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/** The running Hex's loopback API, from its discovery file (rewritten on every Hex start, removed on quit). */
async function hexApi(): Promise<{ port: number; token: string } | null> {
  const api = (await readJson(join(hexDir(), "local-api.json"))) as {
    port?: unknown;
    token?: unknown;
  } | null;
  return typeof api?.port === "number" && typeof api.token === "string"
    ? { port: api.port, token: api.token }
    : null;
}

/** `HEX_MODEL`, else the model selected in Hex, else Parakeet v3 (multilingual). */
async function hexModel(): Promise<string> {
  if (process.env.HEX_MODEL) return process.env.HEX_MODEL;
  const settings = (await readJson(join(hexDir(), "settings.json"))) as {
    transcription?: { model?: unknown };
  } | null;
  const model = settings?.transcription?.model;
  return typeof model === "string" && model ? model : DEFAULT_MODEL;
}

/**
 * Hex takes WAV only, and rejects a piped WAV (no length in the header) — so the
 * clip goes through ffmpeg file-to-file in a throwaway temp dir.
 */
async function toWav(ffmpeg: string, audio: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "zibby-stt-"));
  try {
    const src = join(dir, "in");
    const out = join(dir, "out.wav");
    await writeFile(src, audio);
    await run(ffmpeg, ["-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", out], {
      timeout: FFMPEG_TIMEOUT_MS,
    });
    return await readFile(out);
  } catch (error) {
    throw new SttTranscriptionError(
      `could not decode the audio clip: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Drop non-speech artefacts (`[BLANK_AUDIO]`, `[Music]`) and normalise whitespace. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Local speech-to-text over the running Hex app's loopback API
 * (`POST /transcriptions`, bearer token from Hex's `local-api.json`). Nothing is
 * spawned or kept alive here — Hex owns the model; ZIBBY only converts the clip
 * to WAV with ffmpeg and uploads it. Hex not running / no ffmpeg surface as
 * `status().available=false`.
 */
@Injectable()
export class SttService {
  async status(): Promise<SttStatus> {
    if (!(await hexApi())) return { available: false, reason: "Hex is not running — open Hex.app" };
    if (!(await findFfmpeg()))
      return { available: false, reason: "ffmpeg not found — brew install ffmpeg" };
    return { available: true };
  }

  async transcribe(input: SpeechTranscribeInput): Promise<SpeechTranscribeResult> {
    const api = await hexApi();
    if (!api) throw new SttUnavailableError("Hex is not running — open Hex.app");
    const ffmpeg = await findFfmpeg();
    if (!ffmpeg) throw new SttUnavailableError("ffmpeg not found — brew install ffmpeg");
    const wav = await toWav(ffmpeg, Buffer.from(input.audioBase64, "base64"));
    return { text: await this.postWav(api, wav, input.language) };
  }

  /** Transcribe raw 16 kHz mono s16le PCM (a dictation-stream slice) — no ffmpeg, no temp files. */
  async transcribePcm(pcm: Buffer, language?: string): Promise<string> {
    const api = await hexApi();
    if (!api) throw new SttUnavailableError("Hex is not running — open Hex.app");
    return this.postWav(api, pcmToWav(pcm), language);
  }

  /** POST a WAV to Hex's `/transcriptions` and return the cleaned transcript. */
  private async postWav(
    api: { port: number; token: string },
    wav: Buffer,
    language = DEFAULT_LANGUAGE,
  ): Promise<string> {
    const query = new URLSearchParams({ model: await hexModel(), language });
    let res: Response;
    try {
      res = await fetch(`http://127.0.0.1:${api.port}/transcriptions?${query}`, {
        method: "POST",
        headers: { authorization: `Bearer ${api.token}`, "content-type": "audio/wav" },
        body: new Uint8Array(wav),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new SttUnavailableError(error instanceof Error ? error.message : String(error));
    }
    const body = (await res.json().catch(() => null)) as {
      transcript?: unknown;
      code?: unknown;
    } | null;
    if (!res.ok) {
      const detail = `Hex returned HTTP ${res.status}${typeof body?.code === "string" ? ` (${body.code})` : ""}`;
      // 401 = stale token (Hex restarting), 5xx = model not ready / busy — retryable, not a bad clip.
      if (res.status === 401 || res.status >= 500) throw new SttUnavailableError(detail);
      throw new SttTranscriptionError(detail);
    }
    return cleanTranscript(typeof body?.transcript === "string" ? body.transcript : "");
  }
}
