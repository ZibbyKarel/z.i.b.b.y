import type { QuickAction } from "@zibby/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSetQuickActionsMutation } from "./mutations";
import { getQuickActionsQueryKey } from "./queries";

export type UpdateQuickActions = (
  change: (latest: QuickAction[]) => QuickAction[],
  onSuccess?: () => void,
) => void;

/** Apply `change` to the latest cached list (not the possibly stale rendered one) and PUT it. */
export function useUpdateQuickActions(rendered: QuickAction[]) {
  const set = useSetQuickActionsMutation();
  const queryClient = useQueryClient();
  const update: UpdateQuickActions = (change, onSuccess) => {
    const cached = queryClient.getQueryData<{ body: QuickAction[] }>(getQuickActionsQueryKey());
    set.mutate({ body: change(cached?.body ?? rendered) }, { onSuccess });
  };
  return { update, pending: set.isPending };
}
