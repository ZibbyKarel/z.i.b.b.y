import { expect, test } from "@playwright/test";

const API = "http://localhost:3333";

/**
 * Accountability (Phase 6, F8a/D19): a generated briefing persists, records a
 * `briefing-generated` activity entry, and — since F8a (O6) — renders as its own
 * message variant in the chat transcript (`BriefingMessageCard`), not a page section.
 *
 * F8d: `/overview`'s `BriefingCard` (with its own "Generate now" button) is gone, and
 * `BriefingMessageCard` deliberately has **no live control surface** of its own (its
 * own docblock: "a past turn is a fixed snapshot of the briefing that was generated,
 * not a live control surface") — there is currently no UI button anywhere that
 * triggers an on-demand briefing the way the deleted page's could. This is a gap
 * this deletion phase surfaces rather than causes (flagged in the F8d report; the
 * only other caller is the unattended morning automation). Generating here goes
 * straight at the REST endpoint (`POST /api/briefing/generate`, the same call
 * `useGenerateBriefingMutation` makes) — chat is deliberately single-thread
 * (`ChatTranscriptStore`'s own docblock), so a fresh `/chat` load with no
 * `conversationId` yet resolves to the exact same "active conversation" the
 * briefing sink (`ChatBriefingSinkService.announce`) just appended to, and the
 * right-rail activity log doesn't survive to `/chat` at all — `ChatLiveLog`
 * (`features/chat/components/ChatLiveLog.tsx`) is its F8c replacement.
 */
test("generating a briefing appends it to the chat transcript", async ({ page }) => {
  const res = await page.request.post(`${API}/api/briefing/generate`);
  expect(res.ok()).toBe(true);
  const {
    briefing: { headline },
  } = (await res.json()) as { briefing: { headline: string } };

  await page.goto("/chat");

  // `BriefingMessageCardTestId.Root` — the transcript's briefing card variant.
  await expect(page.getByTestId("chat-briefing-message-card")).toBeVisible({ timeout: 20000 });
  // `BriefingCardTestId.Headline` — the row sub-component `BriefingMessageCard`
  // reuses verbatim from `features/briefing/components/BriefingRows` (D18), so the
  // testid string is unchanged even though the page it renders on is not.
  await expect(page.getByTestId("briefing-headline")).toHaveText(headline, { timeout: 20000 });
});
