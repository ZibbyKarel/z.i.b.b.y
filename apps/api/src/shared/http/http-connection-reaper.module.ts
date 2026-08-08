import { Module } from "@nestjs/common";
import { HttpConnectionReaper } from "./http-connection-reaper.service";

/**
 * Registers {@link HttpConnectionReaper}. Nothing imports it for a provider — it
 * exists purely so the reaper is instantiated and its `beforeApplicationShutdown`
 * hook participates in Nest's shutdown sequence. Kept as its own module (rather than
 * a bare provider on `AppModule`) so the reason it exists is documented next to it.
 */
@Module({ providers: [HttpConnectionReaper] })
export class HttpConnectionReaperModule {}
