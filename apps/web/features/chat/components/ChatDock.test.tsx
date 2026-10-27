import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ChatAbout, ChatMessage as ChatMessageType } from "@zibby/contracts";
import {
  ChipTestId,
  ChatDockTestId as DockFrameTestId,
  TypingDotsTestId,
} from "@zibby/design-system";
import { useEffect } from "react";
import { act, renderWithProviders, screen, within } from "../../../test/render";
import { CommandLineTestId } from "../../tasks/components/CommandLine/CommandLine";
import { ChatProvider, useChat } from "../ChatContext";
import { ChatMessageTestId } from "./ChatMessage";
import { ChatDock, ChatDockTestId } from "./ChatDock";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// `CommandLine`'s `@`-mention catalogs — the same minimal mock set its own test uses.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../workflows/queries/useWorkflowsQuery", () => ({
  useWorkflowsQuery: () => ({ data: [] }),
  getWorkflowsQueryKey: () => ["workflows"],
}));
vi.mock("../../departments/queries/useDepartmentsQuery", () => ({
  useDepartmentsQuery: () => ({ data: [] }),
  getDepartmentsQueryKey: () => ["departments"],
}));
const uploadMutateAsync = vi
  .fn()
  .mockResolvedValue({ attachmentSetId: "set_1", files: [{ name: "a.txt", size: 2 }] });
