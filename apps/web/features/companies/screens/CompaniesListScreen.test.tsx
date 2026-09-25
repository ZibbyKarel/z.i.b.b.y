import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@zibby/contracts";
import { CompaniesListScreen } from "./CompaniesListScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const COMPANIES: Company[] = [{ id: "acme", name: "Acme", desc: "Klient" }];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    companies: { data: [] as Company[], isPending: false, isError: false, refetch: vi.fn() },
  },
}));

vi.mock("../queries", () => ({
  useCompaniesQuery: () => hooks.companies,
}));

describe("CompaniesListScreen (ZB-06)", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.companies = { data: COMPANIES, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("renders a card per company", () => {
    render(<CompaniesListScreen />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("a card click navigates to the /work/companies detail route", async () => {
    render(<CompaniesListScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít Acme" }));
    expect(push).toHaveBeenCalledWith("/work/companies/acme");
  });

  it("the header add action navigates to /work/companies/new", async () => {
    render(<CompaniesListScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat firmu" }));
    expect(push).toHaveBeenCalledWith("/work/companies/new");
  });

  it("shows the empty state when there are no companies", () => {
    hooks.companies = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<CompaniesListScreen />);
    expect(screen.getByText("Zatím žádné firmy")).toBeInTheDocument();
  });
});
