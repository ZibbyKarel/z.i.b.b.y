import type { ServerResponse } from "node:http";
import { Controller, Get, Logger, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type Approval, OPERATOR_QUESTION_ACTION } from "@zibby/contracts";
import { z } from "zod";
import { ApprovalsService } from "../approvals/approvals.service";
import type { KbAuthedRequest } from "../kb/kb-mcp-auth.guard";
import { KbMcpAuthGuard } from "../kb/kb-mcp-auth.guard";
import { RUN_MCP_SERVER_ID } from "../mcp/mcp.storage.service";

const NO_RUN = "ask_operator only works inside a ZIBBY run.";
const NO_RUN_ADVISOR = "ask_advisor only works inside a ZIBBY run.";
const NO_ANSWER = "No answer was recorded. Decide yourself or stop.";
const NO_ADVISOR =
  "No advisor is available for this run. Call mcp__zibby-run__ask_operator instead.";

/**
 * TODO 9 — DI token of the phase advisor (`PhaseAdvisorService`, provided by
 * `WorkflowsModule`). Resolved lazily through `ModuleRef`: `WorkflowsModule` imports
 * this module, so a constructor dependency would be circular.
 */
export const PHASE_ADVISOR = "PHASE_ADVISOR";

/** What `ask_advisor` needs from the advisor: ask the live phase's advisor of a run. */
export interface PhaseAdvisorPort {
  ask(workflowRunId: string, question: string): Promise<string>;
}

function runIdFromHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The question an `operator.question` approval carries (the hook's JSON `summary`). */
function summaryOf(detail: string): string {
  try {
    const parsed: unknown = JSON.parse(detail);
    const summary = (parsed as { summary?: unknown } | null)?.summary;
    return typeof summary === "string" ? summary : detail;
  } catch {
    return detail;
  }
}

/** The newest approved answer to `question` asked by `runId` (or one of its stages). */
export function findAnswer(
  approved: readonly Approval[],
  runId: string,
  question: string,
): Approval | undefined {
  const q = question.trim();
  return approved
    .filter(
      (a) =>
        a.action === OPERATOR_QUESTION_ACTION &&
        // A stage's header carries the workflow run id; its approval the stage run id.
        // An agent's header carries `${agentId}_${startedMs}` (the pid is unknown at
        // spawn); its approval the core id `${agentId}_${startedMs}_${pid}` — only a
        // bare numeric pid may follow, so no other run's id can match.
        (a.runId === runId ||
          a.runId.startsWith(`${runId}.`) ||
          (a.kind === "agent" &&
            a.runId.startsWith(`${runId}_`) &&
            /^\d+$/.test(a.runId.slice(runId.length + 1)))) &&
        summaryOf(a.detail) === q,
    )
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0];
}

/**
 * The `zibby-run` MCP server (D-ASK), hosted in-process like `KbMcpController`. Tools:
 * `ask_operator({ question })` and (TODO 9) `ask_advisor({ question })`, see below. The asking itself is NOT done here: the
 * PreToolUse hook classifies the call as `operator.question` (a locked ask:human
 * floor), so the run holds on an approval until the operator answers it through
 * `POST /approvals/:id/answer`. Only once that gate releases does this handler run,
 * and it just reads the stored answer back. It never waits, never answers on its
 * own, and fails closed: only the RUN token with a run id gets an answer.
 */
@Controller()
export class RunMcpController {
  private readonly logger = new Logger(RunMcpController.name);

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private advisor(): PhaseAdvisorPort | null {
    try {
      return this.moduleRef.get<PhaseAdvisorPort>(PHASE_ADVISOR, { strict: false });
    } catch {
      return null;
    }
  }

  @Post("api/runs/mcp")
  @UseGuards(KbMcpAuthGuard)
  async handle(@Req() req: KbAuthedRequest, @Res() res: ServerResponse): Promise<void> {
    // The chat token carries no run → treated like a missing run id (fail closed).
    const runId =
      req.kbCaller === "run" ? runIdFromHeader(req.headers["x-zibby-run-id"]) : undefined;
    const server = this.buildServer(runId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, (req as { body?: unknown }).body);
    } catch (error) {
      this.logger.error(`run mcp request failed: ${String(error)}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    }
  }

  @Get("api/runs/mcp")
  rejectGet(@Res() res: ServerResponse): void {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  }

  private buildServer(runId: string | undefined): McpServer {
    const server = new McpServer({ name: RUN_MCP_SERVER_ID, version: "1.0.0" });
    server.registerTool(
      "ask_operator",
      {
        description:
          "Ask the operator ONE concrete question you cannot answer yourself. Blocks until answered.",
        inputSchema: { question: z.string().min(1).max(2000) },
      },
      async ({ question }) => {
        if (!runId) return { isError: true, content: [{ type: "text", text: NO_RUN }] };
        const answered = findAnswer(await this.approvals.list("approved"), runId, question);
        const text = answered?.reason ? `The operator answered:\n${answered.reason}` : NO_ANSWER;
        return { content: [{ type: "text", text }] };
      },
    );
    // TODO 9: NOT gated by the approval hook (no `operator.question` floor) — it asks a
    // model, not the operator. Every path it can't settle sends the agent on to
    // ask_operator, so the operator's gate is never bypassed.
    server.registerTool(
      "ask_advisor",
      {
        description:
          "Before deviating from the plan in a way that changes the outcome (different files or behaviour, a skipped check, a generator not run), ask the phase advisor ONE concrete question. It answers from the planner's context. Scope or acceptance-criteria decisions still go to ask_operator.",
        inputSchema: { question: z.string().min(1).max(4000) },
      },
      async ({ question }) => {
        if (!runId) return { isError: true, content: [{ type: "text", text: NO_RUN_ADVISOR }] };
        const advisor = this.advisor();
        const text = advisor ? await advisor.ask(runId, question) : NO_ADVISOR;
        return { content: [{ type: "text", text }] };
      },
    );
    return server;
  }
}
