import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  CompanyIdSchema,
  CompanySchema,
  CreateCompanySchema,
  UpdateCompanySchema,
} from "./company.schema";

const c = initContract();

/**
 * CRUD over the company registry — the super-entity above Project (Phase 68).
 * Mirrors `projectsContract` verbatim in shape: the backend implements it via
 * `@ts-rest/nest` against a JSON-manifest-backed storage service (companies are a
 * registry, not files). `searchCompanies` (`GET /companies/search`) is declared
 * before `getCompany` (`GET /companies/:id`) so it is matched as its own route
 * rather than captured by the `:id` param.
 */
export const companiesContract = c.router(
  {
    createCompany: {
      method: "POST",
      path: "/companies",
      body: CreateCompanySchema,
      responses: { 201: CompanySchema, 409: ErrorSchema },
      summary: "Create a new company",
    },
    listCompanies: {
      method: "GET",
      path: "/companies",
      responses: { 200: z.array(CompanySchema) },
      summary: "List all companies",
    },
    // Declared before `getCompany` so `/companies/search` is matched as its own
    // route rather than captured by the `/companies/:id` param.
    searchCompanies: {
      method: "GET",
      path: "/companies/search",
      query: z.object({ q: z.string() }),
      responses: { 200: z.array(CompanySchema) },
      summary: "Search companies by id, name or desc",
    },
    getCompany: {
      method: "GET",
      path: "/companies/:id",
      pathParams: z.object({ id: CompanyIdSchema }),
      responses: { 200: CompanySchema, 404: ErrorSchema },
      summary: "Get a single company by id",
    },
    updateCompany: {
      method: "PATCH",
      path: "/companies/:id",
      pathParams: z.object({ id: CompanyIdSchema }),
      body: UpdateCompanySchema,
      responses: { 200: CompanySchema, 404: ErrorSchema },
      summary: "Partially update an existing company",
    },
    deleteCompany: {
      method: "DELETE",
      path: "/companies/:id",
      pathParams: z.object({ id: CompanyIdSchema }),
      responses: { 200: z.object({ id: CompanyIdSchema }), 404: ErrorSchema },
      summary:
        "Delete a company (allowed even with linked projects — they keep a dangling companyId)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type CompaniesContract = typeof companiesContract;
