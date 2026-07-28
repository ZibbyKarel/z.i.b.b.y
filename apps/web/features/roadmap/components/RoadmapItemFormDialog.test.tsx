import { DropZoneTestId, MarkdownEditorTestId } from "@zibby/design-system";
import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { RoadmapItemFormDialog, RoadmapItemFormDialogTestId } from "./RoadmapItemFormDialog";

/**
 * Simulate an actual drag-and-drop (as opposed to `userEvent.upload`, which
 * simulates the NATIVE FILE PICKER and pre-filters by the input's `accept`
 * attribute before react-dropzone ever sees a mismatched file — so it can
 * never exercise `onDropRejected`). A real drag-and-drop is not filtered by
 * the browser at all; react-dropzone's own `accept` validation is what
 * produces the rejection, exactly as this dialog's ".md only" behavior
 * depends on. Mirrors react-dropzone's own test helper (`createDtWithFiles`).
 */
function dropFiles(dropzoneRoot: Element, files: File[]) {
  fireEvent.drop(dropzoneRoot, {
    dataTransfer: {
      files,
      items: files.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file })),
      types: ["Files"],
    },
  });
}

type MutateVars = { params: { projectId: string }; body: Record<string, unknown> };
type MutateOpts = { onSuccess?: (result: { body: { id: string } }) => void };

const createRoadmapItem = vi.fn((_vars: MutateVars, opts?: MutateOpts) =>
  opts?.onSuccess?.({ body: { id: "new-item" } }),
);

const { hooks } = vi.hoisted(() => ({
  hooks: {
    isPending: false,
    isError: false,
    error: null as { status: number; body: { message: string } } | null,
  },
}));

vi.mock("../mutations", () => ({
  useCreateRoadmapItemMutation: () => ({
    mutate: createRoadmapItem,
    isPending: hooks.isPending,
    isError: hooks.isError,
    error: hooks.error,
  }),
}));

describe("RoadmapItemFormDialog", () => {
  beforeEach(() => {
    createRoadmapItem.mockClear();
    hooks.isPending = false;
    hooks.isError = false;
    hooks.error = null;
  });

  it("creates an epic — no parentId in the POST body", async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <RoadmapItemFormDialog
        level="epic"
        onClose={onClose}
        onCreated={onCreated}
        projectId="proj-1"
      />,
    );

    await userEvent.type(screen.getByTestId(RoadmapItemFormDialogTestId.Name), "Rate limiting");
    await userEvent.click(screen.getByTestId(RoadmapItemFormDialogTestId.Save));

    expect(createRoadmapItem).toHaveBeenCalledTimes(1);
    const [vars] = createRoadmapItem.mock.calls[0]!;
    expect(vars).toEqual({
      params: { projectId: "proj-1" },
      body: { level: "epic", name: "Rate limiting", description: "", parentId: undefined },
    });
    expect(onCreated).toHaveBeenCalledWith("new-item");
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a task under the selected epic — parentId is the given epic id", async () => {
    render(
      <RoadmapItemFormDialog level="task" onClose={vi.fn()} parentId="epic-1" projectId="proj-1" />,
    );

    await userEvent.type(screen.getByTestId(RoadmapItemFormDialogTestId.Name), "Flag rollout");
    await userEvent.click(screen.getByTestId(RoadmapItemFormDialogTestId.Save));

    const [vars] = createRoadmapItem.mock.calls[0]!;
    expect(vars).toEqual({
      params: { projectId: "proj-1" },
      body: { level: "task", name: "Flag rollout", description: "", parentId: "epic-1" },
    });
  });

  it("dropping a .md file fills the description editor with its content", async () => {
    render(<RoadmapItemFormDialog level="epic" onClose={vi.fn()} projectId="proj-1" />);

    const file = new File(["# Hello\n\nBody text"], "notes.md", { type: "text/markdown" });
    dropFiles(screen.getByTestId(DropZoneTestId.Root), [file]);

    await waitFor(() => {
      expect(screen.getByTestId(MarkdownEditorTestId.Control)).toHaveValue("# Hello\n\nBody text");
    });
  });

  it("dropping a non-.md file is rejected with a visible message, not silently ignored", async () => {
    render(<RoadmapItemFormDialog level="epic" onClose={vi.fn()} projectId="proj-1" />);

    const file = new File(["hi"], "notes.txt", { type: "text/plain" });
    dropFiles(screen.getByTestId(DropZoneTestId.Root), [file]);

    await waitFor(() => {
      expect(screen.getByText("Podporovány jsou jen .md soubory")).toBeInTheDocument();
    });
    expect(screen.getByTestId(MarkdownEditorTestId.Control)).toHaveValue("");
  });

  it("surfaces the server's 422 message rather than swallowing it", async () => {
    hooks.isError = true;
    hooks.error = { status: 422, body: { message: "parentId neodkazuje na existující epik" } };
    render(
      <RoadmapItemFormDialog level="task" onClose={vi.fn()} parentId="gone" projectId="proj-1" />,
    );

    expect(screen.getByTestId(RoadmapItemFormDialogTestId.Error)).toHaveTextContent(
      "parentId neodkazuje na existující epik",
    );
  });

  it("the Save button is disabled until a name is entered", () => {
    render(<RoadmapItemFormDialog level="epic" onClose={vi.fn()} projectId="proj-1" />);
    expect(screen.getByTestId(RoadmapItemFormDialogTestId.Save)).toBeDisabled();
  });
});
