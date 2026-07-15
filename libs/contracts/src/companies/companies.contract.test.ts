import { describe, expect, it } from "vitest";
import { CompanySchema, companiesContract } from "../index";

describe("companiesContract", () => {
  it("lists companies under GET /api/companies", () => {
    expect(companiesContract.listCompanies.method).toBe("GET");
    expect(companiesContract.listCompanies.path).toBe("/api/companies");
  });

  it("creates a company via POST /api/companies with a 409 conflict status", () => {
    expect(companiesContract.createCompany.method).toBe("POST");
    expect(companiesContract.createCompany.path).toBe("/api/companies");
    expect(companiesContract.createCompany.responses).toHaveProperty("201");
    expect(companiesContract.createCompany.responses).toHaveProperty("409");
  });

  it("exposes a search route declared before the `:id` route", () => {
    expect(companiesContract.searchCompanies.method).toBe("GET");
    expect(companiesContract.searchCompanies.path).toBe("/api/companies/search");
    const keys = Object.keys(companiesContract);
    expect(keys.indexOf("searchCompanies")).toBeLessThan(keys.indexOf("getCompany"));
  });

  it("updates a company via PATCH /api/companies/:id (404)", () => {
    expect(companiesContract.updateCompany.method).toBe("PATCH");
    expect(companiesContract.updateCompany.path).toBe("/api/companies/:id");
    expect(companiesContract.updateCompany.responses).toHaveProperty("404");
  });

  it("deletes a company via DELETE /api/companies/:id (404)", () => {
    expect(companiesContract.deleteCompany.method).toBe("DELETE");
    expect(companiesContract.deleteCompany.path).toBe("/api/companies/:id");
    expect(companiesContract.deleteCompany.responses).toHaveProperty("404");
  });

  it("T11 finding #14: search `q` requires at least 1 char (was unbounded z.string())", () => {
    expect(companiesContract.searchCompanies.query.safeParse({ q: "" }).success).toBe(false);
    expect(companiesContract.searchCompanies.query.safeParse({ q: "a" }).success).toBe(true);
  });
});

describe("company schema", () => {
  it("round-trips a minimal company (id + name only)", () => {
    const parsed = CompanySchema.parse({ id: "acme", name: "Acme Corp" });
    expect(parsed).toEqual({ id: "acme", name: "Acme Corp" });
  });

  it("round-trips a company with desc, canonical people and a default budget", () => {
    const input = {
      id: "acme",
      name: "Acme Corp",
      desc: "Long-standing client",
      people: [
        { id: "jane-doe", name: "Jane Doe", role: "CTO", vip: true },
        { name: "No Id Yet", role: "PM" },
      ],
      budget: { dailyRuns: 5, maxConcurrent: 2 },
    };
    expect(CompanySchema.parse(input)).toEqual(input);
  });

  it("rejects an empty name", () => {
    expect(CompanySchema.safeParse({ id: "acme", name: "" }).success).toBe(false);
  });

  it("rejects an id with a path separator (defense in depth)", () => {
    expect(CompanySchema.safeParse({ id: "a/b", name: "Acme" }).success).toBe(false);
  });

  it("rejects an unknown budget knob (strict, inherited from ProjectBudgetSchema)", () => {
    expect(
      CompanySchema.safeParse({
        id: "acme",
        name: "Acme",
        budget: { dailyTokens: 1000 },
      }).success,
    ).toBe(false);
  });
});
