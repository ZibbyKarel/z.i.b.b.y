import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { inboxContract } from "@zibby/contracts";
import { InboxService } from "./inbox.service";

@Controller()
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @TsRestHandler(inboxContract)
  handler() {
    return tsRestHandler(inboxContract, {
      listInboxItems: async () => ({ status: 200, body: await this.inbox.listItems() }),
      listInboxPrs: async () => ({ status: 200, body: await this.inbox.listPrs() }),
      getInboxState: async () => ({ status: 200, body: await this.inbox.getState() }),
      setInboxHidden: async ({ body }) => ({ status: 200, body: await this.inbox.setHidden(body) }),
    });
  }
}
