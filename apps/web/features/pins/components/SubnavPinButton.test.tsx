import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { PinPageDialogTestId } from "./PinPageDialog";
import { SubnavPinButton, SubnavPinButtonTestId } from "./SubnavPinButton";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    isPagePinned: vi.fn(),
    unpinPage: vi.fn(),
    companyName: undefined as string | undefined,
    projectName: undefined as string | undefined,
    teamName: undefined as string | undefined,
  },
}));

vi.mock("../usePagePins", () => ({
  usePagePins: () => ({
    pagePins: [],
    isPagePinned: hooks.isPagePinned,
    pinPage: vi.fn(),
    unpinPage: hooks.unpinPage,
    isPending: false,
  }),
}));
vi.mock("../../companies", () => ({
  useCompanyQuery: () => ({ data: hooks.companyName ? { name: hooks.companyName } : undefined }),
}));
vi.mock("../../projects", () => ({
  useProjectQuery: () => ({ data: hooks.projectName ? { name: hooks.projectName } : undefined }),
}));
vi.mock("../../teams", () => ({
  useTeamQuery: () => ({ data: hooks.teamName ? { name: hooks.teamName } : undefined }),
}));

describe("SubnavPinButton", () => {
  beforeEach(() => {
    hooks.isPagePinned.mockReset();
    hooks.unpinPage.mockReset();
    hooks.companyName = undefined;
    hooks.projectName = undefined;
    hooks.teamName = undefined;
  });

  it("shows a '+ PIN'-style outline button and opens the dialog when unpinned", async () => {
    hooks.isPagePinned.mockReturnValue(false);
    render(<SubnavPinButton href="/work/companies/acme" id="acme" kind="companies" />);
    const button = screen.getByTestId(SubnavPinButtonTestId.Button);
    expect(button).toBeInTheDocument();
    expect(screen.queryByTestId(PinPageDialogTestId.Name)).toBeNull();
    await userEvent.click(button);
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toBeInTheDocument();
    expect(hooks.unpinPage).not.toHaveBeenCalled();
  });

  it("prefills the dialog with the resolved entity name", async () => {
    hooks.isPagePinned.mockReturnValue(false);
    hooks.companyName = "Acme Corp";
    render(<SubnavPinButton href="/work/companies/acme" id="acme" kind="companies" />);
    await userEvent.click(screen.getByTestId(SubnavPinButtonTestId.Button));
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toHaveValue("Acme Corp");
  });

  it("falls back to the id when the entity name hasn't resolved yet", async () => {
    hooks.isPagePinned.mockReturnValue(false);
    render(<SubnavPinButton href="/work/projects/proj-1" id="proj-1" kind="projects" />);
    await userEvent.click(screen.getByTestId(SubnavPinButtonTestId.Button));
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toHaveValue("proj-1");
  });

  it("shows a filled 'PINNED' state and unpins directly on click, without a dialog", async () => {
    hooks.isPagePinned.mockReturnValue(true);
    render(<SubnavPinButton href="/work/teams/core" id="core" kind="teams" />);
    await userEvent.click(screen.getByTestId(SubnavPinButtonTestId.Button));
    expect(hooks.unpinPage).toHaveBeenCalledWith("/work/teams/core");
    expect(screen.queryByTestId(PinPageDialogTestId.Name)).toBeNull();
  });
});
