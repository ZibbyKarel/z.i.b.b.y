import { describe, expect, it } from "vitest";
import { DeleteResponseSchema } from "../common.schema";
import { commandsContract } from "./commands.contract";

describe("commandsContract", () => {
  it("deleteCommand's 200 response IS the shared DeleteResponseSchema (T11 dedup, finding #9)", () => {
    expect(commandsContract.deleteCommand.responses[200]).toBe(DeleteResponseSchema);
  });
});
