import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Agenti" />);
    expect(screen.getByText("Agenti")).toBeInTheDocument();
  });

  it("renders the subtitle when given", () => {
    render(<PageHeader subtitle="4 agenti v katalogu" title="Agenti" />);
    expect(screen.getByText("4 agenti v katalogu")).toBeInTheDocument();
  });

  it("renders the action cluster", () => {
    render(<PageHeader actions={<button>Přidat agenta</button>} title="Agenti" />);
    expect(screen.getByRole("button", { name: "Přidat agenta" })).toBeInTheDocument();
  });
});
