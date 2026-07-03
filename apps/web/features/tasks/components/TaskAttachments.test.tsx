import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropZoneTestId, FilePreviewTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { TaskAttachments } from "./TaskAttachments";

const mutateAsync = vi.fn().mockResolvedValue({
  attachmentSetId: "set_1",
  files: [{ name: "a.txt", size: 2 }],
});

vi.mock("../mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

describe("TaskAttachments", () => {
  it("uploads dropped files and reports the set; remove clears it", async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <TaskAttachments onChange={onChange} value={{ files: [] }} />,
    );

    const input = screen.getByTestId(DropZoneTestId.Input);
    const file = new File(["hi"], "a.txt", { type: "text/plain" });

    // react-dropzone wires its hidden input's onChange to onDrop; userEvent.upload
    // fires a real change event with FileList, which react-dropzone picks up directly.
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentSetId: "set_1",
          files: [{ name: "a.txt", size: 2 }],
        }),
      );
    });

    rerender(
      <TaskAttachments
        onChange={onChange}
        value={{ attachmentSetId: "set_1", files: [{ name: "a.txt", size: 2 }] }}
      />,
    );

    expect(screen.getByTestId(FilePreviewTestId.Name)).toHaveTextContent("a.txt");

    await userEvent.click(screen.getByTestId(FilePreviewTestId.Remove));

    expect(onChange).toHaveBeenLastCalledWith({ files: [] });
  });
});
