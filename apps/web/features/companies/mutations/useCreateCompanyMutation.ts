import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCompaniesQueryKey } from "../queries/useCompaniesQuery";

/** Create a company (`POST /api/companies`); refreshes the registry on success. */
export const useCreateCompanyMutation = makeInvalidatingMutation(
  apiClient.companies.createCompany.useMutation,
  getCompaniesQueryKey,
);
