import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { OPERATOR_TOKEN_HEADER } from "@zibby/contracts";
import { timingSafeEqual } from "node:crypto";
import { OperatorTokenService } from "./operator-token.service";

/** Read-only methods pass; anything else needs the operator token. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Every mutating route of a controller it guards needs the operator token: the
 * approvals decisions (approve/reject/revise/answer) and the inbox clicks whose task
 * output is auto-approved (rebase, address-comments).
 */
@Injectable()
export class OperatorTokenGuard implements CanActivate {
  constructor(private readonly tokens: OperatorTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; headers: Record<string, unknown> }>();
    if (SAFE_METHODS.has(req.method)) return true;
    const expected = this.tokens.token();
    const got = req.headers[OPERATOR_TOKEN_HEADER];
    if (expected && typeof got === "string") {
      const a = Buffer.from(got);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    throw new UnauthorizedException({
      message: "This operator action requires the operator token.",
    });
  }
}
