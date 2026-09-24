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
  it("shows the failed run's title, department and error detail", () => {
    renderWithProviders(<FlyoutErrorRow departmentName="Dev" run={run} runId={run.runId} />);
    expect(screen.getByTestId(FlyoutErrorRowTestId.Title)).toHaveTextContent("Fix login bug");
    expect(screen.getByTestId(FlyoutErrorRowTestId.Meta)).toHaveTextContent("Dev");
    expect(screen.getByTestId(FlyoutErrorRowTestId.Detail)).toHaveTextContent(
      "tests red: auth.spec.ts",
    );
  });

  it("links to the run's archive detail", () => {
    renderWithProviders(<FlyoutErrorRow departmentName="Dev" run={run} runId={run.runId} />);
    expect(screen.getByTestId(FlyoutErrorRowTestId.Link)).toHaveAttribute(
      "href",
      "/archiv?run=delivery_1",
    );
  });

  it("still links to the archive when the run is no longer in the feed", () => {
    renderWithProviders(<FlyoutErrorRow departmentName="Dev" run={undefined} runId="gone_1" />);
    expect(screen.getByTestId(FlyoutErrorRowTestId.Link)).toHaveAttribute(
      "href",
      "/archiv?run=gone_1",
    );
  });

  it("falls back to a localized no-detail line when the run recorded no summary", () => {
    renderWithProviders(
      <FlyoutErrorRow
        departmentName="Dev"
        run={{ ...run, taskOutcomeSummary: undefined }}
        runId={run.runId}
      />,
    );
    expect(screen.getByTestId(FlyoutErrorRowTestId.Detail)).toHaveTextContent(
      "Bez zaznamenaného detailu chyby.",
    );
  });

  it("still renders the run id when the run is no longer in the feed", () => {
    renderWithProviders(<FlyoutErrorRow departmentName="Dev" run={undefined} runId="gone_1" />);
    expect(screen.getByTestId(FlyoutErrorRowTestId.Title)).toHaveTextContent("gone_1");
    expect(screen.getByTestId(FlyoutErrorRowTestId.Detail)).toHaveTextContent(
      "Běh už není v přehledu.",
    );
  });
});
