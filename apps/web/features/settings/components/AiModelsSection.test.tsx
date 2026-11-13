import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { ConfirmDeleteButtonTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiModelsSection, AiModelsSectionTestId } from "./AiModelsSection";

let openai: { configured: boolean; keyHint?: string } = { configured: false };
const set = vi.fn();
const clear = vi.fn();

vi.mock("./AiEngineSection", () => ({ AiEngineSection: () => null }));
vi.mock("./BlueCodeCard", () => ({ BlueCodeCard: () => null }));
vi.mock("../../ai-providers", () => ({
  useAiProvidersQuery: () => ({ data: { openai } }),
  useSetOpenAiKeyMutation: () => ({ mutate: set, isPending: false, isError: false }),
  useClearOpenAiKeyMutation: () => ({ mutate: clear, isPending: false }),
}));

beforeEach(() => {
  set.mockReset();
  clear.mockReset();
  openai = { configured: false };
});

describe("AiModelsSection", () => {
  it("shows not configured, keeps Save disabled until a key is typed, no Clear", async () => {
    render(<AiModelsSection />);
    expect(screen.getByTestId(AiModelsSectionTestId.Status)).toHaveTextContent("Nenastaveno");
    expect(screen.getByTestId(AiModelsSectionTestId.Logo)).toBeInTheDocument();
    expect(screen.getByTestId(AiModelsSectionTestId.Save)).toBeDisabled();
    expect(screen.queryByTestId(ConfirmDeleteButtonTestId.Root)).not.toBeInTheDocument();
    expect(screen.getByTestId(AiModelsSectionTestId.Input)).toHaveAttribute("type", "password");
  });

  it("saves the trimmed key and clears the input on success", async () => {
    set.mockImplementation((_vars, opts: { onSuccess: () => void }) => opts.onSuccess());
    render(<AiModelsSection />);
    const input = screen.getByTestId(AiModelsSectionTestId.Input);
    await userEvent.type(input, " sk-abcdefghijklmnopqrstuv ");
    await userEvent.click(screen.getByTestId(AiModelsSectionTestId.Save));
    expect(set).toHaveBeenCalledWith(
      { body: { apiKey: "sk-abcdefghijklmnopqrstuv" } },
      expect.any(Object),
    );
    expect(input).toHaveValue("");
  });

  it("when configured shows the hint and clears only after the second click", async () => {
    openai = { configured: true, keyHint: "…a1b2" };
    render(<AiModelsSection />);
    expect(screen.getByTestId(AiModelsSectionTestId.Status)).toHaveTextContent("…a1b2");
    const clearBtn = screen.getByTestId(ConfirmDeleteButtonTestId.Root);
    await userEvent.click(clearBtn);
    expect(clear).not.toHaveBeenCalled();
    await userEvent.click(clearBtn);
    expect(clear).toHaveBeenCalledWith({});
  });
});
