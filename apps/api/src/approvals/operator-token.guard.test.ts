import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OperatorTokenGuard } from "./operator-token.guard";
import type { OperatorTokenService } from "./operator-token.service";

const ctx = (method: string, headers: Record<string, string> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  }) as unknown as ExecutionContext;
const guard = (token: string | null) =>
  new OperatorTokenGuard({ token: () => token } as OperatorTokenService);

describe("OperatorTokenGuard", () => {
  it("lets GET through without a token", () => {
    expect(guard("secret").canActivate(ctx("GET"))).toBe(true);
  });
  it("accepts a POST carrying the operator token", () => {
    expect(guard("secret").canActivate(ctx("POST", { "x-zibby-operator-token": "secret" }))).toBe(
      true,
    );
  });
  it.each<Record<string, string>>([
    {},
    { "x-zibby-operator-token": "" },
    { "x-zibby-operator-token": "nope" },
    { "x-zibby-operator-token": "secret-but-longer" },
  ])("rejects a POST with header %o", (headers) => {
    expect(() => guard("secret").canActivate(ctx("POST", headers))).toThrow(UnauthorizedException);
  });
  it("fails closed when no token is configured", () => {
    expect(() => guard(null).canActivate(ctx("POST", { "x-zibby-operator-token": "" }))).toThrow(
      UnauthorizedException,
    );
  });
});
