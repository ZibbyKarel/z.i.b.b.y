import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { CommandLineTestId } from "../components/CommandLine/CommandLine";
import { NewTaskScreen } from "./NewTaskScreen";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: [{ id: "zibby", name: "Zibby Web", path: "/work/zibby" }] }),
}));
vi.mock("../components/TaskAttachments", () => ({
  TaskAttachments: () => null,
}));

vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "koder", name: "Kodér", instructions: "x" }] }),
  getAgentsQueryKey: () => ["agents"],
}));

vi.mock("../../workflows", () => ({
  useWorkflowsQuery: () => ({
    // Owned by "dev" so the Development department is @-taggable (roster-only).
    data: [{ id: "coloring-book", name: "Coloring Book", phases: [], department: "dev" }],
  }),
}));
// The real seed for both the entry select (useDepartmentLookup) and the @ picker.
vi.mock("../../departments/queries/useDepartmentsQuery", async () => {
  const { DEPARTMENTS } = await import("@zibby/contracts");
  return { useDepartmentsQuery: () => ({ data: DEPARTMENTS }) };
});

const invalidate = vi.fn();
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}));
vi.mock("../../todo/queries/useTodoQuery", () => ({ getTodoQueryKey: () => ["todo"] }));

const { inbox, processMutate } = vi.hoisted(() => ({
  inbox: { data: undefined as unknown, isPending: false },
  processMutate: vi.fn(),
}));
vi.mock("../../inbox/queries", () => ({ useInboxItemsQuery: () => inbox }));
vi.mock("../../inbox/mutations", () => ({
  useProcessInboxItemMutation: () => ({ mutate: processMutate, isPending: false }),
}));

const ISSUE = {
  id: "j1-acme-5",
  projectId: "acme",
  project: { id: "acme", name: "Acme Shop" },
  name: "Checkout breaks",
  description: "Steps to reproduce.",
  source: { kind: "jira", externalKey: "ACME-5", url: "https://jira.example/browse/ACME-5" },
  runs: [],
};

const classifyMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("../mutations", () => ({
  useClassifyTaskMutation: () => ({ mutate: classifyMutate, data: undefined }),
  useCreateTaskMutation: () => ({ mutate: createMutate, isPending: false }),
}));

