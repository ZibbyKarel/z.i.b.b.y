/**
 * `select` transform for the ts-rest react-query `useQuery` hooks: unwraps the
 * `{ status, body }` response envelope so consumers read `data` as the response
 * body directly. Every query in this app declares only its 2xx response, so the
 * success body is the only shape that reaches here. Shared across all query
 * wrappers in `features/<domain>/queries/`.
 */
export function selectApiResponseBody<TBody>(response: { body: TBody }): TBody {
  return response.body;
}
