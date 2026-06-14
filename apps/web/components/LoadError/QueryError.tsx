"use client";

import { useTranslations } from "next-intl";
import { LoadError } from "./LoadError";

/**
 * The standard catalog "couldn't load" state — {@link LoadError} pre-wired with the
 * shared `common.loadError*` strings. Render it when a list query errors (pass the query's
 * `refetch` as `onRetry`) so an API outage never reads as an empty workspace.
 */
export function QueryError({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("common");
  return (
    <LoadError
      description={t("loadErrorDescription")}
      onRetry={onRetry}
      retryLabel={t("retry")}
      title={t("loadErrorTitle")}
    />
  );
}
