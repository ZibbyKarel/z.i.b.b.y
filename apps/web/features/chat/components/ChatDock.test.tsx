import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { renderWithProviders, screen, within } from "../../../test/render";
import { CommandLineTestId } from "../../tasks/components/CommandLine/CommandLine";
import { VoiceToggleButtonTestId } from "./VoiceToggleButton";
import { ChatDock, ChatDockTestId } from "./ChatDock";

// `CommandLine` (rendered chrome-less, `showAttach`) reads the agent/pipeline/
// subsystem catalogs for its `@`-mention picker and the attachment-upload
// mutation for drag/drop — the same minimal mock set `CommandLine.test.tsx`
// itself uses to mount it standalone, without hitting the network.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "builder", name: "Builder", glyph: "hammer" }] }),
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

// The dock's own hooks are mocked directly (unit-style — unlike `ChatScreen.test.tsx`,
// which drives the real `useChatStream`/`useVoiceMode` through a mocked `EventSource`/
// `SpeechRecognition`) so each test controls exactly the stream/voice state it needs.
const sendMutate = vi.fn();
const sendState = { isPending: false };
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate: sendMutate, isPending: sendState.isPending }),
}));

const streamState = {
  turnId: null as string | null,
  text: "",
  toolEvents: [] as unknown[],
  streaming: false,
  error: null as string | null,
};
vi.mock("../hooks/useChatStream", () => ({
  useChatStream: () => streamState,
}));

const voiceToggle = vi.fn();
const voiceState = {
  supported: true,
  active: false,
  listening: false,
  interim: "",
  toggle: voiceToggle,
};
vi.mock("../hooks/useVoiceMode", () => ({
  useVoiceMode: () => voiceState,
}));

function ChatDockHarness({ initialMessages = [] }: { initialMessages?: ChatMessageType[] }) {
  const [messages, setMessages] = useState<ChatMessageType[]>(initialMessages);
  return (
    <ChatDock
      conversationId="c1"
      messages={messages}
      onMessagesChange={setMessages}
      onNewChat={() => setMessages([])}
    />
  );
}

describe("ChatDock", () => {
  beforeEach(() => {
    sendMutate.mockClear();
    sendState.isPending = false;
    streamState.turnId = null;
    streamState.text = "";
    streamState.toolEvents = [];
    streamState.streaming = false;
    streamState.error = null;
    voiceToggle.mockClear();
    voiceState.supported = true;
    voiceState.active = false;
    voiceState.listening = false;
    voiceState.interim = "";
  });

  it("renders the history area and the composer", () => {
    renderWithProviders(<ChatDockHarness />);
    expect(screen.getByTestId(ChatDockTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatDockTestId.History)).toBeInTheDocument();
    expect(screen.getByTestId(ChatDockTestId.Composer)).toBeInTheDocument();
    expect(screen.getByTestId(CommandLineTestId.Input)).toBeInTheDocument();
  });

  it("renders no placeholder text in an empty thread's history", () => {
    renderWithProviders(<ChatDockHarness />);
    expect(screen.getByTestId(ChatDockTestId.History)).toBeEmptyDOMElement();
  });

  it("renders seeded messages via ChatTranscript", () => {
    renderWithProviders(
      <ChatDockHarness
        initialMessages={[
          { id: "m1", role: "user", text: "Ahoj ZIBBY", at: "2026-07-15T10:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByText("Ahoj ZIBBY")).toBeInTheDocument();
  });

  it("attach is present in the composer row", () => {
    renderWithProviders(<ChatDockHarness />);
    expect(screen.getByTestId(CommandLineTestId.Attach)).toBeInTheDocument();
  });

  it("mic is rendered inside the composer row, alongside attach", () => {
    renderWithProviders(<ChatDockHarness />);
    const composer = screen.getByTestId(ChatDockTestId.Composer);
    expect(within(composer).getByTestId(VoiceToggleButtonTestId.Root)).toBeInTheDocument();
    expect(within(composer).getByTestId(CommandLineTestId.Attach)).toBeInTheDocument();
  });

  it("send is icon-only (no visible label) and still submits", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatDockHarness />);

    const send = screen.getByTestId(ChatDockTestId.Send);
    expect(send).toHaveAccessibleName(/odeslat/i);
    expect(send.textContent).toBe("");

    await user.type(screen.getByTestId(CommandLineTestId.Input), "Jak se máš");
    await user.click(send);

    // Appended optimistically, then dispatched through the same shape ChatScreen's
    // `send` handler posts.
    expect(screen.getByText("Jak se máš")).toBeInTheDocument();
    expect(sendMutate).toHaveBeenCalledWith({ body: { conversationId: "c1", text: "Jak se máš" } });
  });

  it("send stays disabled until there's a draft", () => {
    renderWithProviders(<ChatDockHarness />);
    expect(screen.getByTestId(ChatDockTestId.Send)).toBeDisabled();
  });

  it("hides New chat on an empty thread and fires onNewChat once there's a transcript", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatDockHarness />);

    expect(screen.queryByTestId(ChatDockTestId.NewChat)).not.toBeInTheDocument();

    await user.type(screen.getByTestId(CommandLineTestId.Input), "Ahoj");
    await user.click(screen.getByTestId(ChatDockTestId.Send));
    expect(screen.getByText("Ahoj")).toBeInTheDocument();

    expect(screen.getByTestId(ChatDockTestId.NewChat)).toBeInTheDocument();
    await user.click(screen.getByTestId(ChatDockTestId.NewChat));
    expect(screen.queryByText("Ahoj")).not.toBeInTheDocument();
    expect(screen.queryByTestId(ChatDockTestId.NewChat)).not.toBeInTheDocument();
  });

  it("mic toggle calls the voice-mode toggle", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatDockHarness />);

    await user.click(screen.getByTestId(VoiceToggleButtonTestId.Root));
    expect(voiceToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render the mic toggle when STT is unsupported", () => {
    voiceState.supported = false;
    renderWithProviders(<ChatDockHarness />);
    expect(screen.queryByTestId(VoiceToggleButtonTestId.Root)).not.toBeInTheDocument();
    voiceState.supported = true;
  });
});
