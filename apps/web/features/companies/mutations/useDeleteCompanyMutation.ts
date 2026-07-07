import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCompaniesQueryKey } from "../queries/useCompaniesQuery";

/**
 * Delete a company (`DELETE /api/companies/:id`). Linked projects (Phase 72) keep
 * their now-dangling `companyId` — the API allows this and the read-time resolver
 * treats an unknown `companyId` as "no company". Refreshes the registry on success.
 */
export const useDeleteCompanyMutation = makeInvalidatingMutation(
  apiClient.companies.deleteCompany.useMutation,
  getCompaniesQueryKey,
);
