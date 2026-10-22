import { Controller, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { inboxContract } from "@zibby/contracts";
import { OperatorTokenGuard } from "../approvals/operator-token.guard";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { InboxAddressCommentsService } from "./inbox-address-comments.service";
import { InboxFixCiService } from "./inbox-fix-ci.service";
import { InboxRebaseService, PrRefusedError } from "./inbox-rebase.service";
import { GithubDiffError, InboxPrDiffService } from "./inbox-pr-diff.service";
import {
  GithubThreadsError,
  InboxPrThreadsService,
  ThreadNotOnPrError,
} from "./inbox-pr-threads.service";
import { InboxReviewService, ReviewRepoMismatchError } from "./inbox-review.service";
import { InboxService } from "./inbox.service";

/**
 * Every mutating inbox route is an operator click; rebase, address-comments and fix-ci
 * auto-approve their push ("authorised by the click"), so an agent must not be able
 * to fake the click — all non-GET routes need the operator token.
 */
@Controller()
@UseGuards(OperatorTokenGuard)
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly reviews: InboxReviewService,
    private readonly diffs: InboxPrDiffService,
    private readonly threads: InboxPrThreadsService,
    private readonly rebases: InboxRebaseService,
    private readonly addressComments: InboxAddressCommentsService,
    private readonly fixCi: InboxFixCiService,
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
            error instanceof PrRefusedError
          ) {
            return { status: 422 as const, body: { message: error.message } };
          }
          throw error;
        }
      },
      addressInboxPrComments: async ({ body }) => {
        try {
          return { status: 201 as const, body: await this.addressComments.start(body) };
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (
            error instanceof NoGithubLinkError ||
            error instanceof ReviewRepoMismatchError ||
            error instanceof PrRefusedError
          ) {
            return { status: 422 as const, body: { message: error.message } };
          }
          throw error;
        }
      },
      fixInboxPrCi: async ({ body }) => {
        try {
          return { status: 201 as const, body: await this.fixCi.start(body) };
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (
            error instanceof NoGithubLinkError ||
            error instanceof ReviewRepoMismatchError ||
            error instanceof PrRefusedError
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
      getInboxPrThreads: async ({ params }) => {
        try {
          return {
            status: 200 as const,
            body: await this.threads.list(params.projectId, params.number),
          };
        } catch (error) {
          return mapThreadsError(error);
        }
      },
      replyInboxPrThread: async ({ params, body }) => {
        try {
          return {
            status: 200 as const,
            body: await this.threads.reply(params.projectId, params.number, params.threadId, body),
          };
        } catch (error) {
          return mapThreadsError(error);
        }
      },
      submitInboxPrReview: async ({ params, body }) => {
        try {
          return {
            status: 201 as const,
            body: await this.threads.submitReview(params.projectId, params.number, body),
          };
        } catch (error) {
          return mapThreadsError(error);
        }
      },
      getInboxState: async () => ({ status: 200, body: await this.inbox.getState() }),
      setInboxHidden: async ({ body }) => ({ status: 200, body: await this.inbox.setHidden(body) }),
    });
  }
}

/** Same mapping as `getInboxPrDiff`; a thread not on the PR is a 422. */
function mapThreadsError(error: unknown) {
  if (error instanceof ProjectNotFoundError) {
    return { status: 404 as const, body: { message: error.message } };
  }
  if (error instanceof NoGithubLinkError || error instanceof ThreadNotOnPrError) {
    return { status: 422 as const, body: { message: error.message } };
  }
  if (error instanceof GithubThreadsError) {
    const { status } = error;
    if (status === 404) return { status: 404 as const, body: { message: error.message } };
    // 422 = GitHub's validation refusal (e.g. approving your own PR)
    if (status === 401 || status === 403 || status === 422) {
      return { status: 422 as const, body: { message: error.message } };
    }
    return { status: 502 as const, body: { message: error.message } };
  }
  throw error;
}
