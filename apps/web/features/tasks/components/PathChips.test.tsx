import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { PathChips } from "./PathChips";

describe("PathChips (Phase 11.3)", () => {
  it("renders a plain chip when no resolution has arrived yet", () => {
    render(<PathChips paths={["/tmp/x"]} />);
    expect(screen.getByText("/tmp/x")).toBeInTheDocument();
    expect(screen.queryByText(/povolit přístup/)).not.toBeInTheDocument();
  });

  it("shows 'scoped to <project>' for an in-project path", () => {
    render(
      <PathChips
        paths={["~/Projects/alpha/x"]}
        resolved={[{ path: "~/Projects/alpha/x", project: { id: "alpha", name: "Alpha" } }]}
      />,
    );
    expect(screen.getByText(/v projektu Alpha/)).toBeInTheDocument();
  });

  it("offers a grant action for a resolved out-of-project path", async () => {
    const onGrant = vi.fn();
    render(
      <PathChips
        onGrant={onGrant}
        paths={["/tmp/out"]}
        resolved={[{ path: "/tmp/out", project: null }]}
      />,
    );
    const grant = screen.getByRole("button", { name: "Povolit ZIBBY přístup k /tmp/out" });
    await userEvent.click(grant);
    expect(onGrant).toHaveBeenCalledWith("/tmp/out");
  });

  it("does not offer a grant action for an unresolved path", () => {
    const onGrant = vi.fn();
    // No `resolved` entry for the path → not yet known to be out-of-project.
    render(<PathChips onGrant={onGrant} paths={["/tmp/out"]} />);
    expect(screen.queryByRole("button", { name: /Povolit ZIBBY přístup/ })).not.toBeInTheDocument();
  });

  it("keeps each chip removable", async () => {
    const onRemove = vi.fn();
    render(<PathChips onRemove={onRemove} paths={["/tmp/x"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Odebrat cestu /tmp/x" }));
    expect(onRemove).toHaveBeenCalledWith("/tmp/x");
  });
});
