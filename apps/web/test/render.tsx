import type { ReactElement, ReactNode } from "react";
import { type RenderOptions, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesignSystemProvider } from "@zibby/design-system";
import messages from "../i18n/messages/cs.json";

/**
 * Render a unit under test inside the same providers the dashboard shell
 * supplies: design-system tokens, next-intl (the real `cs` catalog) and a fresh
 * React Query client. Components in `apps/web/components` that read translations,
 * the router or queries can be tested in isolation through this helper.
 *
 * Plain presentational components (the extracted generic primitives) are
 * i18n-agnostic and can still use Testing Library's bare `render` directly.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <DesignSystemProvider>
        <NextIntlClientProvider locale="cs" messages={messages}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </NextIntlClientProvider>
      </DesignSystemProvider>
    );
  }

  return render(ui, { wrapper: Providers, ...options });
}

export * from "@testing-library/react";
