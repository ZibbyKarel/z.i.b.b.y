import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import cs from "../../../i18n/messages/cs.json";
import { OPERATOR_TOKEN_STORAGE_KEY } from "../../../state/operatorToken";
import { OperatorTokenSection, OperatorTokenSectionTestId } from "./OperatorTokenSection";

beforeEach(() => localStorage.clear());

describe("OperatorTokenSection", () => {
  it("reads missing when nothing is stored", () => {
    render(<OperatorTokenSection />);
    expect(screen.getByTestId(OperatorTokenSectionTestId.Status)).toHaveTextContent(
      cs.settings.operatorTokenMissing,
    );
  });

  it("saving persists the token and the status reads saved", async () => {
    render(<OperatorTokenSection />);
    await userEvent.type(screen.getByTestId(OperatorTokenSectionTestId.Input), "tok-123");
    await userEvent.click(screen.getByTestId(OperatorTokenSectionTestId.Save));
    expect(localStorage.getItem(OPERATOR_TOKEN_STORAGE_KEY)).toBe("tok-123");
    expect(screen.getByTestId(OperatorTokenSectionTestId.Status)).toHaveTextContent(
      cs.settings.operatorTokenSaved,
    );
  });
});
