import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { OPERATOR_TOKEN_HEADER } from "@zibby/contracts";
import { timingSafeEqual } from "node:crypto";
import { OperatorTokenService } from "./operator-token.service";

/** Every non-GET approvals route (approve/reject/revise/answer) needs the operator token. */
@Injectable()
export class OperatorTokenGuard implements CanActivate {
  constructor(private readonly tokens: OperatorTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; headers: Record<string, unknown> }>();
    if (req.method === "GET") return true;
    const expected = this.tokens.token();
    const got = req.headers[OPERATOR_TOKEN_HEADER];
    if (expected && typeof got === "string") {
      const a = Buffer.from(got);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    throw new UnauthorizedException({
      message: "Deciding an approval requires the operator token.",
    });
  }
}
