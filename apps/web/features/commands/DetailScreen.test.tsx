import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "@zibby/contracts";
import { CommandDetailScreenTestId, DetailScreen } from "./DetailScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const COMMAND: Command = {
  id: "orchestrate",
  description: "Orchestrates the thing",
  "argument-hint": "[issue-number]",
  enabled: true,
  instructions: "Do the thing with $ARGUMENTS.",
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    command: {
      data: undefined as unknown,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    update: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("./queries", () => ({
  useCommandQuery: () => hooks.command,
}));
vi.mock("./mutations", () => ({
  useUpdateCommandMutation: () => ({ mutate: hooks.update, isPending: false }),
  useDeleteCommandMutation: () => ({ mutate: hooks.del, isPending: false }),
}));

describe("commands DetailScreen (N4d grammar)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.update.mockClear();
    hooks.del.mockClear();
    hooks.command = { data: COMMAND, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("titles by /<id>, locks the id field, and carries top-right actions by name", () => {
    render(<DetailScreen commandId="orchestrate" />);
    expect(screen.getByText("/orchestrate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uložit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smazat" })).toBeInTheDocument();
    // The id names the backing file — the detail page must not change it.
    expect(screen.getByDisplayValue("orchestrate")).toBeDisabled();
  });

  it("Save submits the form to the update mutation (kebab-case contract keys)", async () => {
    render(<DetailScreen commandId="orchestrate" />);
    await userEvent.click(screen.getByTestId(CommandDetailScreenTestId.Save));
    await vi.waitFor(() => {
      expect(hooks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: "orchestrate" },
          body: expect.objectContaining({
            "argument-hint": "[issue-number]",
            instructions: "Do the thing with $ARGUMENTS.",
          }),
        }),
      );
    });
  });

  it("Delete asks in a CONFIRM dialog, then deletes and navigates back to /commands", async () => {
    hooks.del.mockImplementation((_args, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<DetailScreen commandId="orchestrate" />);
    await userEvent.click(screen.getByTestId(CommandDetailScreenTestId.Delete));
    expect(screen.getByText("Smazat příkaz?")).toBeInTheDocument();
    const confirm = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId(CommandDetailScreenTestId.Delete));
    await userEvent.click(confirm!);
    expect(hooks.del).toHaveBeenCalledWith(
      { params: { id: "orchestrate" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(push).toHaveBeenCalledWith("/commands");
  });
});
