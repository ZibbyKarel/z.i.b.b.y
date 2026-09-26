import { expect, test } from "@playwright/test";

const API = "http://localhost:3333";

/**
 * Throughline (Phase 5.3): a seeded inbound message is ingested and triaged by the
 * watcher unprompted, surfaces as a pending channel approval, and approving it
 * flips the inbox item to handled. The autonomy contract end to end — ZIBBY
 * prepares the reply but a human releases it.
 *
 * F8d: `/overview`'s standalone approvals queue (where this spec used to click
 * "Approve") is gone, and — unlike the seeded AGENT approval in approval.spec — a
 * CHANNEL approval's `runId` is a compound `<integrationId>/<itemId>` ref (contract
 * `ApprovalRunKindSchema` docblock), not a real entry in the unified runs feed. It
 * never appears in `/chat`'s task gutter or any `RunDetail`, and (per
 * `apps/api/src/departments/departments.service.ts`'s own docblock) it has no owning
 * department either, so it never lights up the status pill's "waiting" flyout —
 * that trigger only counts approvals attributable to an owned pipeline/chain run.
 * **A channel approval currently has no UI surface to decide it from at all** — a
 * regression this deletion phase surfaces rather than causes (flagged in the F8d
 * report). Approving it here goes straight at the REST endpoint
 * (`POST /api/approvals/:id/approve`, the same call `useApproveMutation` makes),
 * matching `global-setup.ts`'s own `page.request` convention, so the rest of the
 * throughline (triage → decide → handled) still runs end to end.
 */
test("a triaged inbound message surfaces an approval; approving it handles the item", async ({
  page,
}) => {
  // The reply-research poll below budgets 60s on its own (a real `claude` CLI
  // call, not a fixed-latency UI wait) — extend this test's own timeout past
  // the suite default (60s total) so that budget doesn't eat every other step's
  // allowance too.
  test.setTimeout(120_000);

  // The watcher (fast tick seeded via system config) ingests + triages the seeded
  // Tier-3 fixture. The inbox lives on the owning project's detail page now
  // (the `integrations` route-tab, ZB-06) — there is no standalone /integrations
  // route. The seeded integration is owned by `demo-project`, so its item shows here.
  //
  // This route's dynamic `[tab]` segment can hit a Turbopack dev-server cold-compile
  // race the very first time anything requests it in a session (a bare module
  // binding reads as `undefined` mid-compile, e.g. `PROJECT_TABS.includes is not a
  // function") — a dev-only artifact `next build` never reproduces, not a real app
  // bug. A reload once the module has finished compiling clears it.
  await page.goto("/work/projects/demo-project/integrations");
  if (
    await page
      .getByText("Application error")
      .isVisible()
      .catch(() => false)
  ) {
    await page.reload();
  }
  const inbox = page.getByTestId("inbox-panel");
  await expect(inbox).toBeVisible({ timeout: 20000 });

  // The drafted reply becomes a channel approval (kind "channel") in the durable
  // approvals queue as a SEPARATE step after the watcher tick triages the item —
  // poll the API for it first (matching `global-setup.ts`'s own convention) rather
  // than asserting the UI's "needs approval" tag directly: the tag only appears
  // once `item.approvalId` is set, which can lag a visible "triaged" state tag by
  // more than one render, so checking the API's own source of truth first and
  // reloading avoids racing that window.
  //
  // The wait budget is generous (not the usual 20s): unlike the fixed-latency
  // steps elsewhere in this file, this step's own latency is a REAL `claude` CLI
  // subprocess researching the item (`ReplyDraftService`'s own
  // `RESEARCH_TIMEOUT_MS = 300_000` — "this reads a repo, unlike the 8s
  // triager") — genuinely slower and more variable than anything else this spec
  // waits on, especially against a cold model/network.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${API}/api/approvals`, {
          params: { status: "pending" },
        });
        const pending = (await res.json()) as Array<{ id: string; kind: string }>;
        return pending.find((a) => a.kind === "channel")?.id;
      },
      { timeout: 60000 },
    )
    .toBeTruthy();

  const res = await page.request.get(`${API}/api/approvals`, { params: { status: "pending" } });
  const pending = (await res.json()) as Array<{ id: string; kind: string }>;
  const channelApproval = pending.find((a) => a.kind === "channel");
  if (!channelApproval) throw new Error("no pending channel approval found");

  await page.reload();
  await expect(inbox.getByText("needs approval")).toBeVisible({ timeout: 20000 });

  await page.request.post(`${API}/api/approvals/${channelApproval.id}/approve`);

  // Back on the project inbox, the item is now handled (the reply was sent on approve).
  await page.goto("/work/projects/demo-project/integrations");
  await expect(page.getByTestId("inbox-panel").getByText("handled").first()).toBeVisible({
    timeout: 20000,
  });
});
