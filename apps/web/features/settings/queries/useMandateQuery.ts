import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the autonomy mandate. Exported so the mutation can invalidate it. */
export function getMandateQueryKey() {
  return ["mandate"] as const;
}

/** The autonomy mandate from `GET /api/mandate` (seeded conservative default). */
export function useMandateQuery() {
  return apiClient.mandate.getMandate.useQuery({
    queryKey: getMandateQueryKey(),
    select: selectApiResponseBody,
  });
}
