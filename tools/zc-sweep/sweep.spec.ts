import { promises as fs } from "node:fs";
import * as path from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { QUERY_REDIRECTS, ROUTE_MAP_REDIRECTS } from "../../e2e/route-map-redirects";

/**
 * ZB-14 / ZA-08 — the ROUTE-MAP §1/§2 live-browser sweep. NOT part of `pnpm e2e`
 * (own `testDir`/config, see `playwright.config.ts` in this folder): a one-off
 * validation tool, run by hand once per validation pass, not a CI gate.
 *
 * For every ROUTE-MAP §1 screen (using real ids from `global-setup.ts`'s seed)
 * and every §2 redirect, in light and dark, at 1440x900 and 390x844:
 * - asserts the response was ok and no error boundary / Next overlay rendered;
 * - collects `console.error`s (reported, not asserted — some pre-existing noise
 *   is out of scope for this phase, see PROGRESS.md's ZB-14 section);
 * - asserts no horizontal page overflow;
 * - saves a full-page screenshot to `.playwright-mcp/zc/`.
 */

const SCREENSHOT_DIR = path.resolve(".playwright-mcp/zc");

type SweepIds = {
  departmentId: string;
  departmentPipelineId: string;
  employeeId: string | null;
  chainId: string;
  goalId: string;
  companyId: string;
  teamId: string;
  projectId: string;
  integrationId: string;
  taskId: string | null;
  runId: string | null;
  positionId: string;
  skillId: string;
  mcpId: string;
  hookId: string;
  commandId: string;
  redirectAgentId: string;
  redirectPipelineId: string;
};

// `ids` is read from disk in `beforeAll`, which runs AFTER every `test()` call
// below has already registered (Playwright discovers tests by synchronously
// executing the file). So the per-route list is built with a STATIC id
// fallback (matching what `global-setup.ts` actually seeds) for the test
// title/screenshot slug, and the live value is read again inside each test
// body (after `beforeAll` has populated it) to decide the real path/skip.
let ids: SweepIds | undefined;

test.beforeAll(async () => {
  const raw = await fs.readFile(path.resolve(".e2e-data/zc-sweep-ids.json"), "utf-8");
  ids = JSON.parse(raw) as SweepIds;
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
});

interface RouteCase {
  /** ROUTE-MAP §1 label, used for the screenshot filename and test title. */
  slug: string;
  /** Resolves the real path from the live seeded ids, read after `beforeAll`. */
  path: (ids: SweepIds | undefined) => string;
  /** Skip reason — the route needs an id this environment couldn't seed. */
  skip?: (ids: SweepIds | undefined) => string | undefined;
}

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;
const THEMES = ["light", "dark"] as const;

