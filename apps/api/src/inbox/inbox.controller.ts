import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { inboxContract } from "@zibby/contracts";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { InboxRebaseService, RebaseRefusedError } from "./inbox-rebase.service";
import { GithubDiffError, InboxPrDiffService } from "./inbox-pr-diff.service";
import { InboxReviewService, ReviewRepoMismatchError } from "./inbox-review.service";
import { InboxService } from "./inbox.service";

@Controller()
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly reviews: InboxReviewService,
    private readonly diffs: InboxPrDiffService,
    private readonly rebases: InboxRebaseService,
  ) {}

  @TsRestHandler(inboxContract)
  handler() {
    return tsRestHandler(inboxContract, {
      listInboxItems: async () => ({ status: 200, body: await this.inbox.listItems() }),
      listInboxPrs: async () => ({ status: 200, body: await this.inbox.listPrs() }),
      reviewInboxPr: async ({ body }) => {
        try {
          return { status: 201 as const, body: await this.reviews.start(body) };
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (error instanceof NoGithubLinkError || error instanceof ReviewRepoMismatchError) {
            return { status: 422 as const, body: { message: error.message } };
          }
          throw error;
        }
      },
      rebaseInboxPr: async ({ body }) => {
        try {
          return { status: 201 as const, body: await this.rebases.start(body) };
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (
            error instanceof NoGithubLinkError ||
            error instanceof ReviewRepoMismatchError ||
            error instanceof RebaseRefusedError
          ) {
            return { status: 422 as const, body: { message: error.message } };
          }
          throw error;
        }
      },
      getInboxPrDiff: async ({ params }) => {
        try {
          return {
            status: 200 as const,
            body: await this.diffs.getDiff(params.projectId, params.number),
          };
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (error instanceof NoGithubLinkError) {
            return { status: 422 as const, body: { message: error.message } };
          }
          if (error instanceof GithubDiffError) {
            const { status } = error;
            if (status === 404) return { status: 404 as const, body: { message: error.message } };
            if (status === 401 || status === 403) {
              return { status: 422 as const, body: { message: error.message } };
            }
            return { status: 502 as const, body: { message: error.message } };
          }
          throw error;
        }
      },
      getInboxState: async () => ({ status: 200, body: await this.inbox.getState() }),
      setInboxHidden: async ({ body }) => ({ status: 200, body: await this.inbox.setHidden(body) }),
    });
  }
}
