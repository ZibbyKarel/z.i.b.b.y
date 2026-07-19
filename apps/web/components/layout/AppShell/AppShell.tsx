"use client";

import { type ReactNode, Suspense } from "react";
import { Container } from "@zibby/design-system";
import { CatalogProvider } from "../../../state/store";
import { NewTaskProvider } from "../../../features/tasks";
import { ChatProvider } from "../../../features/chat";

/**
 * F10 (O2/D2, docs/hud2chat/DECISIONS.md): the HUD chrome — `MainLayout`,
 * `Sidebar`, `RightRail`, `TopBar` — and the `isFullscreenRoute`/
 * `FULLSCREEN_ROUTES` route table that used to fork on it (`state/config.ts`)
 * are deleted. Every route in the app renders fullscreen now, so there is
 * nothing left to branch on — `AppShellInner` stays a separate function only
 * because it sits inside the `Suspense` boundary below.
 */
function AppShellInner({ children }: { children: ReactNode }) {
  return (
    <Container height="100dvh" overflow="hidden" width="100%">
      {children}
    </Container>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      {/* NewTaskProvider stays the OUTER provider (the position the removed
          VoiceProvider held), so the chat overlay can reach the task flow later.
          Phase 108: the Fáze-11/Phase-24 app-wide "active project" scope is
          gone — ZIBBY always shows every project's data at once, so there is
          no dashboard-level scope left to mount here. */}
      <NewTaskProvider>
        <ChatProvider>
          <Suspense>
            <AppShellInner>{children}</AppShellInner>
          </Suspense>
        </ChatProvider>
      </NewTaskProvider>
    </CatalogProvider>
  );
}
