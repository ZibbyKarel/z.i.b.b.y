import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { StatusPill, StatusPillTestId } from "./StatusPill";

vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "a", name: "A", color: "#fff", state: "bezi" },
      { id: "b", name: "B", color: "#fff", state: "bezi" },
      { id: "c", name: "C", color: "#fff", state: "hlaseni" },
      { id: "d", name: "D", color: "#fff", state: "ceka" },
    ],
  }),
}));

describe("StatusPill", () => {
  it("shows per-state counts derived from the subsystem roster", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Working)).toHaveTextContent("2");
    expect(screen.getByTestId(StatusPillTestId.Report)).toHaveTextContent("1");
    expect(screen.getByTestId(StatusPillTestId.Waiting)).toHaveTextContent("1");
  });

  it("renders the pill root", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Root)).toBeInTheDocument();
  });
});
