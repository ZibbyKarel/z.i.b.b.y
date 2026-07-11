import { Module } from "@nestjs/common";
import { SpeechController } from "./speech.controller";
import { SpeechService } from "./speech.service";

/**
 * Thin HTTP proxy to the local `speakd` TTS daemon (ARCHITECTURE §6 in
 * `~/Workspace/tts`). No storage of its own — `SpeechService` calls out to
 * `SPEAKD_URL` per request; nothing here persists. `LoggerService` is `@Global`
 * (`LoggingModule`), so no import is needed to inject it into `SpeechService`.
 */
@Module({
  controllers: [SpeechController],
  providers: [SpeechService],
})
export class SpeechModule {}
