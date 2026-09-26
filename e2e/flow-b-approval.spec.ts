import { expect, request, test } from "@playwright/test";

const API = "http://localhost:3333";

/**
 * ZB-14 — Information Architecture "Flow B: Approving a gate", steps 02-04 and
 * half of 06 (`design/ZibbyCorp/Information Architecture.dc.html`): a gated
 * run surfaces a pending approval in the NEEDS YOU rail, opening it shows the
 * approval sheet, and denying with a reason removes it from the rail and
 * records the decision.
 *
 * Seeded the same way `e2e/global-setup.ts` seeds its own gated-agent
 * approval (a `requires_approval` agent + a task dispatched at it as an
 * explicit target) — but with its own unique id, so this spec doesn't race
 * `approval.spec.ts` for the shared fixture (both may run in the same suite).
 *
 * NOT covered here, and why:
 * - Step 01 ("Gate fires") and step 05 ("Resume" — deny sends the run back
 *   into a bounded department retry) both live inside the agent run itself.
 *   This sandbox's `claude` runner is the deterministic `fake-claude.mjs`
 *   fixture (see `playwright.config.ts`), which is enough to pause on the
 *   approval, but the retry-after-deny path isn't exercised here — that's the
 *   `HIGH_RISK_TYPES` retry-budget logic, covered by the API's own e2e suite,
 *   not this UI throughline.
 * - Step 06's second half ("repeated approvals turn into suggested rules") is
 *   `/policy/patterns`, a separate, unrelated read model.
 */
test("an approval is denied with a reason from the sheet, and the denial is recorded", async ({
  page,
}) => {
  const agentId = `flow-b-agent-${Date.now().toString(36)}`;
  const agentName = `Flow B Agent ${Date.now().toString(36)}`;
  const ctx = await request.newContext({ baseURL: API });
  await ctx.post("/api/agents", {
    data: {
      id: agentId,
      name: agentName,
      instructions: "needs approval, for the Flow B smoke spec",
      requires_approval: true,
      risk: "high",
      department: "dev",
    },
  });
  await ctx.post("/api/tasks", {
    data: {
      text: "do something risky (flow b)",
      paths: [],
      target: { kind: "agent", id: agentId, name: agentName, glyph: "bot" },
    },
  });

  // Poll until the seeded run actually pauses on its approval (async — the
  // demo runner produces it, same as `global-setup.ts`'s own wait).
  let approvalId: string | undefined;
  let runId: string | undefined;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !approvalId) {
    const res = await ctx.get("/api/approvals", { params: { status: "pending" } });
    const pending = (await res.json()) as Array<{ id: string; skill?: string; runId?: string }>;
    const found = pending.find((a) => a.skill === agentName);
    approvalId = found?.id;
    runId = found?.runId;
    if (!approvalId) await new Promise((r) => setTimeout(r, 250));
  }
  await ctx.dispose();
  expect(approvalId, "the seeded gated task never produced a pending approval").toBeTruthy();

  // The NEEDS YOU rail, on any page.
  await page.goto("/org");
  const card = page
    .getByTestId("approval-card-root")
    .filter({ has: page.getByTestId("approval-card-name").getByText(agentName) });
  await expect(card).toBeVisible({ timeout: 20000 });

  // Open the sheet via the card's "→" (Flow B step 02→03).
  await card.getByTestId("approval-card-open").click();
  await expect(page).toHaveURL(new RegExp(`\\?approval=${approvalId}$`));

  // Deny with a reason (step 04) — never approve/merge by default in this spec.
  // Scoped to the sheet's own footer: the shared rail can carry other pending
  // approvals (other specs, other runs against the same `.e2e-data`), each
  // with its own card-level "Deny" button, so an unscoped role query is
  // ambiguous.
  const sheetFooter = page.getByTestId("sheet-footer");
  await sheetFooter.getByRole("button", { name: "Deny" }).click();
  const reason = "Flow B smoke spec: deliberate denial";
  await page.getByLabel("Reason (optional)").fill(reason);
  await sheetFooter.getByRole("button", { name: "Confirm deny" }).click();

  // The durable outcome: the card leaves the rail...
  await expect(card).toHaveCount(0, { timeout: 20000 });

  // ...and the decision is recorded in the approvals history. The history
  // table (`ApprovalsScreen`) has no agent-name column — its "task" column
  // shows `a.runId` (the fake-claude runner's generic intent text isn't
  // unique per test run, but the run id is), so assert on that instead.
  await page.goto("/policy/approvals");
  expect(runId, "the pending approval carried no runId").toBeTruthy();
  await expect(page.getByText(runId as string)).toBeVisible({ timeout: 20000 });
});
