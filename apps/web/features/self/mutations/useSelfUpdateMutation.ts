import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSelfStatusQueryKey } from "../queries/useSelfStatusQuery";

/**
 * Phase 79 — the operator's "Upgrade" button (`POST /api/self/update`):
 * fast-forward-only pull of the ZIBBY install repo. 200 covers both an actual
 * pull and the no-op "already up to date" case. A 409 is the refusal (a dirty
 * tree or a history that can't fast-forward): ts-rest THROWS on any non-2xx
 * response, so it arrives in `onError` and the call site reads the error body's
 * `message` (`updateErrorMessage`) to show it inline — hence
 * `meta.inlineError`, which keeps the global mutation-error toast quiet.
 * Refreshes the freshness readout on ANY outcome (`onSettled`), so a
 * server-side refusal (e.g. a now-dirty tree) disables the button at once.
 */
export function useSelfUpdateMutation() {
  const queryClient = useQueryClient();
  return apiClient.self.updateSelf.useMutation({
    meta: { inlineError: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getSelfStatusQueryKey() });
    },
  });
}
