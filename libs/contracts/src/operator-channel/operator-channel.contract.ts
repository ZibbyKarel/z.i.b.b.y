import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { TestResultSchema } from "../integrations/integration.schema";
import {
  OperatorChannelSettingsSchema,
  OperatorChannelStatusSchema,
  OperatorCredentialInputSchema,
  OperatorCredentialKindSchema,
} from "./operator-channel.schema";

const c = initContract();

/**
 * The operator channel (Slack bot DM). Settings are one operator-owned document; the
 * PUT body is a permissive record so an unknown key reaches the handler and gets a
 * precise 422 (the mandate precedent). Tokens are write-only: the credentials route
 * stores them, status only says whether one is stored.
 */
export const operatorChannelContract = c.router(
  {
    getOperatorChannelStatus: {
      method: "GET",
      path: "/operator-channel/status",
      responses: { 200: OperatorChannelStatusSchema },
      summary: "Connection state, DM resolution and the last delivery",
    },
    getOperatorChannelSettings: {
      method: "GET",
      path: "/operator-channel/settings",
      responses: { 200: OperatorChannelSettingsSchema },
      summary: "Get the operator-channel settings (defaults when absent)",
    },
    setOperatorChannelSettings: {
      method: "PUT",
      path: "/operator-channel/settings",
      body: z.record(z.string(), z.unknown()),
      responses: { 200: OperatorChannelSettingsSchema, 422: ErrorSchema },
      summary: "Replace the operator-channel settings (strict — rejects unknown keys)",
    },
    setOperatorChannelCredential: {
      method: "PUT",
      path: "/operator-channel/credentials/:kind",
      pathParams: z.object({ kind: OperatorCredentialKindSchema }),
      body: OperatorCredentialInputSchema,
      responses: { 200: OperatorChannelStatusSchema, 422: ErrorSchema },
      summary: "Store a Slack token (bot xoxb- / app xapp-); write-only",
    },
    testOperatorChannel: {
      method: "POST",
      path: "/operator-channel/test",
      body: c.noBody(),
      responses: { 200: TestResultSchema },
      summary: "Send a test message to the operator DM",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);

export type OperatorChannelContract = typeof operatorChannelContract;
