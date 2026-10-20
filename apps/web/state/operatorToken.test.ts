import { beforeEach, expect, it } from "vitest";
import { OPERATOR_TOKEN_STORAGE_KEY, readOperatorToken, writeOperatorToken } from "./operatorToken";

beforeEach(() => localStorage.clear());
it("round-trips and trims the token", () => {
  writeOperatorToken("  abc  ");
  expect(localStorage.getItem(OPERATOR_TOKEN_STORAGE_KEY)).toBe("abc");
  expect(readOperatorToken()).toBe("abc");
});
it("clears on empty input and reads empty when unset", () => {
  writeOperatorToken("x");
  writeOperatorToken("");
  expect(readOperatorToken()).toBe("");
});
