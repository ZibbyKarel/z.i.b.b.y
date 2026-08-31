import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { TeamKnowledgeBasePanel } from "./TeamKnowledgeBasePanel";

describe("TeamKnowledgeBasePanel", () => {
  it("renders no writable readOnly toggle, switch, or checkbox anywhere", () => {
    render(<TeamKnowledgeBasePanel onSave={vi.fn()} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("disables save until a path is entered", () => {
    render(<TeamKnowledgeBasePanel onSave={vi.fn()} />);
    expect(screen.getByTestId("save-kb")).toBeDisabled();
  });

  it("saves a vault KB with readOnly always true, never as a user choice", async () => {
    const onSave = vi.fn();
    render(<TeamKnowledgeBasePanel onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("/Users/…/vault"), "/Users/karel/vault");
    await userEvent.click(screen.getByTestId("save-kb"));

    expect(onSave).toHaveBeenCalledWith({
      kind: "vault",
      path: "/Users/karel/vault",
      gitRemote: undefined,
      readOnly: true,
    });
  });

  it("includes gitRemote when provided", async () => {
    const onSave = vi.fn();
    render(<TeamKnowledgeBasePanel onSave={onSave} />);

    await userEvent.type(screen.getByPlaceholderText("/Users/…/vault"), "/tmp/kb");
    await userEvent.type(
      screen.getByPlaceholderText("git@github.com:org/repo.git"),
      "git@github.com:acme/kb.git",
    );
    await userEvent.click(screen.getByTestId("save-kb"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ gitRemote: "git@github.com:acme/kb.git" }),
    );
  });

  it("shows no clear action when there is no knowledge base yet", () => {
    render(<TeamKnowledgeBasePanel onSave={vi.fn()} />);
    expect(screen.queryByTestId("clear-kb")).not.toBeInTheDocument();
  });

  it("prefills the path from an existing knowledge base and clears it on demand", async () => {
    const onSave = vi.fn();
    render(
      <TeamKnowledgeBasePanel
        knowledgeBase={{ kind: "vault", path: "/Users/karel/vault", readOnly: true }}
        onSave={onSave}
      />,
    );
    expect(screen.getByDisplayValue("/Users/karel/vault")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("clear-kb"));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
