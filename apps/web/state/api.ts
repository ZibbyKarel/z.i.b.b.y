import { appContract } from "@zibby/contracts";
import { initTsrReactQuery } from "@ts-rest/react-query/v5";

/**
 * Base URL of the API. Configurable per environment via NEXT_PUBLIC_API_URL
 * (must be `NEXT_PUBLIC_` to reach the browser); falls back to the local API
 * dev server. No trailing slash — contract paths start with `/api`.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL!;

/**
 * App-wide ts-rest ↔ TanStack Query binding, derived from the `libs/contracts`
 * source of truth. Every resource is exposed as a typed hook namespace —
 * `tsr.health.getHealth.useQuery(...)`, `tsr.agents.createAgent.useMutation(...)` —
 * with path, method, request and response types all inferred from the contract.
 *
 * `validateResponse` parses every response body through the contract's Zod schema
 * at runtime, so a payload that drifts from the contract throws and surfaces as a
 * query error. `tsr.ReactQueryProvider` must wrap the app inside `QueryClientProvider`
 * (see `app/providers.tsx`); query hooks live per-domain in `features/<domain>/queries.ts`.
 */
export const apiClient = initTsrReactQuery(appContract, {
  baseUrl: API_URL,
  baseHeaders: { accept: "application/json" },
  validateResponse: true,
});
