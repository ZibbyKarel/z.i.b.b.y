import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { companiesContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { CompanyConflictError, CompanyNotFoundError } from "./companies.errors";
import { CompaniesStorageService } from "./companies.storage.service";

const errors = makeErrorMapper("Company", {
  missing: [CompanyNotFoundError],
  conflict: [CompanyConflictError],
});

/**
 * Implements `companiesContract` against the JSON-manifest-backed storage
 * service (Phase 69). Mirrors `ProjectsController` in shape; `searchCompanies`
 * (`GET /companies/search`) is declared before `getCompany` in the contract so
 * it is matched as its own route rather than captured by `GET /companies/:id`.
 */
@Controller()
export class CompaniesController {
  constructor(private readonly storage: CompaniesStorageService) {}

  @TsRestHandler(companiesContract)
  handler() {
    return tsRestHandler(companiesContract, {
      createCompany: ({ body }) => errors.created(() => this.storage.create(body)),

      listCompanies: async () => ({ status: 200, body: await this.storage.list() }),

      searchCompanies: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getCompany: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateCompany: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteCompany: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id); // 404 before any side effect
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
