import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { autopilotContract } from "@zibby/contracts";
import { hasOperatorToken } from "../approvals/operator-token.guard";
import { OperatorTokenService } from "../approvals/operator-token.service";
import { AutopilotService } from "./autopilot.service";

/**
 * Implements `autopilotContract`. Not behind `OperatorTokenGuard` as a whole: only
 * turning autopilot ON needs the operator token; OFF only tightens, so it is open
 * (the chat's `autopilot_off` tool takes the same path in-process).
 */
@Controller()
export class AutopilotController {
  constructor(
    private readonly autopilot: AutopilotService,
    private readonly tokens: OperatorTokenService,
  ) {}

  @TsRestHandler(autopilotContract)
  handler() {
    return tsRestHandler(autopilotContract, {
      getAutopilot: async () => ({ status: 200, body: await this.autopilot.status() }),

      setAutopilot: async ({ body: { level, automation }, headers }) => {
        const operator = hasOperatorToken(this.tokens, headers);
        if (level === "full" && !operator) {
          return {
            status: 401,
            body: { message: "Turning autopilot on requires the operator token." },
          };
        }
        // The toggles start work in both levels, so only the token may change the tree.
        const tree = operator ? automation : undefined;
        return {
          status: 200,
          body: await this.autopilot.set(level, "operator", tree),
        };
      },
    });
  }
}
