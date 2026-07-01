import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { MonitorEventSchema, MonitorEventsQuerySchema } from "./monitor.schema";

const c = initContract();

/**
 * Monitor events (N3) — READ-ONLY. Events are born only inside the API (the
 * monitor watcher ingests them from the adapters), so a client can never forge
 * an alert; handling happens autonomously on the tier path (the dispatched
 * task), not through this surface.
 */
export const monitorsContract = c.router(
  {
    listMonitorEvents: {
      method: "GET",
      path: "/monitors/events",
      query: MonitorEventsQuerySchema,
      responses: { 200: z.array(MonitorEventSchema) },
      summary: "List monitor events (newest-first)",
    },
    getMonitorEvent: {
      method: "GET",
      path: "/monitors/events/:id",
      responses: { 200: MonitorEventSchema, 404: ErrorSchema },
      summary: "One monitor event by id",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type MonitorsContract = typeof monitorsContract;
