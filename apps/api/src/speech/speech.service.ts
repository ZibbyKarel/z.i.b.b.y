import { Injectable, Optional } from "@nestjs/common";
import type {
  SpeechStatus,
  SpeechSynthesizeInput,
  SpeechSynthesizeResult,
  SpeechVoice,
} from "@zibby/contracts";
import { SpeechVoiceSchema } from "@zibby/contracts";
import { z } from "zod";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { SpeakdDaemonError, SpeakdTimeoutError, SpeakdUnreachableError } from "./speech.errors";

/** The daemon's own `{error:{code,message}}` envelope (ARCHITECTURE §3). */
interface DaemonErrorEnvelope {
  error?: { code?: string; message?: string };
}

/** The daemon's `GET /v1/status` body, snake_case as speakd sends it. */
interface DaemonStatusBody {
  state?: string;
  engine?: string | null;
  model?: string | null;
  device?: string | null;
  default_voice?: string | null;
  queue_depth?: number | null;
  uptime_s?: number | null;
}

const DEFAULT_SPEAKD_URL = "http://127.0.0.1:8899";
const DEFAULT_TIMEOUT_MS = 30_000;

/** A `speech.status()` reading for when the daemon can't be reached at all. */
const UNREACHABLE_STATUS: SpeechStatus = {
  reachable: false,
  state: "degraded",
  engine: null,
  model: null,
  device: null,
  defaultVoice: null,
  queueDepth: null,
  uptimeS: null,
};

/** Read a header as a finite number, or `null` when absent/non-numeric. */
function headerNum(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Thin HTTP client for the local `speakd` TTS daemon (`~/Workspace/tts`,
 * ARCHITECTURE §3 / D-0005 — loopback-only, `SPEAKD_URL` default
 * `http://127.0.0.1:8899`). Establishes the daemon-proxy pattern for ZIBBY
 * (ARCHITECTURE §6): no storage of its own, every call is bounded by
 * `AbortSignal.timeout(SPEAKD_TIMEOUT_MS)` so a stuck daemon can never hang a
 * ZIBBY request, and a daemon-side JSON error envelope is decoded and rethrown as
 * a typed `SpeakdDaemonError` the controller maps to the matching HTTP status.
 *
 * No compile-time link to the daemon — the `fixtures/` JSON files + their Vitest
 * test are the drift tripwire instead (whisper's D-0013 pattern, ARCHITECTURE §6).
 */
@Injectable()
export class SpeechService {
  private readonly log?: ScopedLogger;

  constructor(@Optional() logger?: LoggerService) {
    this.log = logger?.child(SpeechService.name);
  }

  private baseUrl(): string {
    return process.env.SPEAKD_URL ?? DEFAULT_SPEAKD_URL;
  }

  private timeoutMs(): number {
    const raw = Number(process.env.SPEAKD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  }

  private authHeaders(): Record<string, string> {
    const token = process.env.SPEAKD_TOKEN;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /**
   * One bounded call to `speakd`. Network failures and `AbortSignal.timeout`
   * become {@link SpeakdUnreachableError} / {@link SpeakdTimeoutError}; the
   * response (2xx or not) is returned as-is for the caller to interpret.
   */
  private async request(path: string, init: RequestInit): Promise<Response> {
    const timeoutMs = this.timeoutMs();
    try {
      return await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { ...this.authHeaders(), ...(init.headers as Record<string, string> | undefined) },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new SpeakdTimeoutError(timeoutMs);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.log?.debug("speakd request failed", { path, error: message });
      throw new SpeakdUnreachableError(message);
    }
  }

  /** Decode a non-2xx response's `{error:{code,message}}` body into a typed error. */
  private async toDaemonError(res: Response): Promise<SpeakdDaemonError> {
    let code = "unknown_error";
    let message = `speakd returned HTTP ${res.status}`;
    try {
      const body = (await res.json()) as DaemonErrorEnvelope;
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Non-JSON or unparseable body — fall back to the generic HTTP-status message.
    }
    return new SpeakdDaemonError(res.status, code, message);
  }

  /** `POST /v1/speak` → base64 WAV + timing (ARCHITECTURE §3). */
  async synthesize(input: SpeechSynthesizeInput): Promise<SpeechSynthesizeResult> {
    const res = await this.request("/v1/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        voice: input.voice,
        language: input.language,
        speed: input.speed,
      }),
    });
    if (!res.ok) throw await this.toDaemonError(res);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      audioBase64: buf.toString("base64"),
      format: "wav",
      synthMs: headerNum(res.headers, "x-speakd-synth-ms"),
      audioMs: headerNum(res.headers, "x-speakd-audio-ms"),
      voice: input.voice ?? null,
    };
  }

  /** `GET /v1/voices` (ARCHITECTURE §3). Parsed against the contract schema — a
   * shape drift from the daemon surfaces as a `SpeakdDaemonError` (503), not a
   * silently-wrong list. */
  async listVoices(): Promise<SpeechVoice[]> {
    const res = await this.request("/v1/voices", { method: "GET" });
    if (!res.ok) throw await this.toDaemonError(res);
    const body = await res.json();
    const parsed = z.array(SpeechVoiceSchema).safeParse(body);
    if (!parsed.success) {
      throw new SpeakdDaemonError(503, "malformed_response", "speakd returned an unexpected voices shape");
    }
    return parsed.data;
  }

  /**
   * `GET /v1/status` (ARCHITECTURE §3), reshaped to the camelCase `SpeechStatus`
   * mirror. Never throws — any failure (unreachable, timeout, non-2xx, malformed
   * body) resolves to {@link UNREACHABLE_STATUS} so the endpoint always answers
   * (mirrors `healthContract`'s "never fail silently").
   */
  async status(): Promise<SpeechStatus> {
    try {
      const res = await this.request("/v1/status", { method: "GET" });
      if (!res.ok) return UNREACHABLE_STATUS;
      const body = (await res.json()) as DaemonStatusBody;
      const state =
        body.state === "loading" || body.state === "ready" || body.state === "degraded"
          ? body.state
          : "degraded";
      return {
        reachable: true,
        state,
        engine: body.engine ?? null,
        model: body.model ?? null,
        device: body.device ?? null,
        defaultVoice: body.default_voice ?? null,
        queueDepth: body.queue_depth ?? null,
        uptimeS: body.uptime_s ?? null,
      };
    } catch (error) {
      this.log?.debug("speakd status probe failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return UNREACHABLE_STATUS;
    }
  }
}
