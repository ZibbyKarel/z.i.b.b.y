import {
  Controller,
  HttpCode,
  type MessageEvent,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Sse,
} from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { speechContract } from "@zibby/contracts";
import type { Request } from "express";
import { type Observable, endWith, ignoreElements, map, merge, takeUntil } from "rxjs";
import { heartbeats } from "../shared/sse/sse";
import { DictationSessionNotFoundError, DictationStreamService } from "./dictation-stream.service";
import { SpeakdDaemonError, SpeakdTimeoutError, SpeakdUnreachableError } from "./speech.errors";
import { SpeechService } from "./speech.service";
import { SttService, SttTranscriptionError, SttUnavailableError } from "./stt.service";

/** Cap on one uploaded MediaRecorder chunk (a 1 s timeslice of webm/opus is ~4-8 KB). */
export const DICTATION_CHUNK_MAX_BYTES = 1024 * 1024;

/** Read a raw request body, refusing more than `max` bytes with `413`. */
async function readRawBody(req: Request, max: number): Promise<Buffer> {
  if (Number(req.headers["content-length"] ?? 0) > max) {
    throw new PayloadTooLargeException(`audio chunk exceeds ${max} bytes`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) throw new PayloadTooLargeException(`audio chunk exceeds ${max} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** `DictationSessionNotFoundError` → Nest's `404`; anything else rethrown. */
function notFound(error: unknown): never {
  if (error instanceof DictationSessionNotFoundError) throw new NotFoundException(error.message);
  throw error;
}

function orNotFound<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    notFound(error);
  }
}

/** True for the two connectivity failures — daemon down or too slow to answer. */
function isConnectionError(error: unknown): boolean {
  return error instanceof SpeakdUnreachableError || error instanceof SpeakdTimeoutError;
}

/**
 * Implements `speechContract` — a thin proxy to the local `speakd` TTS daemon
 * (ARCHITECTURE §6 in `~/Workspace/tts`). `SpeechService` does the HTTP work and
 * throws typed errors; this controller's only job is mapping those to the status
 * codes `speechContract` declares (see its doc comment for the rationale).
 */
@Controller()
export class SpeechController {
  constructor(
    private readonly speech: SpeechService,
    private readonly stt: SttService,
    private readonly dictation: DictationStreamService,
  ) {}

  @TsRestHandler(speechContract)
  handler() {
    return tsRestHandler(speechContract, {
      synthesize: async ({ body }) => {
        try {
          return { status: 200 as const, body: await this.speech.synthesize(body) };
        } catch (error) {
          if (error instanceof SpeakdDaemonError) {
            if (error.status === 400)
              return { status: 400 as const, body: { message: error.message } };
            if (error.status === 409)
              return { status: 409 as const, body: { message: error.message } };
            if (error.status === 422)
              return { status: 422 as const, body: { message: error.message } };
            return { status: 503 as const, body: { message: error.message } };
          }
          if (isConnectionError(error)) {
            return { status: 503 as const, body: { message: (error as Error).message } };
          }
          throw error;
        }
      },

      transcribe: async ({ body }) => {
        try {
          return { status: 200 as const, body: await this.stt.transcribe(body) };
        } catch (error) {
          if (error instanceof SttTranscriptionError) {
            return { status: 422 as const, body: { message: error.message } };
          }
          if (error instanceof SttUnavailableError) {
            return { status: 503 as const, body: { message: error.message } };
          }
          throw error;
        }
      },

      startDictation: async ({ body }) => {
        try {
          return { status: 201 as const, body: await this.dictation.create(body) };
        } catch (error) {
          if (error instanceof SttUnavailableError) {
            return { status: 503 as const, body: { message: error.message } };
          }
          throw error;
        }
      },

      finishDictation: async ({ params }) => {
        try {
          return { status: 200 as const, body: { text: await this.dictation.finish(params.id) } };
        } catch (error) {
          if (error instanceof DictationSessionNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (error instanceof SttTranscriptionError) {
            return { status: 422 as const, body: { message: error.message } };
          }
          if (error instanceof SttUnavailableError) {
            return { status: 503 as const, body: { message: error.message } };
          }
          throw error;
        }
      },

      listVoices: async () => {
        try {
          return { status: 200 as const, body: await this.speech.listVoices() };
        } catch (error) {
          if (error instanceof SpeakdDaemonError || isConnectionError(error)) {
            return { status: 503 as const, body: { message: (error as Error).message } };
          }
          throw error;
        }
      },

      // Neither status() throws — every failure mode is folded into a
      // reachable:false / stt.available:false body, so there is no error branch.
      getStatus: async () => ({
        status: 200 as const,
        body: { ...(await this.speech.status()), stt: await this.stt.status() },
      }),
    });
  }

  /**
   * One MediaRecorder chunk as raw bytes (`application/octet-stream`) — outside the
   * contract because ts-rest models JSON bodies. Chunks are one continuous container
   * stream, so the client uploads them sequentially; they're written in arrival order.
   * The JSON body parser only claims `application/json`, so the stream is still unread here.
   */
  @Post("api/speech/dictation/:id/audio")
  @HttpCode(204)
  async dictationAudio(@Param("id") id: string, @Req() req: Request): Promise<void> {
    orNotFound(() => this.dictation.events(id)); // 404 before reading the body
    const chunk = await readRawBody(req, DICTATION_CHUNK_MAX_BYTES);
    await this.dictation.write(id, chunk).catch(notFound);
  }

  /**
   * Live `{ text, final }` updates of one session — the latest is replayed on
   * subscribe; the stream completes after the `final` one (or when the session expires).
   */
  @Sse("api/speech/dictation/:id/events")
  dictationEvents(@Param("id") id: string): Observable<MessageEvent> {
    const updates = orNotFound(() => this.dictation.events(id));
    const done = updates.pipe(ignoreElements(), endWith(null));
    return merge(
      updates.pipe(map((update): MessageEvent => ({ data: JSON.stringify(update) }))),
      heartbeats().pipe(takeUntil(done)),
    );
  }
}
