import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCompaniesQueryKey } from "../queries/useCompaniesQuery";

/** Partially update a company (`PATCH /api/companies/:id`); refreshes the registry. */
export const useUpdateCompanyMutation = makeInvalidatingMutation(
  apiClient.companies.updateCompany.useMutation,
  getCompaniesQueryKey,
);
