"use client";

import { useEffect, useState } from "react";
import { Alert, Container, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type Toast, toastBus } from "./toastBus";

const DISMISS_MS = 6000;

export enum ToasterTestId {
  Root = "toaster",
}

/**
 * App-wide toast surface (mounted once in `Providers`). Subscribes to the `toastBus`,
 * which the `QueryClient`'s `MutationCache` `onError` emits to — so a failed write
 * (delete / create / toggle / approve …) is never silent. Fixed bottom-right; each toast
 * auto-dismisses and can be closed.
 */
export function Toaster() {
  const t = useTranslations("common");
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(
    () =>
      toastBus.subscribe((toast) => {
        setToasts((prev) => [...prev, toast]);
        setTimeout(
          () => setToasts((prev) => prev.filter((x) => x.id !== toast.id)),
          DISMISS_MS,
        );
      }),
    [],
  );

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  if (toasts.length === 0) return null;

  return (
    // Fixed viewport overlay: `position` is a typed Container prop; the bottom/right/z
    // offsets go through Container's `style` passthrough (a component, so no DOM-props lint).
    <Container
      data-testid={ToasterTestId.Root}
      position="fixed"
      style={{ bottom: "1rem", right: "1rem", zIndex: 1000, maxWidth: "min(90vw, 24rem)" }}
    >
      <Stack gap="100">
        {toasts.map((toast) => (
          <Alert key={toast.id} onClose={() => dismiss(toast.id)} severity="error">
            {toast.message ?? t("mutationError")}
          </Alert>
        ))}
      </Stack>
    </Container>
  );
}
