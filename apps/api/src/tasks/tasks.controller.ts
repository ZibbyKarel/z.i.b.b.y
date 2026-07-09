import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  StreamableFile,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { MulterError } from "multer";
import { tasksContract } from "@zibby/contracts";
import { ClaudeUnavailableError } from "../runner/claude-preflight.service";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { AttachmentStorageService } from "./attachment-storage.service";
import {
  InvalidScheduledTaskIdError,
  ScheduledTaskNotFoundError,
  ScheduledTasksStorageService,
} from "./scheduled-tasks.storage.service";
import { TaskClassifierService } from "./task-classifier.service";
import {
  EmptyCatalogError,
  SubsystemEmptyRosterError,
  TaskSchedulerService,
} from "./task-scheduler.service";

const errors = makeErrorMapper("Scheduled task", {
  missing: [ScheduledTaskNotFoundError, InvalidScheduledTaskIdError],
});

/**
 * The ts-rest handler owns every task route EXCEPT the multipart upload: ts-rest can't
 * own a multipart parse, so `uploadTaskAttachments` is served by the raw `@Post` below.
 * Handing the handler this subset router keeps ts-rest from registering (and demanding an
 * impl for) that route — the contract still declares it, so OpenAPI is unaffected.
 */
const scheduledTaskRoutes = {
  classifyTask: tasksContract.classifyTask,
  createTask: tasksContract.createTask,
  listScheduledTasks: tasksContract.listScheduledTasks,
  cancelScheduledTask: tasksContract.cancelScheduledTask,
};

/** Hard multipart limits — enforced by multer (per-file/count) and a manual set-total check. */
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_SET_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Fold every multer limit overflow into a single 413 so the upload boundary matches the
 * contract (which declares only 413 for an over-limit set). NestJS's platform-express
 * layer already maps `LIMIT_FILE_SIZE` → 413 (`PayloadTooLargeException`) itself, but maps
 * `LIMIT_FILE_COUNT` (and other multer errors) → 400 (`BadRequestException`) — off-contract.
 * This route has no other source of a 400, so catching `BadRequestException` here (plus a
 * raw `MulterError`, for robustness across versions) and re-emitting 413 is safe and uniform.
 */
@Catch(MulterError, BadRequestException)
class MulterLimitFilter implements ExceptionFilter {
  catch(error: MulterError | BadRequestException, host: ArgumentsHost): void {
    const mapped = new PayloadTooLargeException(error.message);
    const res = host
      .switchToHttp()
      .getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    res.status(mapped.getStatus()).json(mapped.getResponse());
  }
}

/**
 * Implements `tasksContract`. `classifyTask` is the side-effect-free verdict;
 * `createTask` is the action behind the New Task dialog — it classifies and
 * dispatches immediately, or (for a future `scheduledAt`) parks the task for the
 * {@link TaskSchedulerService} to fire later. An empty catalog surfaces as a 422.
 */
@Controller()
export class TasksController {
  constructor(
    private readonly classifier: TaskClassifierService,
    private readonly scheduler: TaskSchedulerService,
    private readonly storage: ScheduledTasksStorageService,
    private readonly attachments: AttachmentStorageService,
  ) {}

  /**
   * Multipart upload for a task's attachment set. ts-rest's single handler can't own
   * the multipart parse, so this is a plain `@Post` alongside it (same `/api/tasks`
   * surface — the app adds no global prefix). Limits are hard: max 10 MB/file and 20
   * files (multer), max 50 MB/set (manual). Any overflow → 413 (see {@link MulterLimitFilter}).
   */
  @Post("/api/tasks/attachments")
  @UseFilters(MulterLimitFilter)
  @UseInterceptors(
    FilesInterceptor("files", MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } }),
  )
  async uploadAttachments(@UploadedFiles() files: Express.Multer.File[]) {
    const uploaded = files ?? [];
    const total = uploaded.reduce((n, f) => n + f.size, 0);
    if (total > MAX_SET_BYTES) {
      throw new PayloadTooLargeException("Attachment set exceeds 50 MB");
    }
    return this.attachments.save(uploaded);
  }

  /**
   * Streams one attachment's bytes back so the "Vstup" section's open link opens it in a
   * browser tab (Phase 65). Binary streaming doesn't fit the ts-rest JSON contract (same
   * reason the multipart upload above is a plain route, not the ts-rest handler below), so
   * this is a second raw `@Get` alongside it — no auth, matching the upload route (single-
   * operator, self-hosted threat model). `dir(setId)` already `path.basename`-guards the set
   * id; `path.basename(name)` here does the same for the file name, so a `..`/absolute
   * traversal in either param stays contained to the set's own directory.
   */
  @Get("/api/tasks/attachments/:setId/:name")
  async openAttachment(
    @Param("setId") setId: string,
    @Param("name") name: string,
  ): Promise<StreamableFile> {
    const safeName = path.basename(name);
    const filePath = path.join(this.attachments.dir(setId), safeName);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) throw new NotFoundException("Attachment not found");
    const meta = await this.attachments.list(setId);
    const mediaType = meta.find((a) => a.name === safeName)?.mediaType ?? "application/octet-stream";
    return new StreamableFile(createReadStream(filePath), {
      type: mediaType,
      disposition: `inline; filename="${safeName}"`,
    });
  }

  @TsRestHandler(scheduledTaskRoutes)
  handler() {
    return tsRestHandler(scheduledTaskRoutes, {
      classifyTask: async ({ body }) => {
        const routing = await this.classifier.classify(body);
        if (!routing) {
          return {
            status: 422,
            body: { message: "No agents or pipelines available to route to" },
          };
        }
        return { status: 200, body: routing };
      },

      createTask: async ({ body }) => {
        try {
          // The interactive path: classify + spawn run in the BACKGROUND so the dialog
          // gets an immediate `pending` task to redirect to (the run starts off the
          // response path). A dispatch failure there — empty catalog, claude
          // unavailable, anything thrown — flips the pending task to `failed` with the
          // reason (visible in the feed), so it never silently no-ops. The sync 422/503
          // mapping is kept for the non-background server callers that still throw.
          return {
            status: 201,
            body: await this.scheduler.createTask(body, undefined, undefined, undefined, true),
          };
        } catch (error) {
          if (error instanceof EmptyCatalogError || error instanceof SubsystemEmptyRosterError) {
            return { status: 422, body: { message: error.message } };
          }
          if (error instanceof ClaudeUnavailableError) {
            return { status: 503, body: { message: error.message } };
          }
          throw error;
        }
      },

      listScheduledTasks: async () => ({ status: 200, body: await this.storage.list() }),

      cancelScheduledTask: ({ params: { id } }) =>
        errors.or404(id, () => this.scheduler.cancel(id)),
    });
  }
}
