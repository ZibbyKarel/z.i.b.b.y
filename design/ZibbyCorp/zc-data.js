(function () {
  if (window.ZC) return;
  const subs = new Set();
  const ZC = {
    on(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit() {
      ZC.v++;
      subs.forEach((f) => f());
    },
    v: 0,
  };
  const pad = (n, w) => String(n).padStart(w || 2, "0");
  ZC.pad = pad;

  ZC.depts = [
    ["dev", "DEV", "Development", "Plans and implements tasks, then returns a PR."],
    [
      "ops",
      "OPS",
      "Monitoring & Ops",
      "Watches channels, calendar and CI on a heartbeat, and triages inbound work.",
    ],
    [
      "sec",
      "SEC",
      "Security",
      "Tracks CVEs and secret leaks, and guards the boundary to the outside world.",
    ],
    [
      "rel",
      "REL",
      "Release Management",
      "Prepares releases and changelogs, and waits for you to approve merges.",
    ],
    ["inc", "INC", "Incident Response", "Escalates critical issues: Tier-3 surface-and-wait."],
    ["rnd", "RND", "R&D", "Runs research and hands the result on as an artifact."],
    [
      "com",
      "COM",
      "Communications",
      "Speaks for the company externally and asks when information is missing.",
    ],
    [
      "qa",
      "QA",
      "QA & Architecture",
      "Proactively scans code quality and passes findings to Development.",
    ],
    [
      "knw",
      "KNW",
      "Knowledge Management",
      "Maintains the memory vault, grounding and nightly distillation.",
    ],
    ["fin", "FIN", "Finance", "Manages budgets, run caps and subscription thresholds."],
    ["per", "PER", "Personal Office", "Handles your personal life, separate from work."],
  ].map(([id, code, name, desc]) => ({ id, code, name, desc }));
  ZC.D = (id) => ZC.depts.find((d) => d.id === id);

  ZC.agents = [
    ["Kevin", "Architect", "idle", null, null, "Waiting in pool"],
    ["Stuart", "Coder", "thinking", "dev", "TSK-0142", "Addressing review comments on PR #318"],
    ["Bob", "Coder", "blocked", "dev", "TSK-0143", "Waiting: push fix/checkout-flake"],
    ["Dave", "Reviewer", "working", "dev", "TSK-0142", "Reviewing PR #318 · 14 files"],
    ["Tim", "Tester", "working", "dev", "TSK-0144", "Running auth test suite · 88/140"],
    ["Mark", "Documenter", "blocked", "dev", "TSK-0150", "Handoff of PR #322 awaits approval"],
    ["Otto", "Researcher", "thinking", "rnd", "TSK-0146", "Comparing pgvector, Qdrant and LanceDB"],
    ["Mel", "Summarizer", "idle", null, null, "Waiting in pool"],
    ["Sid", "Triager", "working", "inc", "TSK-0145", "Correlating 5xx with deploy api@2.14.0"],
    ["Ray", "Watcher", "working", "ops", null, "Heartbeat · inbox, calendar, CI"],
    ["Carl", "Scanner", "idle", null, null, "Waiting in pool"],
    ["Phil", "Release Manager", "idle", null, null, "Waiting in pool"],
    ["Lance", "Changelog Writer", "done", "rel", "TSK-0147", "Wrote CHANGELOG.md for api 2.14"],
    [
      "Gus",
      "Incident Commander",
      "working",
      "inc",
      "TSK-0145",
      "Leading the /v2/orders 5xx investigation",
    ],
    ["Larry", "Writer", "blocked", "com", "TSK-0147", "Needs the public release date"],
    ["Paul", "Auditor", "done", "qa", "TSK-0148", "Filed 14 findings in api"],
    ["Hank", "Librarian", "idle", null, null, "Waiting in pool"],
    ["Abe", "Distiller", "idle", null, null, "Waiting in pool"],
    ["Earl", "Accountant", "blocked", "fin", null, "Awaiting SDK credit cap decision"],
    ["Ned", "Assistant", "working", "per", "TSK-0149", "Comparing dentist slots for next week"],
    ["Jorge", "Coder", "done", "dev", "TSK-0144", "Bumped jsonwebtoken to 9.0.3"],
    ["Ken", "Coder", "error", "dev", "TSK-0148", "Worktree conflict on services/orders"],
  ].map(([name, role, state, dept, task, now], i) => ({
    id: "AG-" + pad(i + 1),
    name,
    role,
    state,
    dept,
    task,
    now,
  }));
  ZC.A = (id) => ZC.agents.find((a) => a.id === id);
  ZC.byName = (n) => ZC.agents.find((a) => a.name === n);
  ZC.coo = { id: "COO", name: "Zibby", role: "Chief Operating Officer", state: "working" };

  const TOOLS = {
    Architect: ["repo.read", "docs.write", "plan.write"],
    Coder: ["repo.read", "repo.write", "shell", "git.push", "pr.open"],
    Reviewer: ["repo.read", "pr.review", "ci.read"],
    Tester: ["shell", "ci.run", "repo.read"],
    Documenter: ["docs.write", "repo.read", "pr.comment"],
    Researcher: ["web.search", "web.fetch", "docs.write"],
    Summarizer: ["docs.read", "docs.write"],
    Triager: ["inbox.read", "tasks.create", "slack.read"],
    Watcher: ["slack.read", "gmail.read", "calendar.read", "ci.read"],
    Scanner: ["cve.lookup", "repo.read", "secrets.scan"],
    "Release Manager": ["git.tag", "ci.run", "release.draft"],
    "Changelog Writer": ["repo.read", "docs.write"],
    "Incident Commander": ["sentry.read", "logs.query", "slack.post"],
    Writer: ["docs.write", "slack.post", "email.draft"],
    Auditor: ["repo.read", "lint.run", "docs.write"],
    Librarian: ["vault.read", "vault.write"],
    Distiller: ["vault.read", "vault.write", "docs.read"],
    Accountant: ["ledger.read", "billing.read", "sheets.write"],
    Assistant: ["calendar.write", "email.draft", "web.search"],
  };
  ZC.tools = (a) => TOOLS[a.role] || [];

  ZC.chains = [
    [
      "feature",
      "Feature",
      ["rnd", "dev", "rel"],
      ["auto", "ask"],
      "New capability: research, build, release.",
    ],
    ["bugfix", "Bugfix", ["dev", "rel"], ["ask"], "Known defect with a clear fix."],
    [
      "hotfix",
      "Hotfix",
      ["inc", "dev", "rel"],
      ["auto", "ask"],
      "Production incident that needs a code change.",
    ],
    [
      "secpatch",
      "Security patch",
      ["sec", "dev", "rel"],
      ["auto", "ask"],
      "CVE or leaked secret that needs remediation.",
    ],
    [
      "research",
      "Research",
      ["rnd", "knw"],
      ["auto"],
      "Question answered and filed into the vault.",
    ],
    ["announce", "Announcement", ["rel", "com"], ["ask"], "Public note about a shipped release."],
    [
      "sweep",
      "Quality sweep",
      ["qa", "dev"],
      ["ask"],
      "Proactive scan, findings fixed in Development.",
    ],
    ["personal", "Personal", ["per"], [], "Errands and life admin, kept apart from work."],
    ["finance", "Finance review", ["fin"], [], "Budget or spend question."],
  ].map(([id, name, route, gates, desc]) => ({ id, name, route, gates, desc }));
  ZC.C = (id) => ZC.chains.find((c) => c.id === id);

  ZC.pipelines = {
    dev: [
      [
        "DELIVERY",
        ["Architect", "Coder", "Reviewer", "Tester", "Documenter"],
        [
          [1, 2],
          [2, 3],
        ],
      ],
      ["QUICKFIX", ["Coder", "Reviewer", "Tester"], [[0, 1]]],
    ],
    ops: [
      ["TRIAGE", ["Watcher", "Triager"], []],
      ["HEARTBEAT", ["Watcher"], []],
    ],
    sec: [
      ["SCAN", ["Scanner", "Reviewer"], []],
      ["ASSESS", ["Scanner", "Architect"], []],
    ],
    rel: [["RELEASE", ["Changelog Writer", "Release Manager"], []]],
    inc: [["RESPOND", ["Incident Commander", "Triager", "Summarizer"], []]],
    rnd: [["RESEARCH", ["Researcher", "Summarizer"], []]],
    com: [["ANNOUNCE", ["Writer", "Reviewer"], [[0, 1]]]],
    qa: [["SWEEP", ["Auditor", "Architect"], []]],
    knw: [["DISTILL", ["Librarian", "Distiller"], []]],
    fin: [["BUDGET CHECK", ["Accountant"], []]],
    per: [["ERRANDS", ["Assistant"], []]],
  };

  const T = (id, title, chain, project, source, picked, cost, updated, subs, output) => ({
    id,
    title,
    chain,
    project,
    source,
    picked,
    cost,
    updated,
    output,
    subs: subs.map(([dept, pipeline, state, step, produces], i) => ({
      id: id + "." + (i + 1),
      dept,
      pipeline,
      state,
      step,
      produces,
    })),
  });
  ZC.tasks = [
    T(
      "TSK-0150",
      "Add dark mode to settings",
      "feature",
      "client-portal",
      "COO chat",
      "auto",
      3.1,
      "4M",
      [
        ["rnd", "RESEARCH", "done", "SUMMARIZER", "dark-mode-notes.md"],
        ["dev", "DELIVERY", "blocked", "DOCUMENTER", "PR #322"],
        ["rel", "RELEASE", "idle", "", ""],
      ],
    ),
    T(
      "TSK-0149",
      "Renew passport and book dentist",
      "personal",
      null,
      "COO voice",
      "auto",
      0.42,
      "2M",
      [["per", "ERRANDS", "working", "ASSISTANT", ""]],
    ),
    T("TSK-0148", "Weekly quality sweep: api", "sweep", "api", "Automation", "fixed", 1.95, "9M", [
      ["qa", "SWEEP", "done", "ARCHITECT", "findings.md"],
      ["dev", "DELIVERY", "error", "CODER", ""],
    ]),
    T(
      "TSK-0147",
      "Announce api 2.14 release",
      "announce",
      "api",
      "Release Management",
      "fixed",
      0.88,
      "11M",
      [
        ["rel", "RELEASE", "done", "RELEASE MANAGER", "CHANGELOG.md"],
        ["com", "ANNOUNCE", "blocked", "WRITER", ""],
      ],
    ),
    T(
      "TSK-0146",
      "Compare vector DB options for the vault",
      "research",
      "zibby",
      "COO voice",
      "auto",
      1.21,
      "1M",
      [
        ["rnd", "RESEARCH", "thinking", "RESEARCHER", ""],
        ["knw", "DISTILL", "idle", "", ""],
      ],
    ),
    T(
      "TSK-0145",
      "Investigate 5xx spike on /v2/orders",
      "hotfix",
      "api",
      "Slack #alerts",
      "auto",
      2.64,
      "1M",
      [
        ["inc", "RESPOND", "working", "TRIAGER", ""],
        ["dev", "QUICKFIX", "idle", "", ""],
        ["rel", "RELEASE", "idle", "", ""],
      ],
    ),
    T(
      "TSK-0144",
      "Patch CVE-2026-3141 in jsonwebtoken",
      "secpatch",
      "api",
      "GitHub advisory",
      "auto",
      2.02,
      "3M",
      [
        ["sec", "SCAN", "done", "REVIEWER", "cve-assessment.md"],
        ["dev", "QUICKFIX", "working", "TESTER", ""],
        ["rel", "RELEASE", "idle", "", ""],
      ],
    ),
    T(
      "TSK-0143",
      "Fix flaky checkout test",
      "bugfix",
      "api",
      "GitHub #77",
      "override",
      1.37,
      "4M",
      [
        ["dev", "QUICKFIX", "blocked", "CODER", ""],
        ["rel", "RELEASE", "idle", "", ""],
      ],
    ),
    T(
      "TSK-0142",
      "Add OAuth login to the client portal",
      "feature",
      "client-portal",
      "COO chat",
      "auto",
      4.82,
      "2M",
      [
        ["rnd", "RESEARCH", "done", "SUMMARIZER", "research.md"],
        ["dev", "DELIVERY", "working", "REVIEWER", ""],
        ["rel", "RELEASE", "idle", "", ""],
      ],
    ),
    T(
      "TSK-0141",
      "Fix rate limiter off-by-one",
      "bugfix",
      "api",
      "Jira API-212",
      "auto",
      1.12,
      "2H",
      [
        ["dev", "QUICKFIX", "done", "TESTER", "PR #311"],
        ["rel", "RELEASE", "done", "RELEASE MANAGER", "api@2.14.0"],
      ],
      "api@2.14.0",
    ),
    T(
      "TSK-0139",
      "Summarize Q3 spend",
      "finance",
      null,
      "COO chat",
      "auto",
      0.31,
      "5H",
      [["fin", "BUDGET CHECK", "done", "ACCOUNTANT", "q3-spend.md"]],
      "q3-spend.md",
    ),
  ];
  ZC.Tk = (id) => ZC.tasks.find((t) => t.id === id);
  ZC.taskState = (t) => {
    const s = t.subs.map((x) => x.state);
    for (const k of ["error", "blocked", "working", "thinking"]) if (s.includes(k)) return k;
    return s.every((x) => x === "done") ? "done" : "idle";
  };
  ZC.subAgents = (s) =>
    ZC.agents.filter(
      (a) => a.task === s.id.split(".")[0] && a.dept === s.dept && s.state !== "idle",
    );
  ZC.subtasksOf = (dept) => {
    const r = [];
    ZC.tasks.forEach((t) =>
      t.subs.forEach((s) => {
        if (s.dept === dept) r.push(Object.assign({ task: t }, s));
      }),
    );
    return r;
  };

  ZC.projects = [
    [
      "client-portal",
      "acme/client-portal",
      "main",
      "feature",
      "standard",
      120,
      "Next.js app for customers",
    ],
    ["api", "acme/api", "main", "bugfix", "strict", 260, "Core REST and webhooks API"],
    ["zibby", "zibbykarel/z.i.b.b.y", "main", "feature", "standard", 80, "This agent OS"],
    ["mobile", "acme/mobile", "develop", "bugfix", "strict", 60, "iOS and Android apps"],
    ["personal-site", "zibbykarel/site", "main", "feature", "relaxed", 20, "Personal website"],
  ].map(([id, repo, branch, chain, gate, cap, desc]) => ({
    id,
    repo,
    branch,
    chain,
    gate,
    cap,
    desc,
  }));

  ZC.companies = [
    {
      id: "acme",
      name: "Acme Corp",
      desc: "Logistics platform. We run their core API and the mobile apps.",
      budget: { daily: 40, weekly: 220, monthly: 800, cap: 1000 },
      projectIds: ["api", "mobile"],
      team: [
        {
          id: "ct1",
          name: "Priya Shah",
          role: "Engineering lead",
          vip: true,
          note: "Files bugs in Jira, expects a reply the same day",
        },
        {
          id: "ct2",
          name: "Tom Berg",
          role: "Product owner",
          vip: false,
          note: "Weekly sync on Tuesdays",
        },
      ],
    },
    {
      id: "northwind",
      name: "Northwind Traders",
      desc: "Wholesale distributor. Customer portal rollout planned for Q4.",
      budget: { daily: 20, weekly: 100, monthly: 350, cap: 500 },
      projectIds: ["client-portal"],
      team: [
        {
          id: "ct3",
          name: "Dana Kovac",
          role: "IT manager",
          vip: true,
          note: "Asked about SSO before rollout",
        },
        { id: "ct4", name: "Marek Novak", role: "Procurement", vip: false, note: "" },
      ],
    },
    {
      id: "fabrikam",
      name: "Fabrikam",
      desc: "Prospect. Onboarding is scoped, no repositories linked yet.",
      budget: { daily: 10, weekly: 40, monthly: 150, cap: 200 },
      projectIds: [],
      team: [{ id: "ct5", name: "Lena Ortiz", role: "CTO", vip: false, note: "" }],
    },
  ];
  ZC.Co = (id) => ZC.companies.find((c) => c.id === id);
  ZC.coOf = (pid) => (pid ? ZC.companies.find((c) => c.projectIds.includes(pid)) : null);

  ZC.approvals = [
    {
      id: "AP-0091",
      kind: "PUSH",
      task: "TSK-0143",
      dept: "dev",
      agent: "AG-03",
      wait: "4M",
      text: "Push fix/checkout-flake to origin",
      rule: "api · git.push to a shared remote asks",
      diff: [
        "--- a/tests/checkout.spec.ts",
        "+++ b/tests/checkout.spec.ts",
        "@@ -41,7 +41,9 @@",
        '-  await page.click("#pay")',
        "+  await page.waitForResponse(/\\/cart\\/total/)",
        '+  await page.click("#pay")',
        "   await expect(page).toHaveURL(/success/)",
      ],
    },
    {
      id: "AP-0092",
      kind: "QUESTION",
      task: "TSK-0147",
      dept: "com",
      agent: "AG-15",
      wait: "11M",
      text: "What is the public release date for api 2.14?",
      rule: "Communications asks when information is missing",
      diff: [
        "Draft · announcement.md",
        "",
        "# api 2.14 is out",
        "Released on [DATE]. Rate limiter fix, webhooks v2 GA…",
      ],
    },
    {
      id: "AP-0093",
      kind: "HANDOFF",
      task: "TSK-0150",
      dept: "dev",
      agent: "AG-06",
      wait: "19M",
      text: "Hand off PR #322 to Release Management",
      rule: "Handoff DEV → REL asks",
      diff: [
        "PR #322 · feat(settings): dark mode",
        "12 files · +418 −37 · checks 24/24",
        "Artifact: PR #322 → Release Management",
      ],
    },
    {
      id: "AP-0094",
      kind: "SPEND",
      task: null,
      dept: "fin",
      agent: "AG-19",
      wait: "26M",
      text: "Raise Agent SDK credit cap from $40 to $60",
      rule: "Floor · spend limit changes always ask",
      diff: [
        "Agent SDK credit · month",
        "Used $36.20 of $40.00 (90.5%)",
        "Projected month end $52.10",
      ],
    },
  ];
  ZC.history = [
    ["AP-0090", "APPROVED", "PUSH", "Push fix/rate-limit to origin", "DEV", "TSK-0141", "2H"],
    [
      "AP-0089",
      "APPROVED",
      "HANDOFF",
      "Hand off PR #311 to Release Management",
      "DEV",
      "TSK-0141",
      "2H",
    ],
    ["AP-0088", "DENIED", "SPEND", "Buy Sentry Team plan · $26/mo", "FIN", "—", "6H"],
    ["AP-0087", "APPROVED", "PUSH", "Push fix/webhook-retry to origin", "DEV", "TSK-0137", "1D"],
    ["AP-0086", "APPROVED", "EXTERNAL", "Post release note to #general", "COM", "TSK-0136", "1D"],
    ["AP-0085", "APPROVED", "PUSH", "Push fix/login-redirect to origin", "DEV", "TSK-0134", "2D"],
  ].map(([id, decision, kind, text, dept, task, when]) => ({
    id,
    decision,
    kind,
    text,
    dept,
    task,
    when,
  }));

  ZC.resolve = (id, decision, reason) => {
    const i = ZC.approvals.findIndex((a) => a.id === id);
    if (i < 0) return;
    const a = ZC.approvals[i];
    ZC.approvals.splice(i, 1);
    ZC.history.unshift({
      id,
      decision,
      kind: a.kind,
      text: a.text + (reason ? " — " + reason : ""),
      dept: ZC.D(a.dept).code,
      task: a.task || "—",
      when: "NOW",
    });
    const ag = ZC.A(a.agent);
    if (ag) {
      ag.state = decision === "APPROVED" ? "working" : "thinking";
      ag.now = decision === "APPROVED" ? "Resumed after approval" : "Reworking after denial";
    }
    const t = a.task && ZC.Tk(a.task);
    if (t) {
      const s = t.subs.find((x) => x.dept === a.dept && x.state === "blocked");
      if (s) s.state = decision === "APPROVED" ? "working" : "thinking";
      if (a.kind === "HANDOFF" && decision === "APPROVED" && s) {
        s.state = "done";
        s.produces = "PR #322";
        const n = t.subs[t.subs.indexOf(s) + 1];
        if (n) {
          n.state = "working";
          n.step = "CHANGELOG WRITER";
        }
      }
      t.updated = "NOW";
    }
    ZC.emit();
  };

  const KW = [
    ["personal", /passport|dentist|flight|birthday|doctor|groceries/i],
    ["secpatch", /cve|vulnerab|secret|leak/i],
    ["hotfix", /5xx|outage|incident|down|spike/i],
    ["research", /research|compare|evaluate|options/i],
    ["announce", /announce|blog|post|newsletter/i],
    ["bugfix", /fix|bug|flaky|broken|crash/i],
    ["finance", /budget|spend|cost|invoice/i],
    ["sweep", /sweep|lint|quality|refactor/i],
  ];
  ZC.classify = (txt) => {
    if (!txt) return null;
    const k = KW.find(([, r]) => r.test(txt));
    return k ? k[0] : "feature";
  };
  let seq = 151;
  ZC.createTask = (o) => {
    const c = ZC.C(o.chain) || ZC.C("feature");
    let route = c.route.slice();
    if (o.entry && o.entry !== "coo" && !route.includes(o.entry)) route = [o.entry].concat(route);
    const id = "TSK-0" + seq++;
    const t = {
      id,
      title: o.title || "Untitled task",
      chain: c.id,
      project: o.project || null,
      source: o.source || "New task form",
      picked: o.picked || "override",
      cost: 0,
      updated: "NOW",
      subs: route.map((d, i) => ({
        id: id + "." + (i + 1),
        dept: d,
        pipeline: (ZC.pipelines[d][0] || [""])[0],
        state: i === 0 ? "thinking" : "idle",
        step: i === 0 ? ZC.pipelines[d][0][1][0].toUpperCase() : "",
        produces: "",
      })),
    };
    ZC.tasks.unshift(t);
    ZC.emit();
    return t;
  };

  ZC.runs = [
    [
      "RUN-8812",
      "AG-04",
      "TSK-0142.2",
      "working",
      "06:12",
      0,
      0.41,
      [
        "Loaded PR #318 diff · 14 files",
        "pr.review → 3 comments",
        "Requested changes on src/auth/callback.ts",
      ],
    ],
    [
      "RUN-8811",
      "AG-02",
      "TSK-0142.2",
      "thinking",
      "02:40",
      1,
      0.33,
      ["Rework loop 1 of 3 from Reviewer", "Reading review comments", "Planning edits in src/auth"],
    ],
    [
      "RUN-8810",
      "AG-05",
      "TSK-0144.2",
      "working",
      "08:55",
      0,
      0.52,
      ["ci.run auth suite", "88 / 140 passed so far"],
    ],
    [
      "RUN-8809",
      "AG-09",
      "TSK-0145.1",
      "working",
      "04:18",
      0,
      0.27,
      ["logs.query 5xx last 60m", "Correlated with deploy api@2.14.0"],
    ],
    [
      "RUN-8808",
      "AG-22",
      "TSK-0148.2",
      "error",
      "01:03",
      2,
      0.19,
      ["git worktree add → conflict", "Retry 1 → conflict", "Retry 2 → conflict · escalated"],
    ],
    [
      "RUN-8807",
      "AG-03",
      "TSK-0143.1",
      "blocked",
      "03:30",
      0,
      0.22,
      ["Edited tests/checkout.spec.ts", "Tests passed · 3 / 3", "git.push → gate: waiting for you"],
    ],
    [
      "RUN-8806",
      "AG-06",
      "TSK-0150.2",
      "blocked",
      "01:50",
      0,
      0.12,
      ["Updated docs/settings.md", "Handoff DEV → REL → gate: waiting"],
    ],
    [
      "RUN-8805",
      "AG-07",
      "TSK-0146.1",
      "thinking",
      "07:41",
      0,
      0.61,
      ["web.search pgvector vs qdrant", "Fetched 9 sources", "Drafting comparison table"],
    ],
    [
      "RUN-8804",
      "AG-21",
      "TSK-0144.2",
      "done",
      "05:02",
      0,
      0.38,
      ["Bumped jsonwebtoken 9.0.2 → 9.0.3", "npm test → ok"],
    ],
    [
      "RUN-8803",
      "AG-16",
      "TSK-0148.1",
      "done",
      "12:20",
      0,
      0.74,
      ["lint.run api", "14 findings", "Wrote findings.md"],
    ],
    [
      "RUN-8802",
      "AG-13",
      "TSK-0147.1",
      "done",
      "03:12",
      0,
      0.18,
      ["Read 23 merged PRs", "Wrote CHANGELOG.md"],
    ],
    [
      "RUN-8801",
      "AG-15",
      "TSK-0147.2",
      "blocked",
      "02:05",
      0,
      0.14,
      ["Drafted announcement.md", "Missing: release date → asked you"],
    ],
    [
      "RUN-8800",
      "AG-20",
      "TSK-0149.1",
      "working",
      "01:44",
      0,
      0.09,
      ["calendar.read next 14 days", "3 dentist slots found"],
    ],
    [
      "RUN-8799",
      "AG-11",
      "TSK-0144.1",
      "done",
      "04:40",
      0,
      0.29,
      ["cve.lookup CVE-2026-3141", "Severity high · wrote cve-assessment.md"],
    ],
  ].map(([id, agent, sub, state, dur, retries, cost, events]) => ({
    id,
    agent,
    sub,
    state,
    dur,
    retries,
    cost,
    events,
  }));

  ZC.inbox = [
    {
      id: "IN-311",
      src: "SLACK",
      from: "#alerts · Datadog",
      when: "14:21",
      title: "p95 latency and 5xx rate up on /v2/orders",
      body: "Error rate 4.1% over 10 minutes since 14:08. Linked deploy: api@2.14.0.",
      triage: "Critical incident · Hotfix chain",
      chain: "hotfix",
      status: "task",
      task: "TSK-0145",
    },
    {
      id: "IN-310",
      src: "GITHUB",
      from: "acme/api · Dependabot",
      when: "13:58",
      title: "Security advisory: jsonwebtoken < 9.0.3",
      body: "CVE-2026-3141. Signature bypass when using algorithm none with certain key types.",
      triage: "Security · Security patch chain",
      chain: "secpatch",
      status: "task",
      task: "TSK-0144",
    },
    {
      id: "IN-309",
      src: "E-MAIL",
      from: "dana@northwind.com",
      when: "13:40",
      title: "Can we get SSO for the client portal?",
      body: "Our IT team asks whether the portal supports SAML or Google login before rollout.",
      triage: "Feature request · related to TSK-0142",
      chain: "feature",
      status: "pending",
    },
    {
      id: "IN-308",
      src: "JIRA",
      from: "API-219 · Priya",
      when: "12:15",
      title: "Webhook retries fire twice on 502",
      body: "Seeing duplicate deliveries when the receiver returns 502. Repro steps attached.",
      triage: "Bug · Bugfix chain",
      chain: "bugfix",
      status: "pending",
    },
    {
      id: "IN-307",
      src: "GITHUB",
      from: "acme/api · #77",
      when: "11:02",
      title: "Checkout E2E test is flaky",
      body: "Fails about 1 in 6 runs on CI, never locally.",
      triage: "Bug · Bugfix chain (chain overridden)",
      chain: "bugfix",
      status: "task",
      task: "TSK-0143",
    },
    {
      id: "IN-306",
      src: "E-MAIL",
      from: "newsletter@saasweekly.io",
      when: "09:30",
      title: "SaaS Weekly #212",
      body: "Newsletter.",
      triage: "Not work · dismissed by Monitoring",
      chain: null,
      status: "dismissed",
    },
    {
      id: "IN-305",
      src: "SLACK",
      from: "#general · Marta",
      when: "09:12",
      title: "When is 2.14 going public?",
      body: "Customers are asking about the rate limiter fix.",
      triage: "Question · linked to TSK-0147",
      chain: "announce",
      status: "pending",
    },
  ];

  ZC.briefings = [
    {
      date: "2026-09-24",
      title: "Thursday standup",
      lead: "Eleven tasks in flight across seven departments. Four things need you, and one is costing time: Release Management cannot move PR #322 until you approve the handoff.",
      sections: [
        [
          "SHIPPED",
          [
            "api@2.14.0 went out at 11:40 with the rate limiter fix (TSK-0141).",
            "Q3 spend summary is filed in the vault (TSK-0139).",
          ],
        ],
        [
          "IN FLIGHT",
          [
            "OAuth login is in review. Dave left 3 comments and Stuart is on rework loop 1 of 3.",
            "CVE-2026-3141 is patched; tests are at 88 of 140.",
            "Incident Response is correlating the /v2/orders 5xx spike with the 2.14 deploy.",
          ],
        ],
        [
          "NEEDS YOU",
          [
            "Push fix/checkout-flake (4 min).",
            "Release date for the 2.14 announcement (11 min).",
            "Handoff of PR #322 to Release Management (19 min).",
            "Agent SDK credit cap (26 min).",
          ],
        ],
        [
          "SPEND",
          [
            "$18.90 today, 63% of the daily run cap. Agent SDK credit is at 90.5% of the monthly cap.",
          ],
        ],
      ],
    },
    {
      date: "2026-09-23",
      title: "Wednesday standup",
      lead: "A quiet day. Development closed three bugs and the nightly distillation found two gaps in the api runbooks.",
      sections: [
        [
          "SHIPPED",
          ["Webhook retry fix merged (TSK-0137).", "Release note posted to #general (TSK-0136)."],
        ],
        ["IN FLIGHT", ["OAuth research finished and was handed to Development."]],
        ["SPEND", ["$14.20, 47% of the daily cap."]],
      ],
    },
    {
      date: "2026-09-22",
      title: "Tuesday standup",
      lead: "Security flagged a leaked test key in a fork; it was rotated within 6 minutes.",
      sections: [
        ["SHIPPED", ["Login redirect fix (TSK-0134)."]],
        ["SPEND", ["$11.05, 37% of the daily cap."]],
      ],
    },
  ];

  ZC.floor = [
    ["Merge a pull request", "Never offered. You merge by hand."],
    ["Push to main or a release branch", "Always asks"],
    ["Payments, purchases, spend limit changes", "Always asks"],
    ["Delete data, drop tables, force-push", "Always asks"],
    ["Send anything outside the company", "Always asks the first time per recipient"],
    ["Read secrets or production credentials", "Always asks"],
  ];
  ZC.projectRules = [
    ["client-portal", "git.push feature/*", "AUTO"],
    ["client-portal", "pr.open", "AUTO"],
    ["api", "git.push *", "ASK"],
    ["api", "pr.open", "AUTO"],
    ["api", "db.query production", "ASK"],
    ["mobile", "ci.run release lane", "ASK"],
    ["personal-site", "git.push *", "AUTO"],
  ].map(([project, action, mode], i) => ({ i, project, action, mode }));
  ZC.handoffRules = [
    ["rnd", "dev", "AUTO"],
    ["dev", "rel", "ASK"],
    ["sec", "dev", "AUTO"],
    ["inc", "dev", "AUTO"],
    ["rel", "com", "ASK"],
    ["qa", "dev", "ASK"],
    ["rnd", "knw", "AUTO"],
  ].map(([from, to, mode]) => ({ from, to, mode }));
  ZC.patterns = [
    {
      id: "LP-12",
      text: "Auto-approve git.push fix/* on api",
      evidence: "You approved 9 of 9 in the last 14 days",
      n: 9,
      of: 9,
      scope: "api",
    },
    {
      id: "LP-11",
      text: "Auto-approve handoff QA → DEV when findings ≤ 5",
      evidence: "You approved 6 of 6 small sweeps",
      n: 6,
      of: 6,
      scope: "Handoff",
    },
    {
      id: "LP-10",
      text: "Auto-approve release notes to #general",
      evidence: "You approved 4 of 5; the denial was a typo",
      n: 4,
      of: 5,
      scope: "Communications",
    },
    {
      id: "LP-09",
      text: "Always deny paid tooling under $30/mo",
      evidence: "You denied 3 of 3",
      n: 3,
      of: 3,
      scope: "Finance",
    },
  ];

  ZC.vault = [
    {
      id: "moc",
      folder: "MOC",
      title: "Home",
      body: [
        "Start here. The company runs on [[Operating model]] and ships through [[Chains]].",
        "Active projects: [[client-portal]], [[api]].",
        "Daily notes live in [[2026-09-24]].",
      ],
    },
    {
      id: "Operating model",
      folder: "Company",
      title: "Operating model",
      body: [
        "You are the CEO. Zibby is the COO and routes every task through a [[Chains|chain]].",
        "Departments borrow agents from a shared pool. Rework loops stay inside a department pipeline.",
        "See [[Gate rules]] for what waits for you.",
      ],
    },
    {
      id: "Chains",
      folder: "Company",
      title: "Chains",
      body: [
        "A chain is a fixed route across departments. Feature: R&D → Development → Release Management.",
        "Handoffs between steps follow [[Gate rules]].",
      ],
    },
    {
      id: "Gate rules",
      folder: "Company",
      title: "Gate rules",
      body: [
        "Merging a PR is never automatic.",
        "Pushes on [[api]] always ask. Pushes to feature branches on [[client-portal]] run automatically.",
      ],
    },
    {
      id: "client-portal",
      folder: "Projects",
      title: "client-portal",
      body: [
        "Next.js customer portal. OAuth login in progress (TSK-0142), see [[OAuth research]].",
        "Owner contact: Dana at Northwind asked about SSO.",
      ],
    },
    {
      id: "api",
      folder: "Projects",
      title: "api",
      body: [
        "Core REST and webhooks API. Latest release api@2.14.0.",
        "Runbook gaps found by distillation: [[Runbook: 5xx]].",
      ],
    },
    {
      id: "OAuth research",
      folder: "Research",
      title: "OAuth research",
      body: [
        "Recommendation: Auth.js with Google and Microsoft providers, SAML later through a broker.",
        "Filed by R&D for [[client-portal]].",
      ],
    },
    {
      id: "Runbook: 5xx",
      folder: "Runbooks",
      title: "Runbook: 5xx",
      body: [
        "Draft. Check the last deploy first, then database pool saturation.",
        "Gap: no step for rolling back webhooks workers.",
      ],
    },
    {
      id: "2026-09-24",
      folder: "Daily",
      title: "2026-09-24",
      body: [
        "Shipped api@2.14.0. 5xx spike under investigation.",
        "Links: [[api]], [[client-portal]].",
      ],
    },
    {
      id: "2026-09-23",
      folder: "Daily",
      title: "2026-09-23",
      body: ["Quiet day. Webhook retry fix merged. See [[api]]."],
    },
  ];
  ZC.distills = [
    {
      id: "DST-0924",
      date: "2026-09-24 02:00",
      notes: 38,
      links: 61,
      dur: "11m",
      gaps: [
        "No rollback step for webhooks workers in [[Runbook: 5xx]]",
        "client-portal has no owner note for Northwind",
      ],
      ideas: [
        "A status page generated from the incident log",
        "Weekly digest of approvals you could automate",
      ],
    },
    {
      id: "DST-0923",
      date: "2026-09-23 02:00",
      notes: 31,
      links: 48,
      dur: "9m",
      gaps: ["Chains note does not describe Security patch"],
      ideas: ["Changelog preview in the release approval sheet"],
    },
    {
      id: "DST-0922",
      date: "2026-09-22 02:00",
      notes: 29,
      links: 40,
      dur: "8m",
      gaps: [],
      ideas: ["Voice briefing at 07:30"],
    },
  ];

  ZC.budget = { day: [189, 300], week: [812, 1800], month: [2904, 6000] };
  ZC.deptBudget = {
    dev: [96, 140],
    ops: [22, 40],
    sec: [9, 20],
    rel: [6, 20],
    inc: [14, 30],
    rnd: [18, 30],
    com: [5, 10],
    qa: [8, 20],
    knw: [4, 15],
    fin: [2, 5],
    per: [5, 10],
  };
  ZC.spend = {
    sub5h: 62,
    subWeek: 41,
    sdk: [36.2, 40],
    warn: 80,
    stop: 95,
    today: 18.9,
    byDept: {
      dev: 9.8,
      ops: 1.4,
      sec: 0.9,
      rel: 0.5,
      inc: 2.6,
      rnd: 1.8,
      com: 0.4,
      qa: 0.7,
      knw: 0.3,
      fin: 0.1,
      per: 0.4,
    },
  };

  ZC.registries = {
    mcp: [
      ["github", "Repos, PRs, issues", "connected", ["dev", "rel", "qa", "sec", "ops"]],
      ["slack", "Channels and DMs", "connected", ["ops", "com", "inc"]],
      ["gmail", "Mail read and draft", "connected", ["ops", "per", "com"]],
      ["jira", "Issues", "connected", ["ops", "dev"]],
      ["google-calendar", "Calendar", "connected", ["ops", "per"]],
      ["sentry", "Errors and traces", "connected", ["inc", "ops"]],
      ["stripe", "Billing read", "limited", ["fin"]],
      ["postgres", "Read replicas", "connected", ["dev", "inc"]],
      ["obsidian-vault", "Memory vault", "connected", ["knw", "rnd"]],
      ["filesystem", "Worktrees", "connected", ["dev", "qa", "rel"]],
    ],
    skills: [
      ["code-review", "Review a diff against project rules", ["dev", "com"]],
      ["write-tests", "Add tests for a change", ["dev"]],
      ["changelog", "Changelog from merged PRs", ["rel"]],
      ["research-web", "Search, fetch, cite", ["rnd"]],
      ["summarize", "Condense to a brief", ["rnd", "inc", "knw"]],
      ["triage-inbound", "Classify inbound messages", ["ops"]],
      ["cve-lookup", "Query CVE feeds", ["sec"]],
      ["distill-notes", "Nightly vault distillation", ["knw"]],
      ["budget-report", "Spend and cap report", ["fin"]],
      ["calendar-ops", "Find and book slots", ["per"]],
    ],
    hooks: [
      ["pre-push guard", "PreToolUse · git.push", "Blocks pushes that break gate rules", ["*"]],
      ["secret scan", "PreToolUse · repo.write", "Rejects writes containing secrets", ["*"]],
      ["post-edit lint", "PostToolUse · repo.write", "Runs the linter after edits", ["dev", "qa"]],
      ["subtask done", "SubtaskStop", "Posts the artifact to the next gate", ["*"]],
      ["ground session", "SessionStart", "Loads vault context for the task", ["*"]],
    ],
    commands: [
      ["/task", "Create a task from text"],
      ["/chain", "Show or override the chain"],
      ["/approve", "Approve the oldest NEEDS YOU item"],
      ["/brief", "Read today's briefing"],
      ["/distill", "Run distillation now"],
      ["/budget", "Show caps and spend"],
      ["/pause", "Pause an agent or department"],
      ["/status", "Company status in one line"],
    ],
  };
  ZC.automations = [
    ["ops", "Inbox heartbeat", "Every 5 min", "14:35", true],
    ["ops", "CI watch", "Every 10 min", "14:40", true],
    ["ops", "Calendar sync", "Every 30 min", "15:00", true],
    ["sec", "CVE feed", "Hourly", "15:00", true],
    ["sec", "Secret scan · all repos", "Daily 03:00", "03:00", true],
    ["knw", "Nightly distillation", "Daily 02:00", "02:00", true],
    ["qa", "Quality sweep: api", "Mon 06:00", "Mon", true],
    ["qa", "Quality sweep: client-portal", "Mon 06:30", "Mon", false],
    ["fin", "Spend check", "Hourly", "15:00", true],
    ["per", "Morning brief", "Daily 07:30", "07:30", true],
    ["com", "Weekly digest", "Fri 16:00", "Fri", false],
    ["rel", "Release train", "Tue, Thu 11:00", "Thu", true],
    ["inc", "Pager escalation", "On critical alert", "—", true],
    ["rnd", "Paper watch", "Weekly", "Mon", false],
    ["dev", "Stale PR nudge", "Daily 10:00", "10:00", true],
  ].map(([dept, name, sched, next, on]) => ({ dept, name, sched, next, on }));

  ZC.goals = [
    {
      id: "GL-07",
      title: "Checkout E2E suite green for 7 days",
      project: "api",
      maker: "Coder",
      verifier: "Tester",
      runs: [6, 20],
      state: "working",
      iter: "Iteration 6 · verifier failed 1 of 42 tests",
      log: [
        "I6 · Tester: 41/42, flaky #pay click",
        "I5 · Coder: added waitForResponse",
        "I4 · Tester: 39/42",
      ],
    },
    {
      id: "GL-06",
      title: "p95 latency under 300 ms on /v2/orders",
      project: "api",
      maker: "Coder",
      verifier: "Watcher",
      runs: [3, 12],
      state: "thinking",
      iter: "Iteration 3 · measuring after index change",
      log: [
        "I3 · Watcher: p95 342 ms",
        "I2 · Coder: added orders(created_at) index",
        "I1 · Watcher: p95 510 ms",
      ],
    },
    {
      id: "GL-05",
      title: "Docs coverage at least 90% in client-portal",
      project: "client-portal",
      maker: "Documenter",
      verifier: "Reviewer",
      runs: [10, 10],
      state: "idle",
      parked: "Run budget spent at 84%",
      iter: "Parked after 10 runs",
      log: ["I10 · Reviewer: 84%", "I9 · Documenter: hooks docs"],
    },
    {
      id: "GL-04",
      title: "Zero high-severity lint findings in api",
      project: "api",
      maker: "Coder",
      verifier: "Auditor",
      runs: [4, 15],
      state: "done",
      iter: "Met on iteration 4",
      log: ["I4 · Auditor: 0 high", "I3 · Coder: removed any casts"],
    },
  ];

  ZC.chat = {
    coo: [
      [
        "coo",
        "Morning. Four items need you. The oldest is a push on api that has waited 4 minutes.",
      ],
      ["you", "Start the OAuth work for the client portal."],
      [
        "coo",
        "Classified as Feature: R&D → Development → Release Management. Created TSK-0142 and handed research to R&D.",
      ],
    ],
    dept: {
      dev: [
        [
          "dept",
          "Development here. Two subtasks running, one blocked on your push approval, one in error on a worktree conflict.",
        ],
        ["you", "What is the conflict on TSK-0148?"],
        [
          "dept",
          "Ken tried to create a worktree on services/orders while TSK-0145 holds it. I will retry after Incident Response releases it.",
        ],
      ],
    },
  };
  ZC.settings = {
    name: "ZibbyCorp",
    tz: "Europe/Prague",
    lang: "English",
    concurrency: 12,
    wake: "Hey Zibby",
    voice: "Calm",
    ptt: true,
    speak: true,
    theme: "light",
    motion: true,
  };

  window.ZC = ZC;
})();
