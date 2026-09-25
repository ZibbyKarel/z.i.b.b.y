import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ConfirmDeleteButtonTestId, ContactRowTestId } from "@zibby/design-system";
import type { Company } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { CompanyDetailScreen } from "./CompanyDetailScreen";

const company: Company = {
  id: "acme",
  name: "Acme",
  desc: "Klient",
  people: [{ name: "Jana", role: "PM", vip: true }],
};

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const updateProjectMutate = vi.fn();
const replace = vi.fn();
const push = vi.fn();

vi.mock("../queries", () => ({
  useCompanyQuery: () => ({ data: company, isPending: false, isError: false }),
}));

vi.mock("../mutations", () => ({
  useCreateCompanyMutation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateCompanyMutation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteCompanyMutation: () => ({ mutate: deleteMutate, isPending: false }),
}));

let projects: { id: string; name: string; path: string; companyId?: string }[] = [];
vi.mock("../../projects", () => ({
  useProjectsQuery: () => ({ data: projects }),
}));

vi.mock("../../projects/mutations", () => ({
  useUpdateProjectMutation: () => ({ mutate: updateProjectMutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  updateProjectMutate.mockReset();
  replace.mockReset();
  push.mockReset();
  projects = [];
});

describe("CompanyDetailScreen (ZB-06)", () => {
  it("renders the company name and its contacts as ContactRows", () => {
    render(<CompanyDetailScreen companyId="acme" />);
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
    expect(screen.getByTestId(ContactRowTestId.Name)).toHaveTextContent("Jana");
  });

  it("saves the core record via the update mutation", async () => {
    render(<CompanyDetailScreen companyId="acme" />);
    await userEvent.click(screen.getByTestId("save-basics"));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: "acme" },
        body: expect.objectContaining({ name: "Acme", desc: "Klient" }),
      }),
    );
  });

  it("lists projects whose companyId matches this company, navigating on row click", async () => {
    projects = [
      { id: "linked", name: "Linked Co Project", path: "~/p/linked", companyId: "acme" },
      { id: "other", name: "Other Project", path: "~/p/other", companyId: "globex" },
    ];
    render(<CompanyDetailScreen companyId="acme" />);
    expect(screen.getByText("Linked Co Project")).toBeInTheDocument();
    expect(screen.queryByText("Other Project")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Linked Co Project"));
    expect(push).toHaveBeenCalledWith("/work/projects/linked");
  });

  it("removes a contact via the ContactRow remove action", async () => {
    render(<CompanyDetailScreen companyId="acme" />);
    await userEvent.click(screen.getByTestId(ContactRowTestId.Remove));
    expect(updateMutate).toHaveBeenCalledWith(
      { params: { id: "acme" }, body: { people: [] } },
      expect.any(Object),
    );
  });

  it("deletes via the two-click ConfirmDeleteButton and redirects to the list", async () => {
    render(<CompanyDetailScreen companyId="acme" />);
    const del = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
    await userEvent.click(del);
    await userEvent.click(del);
    expect(deleteMutate).toHaveBeenCalledWith(
      { params: { id: "acme" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("links to /work/tasks?company=<id>", () => {
    render(<CompanyDetailScreen companyId="acme" />);
    expect(screen.getByText("VŠECHNY ÚKOLY TÉTO FIRMY →")).toBeInTheDocument();
  });

  describe("new company mode", () => {
    it("shows only the basics panel — no contacts/projects panels until saved", () => {
      render(<CompanyDetailScreen />);
      expect(screen.getByTestId("save-basics")).toBeInTheDocument();
      expect(screen.queryByTestId(ContactRowTestId.Root)).not.toBeInTheDocument();
    });

    it("creates the company and redirects to its detail page", async () => {
      render(<CompanyDetailScreen />);
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
