import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { Company } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../test/render";
import { DetailScreen } from "./DetailScreen";

const company: Company = {
  id: "acme",
  name: "Acme",
  desc: "Klient",
  people: [{ name: "Jana", role: "PM", vip: true }],
};

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const replace = vi.fn();
const push = vi.fn();

vi.mock("./queries", () => ({
  useCompanyQuery: () => ({ data: company, isPending: false, isError: false }),
}));

vi.mock("./mutations", () => ({
  useCreateCompanyMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateCompanyMutation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteCompanyMutation: () => ({ mutate: deleteMutate, isPending: false }),
}));

// Phase 72's member-projects panel is the reverse `companyId` lookup over the
// shared project registry — reassigned per test, so this starts empty.
let projects: { id: string; name: string; path: string; companyId?: string }[] = [];
vi.mock("../projects", () => ({
  useProjectsQuery: () => ({ data: projects }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  replace.mockReset();
  push.mockReset();
  projects = [];
});

describe("companies DetailScreen", () => {
  it("renders the company name from the query", () => {
    render(<DetailScreen companyId="acme" />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("shows the person's name from the roster", () => {
    render(<DetailScreen companyId="acme" />);
    expect(screen.getByDisplayValue("Jana")).toBeInTheDocument();
  });

  it("edits the core record in place", () => {
    render(<DetailScreen companyId="acme" />);
    expect(screen.getByDisplayValue("Klient")).toBeInTheDocument();
  });

  it("saves the core record via the update mutation", async () => {
    render(<DetailScreen companyId="acme" />);
    await userEvent.click(screen.getByTestId("save-basics"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "acme" },
        body: expect.objectContaining({ name: "Acme", desc: "Klient" }),
      }),
    );
  });

  it("saves the roster on button click", async () => {
    render(<DetailScreen companyId="acme" />);
    await userEvent.click(screen.getByTestId("save-team"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "acme" },
        body: { people: [expect.objectContaining({ name: "Jana" })] },
      }),
      expect.any(Object),
    );
  });

  it("adds a new person row", async () => {
    render(<DetailScreen companyId="acme" />);
    const before = screen.getAllByTestId("person-name").length;
    await userEvent.click(screen.getByTestId("add-person"));
    expect(screen.getAllByTestId("person-name")).toHaveLength(before + 1);
  });

  describe("member projects (Phase 72)", () => {
    it("shows the empty state when no project links to this company", () => {
      render(<DetailScreen companyId="acme" />);
      expect(screen.getByTestId("member-projects-empty")).toBeInTheDocument();
    });

    it("lists projects whose companyId matches this company, navigating on click", async () => {
      projects = [
        { id: "linked", name: "Linked Co Project", path: "~/p/linked", companyId: "acme" },
        { id: "other", name: "Other Project", path: "~/p/other", companyId: "globex" },
        { id: "solo", name: "Solo Project", path: "~/p/solo" },
      ];
      render(<DetailScreen companyId="acme" />);

      expect(screen.getByText("Linked Co Project")).toBeInTheDocument();
      expect(screen.queryByText("Other Project")).not.toBeInTheDocument();
      expect(screen.queryByText("Solo Project")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Linked Co Project"));
      expect(push).toHaveBeenCalledWith("/projects/linked");
    });
  });

  it("deletes via the confirm dialog and redirects to the list", async () => {
    render(<DetailScreen companyId="acme" />);
    await userEvent.click(screen.getByTestId("delete-company"));
    expect(screen.getByText("Smazat firmu?")).toBeInTheDocument();

    const confirmButton = screen
      .getAllByRole("button", { name: "Smazat" })
      .find((b) => b !== screen.getByTestId("delete-company"));
    await userEvent.click(confirmButton!);

    expect(deleteMutate).toHaveBeenCalledWith(
      { params: { id: "acme" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  describe("new company mode", () => {
    it("shows only the basics panel — no team section until saved", () => {
      render(<DetailScreen />);
      expect(screen.getByTestId("save-basics")).toBeInTheDocument();
      expect(screen.queryByTestId("save-team")).not.toBeInTheDocument();
    });

    it("creates the company and redirects to its detail page", async () => {
      render(<DetailScreen />);
      const nameField = screen.getByPlaceholderText("Acme s.r.o.");
      await userEvent.type(nameField, "Alpha");
      await userEvent.click(screen.getByTestId("save-basics"));
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ id: "alpha", name: "Alpha" }),
        }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });
});
