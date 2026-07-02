import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { monitorsContract } from "@zibby/contracts";
import { MonitorEventStore } from "./monitor-event.store";

/**
 * Implements `monitorsContract` — READ-ONLY. Alerts are born only inside the API
 * (the watcher ingests them), so a client can never forge one; handling is the
 * watcher's tier path, not an HTTP mutation.
 */
@Controller()
export class MonitorsController {
  constructor(private readonly store: MonitorEventStore) {}

  @TsRestHandler(monitorsContract)
  handler() {
    return tsRestHandler(monitorsContract, {
      listMonitorEvents: async ({ query }) => ({
        status: 200,
        body: await this.store.listFiltered(query),
      }),

      getMonitorEvent: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.store.get(id) };
        } catch {
          return { status: 404, body: { message: `Monitor event "${id}" not found` } };
        }
      },

      listCiStatus: async ({ query }) => ({
        status: 200,
        body: await this.store.listStatuses(query),
      }),
    });
  }
}
