import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  ChatTranscriptSchema,
  SendChatMessageBodySchema,
  SendChatMessageResultSchema,
} from "./chat.schema";

const c = initContract();

/**
 * Chat (chat-first conversational layer). `POST /chat/messages` appends the
 * operator's turn, kicks off a streaming `claude` session turn, and returns
 * immediately with `{ conversationId, turnId }`; the assistant's tokens arrive
 * out-of-band on the SSE endpoint `GET /api/chat/stream` (a raw `@Sse()`, not
 * part of this ts-rest router). `GET /chat/transcript` is a pure read of the
 * append-only transcript. Omitting `conversationId` targets the single active
 * conversation (MVP is one ongoing thread).
 *
 * A `skillId` naming no existing skill is a 404 — the turn is never started with
 * a silently dropped skill (see `SendChatMessageBodySchema.skillId`).
 */
export const chatContract = c.router(
  {
    sendMessage: {
      method: "POST",
      path: "/chat/messages",
      body: SendChatMessageBodySchema,
      responses: { 201: SendChatMessageResultSchema, 404: ErrorSchema },
      summary: "Append a turn and start a streaming assistant response",
    },
    getTranscript: {
      method: "GET",
      path: "/chat/transcript",
      query: z.object({ conversationId: z.string().optional() }),
      responses: { 200: ChatTranscriptSchema },
      summary: "Read the conversation transcript (pure read)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ChatContract = typeof chatContract;
