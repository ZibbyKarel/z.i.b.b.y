import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  SpeechStatusSchema,
  SpeechSynthesizeInputSchema,
  SpeechSynthesizeResultSchema,
  SpeechVoiceSchema,
} from "./speech.schema";

const c = initContract();

/**
 * Speech contract — a thin proxy in front of the local `speakd` TTS daemon
 * (`~/Workspace/tts`, ARCHITECTURE §3 / D-0005; loopback-only, `127.0.0.1:8899`).
 * `apps/api` establishes the daemon-proxy pattern here (ARCHITECTURE §6): no
 * ZIBBY storage of its own, every route is a pass-through to `/v1/*` with the
 * daemon's own JSON error envelope reshaped to the repo's `{message}` `ErrorSchema`.
 *
 * Status code choices per daemon error (documented per ARCHITECTURE §3 + D-0005):
 * - daemon unreachable, request timeout, or daemon `503` (`state: loading`) → `503`.
 * - daemon `409` (`queue_full`, synth queue at capacity) → passthrough `409`. The
 *   repo has no existing "upstream busy" convention (no ts-rest contract uses
 *   `429`) so this keeps the daemon's own conflict semantics rather than
 *   inventing a new one; `409` also reads correctly as "try again shortly", the
 *   daemon's own message.
 * - daemon `422` (invalid text/speed) → passthrough `422`.
 * - daemon `400` (unknown voice) → passthrough `400`.
 */
export const speechContract = c.router(
  {
    synthesize: {
      method: "POST",
      path: "/speech/synthesize",
      body: SpeechSynthesizeInputSchema,
      responses: {
        200: SpeechSynthesizeResultSchema,
        400: ErrorSchema,
        409: ErrorSchema,
        422: ErrorSchema,
        503: ErrorSchema,
      },
      summary: "Synthesize speech via the local speakd daemon",
    },
    listVoices: {
      method: "GET",
      path: "/speech/voices",
      responses: {
        200: z.array(SpeechVoiceSchema),
        503: ErrorSchema,
      },
      summary: "List the voices speakd currently has available",
    },
    getStatus: {
      method: "GET",
      path: "/speech/status",
      responses: {
        200: SpeechStatusSchema,
      },
      summary:
        "speakd daemon status — always 200; reachable:false when the daemon can't be reached",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type SpeechContract = typeof speechContract;
