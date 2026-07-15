import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatDockTestId } from "./ChatDock";
import { ChatQuickNoteTestId } from "./ChatQuickNote";
import { ChatQuickTaskTestId } from "./ChatQuickTask";
import { ChatBottomBar, ChatBottomBarTestId } from "./ChatBottomBar";

// `ChatDock` (the chat slot) reads the agent/pipeline/subsystem catalogs for its
// `CommandLine`'s `@`-mention picker, the attachment-upload mutation, its own
// send mutation, the chat stream and voice-mode hooks — the same minimal mock
// set `ChatDock.test.tsx` uses to mount it standalone, without hitting the
// network. `ChatQuickTask`/`ChatQuickNote` (the other two slots) each mock
// their own create mutation the same way their own test files do.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({ data: [] }),
  getSubsystemsQueryKey: () => ["subsystems"],
}));
vi.mock("../../tasks/mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useChatStream", () => ({
  useChatStream: () => ({
    turnId: null,
    text: "",
    toolEvents: [],
    streaming: false,
    error: null,
  }),
}));
vi.mock("../hooks/useVoiceMode", () => ({
  useVoiceMode: () => ({
    supported: false,
    active: false,
    listening: false,
    interim: "",
    toggle: vi.fn(),
  }),
}));
vi.mock("../../tasks/mutations", () => ({
  useCreateTaskMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../memory/mutations", () => ({
  useCreateNoteMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function ChatBottomBarHarness() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  return (
    <ChatBottomBar
      conversationId="c1"
      messages={messages}
      onMessagesChange={setMessages}
      onNewChat={() => setMessages([])}
    />
  );
}

describe("ChatBottomBar", () => {
  it("renders the chat slot expanded by default, task/note as icon toggles", () => {
    renderWithProviders(<ChatBottomBarHarness />);
    expect(screen.getByTestId(ChatBottomBarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatDockTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.TaskSlot)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.NoteSlot)).toBeInTheDocument();
    // The chat slot is expanded, so it has no icon toggle of its own.
    expect(screen.queryByTestId(ChatBottomBarTestId.ChatSlot)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatQuickTaskTestId.Root)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatQuickNoteTestId.Root)).not.toBeInTheDocument();
  });

  it("clicking the task toggle switches the expanded slot to task", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatBottomBarHarness />);

    await user.click(screen.getByTestId(ChatBottomBarTestId.TaskSlot));

    expect(screen.getByTestId(ChatQuickTaskTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.ChatSlot)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.NoteSlot)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatDockTestId.Root)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatBottomBarTestId.TaskSlot)).not.toBeInTheDocument();
  });

  it("clicking the note toggle switches the expanded slot to note", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatBottomBarHarness />);

    await user.click(screen.getByTestId(ChatBottomBarTestId.NoteSlot));

    expect(screen.getByTestId(ChatQuickNoteTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.ChatSlot)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.TaskSlot)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatDockTestId.Root)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatBottomBarTestId.NoteSlot)).not.toBeInTheDocument();
  });

  it("a child's onClose collapses the bar to all-icons", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatBottomBarHarness />);

    await user.click(screen.getByTestId(ChatDockTestId.Close));

    expect(screen.getByTestId(ChatBottomBarTestId.ChatSlot)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.TaskSlot)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.NoteSlot)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatDockTestId.Root)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatQuickTaskTestId.Root)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatQuickNoteTestId.Root)).not.toBeInTheDocument();
  });

  it("reopening a slot after collapse re-expands it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatBottomBarHarness />);

    await user.click(screen.getByTestId(ChatDockTestId.Close));
    await user.click(screen.getByTestId(ChatBottomBarTestId.NoteSlot));

    expect(screen.getByTestId(ChatQuickNoteTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.ChatSlot)).toBeInTheDocument();
    expect(screen.getByTestId(ChatBottomBarTestId.TaskSlot)).toBeInTheDocument();
  });
});