function routes(): RouteCase[] {
  const dep = "dev";
  return [
    // --- ORG ---
    { slug: "org-map", path: () => "/org" },
    { slug: "org-map-focus", path: () => `/org?focus=${dep}` },
    { slug: "org-department-team", path: () => `/org/departments/${dep}/team` },
    { slug: "org-department-subtasks", path: () => `/org/departments/${dep}/subtasks` },
    { slug: "org-department-pipelines", path: () => `/org/departments/${dep}/pipelines` },
    {
      slug: "org-department-pipeline-detail",
      path: (i) => `/org/departments/${dep}/pipelines/${i?.departmentPipelineId ?? "demo-pipe"}`,
    },
    { slug: "org-department-handoff", path: () => `/org/departments/${dep}/handoff` },
    { slug: "org-department-skills", path: () => `/org/departments/${dep}/skills` },
    { slug: "org-department-integrations", path: () => `/org/departments/${dep}/integrations` },
    { slug: "org-department-automations", path: () => `/org/departments/${dep}/automations` },
    { slug: "org-department-hooks", path: () => `/org/departments/${dep}/hooks` },
    { slug: "org-people", path: () => "/org/people" },
    {
      slug: "org-people-detail",
      path: (i) => (i?.employeeId ? `/org/people/${i.employeeId}` : ""),
      skip: (i) =>
        i?.employeeId ? undefined : "no employee hired (POST /departments/dev/employees failed)",
    },
    { slug: "org-people-new", path: () => "/org/people/new" },

    // --- WORK ---
    { slug: "work-tasks", path: () => "/work/tasks" },
    {
      slug: "work-task-detail",
      path: (i) => (i?.taskId ? `/work/tasks/${i.taskId}` : ""),
      skip: (i) => (i?.taskId ? undefined : "no task created (POST /tasks failed)"),
    },
    { slug: "work-tasks-new", path: () => "/work/tasks/new" },
    { slug: "work-chains", path: () => "/work/chains" },
    { slug: "work-chain-detail", path: (i) => `/work/chains/${i?.chainId ?? "sweep-chain"}` },
    { slug: "work-chains-new", path: () => "/work/chains/new" },
    { slug: "work-goals", path: () => "/work/goals" },
    { slug: "work-goal-detail", path: (i) => `/work/goals/${i?.goalId ?? "sweep-goal"}` },
    { slug: "work-companies", path: () => "/work/companies" },
    {
      slug: "work-company-detail",
      path: (i) => `/work/companies/${i?.companyId ?? "sweep-company"}`,
    },
    { slug: "work-companies-new", path: () => "/work/companies/new" },
    { slug: "work-teams", path: () => "/work/teams" },
    { slug: "work-team-detail", path: (i) => `/work/teams/${i?.teamId ?? "sweep-team"}` },
    { slug: "work-teams-new", path: () => "/work/teams/new" },
    { slug: "work-projects", path: () => "/work/projects" },
    ...(["overview", "profile", "secrets", "integrations", "roadmap"] as const).map((tab) => ({
      slug: `work-project-${tab}`,
      path: (i: SweepIds | undefined) => `/work/projects/${i?.projectId ?? "demo-project"}/${tab}`,
    })),
    {
      slug: "work-project-integration-detail",
      path: (i) =>
        `/work/projects/${i?.projectId ?? "demo-project"}/integrations/${i?.integrationId ?? "team-slack"}`,
    },
    { slug: "work-projects-new", path: () => "/work/projects/new" },

    // --- ACTIVITY ---
    { slug: "activity-log", path: () => "/activity/log" },
    { slug: "activity-runs", path: () => "/activity/runs" },
    {
      slug: "activity-run-detail",
      path: (i) => (i?.runId ? `/activity/runs/${i.runId}` : ""),
      skip: (i) =>
        i?.runId ? undefined : "no run dispatched (sweep-agent task never got a runRef)",
    },
    { slug: "activity-inbox", path: () => "/activity/inbox" },
    { slug: "activity-briefings", path: () => "/activity/briefings" },

    // --- POLICY ---
    { slug: "policy-approvals", path: () => "/policy/approvals" },
    ...(["floor", "global", "project", "agent", "handoff", "signals", "mandate"] as const).map(
      (section) => ({
        slug: `policy-gates-${section}`,
        path: () => `/policy/gates?section=${section}`,
      }),
    ),
    { slug: "policy-patterns", path: () => "/policy/patterns" },

    // --- KNOWLEDGE ---
    { slug: "knowledge-vault", path: () => "/knowledge/vault" },
    { slug: "knowledge-vault-note", path: () => "/knowledge/vault?note=MEMORY.md" },
    { slug: "knowledge-distill", path: () => "/knowledge/distill" },

    // --- LEDGER ---
    { slug: "ledger-budgets", path: () => "/ledger/budgets" },
    { slug: "ledger-spend", path: () => "/ledger/spend" },

    // --- SYSTEM ---
    ...(
      [
        "general",
        "appearance",
        "coo",
        "activity",
        "automations",
        "runtime",
        "machine",
        "status",
      ] as const
    ).map((section) => ({
      slug: `system-settings-${section}`,
      path: () => `/system/settings/${section}`,
    })),
    ...(["skills", "mcp", "hooks", "commands"] as const).map((kind) => ({
      slug: `system-registries-${kind}`,
      path: () => `/system/registries/${kind}`,
    })),
    {
      slug: "system-registries-skills-detail",
      path: (i) => `/system/registries/skills/${i?.skillId ?? "demo-skill"}`,
    },
    {
      slug: "system-registries-mcp-detail",
      path: (i) => `/system/registries/mcp/${i?.mcpId ?? "sweep-mcp"}`,
    },
    {
      slug: "system-registries-hooks-detail",
      path: (i) => `/system/registries/hooks/${i?.hookId ?? "sweep-hook"}`,
    },
    {
      slug: "system-registries-commands-detail",
      path: (i) => `/system/registries/commands/${i?.commandId ?? "sweep-command"}`,
    },
    { slug: "system-registries-positions", path: () => "/system/registries/positions" },
    {
      slug: "system-registries-positions-detail",
      path: (i) => `/system/registries/positions/${i?.positionId ?? "sweep-agent"}`,
    },
  ];
}

/** Every §2 redirect worth a screenshot of the LANDED page (not just the URL —
 * `redirects.spec.ts`/§2 QUERY_REDIRECTS already assert the URL half). Static
 * pairs come straight from `redirects.spec.ts`; the two id-dependent ones
 * (`/agents/:id`, `/pipelines/:id`) are ROUTE-MAP §2 rows that table
 * deliberately excludes as "left uncovered — this table only fits static
 * pairs" — covered here instead, with the sweep's own seeded ids.
 */
