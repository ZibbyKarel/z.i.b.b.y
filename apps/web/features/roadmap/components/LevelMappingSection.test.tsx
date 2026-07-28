import type { LevelMapping, LevelMappingEntry } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { LevelMappingSection } from "./LevelMappingSection";

const seeded: LevelMapping = {
  entries: [
    { kind: "jira", externalLevel: "Epic", target: "epic" },
    { kind: "jira", externalLevel: "Story", target: "task" },
    { kind: "github", externalLevel: "Milestone", target: "epic" },
    { kind: "github", externalLevel: "Issue", target: "task" },
  ],
};

const { hooks } = vi.hoisted(() => ({
  hooks: {
    mapping: {
      data: undefined as LevelMapping | undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    setMapping: vi.fn(),
  },
}));

vi.mock("../queries", () => ({
  useLevelMappingQuery: () => hooks.mapping,
}));
vi.mock("../mutations", () => ({
  useSetLevelMappingMutation: () => ({ mutate: hooks.setMapping, isPending: false }),
}));

/** Open a row's target Dropdown (wrapped in an indexed test-id div) and pick an option. */
async function pickTarget(testId: string, optionText: string) {
  const wrapper = screen.getByTestId(testId);
  await userEvent.click(within(wrapper).getByTestId(DropdownTestId.Trigger));
  const panel = screen.getByTestId(DropdownTestId.Panel);
  await userEvent.click(within(panel).getByText(optionText));
}

describe("LevelMappingSection", () => {
  beforeEach(() => {
    hooks.mapping = { data: seeded, isPending: false, isError: false, refetch: vi.fn() };
    hooks.setMapping.mockClear();
  });

  it("renders the seeded rows for the default (Jira) tab", () => {
    render(<LevelMappingSection />);
    expect(screen.getByTestId("level-mapping-jira-level-0")).toHaveValue("Epic");
    expect(screen.getByTestId("level-mapping-jira-level-1")).toHaveValue("Story");
    expect(screen.queryByTestId("level-mapping-github-level-0")).not.toBeInTheDocument();
  });

  it("switching to the GitHub tab shows GitHub's rows instead of Jira's", async () => {
    render(<LevelMappingSection />);
    await userEvent.click(screen.getByTestId("tabs-tab-github"));
    expect(screen.getByTestId("level-mapping-github-level-0")).toHaveValue("Milestone");
    expect(screen.getByTestId("level-mapping-github-level-1")).toHaveValue("Issue");
    expect(screen.queryByTestId("level-mapping-jira-level-0")).not.toBeInTheDocument();
  });

  it("adding a row appends a blank entry defaulted to task", async () => {
    render(<LevelMappingSection />);
    await userEvent.click(screen.getByTestId("level-mapping-jira-add"));
    expect(screen.getByTestId("level-mapping-jira-level-2")).toHaveValue("");
  });

  it("removing a row drops only that row, keeping the others in order", async () => {
    render(<LevelMappingSection />);
    await userEvent.click(screen.getByTestId("level-mapping-jira-remove-0"));
    expect(screen.queryByTestId("level-mapping-jira-level-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("level-mapping-jira-level-0")).toHaveValue("Story");
  });

  it("changing a row's target picks the new value from the Dropdown", async () => {
    render(<LevelMappingSection />);
    await pickTarget("level-mapping-jira-target-1", "Ignorovat");
    await userEvent.click(screen.getByTestId("level-mapping-save"));

    const [call] = hooks.setMapping.mock.calls[0]!;
    const entries: LevelMappingEntry[] = call.body.entries;
    expect(entries.find((e) => e.kind === "jira" && e.externalLevel === "Story")?.target).toBe(
      "ignore",
    );
  });

  // The exact bug the plan calls out: PUT replaces the whole `{ entries }` document,
  // so editing one kind's rows must never drop the other kind's entries from the body.
  it("saving from the Jira tab preserves GitHub's entries untouched", async () => {
    render(<LevelMappingSection />);
    await userEvent.type(screen.getByTestId("level-mapping-jira-level-0"), " (edited)");
    await userEvent.click(screen.getByTestId("level-mapping-save"));

    expect(hooks.setMapping).toHaveBeenCalledTimes(1);
    const [call] = hooks.setMapping.mock.calls[0]!;
    const entries: LevelMappingEntry[] = call.body.entries;

    const githubEntries = entries.filter((e) => e.kind === "github");
    expect(githubEntries).toEqual(seeded.entries.filter((e) => e.kind === "github"));

    const editedEpic = entries.find(
      (e) => e.kind === "jira" && e.externalLevel === "Epic (edited)",
    );
    expect(editedEpic).toBeDefined();
  });
});
