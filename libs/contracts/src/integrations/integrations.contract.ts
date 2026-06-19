import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  CreateIntegrationSchema,
  CredentialsInputSchema,
  IntegrationIdSchema,
  IntegrationSchema,
  TestResultSchema,
  UpdateIntegrationSchema,
} from "./integration.schema";

const c = initContract();

const IdParam = z.object({ id: IntegrationIdSchema });

/**
 * Integrations (Phase 5): configured inbound channels (Slack, email). CRUD plus a
 * write-only credentials sub-resource and a connection test. Credentials are never
 * readable over HTTP — the entity exposes only `hasCredentials` — and `kind` is
 * immutable (update rejects a kind change with 422), like vault tier in Phase 4.
 */
export const integrationsContract = c.router(
  {
    createIntegration: {
      method: "POST",
      path: "/integrations",
      body: CreateIntegrationSchema,
      responses: { 201: IntegrationSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create an integration",
    },
    listIntegrations: {
      method: "GET",
      path: "/integrations",
      query: z.object({ projectId: z.string().optional() }),
      responses: { 200: z.array(IntegrationSchema) },
      summary: "List integrations (optionally filtered to one project)",
    },
    getIntegration: {
      method: "GET",
      path: "/integrations/:id",
      pathParams: IdParam,
      responses: { 200: IntegrationSchema, 404: ErrorSchema },
      summary: "Get an integration by id",
    },
    updateIntegration: {
      method: "PATCH",
      path: "/integrations/:id",
      pathParams: IdParam,
      body: UpdateIntegrationSchema,
      responses: { 200: IntegrationSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Update an integration (name, enabled, config — never kind)",
    },
    deleteIntegration: {
      method: "DELETE",
      path: "/integrations/:id",
      pathParams: IdParam,
      responses: { 200: z.object({ id: IntegrationIdSchema }), 404: ErrorSchema },
      summary: "Delete an integration (cascades its credentials)",
    },
    setCredentials: {
      method: "PUT",
      path: "/integrations/:id/credentials",
      pathParams: IdParam,
      body: CredentialsInputSchema,
      responses: { 200: IntegrationSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Set an integration's secret (write-only; never read back)",
    },
    deleteCredentials: {
      method: "DELETE",
      path: "/integrations/:id/credentials",
      pathParams: IdParam,
      responses: { 200: IntegrationSchema, 404: ErrorSchema },
      summary: "Remove an integration's stored secret",
    },
    testIntegration: {
      method: "POST",
      path: "/integrations/:id/test",
      pathParams: IdParam,
      body: z.object({}).optional(),
      responses: { 200: TestResultSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Test the connection (stamps status; 409 when no credentials)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type IntegrationsContract = typeof integrationsContract;
