import { OPERATOR_TOKEN_HEADER } from "@zibby/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeOperatorToken } from "./operatorToken";

const fetchMock = vi.fn();

// API_URL is read from the env at module load, so stub it before importing the client.
async function loadClient() {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  vi.resetModules();
  return (await import("./api")).apiClient;
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ message: "nope" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentHeaders = () => new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);

it("sends the stored operator token on an approval decision, read at call time", async () => {
  writeOperatorToken("secret-token");
  const apiClient = await loadClient();
  await apiClient.approvals.approveApproval.mutate({ params: { id: "a1" }, body: {} });
  expect(sentHeaders().get(OPERATOR_TOKEN_HEADER)).toBe("secret-token");
});

it("sends an empty header (server answers 401) when no token is stored", async () => {
  const apiClient = await loadClient();
  await apiClient.approvals.approveApproval.mutate({ params: { id: "a1" }, body: {} });
  expect(sentHeaders().get(OPERATOR_TOKEN_HEADER) ?? "").toBe("");
});
