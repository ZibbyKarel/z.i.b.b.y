import { describe, expect, it } from "vitest";
import type { RunView } from "../../runs/run";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutErrorRow, FlyoutErrorRowTestId } from "./FlyoutErrorRow";

const run: RunView = {
  runId: "delivery_1",
  kind: "pipeline",
  owner: "delivery",
  status: "error",
  pct: null,
  title: "Fix login bug",
  prompt: "",
  project: "acme",
  startedAt: new Date().toISOString(),
  logBase: null,
  taskOutcomeSummary: "tests red: auth.spec.ts",
};

describe("FlyoutErrorRow", () => {
  it("shows the failed run's title, subsystem and error detail", () => {
    renderWithProviders(<FlyoutErrorRow run={run} runId={run.runId} subsystemName="Forge" />);
    expect(screen.getByTestId(FlyoutErrorRowTestId.Title)).toHaveTextContent("Fix login bug");
    expect(screen.getByTestId(FlyoutErrorRowTestId.Meta)).toHaveTextContent("Forge");
    expect(screen.getByTestId(FlyoutErrorRowTestId.Detail)).toHaveTextContent(
      "tests red: auth.spec.ts",
    );
  });

  it("falls back to a localized no-detail line when the run recorded no summary", () => {
    renderWithProviders(
      <FlyoutErrorRow
        run={{ ...run, taskOutcomeSummary: undefined }}
        runId={run.runId}
        subsystemName="Forge"
      />,
    );
    expect(screen.getByTestId(FlyoutErrorRowTestId.Detail)).toHaveTextContent(
      "Bez zaznamenaného detailu chyby.",
    );
  });

  it("still renders the run id when the run is no longer in the feed", () => {
    renderWithProviders(<FlyoutErrorRow run={undefined} runId="gone_1" subsystemName="Forge" />);
    expect(screen.getByTestId(FlyoutErrorRowTestId.Title)).toHaveTextContent("gone_1");
    expect(screen.getByTestId(FlyoutErrorRowTestId.Detail)).toHaveTextContent("archivován");
  });
});
