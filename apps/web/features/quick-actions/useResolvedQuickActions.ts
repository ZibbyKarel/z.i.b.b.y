import type { QuickAction } from "@zibby/contracts";
import { useMemo } from "react";
import { useAutomationsQuery } from "../automations/queries";
import { useQuickActionsQuery } from "./queries";

/**
 * The quick actions with automation-pinned ones overlaid by their automation's current
 * name / prompt / target. A pinned action whose automation is gone keeps its stored copy.
 */
export function useResolvedQuickActions() {
  const query = useQuickActionsQuery();
  const { data: automations } = useAutomationsQuery();
  const data = useMemo(
    () =>
      query.data?.map((a): QuickAction => {
        const auto = a.automationId ? automations?.find((x) => x.id === a.automationId) : undefined;
        if (!auto || auto.target.type !== "task") return a;
        const t = auto.target.target;
        return {
          ...a,
          label: (auto.name ?? a.label).slice(0, 80),
          text: auto.target.text,
          target: t?.kind === "agent" || t?.kind === "workflow" ? t : undefined,
        };
      }),
    [query.data, automations],
  );
  return { ...query, data };
}
