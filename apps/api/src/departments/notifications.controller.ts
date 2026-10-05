import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { notificationsContract } from "@zibby/contracts";
import { DepartmentsService } from "./departments.service";

/** Implements `notificationsContract` — the bell over unread failed runs. */
@Controller()
export class NotificationsController {
  constructor(private readonly departments: DepartmentsService) {}

  @TsRestHandler(notificationsContract)
  handler() {
    return tsRestHandler(notificationsContract, {
      listNotifications: async () => ({
        status: 200,
        body: await this.departments.notifications(),
      }),
      markNotificationsRead: async ({ body }) => ({
        status: 200,
        body: await this.departments.markRead(body.runIds),
      }),
    });
  }
}
