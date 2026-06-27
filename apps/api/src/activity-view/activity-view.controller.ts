import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { ActivityViewSchema, activityViewContract } from "@zibby/contracts";
import { ActivityViewStorageService } from "./activity-view.storage.service";

/**
 * The RightRail activity-log display config endpoints. GET returns the current
 * (seeded) view; PUT strict-validates the body against {@link ActivityViewSchema}
 * and returns 422 on any unknown group key — the transport schema is permissive so
 * the unknown key reaches here and is rejected explicitly (Law 4: only this operator
 * endpoint writes the view, and it can't be widened by a smuggled field).
 */
@Controller()
export class ActivityViewController {
  constructor(private readonly storage: ActivityViewStorageService) {}

  @TsRestHandler(activityViewContract)
  handler() {
    return tsRestHandler(activityViewContract, {
      getActivityView: async () => ({ status: 200, body: await this.storage.read() }),

      setActivityView: async ({ body }) => {
        const parsed = ActivityViewSchema.safeParse(body);
        if (!parsed.success) {
          return {
            status: 422 as const,
            body: { message: "activity view has unknown or invalid fields" },
          };
        }
        return { status: 200 as const, body: await this.storage.write(parsed.data) };
      },
    });
  }
}
