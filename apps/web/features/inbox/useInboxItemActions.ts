import type { InboxRoadmapItem } from "@zibby/contracts";
import { useProcessInboxItemMutation, useSetInboxHiddenMutation } from "./mutations";

/**
 * The two per-item write actions the Issues rows and the detail page share:
 * "Process" (play the item in its project) and Hide / Unhide (permanent,
 * keyed by the source identity — manual items have none and cannot be hidden).
 */
export function useInboxItemActions() {
  const processMutation = useProcessInboxItemMutation();
  const hideMutation = useSetInboxHiddenMutation();
  return {
    process: (item: InboxRoadmapItem) =>
      processMutation.mutate({ body: { projectId: item.projectId, itemId: item.id } }),
    isProcessing: (item: InboxRoadmapItem) =>
      processMutation.isPending && processMutation.variables?.body.itemId === item.id,
    toggleHidden: (item: InboxRoadmapItem) => {
      const { integrationId, externalId } = item.source;
      if (!integrationId || !externalId) return;
      hideMutation.mutate({ body: { integrationId, externalId, hidden: !item.hidden } });
    },
  };
}
