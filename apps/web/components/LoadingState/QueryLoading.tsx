"use client";

import { useTranslations } from "next-intl";
import { LoadingState } from "./LoadingState";

/**
 * The standard catalog loading state — {@link LoadingState} pre-wired with the shared
 * `common.loading` string. Render it when a list query `isPending` so a cold load never
 * flashes the empty state.
 */
export function QueryLoading() {
  const t = useTranslations("common");
  return <LoadingState label={t("loading")} />;
}
