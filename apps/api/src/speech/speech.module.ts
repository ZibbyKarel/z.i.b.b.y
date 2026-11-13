import { Module } from "@nestjs/common";
import { DictationStreamService } from "./dictation-stream.service";
import { SpeechController } from "./speech.controller";
import { SpeechService } from "./speech.service";
import { SttService } from "./stt.service";

/**
 * Thin HTTP proxy to the local `speakd` TTS daemon (ARCHITECTURE §6 in
 * `~/Workspace/tts`). No storage of its own — `SpeechService` calls out to
 * `SPEAKD_URL` per request; nothing here persists. `LoggerService` is `@Global`
 * (`LoggingModule`), so no import is needed to inject it into `SpeechService`.
 */
@Module({
  controllers: [SpeechController],
  providers: [SpeechService, SttService, DictationStreamService],
})
export class SpeechModule {}
