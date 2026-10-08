import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  APP_FRAME_MAIN_CONTENT_ID,
  ActivityDockTestId,
  AppFrameTestId,
  AppHeaderTestId,
  MenuButtonTestId,
  RailTestId,
  SubNavTestId,
  TabsTestId,
} from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { PinPageDialogTestId } from "../../../features/pins";
import { AppShell } from "./AppShell";

let mockPath = "/chat";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
}));

// ZB-01: `AppShell` is rebuilt over the ZibbyCorp DS `AppFrame` — a header
// (section nav, ⋮ menu, limits), the PINNED/"NEEDS YOU"/RUNNING rails and the
// page content, plus the same provider stack (catalog/new-task/chat) as
// before. `usePathname`/`useRouter`/`useSearchParams` come from the global
// `next/navigation` mock in `vitest.setup.tsx` (`usePathname` → `/chat`,
// `useSearchParams` → empty), which `sectionForPath` maps to the `org`
// section. Every data-backed slot (approvals/runs/limits/pins/system-config
// queries) never resolves in this harness (no fetch mock, `retry: false`),
// so it renders its honest pending/empty state — that state is exactly what
// these tests assert. `AppHeader`'s `operator`/`activeCount` slots are
// optional and `AppShellChrome` never fills them (there is no operator-
// identity/active-run-count source wired up yet) — they're asserted absent,
// not with stale placeholder text.
describe("AppShell", () => {
  it("mounts and renders its children inside the AppFrame main landmark", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppFrameTestId.Root)).toBeInTheDocument();
    expect(screen.getByText("obsah stránky")).toBeInTheDocument();
  });

  it("mounts the skip link once, pointed at the AppFrame main-content id", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    const link = screen.getByTestId(AppFrameTestId.SkipLink);
    expect(link).toHaveRole("link");
    expect(link).toHaveAttribute("href", `#${APP_FRAME_MAIN_CONTENT_ID}`);
  });

  it("renders the header's section nav without a SYSTEM tab, and no operator/active-count slot", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppHeaderTestId.Nav)).toBeInTheDocument();
    expect(screen.queryByTestId(`${TabsTestId.Tab}-system`)).toBeNull();
    expect(screen.queryByTestId(AppHeaderTestId.Operator)).toBeNull();
    expect(screen.queryByTestId(AppHeaderTestId.ActiveCount)).toBeNull();
  });

  it("renders the ⋮ overflow menu in the header", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppHeaderTestId.Menu)).toBeInTheDocument();
  });

  it("opens the pin dialog for the current page from the ⋮ menu's PIN PAGE item", async () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.queryByTestId(PinPageDialogTestId.Name)).toBeNull();
    await userEvent.click(screen.getByTestId(MenuButtonTestId.Trigger));
    await userEvent.click(screen.getByText("Připnout stránku"));
    expect(screen.getByTestId(PinPageDialogTestId.Name)).toBeInTheDocument();
  });

  it("collapses the dock by default; each icon opens its panel, a second click closes it", async () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.queryByTestId(ActivityDockTestId.Body)).toBeNull();
    const buttons = screen.getAllByTestId(ActivityDockTestId.Button);
    expect(buttons).toHaveLength(3);
    // No data in this harness: no badges.
    expect(screen.queryAllByTestId(ActivityDockTestId.Badge)).toHaveLength(0);

    await userEvent.click(buttons[0]!);
    expect(screen.getAllByTestId(RailTestId.Root)).toHaveLength(1);
    await userEvent.click(buttons[1]!);
    expect(screen.getAllByTestId(RailTestId.Root)).toHaveLength(1);
    expect(screen.getAllByTestId(RailTestId.Empty)).toHaveLength(1);
    await userEvent.click(buttons[2]!);
    expect(screen.getAllByTestId(RailTestId.Root)).toHaveLength(2);
    await userEvent.click(buttons[2]!);
    expect(screen.queryByTestId(ActivityDockTestId.Body)).toBeNull();
  });

  it.each([
    ["/work/projects/cms4/integrations", "/work/projects"],
    ["/work/tasks", "/work/tasks"],
  ])("marks the owning sub-nav tab current on %s", (path, href) => {
    mockPath = path;
    try {
      renderWithProviders(
        <AppShell>
          <div>obsah stránky</div>
        </AppShell>,
      );
      expect(screen.getByTestId(`${SubNavTestId.Item}-${href}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        screen
          .getAllByTestId(new RegExp(`^${SubNavTestId.Item}-`))
          .filter((el) => el.getAttribute("aria-current") === "page"),
      ).toHaveLength(1);
    } finally {
      mockPath = "/chat";
    }
  });

  it.each([
    ["/system/registries/hooks/foo", "/system/registries/skills"],
    ["/system/settings/appearance", "/system/settings/general"],
  ])("highlights the owning sub-tab for %s", (path, tabHref) => {
    mockPath = path;
    try {
      renderWithProviders(
        <AppShell>
          <div />
        </AppShell>,
      );
      expect(screen.getByTestId(`${SubNavTestId.Item}-${tabHref}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
    } finally {
      mockPath = "/chat";
    }
  });
});
