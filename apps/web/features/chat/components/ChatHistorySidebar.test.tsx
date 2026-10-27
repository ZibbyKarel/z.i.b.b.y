import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ListTestId } from "@zibby/design-system";
import { renderWithProviders, screen, waitFor } from "../../../test/render";
import { ChatProvider, useChat } from "../ChatContext";
import { ChatHistorySidebar, ChatHistorySidebarTestId } from "./ChatHistorySidebar";

const queryArgs: (string | undefined)[] = [];
vi.mock("../queries", () => ({
  useChatConversationsQuery: (q?: string) => {
    queryArgs.push(q);
    return {
      data: [
        {
          conversationId: "c2",
          title: "Faktura",
          messageCount: 2,
          updatedAt: "2026-10-11T09:00:00Z",
        },
        {
          conversationId: "c1",
          title: "Deploy",
          messageCount: 4,
          updatedAt: "2026-10-10T09:00:00Z",
        },
      ],
    };
  },
}));

const transcriptQuery = vi.fn().mockResolvedValue({
  status: 200,
  body: {
    conversationId: "c1",
    sessionId: null,
    messages: [{ id: "u1", role: "user", text: "Deploy", at: "2026-10-10T09:00:00Z" }],
  },
});
vi.mock("../../../state/api", () => ({
  apiClient: { chat: { getTranscript: { query: (args: unknown) => transcriptQuery(args) } } },
}));

function Probe() {
  const { conversationId, messages, about, setAbout } = useChat();
  return (
    <>
      <output data-testid="probe">{`${conversationId}:${messages.length}`}</output>
      <output data-testid="about">{about?.id ?? "none"}</output>
      <button onClick={() => setAbout({ kind: "pr", id: "p1", label: "PR" })} type="button">
        set-about
      </button>
    </>
  );
}

describe("ChatHistorySidebar", () => {
  it("lists conversations, passes the search term, and loads the picked one", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <ChatHistorySidebar />
        <Probe />
      </ChatProvider>,
    );
    expect(screen.getByTestId(`${ListTestId.Item}-c2`)).toHaveTextContent("Faktura");

    await user.type(screen.getByTestId(ChatHistorySidebarTestId.Search), "dep");
    await waitFor(() => expect(queryArgs.at(-1)).toBe("dep"));

    await user.click(screen.getByTestId(`${ListTestId.Item}-c1`));
    expect(transcriptQuery).toHaveBeenCalledWith({ query: { conversationId: "c1" } });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("c1:1"));
    expect(screen.getByTestId(`${ListTestId.Item}-c1`)).toHaveAttribute("aria-current", "page");
  });

  it("clears the chat context when an older conversation is opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <ChatHistorySidebar />
        <Probe />
      </ChatProvider>,
    );
    await user.click(screen.getByText("set-about"));
    expect(screen.getByTestId("about")).toHaveTextContent("p1");
    await user.click(screen.getByTestId(`${ListTestId.Item}-c1`));
    await waitFor(() => expect(screen.getByTestId("about")).toHaveTextContent("none"));
  });
});
