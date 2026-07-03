import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Pin `API_URL` so the mutation posts to a deterministic origin — the API is a
// separate server from the Next.js app, never a same-origin relative path.
vi.mock("../../../state/api", () => ({ API_URL: "http://api.test" }));

import { useUploadTaskAttachmentsMutation } from "./useUploadTaskAttachmentsMutation";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("useUploadTaskAttachmentsMutation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts files as multipart to the API origin and returns the set", async () => {
    const body = { attachmentSetId: "set_1", files: [{ name: "a.txt", size: 2 }] };
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 201 }));

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useUploadTaskAttachmentsMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync([new File(["hi"], "a.txt")]);
    });

    await waitFor(() => expect(result.current.data).toEqual(body));
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/tasks/attachments",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });

  it("throws when the upload response is not ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useUploadTaskAttachmentsMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync([new File(["hi"], "a.txt")])).rejects.toThrow(
        "Upload failed (500)",
      );
    });
  });
});
