import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { LangSwitch } from "./LangSwitch";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("LangSwitch", () => {
  it("shows only the current locale code in the compact trigger", () => {
    renderWithProviders(<LangSwitch />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveTextContent("CZ");
    expect(trigger).not.toHaveTextContent("Čeština");
  });

  it("writes the locale cookie and refreshes when a language is picked", async () => {
    renderWithProviders(<LangSwitch />);
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    await userEvent.click(screen.getByText("English"));
    expect(document.cookie).toContain("locale=en");
    expect(refresh).toHaveBeenCalled();
  });
});
