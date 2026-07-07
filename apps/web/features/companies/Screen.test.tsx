import { renderWithProviders as render, screen } from "../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@zibby/contracts";
import { Screen } from "./Screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const COMPANIES: Company[] = [{ id: "acme", name: "Acme", desc: "Klient" }];

const { hooks } = vi.hoisted(() => ({
  hooks: {
    companies: { data: [] as Company[], isPending: false, isError: false, refetch: vi.fn() },
  },
}));

vi.mock("./queries", () => ({
  useCompaniesQuery: () => hooks.companies,
}));

describe("companies Screen", () => {
  beforeEach(() => {
    push.mockClear();
    hooks.companies = { data: COMPANIES, isPending: false, isError: false, refetch: vi.fn() };
  });

  it("renders a card per company", () => {
    render(<Screen />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("a card click navigates to the company detail route", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Otevřít Acme" }));
    expect(push).toHaveBeenCalledWith("/companies/acme");
  });

  it("the header add action navigates to /companies/new", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Přidat firmu" }));
    expect(push).toHaveBeenCalledWith("/companies/new");
  });

  it("shows the empty state when there are no companies", () => {
    hooks.companies = { data: [], isPending: false, isError: false, refetch: vi.fn() };
    render(<Screen />);
    expect(screen.getByText("Zatím žádné firmy")).toBeInTheDocument();
  });

  it("shows the loading state while pending", () => {
    hooks.companies = { data: [], isPending: true, isError: false, refetch: vi.fn() };
    render(<Screen />);
    expect(screen.queryByText("Zatím žádné firmy")).not.toBeInTheDocument();
  });

  it("shows the error state and retries", async () => {
    const refetch = vi.fn();
    hooks.companies = { data: [], isPending: false, isError: true, refetch };
    render(<Screen />);
    const retry = screen.getByRole("button", { name: /Zkusit|znovu|Opakovat/i });
    await userEvent.click(retry);
    expect(refetch).toHaveBeenCalled();
  });
});
