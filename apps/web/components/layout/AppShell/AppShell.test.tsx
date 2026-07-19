import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
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

  // F1 (docs/plans/hud2chat-F1-settings.md): `/settings` is the second route to
  // adopt the immersive shell — it now renders fullscreen too, same as `/chat`.
  it("bypasses MainLayout (no nav rail) fullscreen on /settings (F1)", () => {
    pathnameRef.current = "/settings";
    renderWithProviders(
      <AppShell>
        <div>obsah nastavení</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah nastavení")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  // F2 (docs/plans/hud2chat-F2-archive.md): `/archiv` (the task archive) is the
  // third route to adopt the immersive shell — reached via `ChatTasksPanel`'s own
  // "Archiv" link, not the classic nav rail, but still fullscreen like /chat.
  it("bypasses MainLayout (no nav rail) fullscreen on /archiv (F2)", () => {
    pathnameRef.current = "/archiv";
    renderWithProviders(
      <AppShell>
        <div>obsah archivu</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah archivu")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  // F3 (docs/plans/hud2chat-F3-catalogs-a.md): the four uniform catalog
  // sections (skills, commands, mcp, hooks) adopt the immersive shell —
  // `isFullscreenRoute`'s prefix match covers each `/[id]` detail route too.
  it.each([
    "/skills",
    "/skills/deploy",
    "/commands",
    "/commands/some-command",
    "/mcp",
    "/mcp/some-server",
    "/hooks",
    "/hooks/some-hook",
  ])("bypasses MainLayout (no nav rail) fullscreen on %s (F3)", (route) => {
    pathnameRef.current = route;
    renderWithProviders(
      <AppShell>
        <div>obsah katalogu</div>
      </AppShell>,
    );
    expect(screen.getByText("obsah katalogu")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  // F4 (docs/plans/hud2chat-F4-catalogs-b.md): agents and automations adopt the
  // immersive shell — `isFullscreenRoute`'s prefix match covers each `/[id]`
  // detail route too.
  it.each(["/agents", "/agents/koder", "/automations", "/automations/morning-standup"])(
    "bypasses MainLayout (no nav rail) fullscreen on %s (F4)",
    (route) => {
      pathnameRef.current = route;
      renderWithProviders(
        <AppShell>
          <div>obsah katalogu</div>
        </AppShell>,
      );
      expect(screen.getByText("obsah katalogu")).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    },
  );

  // F5 (docs/plans/hud2chat-F5-orchestration.md): pipelines and chains adopt
  // the immersive shell — `isFullscreenRoute`'s prefix match covers each
  // section's `/[id]` detail route too, and both routes share one Screen.tsx
  // (list vs. detail switches on the `[id]` segment, not on separate routes).
  it.each(["/pipelines", "/pipelines/build-feature", "/chains", "/chains/research-then-build"])(
    "bypasses MainLayout (no nav rail) fullscreen on %s (F5)",
    (route) => {
      pathnameRef.current = route;
      renderWithProviders(
        <AppShell>
          <div>obsah katalogu</div>
        </AppShell>,
      );
      expect(screen.getByText("obsah katalogu")).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    },
  );

  // F0 (docs/plans/hud2chat-F0-immersive-shell.md): the hardcoded `/chat` check
  // became a route table (`FULLSCREEN_ROUTES` / `isFullscreenRoute`). `/settings`
  // migrated in F1, `/skills`/`/commands`/`/mcp`/`/hooks` in F3, `/agents`/
  // `/automations` in F4, `/pipelines`/`/chains` in F5 (see the dedicated tests
  // above); every other route must keep rendering the HUD chrome exactly as
  // before.
  it.each(["/overview", "/runs", "/memory"])(
    "still renders the HUD chrome (nav rail) on %s — unmigrated",
    (route) => {
      pathnameRef.current = route;
      renderWithProviders(
        <AppShell>
          <div>obsah dashboardu</div>
        </AppShell>,
      );
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    },
  );
});
