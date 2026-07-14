import { useTranslations } from "next-intl";
import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";

export enum StatusPillTestId {
  Root = "chat-status-pill",
  Working = "chat-status-pill-working",
  Report = "chat-status-pill-report",
  Waiting = "chat-status-pill-waiting",
}

/**
 * The top-bar live status pill (Velín-D, Task E1) — a single-glance rollup of
 * the subsystem roster's state counts, next to the top-bar clock. Reads
 * `useSubsystemsQuery` itself (self-contained, same polling posture as the
 * orb overlay and the drawer) rather than taking the roster as a prop, so
 * `ChatScreen` only has to mount it. Segments only render once their count is
 * positive — an all-`idle` roster shows just the nominal label. The rounded
 * pill chrome (border/radius/padding) has no `Stack` prop equivalent
 * (`StackProps` omits `className`), so it lives on a plain wrapping `div` —
 * Tailwind classes only, no inline `style`.
 */
export function StatusPill() {
  const t = useTranslations("chat");
  const { data } = useSubsystemsQuery();
  const subsystems = data ?? [];

  const working = subsystems.filter((s) => s.state === "running").length;
  const report = subsystems.filter((s) => s.state === "report").length;
  const waiting = subsystems.filter((s) => s.state === "waiting").length;

  return (
    <div
      className="rounded-full border border-border px-[14px] py-[6px]"
      data-testid={StatusPillTestId.Root}
    >
      <Stack align="center" direction="row" gap="100">
        <StatusDot tone="ok" />
        <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
          {t("statusPill.nominal")}
        </Typography>
        {working > 0 && (
          <Typography
            mono
            data-testid={StatusPillTestId.Working}
            size="xs"
            tracking="wide"
            type="note"
            variant="secondary"
          >
            {t("statusPill.working", { n: working })}
          </Typography>
        )}
        {report > 0 && (
          <Typography
            mono
            data-testid={StatusPillTestId.Report}
            size="xs"
            tone="warn"
            tracking="wide"
            type="note"
          >
            {t("statusPill.report", { n: report })}
          </Typography>
        )}
        {waiting > 0 && (
          <Typography
            mono
            data-testid={StatusPillTestId.Waiting}
            size="xs"
            tone="accent"
            tracking="wide"
            type="note"
          >
            {t("statusPill.waiting", { n: waiting })}
          </Typography>
        )}
      </Stack>
    </div>
  );
}
