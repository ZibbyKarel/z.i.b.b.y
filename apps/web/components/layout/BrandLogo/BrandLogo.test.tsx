import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { BrandLogo } from "./BrandLogo";

const { store } = vi.hoisted(() => ({
  store: {
    activeProjectId: null as string | null,
    projects: [] as { id: string; name: string; logo?: string }[],
  },
}));

vi.mock("../../../features/projects", () => ({
  useActiveProject: () => ({ activeProjectId: store.activeProjectId, setActiveProject: vi.fn() }),
  useProjectsQuery: () => ({ data: store.projects }),
}));

describe("BrandLogo", () => {
  it("renders the default z.i.b.b.y brand with tagline when no project is active", () => {
    store.activeProjectId = null;
    store.projects = [];
    renderWithProviders(<BrandLogo />);
    expect(screen.getByText("Zestful Intuitive Brainy Butler for You")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/overview");
  });

  it("swaps to the active project's name, logo and detail link", () => {
    store.activeProjectId = "alpha";
    store.projects = [{ id: "alpha", name: "Alpha", logo: "data:image/png;base64,abc" }];
    renderWithProviders(<BrandLogo />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Zestful Intuitive Brainy Butler for You")).not.toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/projects/alpha");
    expect(link).toHaveAccessibleName("Projekt: Alpha");
  });

  it("falls back to the default brand for an unknown active project id", () => {
    store.activeProjectId = "ghost";
    store.projects = [];
    renderWithProviders(<BrandLogo />);
    expect(screen.getByText("Zestful Intuitive Brainy Butler for You")).toBeInTheDocument();
  });
});