vi.mock("../../tasks/mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));
vi.mock("../../teams", () => ({
  useTeamsQuery: () => ({ data: [{ id: "devrel", name: "DevRel" }] }),
}));
vi.mock("../../companies", () => ({
  useCompaniesQuery: () => ({ data: [{ id: "acme", name: "Acme Corp" }] }),
}));
vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "zibby", name: "Zibby Web" }] }),
}));
vi.mock("../../skills", () => ({
  useSkillsQuery: () => ({ data: [{ id: "tdd", name: "Test Driven", glyph: "spark" }] }),
}));
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
type HandoffOptions = { onSuccess: (res: unknown) => void; onError: () => void };
const handoffMutate = vi.fn((_vars: unknown, opts: HandoffOptions) =>
  opts.onSuccess({ status: 200, body: { text: "HANDOFF BRIEF", compacted: false } }),
);
vi.mock("../mutations/useCreateChatHandoffMutation", () => ({
  useCreateChatHandoffMutation: () => ({ mutate: handoffMutate, isPending: false }),
}));
vi.mock("../mutations/useSynthesizeSpeechMutation", () => ({
  useSynthesizeSpeechMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const streamState: {
  turnId: string | null;
  text: string;
  toolEvents: unknown[];
  streaming: boolean;
  error: string | null;
} = { turnId: null, text: "", toolEvents: [], streaming: false, error: null };
vi.mock("../hooks/useChatStream", () => ({ useChatStream: () => streamState }));

const voiceState = {
  supported: false,
  active: false,
  listening: false,
  interim: "",
  toggle: vi.fn(),
  off: vi.fn(),
};
const voiceOptions: { suspended?: boolean; onFinal: (text: string) => void }[] = [];
vi.mock("../hooks/useVoiceMode", () => ({
  useVoiceMode: (opts: { suspended?: boolean; onFinal: (text: string) => void }) => {
    voiceOptions.push(opts);
    return voiceState;
  },
}));

/** Opens the dock (optionally pre-scoped) on mount, the way the shell / a
 *  department page would. */
function Opener({ department, about }: { department?: boolean; about?: ChatAbout }) {
  const { open, openAbout } = useChat();
  useEffect(() => {
    open(department ? { kind: "department", id: "dev", name: "Development" } : undefined);
    if (about) openAbout(about);
  }, [open, openAbout, department, about]);
  return null;
}

function renderDock(opts: { department?: boolean; open?: boolean; about?: ChatAbout } = {}) {
  return renderWithProviders(
    <ChatProvider>
      {opts.open !== false && <Opener about={opts.about} department={opts.department} />}
      <ChatDock />
    </ChatProvider>,
  );
}

async function typeAndSend(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId(CommandLineTestId.Input), text);
  await user.click(screen.getByTestId(ChatDockTestId.Send));
}

describe("ChatDock (ZB-12)", () => {
  beforeEach(() => {
    push.mockClear();
    sendMutate.mockClear();
    handoffMutate.mockClear();
    voiceOptions.length = 0;
    transcriptState.data = undefined;
    transcriptState.isSuccess = false;
    transcriptState.isError = false;
    streamState.text = "";
    streamState.toolEvents = [];
    streamState.streaming = false;
    window.localStorage.clear();
  });

  it("renders collapsed with no target chip for the automatic default and the attach control back (D-020)", () => {
    renderDock({ open: false });
    expect(screen.getByTestId(DockFrameTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(DockFrameTestId.Transcript)).not.toBeInTheDocument();
    // No chip for the obvious default (item 28) — only an explicit explicit
    // target earns one (see the department-scoped test below).
    expect(screen.queryByTestId(ChatDockTestId.TargetChip)).not.toBeInTheDocument();
    // D-020: the chat send contract now carries attachmentSetId — the attach
    // control is back.
    expect(screen.getByTestId(CommandLineTestId.Attach)).toBeInTheDocument();
  });

  describe("about chip (todo-29)", () => {
    const about: ChatAbout = { kind: "pr", id: "u", label: "PR #7 · Fix login", details: "d" };

    it("shows the chip and sends about on every turn", async () => {
      renderDock({ about });
      expect(screen.getByTestId(ChatDockTestId.AboutChip)).toHaveTextContent("PR #7 · Fix login");
      await typeAndSend("one");
      await typeAndSend("two");
      expect(sendMutate).toHaveBeenCalledTimes(2);
      for (const call of sendMutate.mock.calls) {
        expect((call[0] as { body: { about?: ChatAbout } }).body.about).toEqual(about);
      }
    });

    it("clearing the chip drops about from the next send", async () => {
      renderDock({ about });
      await userEvent
        .setup()
        .click(within(screen.getByTestId(ChatDockTestId.AboutChip)).getByTestId(ChipTestId.Close));
      expect(screen.queryByTestId(ChatDockTestId.AboutChip)).not.toBeInTheDocument();
      await typeAndSend("go");
      expect(sendMutate.mock.calls[0]?.[0]?.body).not.toHaveProperty("about");
    });

    it("renders both chips with a department target", () => {
      renderDock({ about, department: true });
      expect(screen.getByTestId(ChatDockTestId.AboutChip)).toBeInTheDocument();
      expect(screen.getByTestId(ChatDockTestId.TargetChip)).toBeInTheDocument();
    });
  });

  it("sends through the classifier (no mentions) by default", async () => {
    renderDock();
    await typeAndSend("Status of the release?");
    expect(sendMutate).toHaveBeenCalledTimes(1);
    const body = sendMutate.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.text).toBe("Status of the release?");
    expect(body.conversationId).toEqual(expect.stringMatching(/^conv_/));
    expect(body).not.toHaveProperty("mentions");
    expect(body).not.toHaveProperty("target");
  });

  it("appends dictation to the composer and sends it only on Enter", async () => {
    renderDock();
    const onFinal = voiceOptions.at(-1)?.onFinal;
    act(() => onFinal?.("Ahoj"));
    act(() => onFinal?.("světe"));
    const input = screen.getByTestId(CommandLineTestId.Input);
    expect(input).toHaveValue("Ahoj světe");
    expect(sendMutate).not.toHaveBeenCalled();
    await userEvent.setup().type(input, "{Enter}");
    expect(sendMutate).toHaveBeenCalledTimes(1);
    expect((sendMutate.mock.calls[0]?.[0]?.body as { text: string }).text).toBe("Ahoj světe");
  });

  it("sends the dock's department scope as the turn's sole mention (O-20 / D-020)", async () => {
    renderDock({ department: true });
    expect(screen.getByTestId(ChatDockTestId.TargetChip)).toHaveTextContent("Development");
    await typeAndSend("Ship the hotfix");
    const body = sendMutate.mock.calls[0]?.[0]?.body as {
      mentions?: Array<{ kind: string; id: string }>;
    };
    expect(body.mentions).toEqual([expect.objectContaining({ kind: "department", id: "dev" })]);
  });

  it("# tags a team/project/company and / a skill onto the send body — one turn only", async () => {
    renderDock();
    const user = userEvent.setup();
    const input = screen.getByTestId(CommandLineTestId.Input);
    for (const [trigger, item] of [
      ["#", "team-devrel"],
      ["#", "project-zibby"],
      ["#", "company-acme"],
      ["/", "skill-tdd"],
    ] as const) {
      await user.type(input, trigger);
      await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-${item}`));
    }
    await user.type(input, "go");
    await user.click(screen.getByTestId(ChatDockTestId.Send));
    expect(sendMutate).toHaveBeenCalledTimes(1);
    expect(sendMutate.mock.calls[0]?.[0]?.body).toEqual(
      expect.objectContaining({
        teamId: "devrel",
        projectId: "zibby",
        companyId: "acme",
        skillId: "tdd",
      }),
    );

    await typeAndSend("again");
    expect(sendMutate).toHaveBeenCalledTimes(2);
    const second = sendMutate.mock.calls[1]?.[0]?.body as Record<string, unknown>;
    for (const key of ["teamId", "projectId", "companyId", "skillId"]) {
      expect(second).not.toHaveProperty(key);
    }
  });

  it("forwards the uploaded attachmentSetId (D-020)", async () => {
    const user = userEvent.setup();
    renderDock();
    const file = new File(["hi"], "a.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId(CommandLineTestId.FileInput), file);
    await screen.findByTestId(`${CommandLineTestId.FileTile}-a.txt`);
    await typeAndSend("zkontroluj přílohu");
    const body = sendMutate.mock.calls[0]?.[0]?.body as { attachmentSetId?: string };
    expect(body.attachmentSetId).toBe("set_1");
  });

  it("clearing the target chip falls back to automatic routing", async () => {
    const user = userEvent.setup();
    renderDock({ department: true });
    await user.click(
      within(screen.getByTestId(ChatDockTestId.TargetChip)).getByTestId(ChipTestId.Close),
    );
    expect(screen.queryByTestId(ChatDockTestId.TargetChip)).not.toBeInTheDocument();
    await typeAndSend("hello");
    const body = sendMutate.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("mentions");
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
    // The whole conversation up to the clicked reply is handed off — not just its text.
    expect(handoffMutate).toHaveBeenCalledWith(
      { body: { conversationId: "conv_server", upToMessageId: "a1" } },
      expect.anything(),
    );
    expect(push).toHaveBeenCalledWith(
      `/work/tasks/new?${new URLSearchParams({ text: "HANDOFF BRIEF" }).toString()}`,
    );
  });

  it("CREATE TASK falls back to the reply plus a conversation pointer when the hand-off fails", async () => {
    transcriptState.data = {
      conversationId: "conv_server",
      messages: [{ id: "a1", role: "assistant", text: "Fix it", at: "2026-09-25T10:00:00Z" }],
    };
    handoffMutate.mockImplementationOnce((_vars, opts) => opts.onError());
    const user = userEvent.setup();
    renderDock();
    await user.click(screen.getByTestId(ChatMessageTestId.CreateTaskButton));
    expect(push).toHaveBeenCalledWith(
      `/work/tasks/new?${new URLSearchParams({ text: "Fix it\n\nContext: ZIBBY chat conversation conv_server." }).toString()}`,
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
    expect(push).toHaveBeenCalledWith("/work/tasks/new?text=HANDOFF+BRIEF&entry=dev");
  });

  it("switches the mic off when the dock closes (CLOSE or Esc)", async () => {
    renderDock();
    voiceState.off.mockClear();
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.queryByTestId(DockFrameTestId.Transcript)).not.toBeInTheDocument();
    expect(voiceState.off).toHaveBeenCalled();
  });

  it("keeps the mic idle-gated: voice is not suspended while idle", () => {
    renderDock();
    expect(voiceOptions.at(-1)?.suspended).toBe(false);
  });

  it("shows the typing-dots placeholder for the gap before any token has streamed in (item 28)", async () => {
    streamState.streaming = true;
    const user = userEvent.setup();
    renderDock();
    await user.type(screen.getByTestId(CommandLineTestId.Input), "hello");
    await user.click(screen.getByTestId(ChatDockTestId.Send));
    expect(screen.getByRole("status", { name: "ZIBBY píše…" })).toBeInTheDocument();
    expect(screen.getAllByTestId(TypingDotsTestId.Dot)).toHaveLength(3);
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