describe("NewTaskScreen (ZB-04b)", () => {
  beforeEach(() => {
    push.mockClear();
    classifyMutate.mockClear();
    createMutate.mockReset();
    invalidate.mockClear();
    processMutate.mockReset();
    inbox.data = undefined;
    inbox.isPending = false;
    searchParams = new URLSearchParams();
  });

  it("disables submit until the brief is filled", () => {
    render(<NewTaskScreen />);
    expect(screen.getByText("Vytvořit úkol")).toBeDisabled();
  });

  it("submits without a title — the server derives one (TODO 42)", () => {
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Zadání"), { target: { value: "Do the thing" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ text: "Do the thing", title: undefined }),
      }),
      expect.anything(),
    );
  });

  it("sends a whitespace-only title as undefined", () => {
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Zadání"), { target: { value: "Do the thing" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ title: undefined }) }),
      expect.anything(),
    );
  });

  it("submits the task with the typed title and brief", () => {
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "Ship it" } });
    fireEvent.change(screen.getByLabelText("Zadání"), { target: { value: "Do the thing" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ title: "Ship it", text: "Do the thing" }),
      }),
      expect.anything(),
    );
  });

  it("navigates back to the tasks list on cancel", () => {
    render(<NewTaskScreen />);
    fireEvent.click(screen.getByText("Zrušit"));
    expect(push).toHaveBeenCalledWith("/work/tasks");
  });

  it("prefills the brief and a valid department entry from the chat dock's CREATE TASK (ZB-12)", () => {
    searchParams = new URLSearchParams({ text: "Draft the release notes", entry: "dev" });
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "Notes" } });
    expect(screen.getByLabelText("Zadání")).toHaveValue("Draft the release notes");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          text: "Draft the release notes",
          target: expect.objectContaining({ kind: "department", id: "dev" }),
        }),
      }),
      expect.anything(),
    );
  });

  it("ignores an unknown entry and falls back to automatic", () => {
    searchParams = new URLSearchParams({ text: "x y z", entry: "not-a-department" });
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: { kind: string } };
    expect(body.target?.kind).not.toBe("department");
  });

  it("sends an @-mentioned agent as the explicit target", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "fix it @Kod");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-koder`));
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          target: expect.objectContaining({ kind: "agent", id: "koder" }),
        }),
      }),
      expect.anything(),
    );
  });

  it("takes a #-picked project as the task's project (its path joins the dispatched paths)", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "fix it #Zib");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-project-zibby`));
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { paths: string[]; target?: unknown };
    expect(body.paths).toContain("/work/zibby");
    expect(body.target).toBeUndefined();
  });

  it("an @-picked multi-word workflow sets the target select and is sent as the workflow target", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "make one @Color");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-workflow-coloring-book`));
    expect(screen.getByTestId(CommandLineTestId.Input)).toHaveValue("make one @Coloring Book ");
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Coloring Book");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          target: expect.objectContaining({
            kind: "workflow",
            id: "coloring-book",
            name: "Coloring Book",
          }),
        }),
      }),
      expect.anything(),
    );
  });

  it("a typed (not picked) @Coloring Book sets the target select and is sent as the workflow target", () => {
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    fireEvent.change(screen.getByTestId(CommandLineTestId.Input), {
      target: { value: "make one @Coloring Book " },
    });
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Coloring Book");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: unknown };
    expect(body.target).toMatchObject({ kind: "workflow", id: "coloring-book" });
  });

  it("deleting the @-tag reverts the target select to the entry and drops the target", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "go @Kod");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-koder`));
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Kodér");
    fireEvent.change(screen.getByTestId(CommandLineTestId.Input), { target: { value: "go " } });
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Automaticky");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: unknown };
    expect(body.target).toBeUndefined();
  });

  it("a department @-tag lands the select on that department's existing option", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "go @Devel");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-department-dev`));
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Development");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: unknown };
    expect(body.target).toMatchObject({ kind: "department", id: "dev" });
  });

  it("deleting an @-tag reverts the select to a manually picked entry, not automatic", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.click(screen.getByLabelText("Vstup"));
    await user.click(screen.getByRole("option", { name: /dev/i }));
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Development");

    await user.type(screen.getByTestId(CommandLineTestId.Input), "go @Kod");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-koder`));
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Kodér");

    fireEvent.change(screen.getByTestId(CommandLineTestId.Input), { target: { value: "go " } });
    expect(screen.getByLabelText("Vstup")).toHaveTextContent("Development");
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: unknown };
    expect(body.target).toMatchObject({ kind: "department", id: "dev" });
  });

  it("a manual entry pick overrides an active @-tag", async () => {
    const user = userEvent.setup();
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    await user.type(screen.getByTestId(CommandLineTestId.Input), "go @Kod");
    await user.click(screen.getByTestId(`${CommandLineTestId.MentionItem}-agent-koder`));
    await user.click(screen.getByLabelText("Vstup"));
    await user.click(screen.getByRole("option", { name: /dev/i }));
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { target?: unknown };
    expect(body.target).toMatchObject({ kind: "department", id: "dev" });
  });

  it("seeds the title from ?title= (TODO 17)", () => {
    searchParams = new URLSearchParams({ text: "Do it", title: "Do it now" });
    render(<NewTaskScreen />);
    expect(screen.getByLabelText("Název (volitelný)")).toHaveValue("Do it now");
  });

  it("sends ?todo= as todoId and refreshes the TODO list before navigating", () => {
    searchParams = new URLSearchParams({ text: "Do it", title: "T", todo: "todo_7" });
    createMutate.mockImplementation((_vars, opts) =>
      opts.onSuccess({ body: { task: { id: "task-1" } } }),
    );
    render(<NewTaskScreen />);
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ todoId: "todo_7" }) }),
      expect.anything(),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todo"] });
    expect(push).toHaveBeenCalledWith("/work/tasks/task-1");
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      push.mock.invocationCallOrder[0] as number,
    );
  });

  it("omits todoId when there is no ?todo=", () => {
    render(<NewTaskScreen />);
    fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Zadání"), { target: { value: "x y z" } });
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { todoId?: string };
    expect(body.todoId).toBeUndefined();
  });

  it("adopts a typed @Agent in the prefilled brief as the explicit target", () => {
    searchParams = new URLSearchParams({ text: "fix it @Kodér", title: "T" });
    render(<NewTaskScreen />);
    fireEvent.click(screen.getByText("Vytvořit úkol"));
    const body = createMutate.mock.calls[0]?.[0]?.body as { text: string; target?: unknown };
    expect(body.text).toBe("fix it @Kodér");
    expect(body.target).toEqual(expect.objectContaining({ kind: "agent", id: "koder" }));
  });

  describe("?issue= — process an issue as an edited task (TODO 7)", () => {
    beforeEach(() => {
      searchParams = new URLSearchParams({ issue: "acme/j1-acme-5" });
      inbox.data = { items: [ISSUE] };
    });

    it("prefills the title, the brief, the issue's project and shows the linked issue", () => {
      render(<NewTaskScreen />);
      expect(screen.getByLabelText("Název (volitelný)")).toHaveValue(
        "Implementation of issue ACME-5",
      );
      expect(screen.getByLabelText("Zadání")).toHaveValue(
        "Issue ACME-5\nhttps://jira.example/browse/ACME-5\n\nSteps to reproduce.",
      );
      expect(screen.getByLabelText("Projekt")).toHaveTextContent("Acme Shop");
      expect(screen.getByText("Propojené issue ACME-5")).toBeInTheDocument();
    });

    it("submits through the inbox process endpoint with the edits, never the plain create", () => {
      render(<NewTaskScreen />);
      fireEvent.change(screen.getByLabelText("Název (volitelný)"), { target: { value: "Fix it" } });
      fireEvent.change(screen.getByLabelText("Zadání"), { target: { value: "Edited brief" } });
      fireEvent.click(screen.getByText("Vytvořit úkol"));
      expect(createMutate).not.toHaveBeenCalled();
      expect(processMutate).toHaveBeenCalledWith(
        {
          body: {
            projectId: "acme",
            itemId: "j1-acme-5",
            title: "Fix it",
            text: "Edited brief",
            target: undefined,
          },
        },
        expect.anything(),
      );
    });

    it("sends a picked entry as the target", async () => {
      const user = userEvent.setup();
      render(<NewTaskScreen />);
      await user.click(screen.getByLabelText("Vstup"));
      await user.click(screen.getByRole("option", { name: /dev/i }));
      fireEvent.click(screen.getByText("Vytvořit úkol"));
      const body = processMutate.mock.calls[0]?.[0]?.body as { target?: unknown };
      expect(body.target).toMatchObject({ kind: "department", id: "dev" });
    });

    it("lands on the created task, or back on the issue when no run exists yet", () => {
      processMutate.mockImplementationOnce((_vars, opts) =>
        opts.onSuccess({
          body: { runs: [{ taskId: "task-9", startedAt: "2026-11-05T00:00:00.000Z" }] },
        }),
      );
      render(<NewTaskScreen />);
      fireEvent.click(screen.getByText("Vytvořit úkol"));
      expect(push).toHaveBeenLastCalledWith("/work/tasks/task-9");

      processMutate.mockImplementationOnce((_vars, opts) => opts.onSuccess({ body: { runs: [] } }));
      fireEvent.click(screen.getByText("Vytvořit úkol"));
      expect(push).toHaveBeenLastCalledWith("/dashboard/inbox/issues/acme/j1-acme-5");
    });

    it("says so instead of rendering the form when the issue is not in the inbox", () => {
      inbox.data = { items: [] };
      render(<NewTaskScreen />);
      expect(screen.getByText("Issue v inboxu nenalezeno.")).toBeInTheDocument();
      expect(screen.queryByText("Vytvořit úkol")).not.toBeInTheDocument();
    });
  });
});
