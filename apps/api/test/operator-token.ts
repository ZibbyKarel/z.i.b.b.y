import { OPERATOR_TOKEN_HEADER } from "@zibby/contracts";
import type { Test } from "supertest";

/** Attach the operator token vitest.setup.ts pins, so a test can decide approvals. */
export const withOperator = (req: Test): Test =>
  req.set(OPERATOR_TOKEN_HEADER, process.env.ZIBBY_OPERATOR_TOKEN ?? "");
