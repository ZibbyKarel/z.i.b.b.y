import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { ConfirmDeleteButtonTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlueCodeCard, BlueCodeCardTestId } from "./BlueCodeCard";

let bluecode: { configured: boolean; keyHint?: string; baseUrl?: string; modelCount?: number } = {
  configured: false,
};
let setError: unknown = null;
const set = vi.fn();
const clear = vi.fn();

vi.mock("../../ai-providers", () => ({
  useAiProvidersQuery: () => ({ data: { bluecode } }),
  useSetBlueCodeMutation: () => ({
    mutate: set,
    isPending: false,
    isError: setError !== null,
    error: setError,
  }),
  useClearBlueCodeMutation: () => ({ mutate: clear, isPending: false }),
}));

beforeEach(() => {
  set.mockReset();
  setError = null;
  clear.mockReset();
  bluecode = { configured: false };
});

describe("BlueCodeCard", () => {
  it("is not configured: Save needs URL and key, no Refresh / remove, key is a password field", async () => {
    render(<BlueCodeCard />);
    expect(screen.getByTestId(BlueCodeCardTestId.Status)).toHaveTextContent("Nenastaveno");
    expect(screen.getByTestId(BlueCodeCardTestId.Save)).toBeDisabled();
    expect(screen.queryByTestId(BlueCodeCardTestId.Refresh)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ConfirmDeleteButtonTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByTestId(BlueCodeCardTestId.Key)).toHaveAttribute("type", "password");
  });

  it("saves the trimmed URL and key and clears the inputs on success", async () => {
    set.mockImplementation((_vars, opts: { onSuccess: () => void }) => opts.onSuccess());
    render(<BlueCodeCard />);
    const key = screen.getByTestId(BlueCodeCardTestId.Key);
    await userEvent.type(screen.getByTestId(BlueCodeCardTestId.BaseUrl), " https://x.test/p/v1 ");
    await userEvent.type(key, " sk-test-0000000000000000000000 ");
    await userEvent.click(screen.getByTestId(BlueCodeCardTestId.Save));
    expect(set).toHaveBeenCalledWith(
      { body: { baseUrl: "https://x.test/p/v1", apiKey: "sk-test-0000000000000000000000" } },
      expect.any(Object),
    );
    expect(key).toHaveValue("");
  });

  it("when configured shows hint, URL and count; Refresh sends no key; remove needs two clicks", async () => {
    bluecode = {
      configured: true,
      keyHint: "…0000",
      baseUrl: "https://x.test/p/v1",
      modelCount: 9,
    };
    render(<BlueCodeCard />);
    const status = screen.getByTestId(BlueCodeCardTestId.Status);
    expect(status).toHaveTextContent("…0000");
    expect(status).toHaveTextContent("https://x.test/p/v1");
    expect(status).toHaveTextContent("9");
    await userEvent.click(screen.getByTestId(BlueCodeCardTestId.Refresh));
    expect(set).toHaveBeenCalledWith({ body: { baseUrl: "https://x.test/p/v1" } });
    const remove = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
    await userEvent.click(remove);
    expect(clear).not.toHaveBeenCalled();
    await userEvent.click(remove);
    expect(clear).toHaveBeenCalledWith({});
  });

  it("shows the server's message on a 422, the generic text otherwise", () => {
    setError = { status: 422, body: { message: "BlueCode rejected the key (HTTP 401)." } };
    const { unmount } = render(<BlueCodeCard />);
    expect(screen.getByText("BlueCode rejected the key (HTTP 401).")).toBeInTheDocument();
    unmount();
    setError = { status: 500 };
    render(<BlueCodeCard />);
    expect(screen.getByText(/Uložení selhalo/)).toBeInTheDocument();
  });
});
