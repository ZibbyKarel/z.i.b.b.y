import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { OPERATOR_TOKEN_HEADER } from "@zibby/contracts";
import { timingSafeEqual } from "node:crypto";
import { OperatorTokenService } from "./operator-token.service";

/** Read-only methods pass; anything else needs the operator token. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Whether `headers` carry the operator token (timing-safe; no token resolved = false). */
export function hasOperatorToken(
  tokens: OperatorTokenService,
  headers: Record<string, unknown>,
): boolean {
  const expected = tokens.token();
  const got = headers[OPERATOR_TOKEN_HEADER];
  if (!expected || typeof got !== "string") return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Field-level variant for routes that stay open except for one operator-only change
 * (e.g. switching the AI engine / model): throws the guard's 401 when `needed` and the
 * token is missing.
 */
export function requireOperatorTokenIf(
  needed: boolean,
  tokens: OperatorTokenService,
  headers: Record<string, unknown>,
  what: string,
): void {
  if (!needed || hasOperatorToken(tokens, headers)) return;
  throw new UnauthorizedException({ message: `${what} requires the operator token.` });
}

/**
 * Every mutating route of a controller it guards needs the operator token: the
 * approvals decisions (approve/reject/revise/answer) and the inbox clicks whose task
 * output is auto-approved (rebase, address-comments, fix-ci).
 */
@Injectable()
export class OperatorTokenGuard implements CanActivate {
  constructor(private readonly tokens: OperatorTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; headers: Record<string, unknown> }>();
    if (SAFE_METHODS.has(req.method) || hasOperatorToken(this.tokens, req.headers)) return true;
    throw new UnauthorizedException({
      message: "This operator action requires the operator token.",
    });
  }
}
