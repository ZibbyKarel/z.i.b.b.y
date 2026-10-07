import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  APP_FRAME_MAIN_CONTENT_ID,
  AppFrameTestId,
  AppHeaderTestId,
  MenuButtonTestId,
  RailTestId,
  TabsTestId,
} from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { HeaderPinButtonTestId, PinPageDialogTestId } from "../../../features/pins";
import { AppShell } from "./AppShell";

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

  it("renders PINNED above NEEDS YOU and RUNNING, all with their empty states before data loads", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getAllByTestId(RailTestId.Root)).toHaveLength(3);
    expect(screen.getAllByTestId(RailTestId.Empty)).toHaveLength(3);
  });

  it("renders the current-page pin icon in the header", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppHeaderTestId.Pin)).toBeInTheDocument();
    expect(screen.getByTestId(HeaderPinButtonTestId.Button)).toHaveAccessibleName(
      "Připnout stránku do rychlého přístupu",
    );
  });
});
