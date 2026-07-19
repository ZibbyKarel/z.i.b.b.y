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
 * `apps/api/src/subsystems/subsystems.service.ts`'s own docblock) it has no owning
 * subsystem either, so it never lights up the status pill's "waiting" flyout —
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
  // The watcher (fast tick seeded via system config) ingests + triages the seeded
  // Tier-3 fixture. The inbox lives on the owning project's detail page now
  // (integrations tab, addressable via `?tab=`) — there is no standalone /integrations
  // route. The seeded integration is owned by `demo-project`, so its item shows here.
  await page.goto("/projects/demo-project?tab=integrations");
  const inbox = page.getByTestId("inbox-panel");
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await expect(inbox.getByText("needs approval")).toBeVisible({ timeout: 20000 });

  // The drafted reply is waiting as a channel approval (kind "channel") in the
  // durable approvals queue. Poll for it (the watcher tick is async) and approve it
  // directly — see the module doc for why there is no UI path to click through.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${API}/api/approvals`, {
          params: { status: "pending" },
        });
        const pending = (await res.json()) as Array<{ id: string; kind: string }>;
        return pending.find((a) => a.kind === "channel")?.id;
      },
      { timeout: 20000 },
    )
    .toBeTruthy();

  const res = await page.request.get(`${API}/api/approvals`, { params: { status: "pending" } });
  const pending = (await res.json()) as Array<{ id: string; kind: string }>;
  const channelApproval = pending.find((a) => a.kind === "channel");
  if (!channelApproval) throw new Error("no pending channel approval found");
  await page.request.post(`${API}/api/approvals/${channelApproval.id}/approve`);

  // Back on the project inbox, the item is now handled (the reply was sent on approve).
  await page.goto("/projects/demo-project?tab=integrations");
  await expect(page.getByTestId("inbox-panel").getByText("handled").first()).toBeVisible({
    timeout: 20000,
  });
});
