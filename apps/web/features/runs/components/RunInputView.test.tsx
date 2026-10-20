import { renderWithProviders as render, screen, within } from "../../../test/render";
import { FilePreviewTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import type { RunView } from "../run";
import { RunInputView, RunInputViewTestId } from "./RunInputView";

vi.mock("../../../state/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/api")>()),
  API_URL: "http://api.test",
}));

const run: RunView = {
  runId: "delivery_42",
  kind: "workflow",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: "2026-10-20T10:00:00Z",
  logBase: null,
  taskText: "Fix the **login** flow",
  attachmentSetId: "set_1",
  attachments: [
    { name: "spec file.pdf", size: 100 },
    { name: "notes.md", size: 50 },
  ],
};

describe("RunInputView", () => {
  it("renders the task text and an openable link per attachment", () => {
    render(<RunInputView run={run} />);
    expect(screen.getByTestId(RunInputViewTestId.Root)).toHaveTextContent("Fix the login flow");
    const rows = screen.getAllByTestId(RunInputViewTestId.Attachment);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId(FilePreviewTestId.Link)).toHaveAttribute(
      "href",
      "http://api.test/api/tasks/attachments/set_1/spec%20file.pdf",
    );
  });

  it("keeps attachments read-only without an attachment set id", () => {
    render(<RunInputView run={{ ...run, attachmentSetId: undefined }} />);
    expect(screen.getAllByTestId(RunInputViewTestId.Attachment)).toHaveLength(2);
    expect(screen.queryByTestId(FilePreviewTestId.Link)).not.toBeInTheDocument();
  });
});
