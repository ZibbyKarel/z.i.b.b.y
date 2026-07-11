import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { speechContract } from "@zibby/contracts";
import { SpeakdDaemonError, SpeakdTimeoutError, SpeakdUnreachableError } from "./speech.errors";
import { SpeechService } from "./speech.service";

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
  constructor(private readonly speech: SpeechService) {}

  @TsRestHandler(speechContract)
  handler() {
    return tsRestHandler(speechContract, {
      synthesize: async ({ body }) => {
        try {
          return { status: 200 as const, body: await this.speech.synthesize(body) };
        } catch (error) {
          if (error instanceof SpeakdDaemonError) {
            if (error.status === 400) return { status: 400 as const, body: { message: error.message } };
            if (error.status === 409) return { status: 409 as const, body: { message: error.message } };
            if (error.status === 422) return { status: 422 as const, body: { message: error.message } };
            return { status: 503 as const, body: { message: error.message } };
          }
          if (isConnectionError(error)) {
            return { status: 503 as const, body: { message: (error as Error).message } };
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

      // SpeechService.status() never throws — every failure mode is folded into
      // a reachable:false body, so there is no error branch to map here.
      getStatus: async () => ({ status: 200 as const, body: await this.speech.status() }),
    });
  }
}
