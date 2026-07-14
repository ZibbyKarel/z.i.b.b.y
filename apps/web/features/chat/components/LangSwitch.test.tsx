import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { LangSwitch, LangSwitchTestId } from "./LangSwitch";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("LangSwitch", () => {
  it("writes the locale cookie and refreshes on change", async () => {
    const { getByText } = renderWithProviders(<LangSwitch />);
    await userEvent.click(getByText("English"));
    expect(document.cookie).toContain("locale=en");
    expect(refresh).toHaveBeenCalled();
  });

  it("ignores the empty value ButtonGroup emits when the active option is re-clicked", async () => {
    const { getByText } = renderWithProviders(<LangSwitch />);
    // Default locale in tests is "cs"; clicking the active option can emit "".
    await userEvent.click(getByText("Čeština"));
    expect(document.cookie).not.toContain("locale=;");
  });
});
