import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import messages from "../../../i18n/messages/cs.json";
import { AppearanceProvider } from "../../../state/appearance";
import { AppearanceSection } from "./AppearanceSection";

function renderSection() {
  return render(
    <AppearanceProvider>
      <NextIntlClientProvider locale="cs" messages={messages}>
        <AppearanceSection />
      </NextIntlClientProvider>
    </AppearanceProvider>,
  );
}

describe("AppearanceSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-motion");
  });

  it("defaults to the system theme choice and motion off", () => {
    renderSection();
    expect(screen.getByTestId("segmented-control-item-system")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("switching to dark persists the choice", async () => {
    renderSection();
    await userEvent.click(screen.getByTestId("segmented-control-item-dark"));
    expect(screen.getByTestId("segmented-control-item-dark")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(window.localStorage.getItem("zibby-theme")).toBe("dark");
  });

  it("toggling reduced motion sets data-motion on <html>", async () => {
    renderSection();
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  });
});
