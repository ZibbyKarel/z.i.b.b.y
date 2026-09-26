import { describe, expect, it } from "vitest";
import {
  APP_FRAME_MAIN_CONTENT_ID,
  AppFrameTestId,
  AppHeaderTestId,
  RailTestId,
} from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { AppShell } from "./AppShell";

// ZB-01: `AppShell` is rebuilt over the ZibbyCorp DS `AppFrame` — a header
// (section nav, operator, active count, limits), the "NEEDS YOU" rail and the
// page content, plus the same provider stack (catalog/new-task/chat) as
// before. `usePathname`/`useRouter`/`useSearchParams` come from the global
// `next/navigation` mock in `vitest.setup.tsx` (`usePathname` → `/chat`,
// `useSearchParams` → empty), which `sectionForPath` maps to the `org`
// section. Every data-backed slot (approvals/runs/limits/system-config
// queries) never resolves in this harness (no fetch mock, `retry: false`),
// so it renders its honest pending/empty state — that state is exactly what
// these tests assert.
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

  it("renders the header's section nav, operator and active-run count", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(AppHeaderTestId.Nav)).toBeInTheDocument();
    expect(screen.getByTestId(AppHeaderTestId.Operator)).toHaveTextContent("CEO");
    // No runs query ever resolves in this harness — the honest 0 count.
    expect(screen.getByTestId(AppHeaderTestId.ActiveCount)).toHaveTextContent("0");
  });

  it("renders the NEEDS YOU rail with its empty state before approvals load", () => {
    renderWithProviders(
      <AppShell>
        <div>obsah stránky</div>
      </AppShell>,
    );
    expect(screen.getByTestId(RailTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(RailTestId.Empty)).toBeInTheDocument();
  });
});
