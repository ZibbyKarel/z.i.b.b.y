import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import {
  ACTIVITY_DATE_RE,
  type ActivityKind,
  ActivityKindSchema,
  activityContract,
} from "@zibby/contracts";
import { ActivityLogService } from "./activity-log.service";

/** Parse the comma-separated `kinds` query into a validated kind list (bad values dropped). */
function parseKinds(raw: string | undefined): ActivityKind[] | undefined {
  if (!raw) return undefined;
  const kinds = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => ActivityKindSchema.safeParse(k).success) as ActivityKind[];
  return kinds.length > 0 ? kinds : undefined;
}

/** Implements `activityContract` against the {@link ActivityLogService} (read-only). */
@Controller()
export class ActivityController {
  constructor(private readonly activity: ActivityLogService) {}

  @TsRestHandler(activityContract)
  handler() {
    return tsRestHandler(activityContract, {
      listActivity: async ({ query }) => {
        if (query.date !== undefined && !ACTIVITY_DATE_RE.test(query.date)) {
          return {
            status: 422,
            body: { message: `invalid date "${query.date}" (expected YYYY-MM-DD)` },
          };
        }
        return {
          status: 200,
          body: await this.activity.list({
            date: query.date,
            kinds: parseKinds(query.kinds),
            limit: query.limit ?? 50,
            projectId: query.projectId,
            integrationId: query.integrationId,
            days: query.days,
          }),
        };
      },

      pageActivity: async ({ query }) => ({
        status: 200,
        body: await this.activity.page({
          before: query.before,
          limit: query.limit,
          kinds: parseKinds(query.kinds),
        }),
      }),
    });
  }
}
