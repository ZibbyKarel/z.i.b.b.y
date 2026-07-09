import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ProjectSwitcherTestId } from "../../../features/projects/components/ProjectSwitcher";
import { AppShell } from "./AppShell";

// `AppShellInner` reads the route via `usePathname()` to decide whether to render
// the HUD's `MainLayout` chrome or (Phase 27) bypass it fullscreen for `/chat`; a
// mutable ref lets each test simulate a different current route, the same pattern
// `ChatContext.test.tsx` uses.
const pathnameRef = { current: "/overview" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => pathnameRef.current,
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

describe("AppShell", () => {
  beforeEach(() => {
    pathnameRef.current = "/overview";
  });

  // Smoke test only: AppShell wires routing (usePathname), the catalog provider
  // and Suspense around MainLayout.
  it("mounts and renders its children", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah dashboardu</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah dashboardu")).toBeInTheDocument();
  });

  it("renders the HUD chrome (nav rail) on an ordinary dashboard route", () => {
    pathnameRef.current = "/overview";
    renderWithProviders(
      <AppShell>
        <div>obsah dashboardu</div>
      </AppShell>,
    );
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  // Phase 102: the standalone topbar `ProjectSwitcher` is retired — project
  // selection moved inline into `CommandLine`. The topbar chrome must never
  // resurrect it.
  it("no longer mounts the standalone project switcher in the topbar", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah dashboardu</div>
      </AppShell>,
    );
    expect(screen.queryByTestId(ProjectSwitcherTestId.Root)).not.toBeInTheDocument();
  });

  // Phase 27: `/chat` is a coequal, parallel UI to the HUD, not a screen nested
  // inside it — it must render fullscreen with none of MainLayout's chrome (no
  // nav rail).
  it("bypasses MainLayout (no nav rail) fullscreen on /chat", () => {
    pathnameRef.current = "/chat";
    renderWithProviders(
      <AppShell>
        <div>obsah chatu</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah chatu")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("bypasses MainLayout on a /chat sub-path too", () => {
    pathnameRef.current = "/chat/thread-1";
    renderWithProviders(
      <AppShell>
        <div>obsah chatu</div>
      </AppShell>,
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
