import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { channelsContract } from "@zibby/contracts"
import { ChannelItemStore } from "./channel-item.store"

/**
 * Read-only access to ingested channel items. There is no write handler — items
 * are created and transitioned only by the watcher / triage flow (Law 4).
 */
@Controller()
export class ChannelsController {
  constructor(private readonly store: ChannelItemStore) {}

  @TsRestHandler(channelsContract)
  handler() {
    return tsRestHandler(channelsContract, {
      listChannelItems: async ({ query }) => ({
        status: 200,
        body: await this.store.list({ integrationId: query.integrationId, state: query.state }),
      }),

      getChannelItem: async ({ params: { id } }) => {
        const item = await this.store.findById(id)
        return item
          ? { status: 200 as const, body: item }
          : { status: 404 as const, body: { message: `Channel item "${id}" not found` } }
      },
    })
  }
}