function redirectRoutes(): RouteCase[] {
  const idRedirects: RouteCase[] = [
    {
      slug: "redirect-agents-id",
      path: (i) => `/agents/${i?.redirectAgentId ?? "gated-agent"}`,
    },
    {
      slug: "redirect-pipelines-id",
      path: (i) => `/pipelines/${i?.redirectPipelineId ?? "demo-pipe"}`,
    },
  ];
  const staticRedirects: RouteCase[] = [...ROUTE_MAP_REDIRECTS, ...QUERY_REDIRECTS].map(
    ([from]) => ({
      slug: `redirect-${from.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`,
      path: () => from,
    }),
  );
  return [...staticRedirects, ...idRedirects];
}

/** Sets the DS theme choice via the same `localStorage` key `DesignSystemProvider`
 * reads (`THEME_STORAGE_KEY` = `"zibby-theme"`) before any script runs, so the
 * page never flashes the wrong theme and never needs a UI toggle click. */
async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => window.localStorage.setItem("zibby-theme", t), theme);
}

/**
 * Every ROUTE-MAP §1 screen and every §2 redirect target lands inside the
 * shell (`AppFrame`), so a positive check that it actually mounted
 * (`app-frame-root`, `AppFrameTestId.Root`) is a much sharper crash signal
 * than a negative text/overlay search: an uncaught render error unmounts the
 * whole tree (this testid disappears), while `<nextjs-portal>` is ALSO the
 * always-present Next.js dev-tools indicator — asserting its absence is a
 * false positive on every route, not just crashed ones (found running this
 * spec: every route "failed" on that assertion). The generic "Application
 * error" digest text is kept as a second, redundant check for the one case
 * that renders outside the shell (a root-segment `error.tsx` boundary).
 */
async function assertNoCrash(page: Page): Promise<void> {
  await expect(page.getByTestId("app-frame-root")).toBeVisible();
  await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
}

/**
 * Every fresh page load (each Playwright test gets its own browser context, so
 * every `goto` here is a cold load, not an in-SPA navigation) plays the DS
 * `Splash` boot choreography (`BootSplash`) over the real content underneath.
 * It has its own minimum-visible timing and fades out once ready, so a fixed
 * short wait isn't reliable — wait for it to actually unmount instead. Some
 * routes may not show it at all (an occasional CI-shared context) — that's
 * fine, `waitFor({state: "detached"})` on an element that's already gone
 * resolves immediately.
 */
async function waitForSplashGone(page: Page): Promise<void> {
  await page
    .getByTestId("splash-root")
    .waitFor({ state: "detached", timeout: 8000 })
    .catch(() => {});
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `document.documentElement.scrollWidth (${overflow.scrollWidth}) > innerWidth + 1 (${overflow.innerWidth + 1})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
  // The document check alone is blind to content clipped *inside* the shell:
  // `AppFrame`'s root is `overflow-x-hidden`, so a body track wider than the
  // viewport never reaches `documentElement.scrollWidth`. Assert the shell's
  // body itself fits (wide page content must scroll inside `<main>` instead).
  const bodyWidth = await page
    .getByTestId("app-frame-body")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(
    bodyWidth,
    `app-frame-body width (${bodyWidth}) > innerWidth + 1 (${overflow.innerWidth + 1})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name}px / ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of routes()) {
        test(`${route.slug}`, async ({ page }) => {
          const skipReason = route.skip?.(ids);
          const targetPath = route.path(ids);
          test.skip(!targetPath, skipReason ?? "no path");
          const consoleErrors: string[] = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
          });
          await setTheme(page, theme);

          const res = await page.goto(targetPath);
          expect(res?.ok(), `${targetPath} responded ${res?.status()}`).toBeTruthy();
          // Not `networkidle`: the shell holds an open SSE connection (run events,
          // activity feed) on every page, so the network is never idle — that wait
          // would just eat the whole test timeout. Wait for the boot splash to
          // clear instead (every test is a cold load — see `waitForSplashGone`).
          await waitForSplashGone(page);
          await assertNoCrash(page);
          await assertNoHorizontalOverflow(page);

          await page.screenshot({
            fullPage: true,
            path: path.join(SCREENSHOT_DIR, `${route.slug}-${theme}-${viewport.width}.png`),
          });

          if (consoleErrors.length > 0) {
            console.log(
              `[console errors] ${targetPath} (${theme}, ${viewport.width}px):`,
              consoleErrors,
            );
          }
        });
      }

      for (const route of redirectRoutes()) {
        test(`${route.slug}`, async ({ page }) => {
          const targetPath = route.path(ids);
          await setTheme(page, theme);
          const res = await page.goto(targetPath);
          expect(res?.ok(), `${targetPath} responded ${res?.status()}`).toBeTruthy();
          await waitForSplashGone(page);
          await assertNoCrash(page);
          await page.screenshot({
            fullPage: true,
            path: path.join(SCREENSHOT_DIR, `${route.slug}-${theme}-${viewport.width}.png`),
          });
        });
      }
    });
  }
}
