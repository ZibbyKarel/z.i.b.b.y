import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSelfStatusQueryKey } from "../queries/useSelfStatusQuery";

/**
 * Phase 79 — the operator's "Aktualizovat" button (`POST /api/self/update`):
 * fast-forward-only pull of the ZIBBY install repo. 200 covers both an actual
 * pull and the no-op "already up to date" case; 409 is the refusal (a dirty
 * tree or a history that can't fast-forward) — the call site reads the 409
 * body's `message` to surface it, since ts-rest resolves any status the
 * contract declares as a normal `onSuccess`, not a thrown error. Refreshes the
 * freshness readout either way so the top-bar control reflects the outcome.
 */
export const useSelfUpdateMutation = makeInvalidatingMutation(
  apiClient.self.updateSelf.useMutation,
  getSelfStatusQueryKey,
);
