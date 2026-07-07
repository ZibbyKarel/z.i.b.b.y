import type { Company } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { CompanyCard } from "./CompanyCard";

const company = (over: Partial<Company> = {}): Company => ({
  id: "acme",
  name: "Acme",
  ...over,
});

describe("CompanyCard", () => {
  it("renders the company name and description", () => {
    render(<CompanyCard company={company({ desc: "Klient s.r.o." })} />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Klient s.r.o.")).toBeInTheDocument();
  });

  it("shows the people count badge when the company has a roster", () => {
    render(
      <CompanyCard
        company={company({ people: [{ name: "Jana", role: "PM" }, { name: "Petr", role: "Dev" }] })}
      />,
    );
    expect(screen.getByText("2 osoby")).toBeInTheDocument();
  });

  it("hides the people count badge when the company has no roster", () => {
    render(<CompanyCard company={company()} />);
    expect(screen.queryByText(/osob/)).not.toBeInTheDocument();
  });

  it("shows a budget badge when the company has a default budget", () => {
    render(<CompanyCard company={company({ budget: { dailyRuns: 5 } })} />);
    expect(screen.getByText("výchozí rozpočet")).toBeInTheDocument();
  });

  it("hides the budget badge when the company has no default budget", () => {
    render(<CompanyCard company={company()} />);
    expect(screen.queryByText("výchozí rozpočet")).not.toBeInTheDocument();
  });

  it("calls onOpen with the company when clicked", () => {
    const onOpen = vi.fn();
    render(<CompanyCard company={company()} onOpen={onOpen} />);
    screen.getByLabelText("Otevřít Acme").click();
    expect(onOpen).toHaveBeenCalledWith(company());
  });
});
