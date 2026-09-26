import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { ChatDockTestId, ChipTestId } from "@zibby/design-system";
import { useEffect } from "react";
import { renderWithProviders, screen, within } from "../../../test/render";
import { CommandLineTestId } from "../../tasks/components/CommandLine/CommandLine";
import { ChatProvider, useChat } from "../ChatContext";
import { ChatMessageTestId } from "./ChatMessage";
import { CooDock, CooDockTestId } from "./CooDock";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// `CommandLine`'s `@`-mention catalogs — the same minimal mock set its own test uses.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
  useDepartmentsQuery: () => ({ data: [] }),
  getDepartmentsQueryKey: () => ["departments"],
}));
vi.mock("../../tasks/mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../teams", () => ({ useTeamsQuery: () => ({ data: [] }) }));
vi.mock("../../system", () => ({ useSystemConfigQuery: () => ({ data: undefined }) }));

const transcriptState: {
  data: { conversationId: string; messages: ChatMessageType[] } | undefined;
  isSuccess: boolean;
  isError: boolean;
} = { data: undefined, isSuccess: false, isError: false };
vi.mock("../queries/useChatTranscriptQuery", () => ({
  useChatTranscriptQuery: () => transcriptState,
}));

const sendMutate = vi.fn();
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate: sendMutate, isPending: false }),
}));
vi.mock("../mutations/useSynthesizeSpeechMutation", () => ({
  useSynthesizeSpeechMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const streamState = { turnId: null, text: "", toolEvents: [], streaming: false, error: null };
vi.mock("../hooks/useChatStream", () => ({ useChatStream: () => streamState }));

const voiceState = {
  supported: false,
  active: false,
  listening: false,
  interim: "",
  toggle: vi.fn(),
};
const voiceOptions: { suspended?: boolean }[] = [];
vi.mock("../hooks/useVoiceMode", () => ({
  useVoiceMode: (opts: { suspended?: boolean }) => {
    voiceOptions.push(opts);
    return voiceState;
  },
}));

/** Opens the dock (optionally pre-scoped) on mount, the way the shell / a
 *  department page would. */
function Opener({ department }: { department?: boolean }) {
  const { open } = useChat();
  useEffect(() => {
    open(department ? { kind: "department", id: "dev", name: "Development" } : undefined);
  }, [open, department]);
  return null;
}

function renderDock(opts: { department?: boolean; open?: boolean } = {}) {
  return renderWithProviders(
    <ChatProvider>
      {opts.open !== false && <Opener department={opts.department} />}
      <CooDock />
    </ChatProvider>,
  );
}

async function typeAndSend(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId(CommandLineTestId.Input), text);
  await user.click(screen.getByTestId(CooDockTestId.Send));
}

describe("CooDock (ZB-12)", () => {
  beforeEach(() => {
    push.mockClear();
    sendMutate.mockClear();
    voiceOptions.length = 0;
    transcriptState.data = undefined;
    transcriptState.isSuccess = false;
    transcriptState.isError = false;
    window.localStorage.clear();
  });

  it("renders collapsed with the COO target chip and no attach control", () => {
    renderDock({ open: false });
    expect(screen.getByTestId(ChatDockTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).not.toBeInTheDocument();
    expect(screen.getByTestId(CooDockTestId.TargetChip)).toHaveTextContent("→ COO");
    // The chat send contract has no attachment channel — never offer a silent drop.
    expect(screen.queryByTestId(CommandLineTestId.Attach)).not.toBeInTheDocument();
  });

  it("sends through the COO classifier (no target) by default", async () => {
    renderDock();
    await typeAndSend("Status of the release?");
    expect(sendMutate).toHaveBeenCalledTimes(1);
    const body = sendMutate.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.text).toBe("Status of the release?");
    expect(body.conversationId).toEqual(expect.stringMatching(/^conv_/));
    expect(body).not.toHaveProperty("target");
  });

  it("sends the explicit department target when opened from a department (O-20)", async () => {
    renderDock({ department: true });
    expect(screen.getByTestId(CooDockTestId.TargetChip)).toHaveTextContent("Development");
    await typeAndSend("Ship the hotfix");
    const body = sendMutate.mock.calls[0]?.[0]?.body as { target?: { kind: string; id: string } };
    expect(body.target).toEqual(expect.objectContaining({ kind: "department", id: "dev" }));
  });

  it("clearing the target chip falls back to the COO", async () => {
    const user = userEvent.setup();
    renderDock({ department: true });
    await user.click(
      within(screen.getByTestId(CooDockTestId.TargetChip)).getByTestId(ChipTestId.Close),
    );
    expect(screen.getByTestId(CooDockTestId.TargetChip)).toHaveTextContent("→ COO");
    await typeAndSend("hello");
    const body = sendMutate.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("target");
  });

  it("hydrates the transcript from the server's durable copy and offers CREATE TASK", async () => {
    transcriptState.data = {
      conversationId: "conv_server",
      messages: [
        {
          id: "a1",
          role: "assistant",
          text: "Write the migration notes",
          at: "2026-09-25T10:00:00Z",
        },
      ],
    };
    const user = userEvent.setup();
    renderDock();
    expect(screen.getByTestId(ChatMessageTestId.AssistantBubble)).toHaveTextContent(
      "Write the migration notes",
    );
    await user.click(screen.getByTestId(ChatMessageTestId.CreateTaskButton));
    expect(push).toHaveBeenCalledWith(
      `/work/tasks/new?${new URLSearchParams({ text: "Write the migration notes" }).toString()}`,
    );
  });

  it("CREATE TASK carries the explicit department entry", async () => {
    transcriptState.data = {
      conversationId: "conv_server",
      messages: [{ id: "a1", role: "assistant", text: "Fix it", at: "2026-09-25T10:00:00Z" }],
    };
    const user = userEvent.setup();
    renderDock({ department: true });
    await user.click(screen.getByTestId(ChatMessageTestId.CreateTaskButton));
    expect(push).toHaveBeenCalledWith("/work/tasks/new?text=Fix+it&entry=dev");
  });

  it("keeps the mic idle-gated: voice is not suspended while idle", () => {
    renderDock();
    expect(voiceOptions.at(-1)?.suspended).toBe(false);
  });

  it("still sends from the collapsed dock when the server has no active thread (mints after hydration settles)", async () => {
    transcriptState.isError = true;
    renderDock({ open: false });
    await typeAndSend("first message ever");
    expect(sendMutate).toHaveBeenCalledTimes(1);
    const body = sendMutate.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.conversationId).toEqual(expect.stringMatching(/^conv_/));
  });
});
