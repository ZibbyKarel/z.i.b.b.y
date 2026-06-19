import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "./SectionLabel";

describe("SectionLabel", () => {
  it("renders the caption", () => {
    render(<SectionLabel>moje skilly</SectionLabel>);
    expect(screen.getByText("moje skilly")).toBeInTheDocument();
  });

  it("renders an action slot", () => {
    render(<SectionLabel action={<button>Přidat</button>}>skilly</SectionLabel>);
    expect(screen.getByRole("button", { name: "Přidat" })).toBeInTheDocument();
  });

  it("forwards extra props onto the root", () => {
    render(<SectionLabel data-testid="label">skilly</SectionLabel>);
    expect(screen.getByTestId("label")).toBeInTheDocument();
  });
});
