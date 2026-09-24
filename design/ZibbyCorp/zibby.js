(function () {
  if (window.ZB) return;
  const css = `
@keyframes zb-breathe{0%{transform:translateY(0)}50%{transform:translateY(.5px)}}
@keyframes zb-bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes zb-arm{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes zb-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}
@keyframes zb-key{0%{opacity:.2}50%{opacity:1}}
@keyframes zb-dot{0%,100%{opacity:.12}40%{opacity:1}}
@keyframes zb-pulse{0%{opacity:1}50%{opacity:.1}}
@keyframes zb-shake{0%{transform:translateX(0)}25%{transform:translateX(-.6px)}50%{transform:translateX(0)}75%{transform:translateX(.6px)}}
@keyframes zb-hop{0%{transform:translateY(0)}12%{transform:translateY(-2px)}24%{transform:translateY(-1px)}36%{transform:translateY(0)}}
@keyframes zb-twinkle{0%,100%{opacity:0}50%{opacity:1}}
@keyframes zb-live{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes zb-ring{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.28);opacity:0}}
@keyframes zb-flow{0%{transform:translateY(-3px);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateY(var(--len,20px));opacity:0}}
@keyframes zb-caret{0%,49%{opacity:1}50%,100%{opacity:0}}`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const S = {
    working: { label: "Working", c: "var(--s-work)" },
    thinking: { label: "Thinking", c: "var(--s-think)" },
    blocked: { label: "Blocked", c: "var(--s-block)" },
    error: { label: "Error", c: "var(--s-err)" },
    done: { label: "Done", c: "var(--s-done)" },
    idle: { label: "Idle", c: "var(--s-idle)" },
  };
  const ORDER = ["working", "thinking", "blocked", "error", "done", "idle"];
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shape(seed) {
    const r = rng(hash(seed));
    const g = [];
    for (let y = 0; y < 8; y++) g.push([0, 0, 0, 0, 0, 0, 0, 0]);
    const set = (x, y) => {
      if (y < 0 || y > 7) return;
      g[y][x] = 1;
      g[y][7 - x] = 1;
    };
    const top = r() < 0.55 ? 1 : 2,
      w = r() < 0.5 ? 3 : 2,
      x0 = 4 - w;
    for (let y = top; y <= 6; y++) for (let x = x0; x <= 3; x++) set(x, y);
    if (r() < 0.5) {
      g[top][x0] = 0;
      g[top][7 - x0] = 0;
    }
    const ear = Math.floor(r() * 4);
    if (ear === 0) set(x0, top - 1);
    else if (ear === 1) set(3, top - 1);
    else if (ear === 2) {
      set(x0, top - 1);
      set(x0, top - 2);
    }
    let arms = [];
    const ay = 4 + (r() < 0.5 ? 0 : 1),
      ax = x0 - 1;
    if (r() < 0.8)
      arms = [
        [ax, ay],
        [7 - ax, ay],
      ];
    else if (w === 2) for (let y = 3; y <= 5; y++) set(1, y);
    set(x0, 7);
    if (r() < 0.5) set(3, 7);
    if (r() < 0.35) {
      g[6][3] = 0;
      g[6][4] = 0;
    }
    const ey = Math.min(top + 1 + (r() < 0.3 ? 1 : 0), 4),
      ex = w === 3 ? (r() < 0.5 ? 1 : 2) : 2;
    return {
      g,
      arms,
      eyes: [
        [ex, ey],
        [7 - ex, ey],
      ],
    };
  }

  function glyph(R, o) {
    const {
      seed,
      state = "idle",
      size = 48,
      body = "var(--ink)",
      eye = "var(--glyph-eye, var(--panel))",
      glow = true,
    } = o;
    const h = R.createElement,
      s = shape(seed),
      c = S[state].c,
      hv = hash(seed);
    const d = (n) => `-${(((hv % 997) / 997) * n).toFixed(2)}s`;
    const px = (x, y, fill, key, st) =>
      h("rect", { key, x, y, width: 1.04, height: 1.04, style: Object.assign({ fill }, st || {}) });
    const bodyR = [];
    s.g.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v) bodyR.push(px(x + 2, y + 2, body, "b" + x + "_" + y));
      }),
    );
    const arms = s.arms.map(([x, y], i) =>
      h(
        "g",
        {
          key: "a" + i,
          style:
            state === "working"
              ? { animation: `zb-arm .45s steps(1,end) ${i ? ".22s" : "0s"} infinite` }
              : null,
        },
        px(x + 2, y + 2, body, "ap"),
      ),
    );
    const eyes = s.eyes.map(([x, y], i) => px(x + 2, y + 2, state === "error" ? c : eye, "e" + i));
    const blink = ["idle", "working", "thinking"].includes(state);
    const eyeG = h(
      "g",
      {
        key: "eyes",
        style: blink
          ? {
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: `zb-blink 3.8s ${d(3.8)} infinite`,
            }
          : null,
      },
      eyes,
    );
    const anim = {
      idle: `zb-breathe 2.4s steps(1,end) ${d(2.4)} infinite`,
      working: `zb-bob .45s steps(1,end) ${d(0.45)} infinite`,
      thinking: `zb-breathe 3.2s steps(1,end) ${d(3.2)} infinite`,
      blocked: "none",
      error: "zb-shake .32s steps(1,end) infinite",
      done: `zb-hop 1.4s steps(1,end) ${d(1.4)} infinite`,
    }[state];
    const ex = [];
    if (state === "working")
      for (let i = 0; i < 6; i++)
        ex.push(
          px(3 + i, 11, c, "k" + i, {
            animation: `zb-key .5s steps(1,end) ${((i * 7) % 5) * 0.1}s infinite`,
          }),
        );
    if (state === "thinking")
      [7, 9, 11].forEach((x, i) =>
        ex.push(
          px(x, 0, c, "t" + i, { animation: `zb-dot 1.2s ease-in-out ${i * 0.2}s infinite` }),
        ),
      );
    if (state === "blocked")
      [1, 2, 3, 5].forEach((y) =>
        ex.push(px(11, y, c, "x" + y, { animation: "zb-pulse 1s steps(1,end) infinite" })),
      );
    if (state === "error")
      [
        [0, 1],
        [11, 3],
        [1, 11],
        [10, 10],
      ].forEach(([x, y], i) =>
        ex.push(
          px(x, y, c, "r" + i, { animation: `zb-twinkle .5s steps(1,end) ${i * 0.12}s infinite` }),
        ),
      );
    if (state === "done")
      [
        [0, 1],
        [11, 0],
        [0, 9],
        [11, 8],
        [6, 0],
      ].forEach(([x, y], i) =>
        ex.push(
          px(x, y, c, "s" + i, { animation: `zb-twinkle 1.4s steps(1,end) ${i * 0.28}s infinite` }),
        ),
      );
    return h(
      "svg",
      {
        viewBox: "0 0 12 12",
        width: size,
        height: size,
        shapeRendering: "crispEdges",
        style: {
          display: "block",
          overflow: "visible",
          flexShrink: 0,
          filter:
            glow && size >= 40 && state !== "idle"
              ? `drop-shadow(0 0 var(--gw) color-mix(in oklch, ${c} 75%, transparent))`
              : "none",
        },
      },
      h("g", { style: { animation: anim } }, bodyR, arms, eyeG),
      ex,
    );
  }

  function pod(R, o) {
    const { seed, state = "idle", size = 40 } = o;
    const h = R.createElement,
      c = S[state].c;
    const live = state === "working" || state === "blocked";
    return h(
      "div",
      {
        style: {
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--pod)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          boxShadow: `inset 0 0 0 1.5px ${c}, 0 0 var(--gw) color-mix(in oklch, ${c} 40%, transparent)`,
        },
      },
      live
        ? h("div", {
            style: {
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              boxShadow: `0 0 0 1.5px ${c}`,
              animation: `zb-ring ${state === "working" ? 1.8 : 1.1}s ease-out infinite`,
            },
          })
        : null,
      glyph(R, { seed, state, size: Math.round(size * 0.58), glow: false }),
    );
  }
  function dot(R, state, size) {
    size = size || 7;
    const c = S[state].c;
    return R.createElement("span", {
      style: {
        width: size,
        height: size,
        background: c,
        flexShrink: 0,
        display: "inline-block",
        borderRadius: "var(--dot-r, 0)",
        boxShadow: `0 0 var(--gw) ${c}`,
        animation:
          state === "working"
            ? "zb-live 1.4s ease-in-out infinite"
            : state === "blocked"
              ? "zb-pulse 1s steps(1,end) infinite"
              : "none",
      },
    });
  }
  function packet(R, len, delay) {
    return R.createElement("span", {
      style: {
        position: "absolute",
        left: "50%",
        top: 0,
        width: 4,
        height: 4,
        marginLeft: -2,
        borderRadius: "50%",
        background: "var(--s-work)",
        boxShadow: "0 0 var(--gw) var(--s-work)",
        "--len": len + "px",
        animation: `zb-flow 1.6s linear ${delay || 0}s infinite`,
      },
    });
  }
  function caret(R) {
    return R.createElement("span", {
      style: {
        display: "inline-block",
        width: 6,
        height: 12,
        background: "currentColor",
        verticalAlign: "-2px",
        marginLeft: 4,
        animation: "zb-caret 1s steps(1,end) infinite",
      },
    });
  }

  const RAW = [
    [
      "eng",
      "ENG",
      "Engineering",
      [
        ["Kevin", "Engineering Lead", "thinking", "Scoping sprint 14 with Product"],
        ["Stuart", "Backend Engineer", "working", "Migrating billing service to v2 API"],
        ["Bob", "Frontend Engineer", "working", "Building onboarding flow v3"],
        ["Jerry", "Integrations", "blocked", "Needs approval: Stripe production key"],
        ["Dave", "QA Engineer", "working", "Regression suite · batch 3 of 7"],
        ["Carl", "Security Engineer", "idle", "Waiting for next assignment"],
        ["Phil", "DevOps", "done", "Deployed api@2.14.0 to production"],
        ["Tim", "Data Engineer", "working", "Backfilling events table (2024–25)"],
        ["Mark", "Technical Writer", "thinking", "Outlining API reference"],
        ["Jorge", "Mobile Engineer", "error", "iOS build failed: code signing"],
      ],
    ],
    [
      "prd",
      "PRD",
      "Product",
      [
        ["Otto", "Head of Product", "working", "Writing Q4 roadmap brief"],
        ["Mel", "Product Analyst", "working", "Funnel analysis: trial → paid"],
        ["Tom", "User Researcher", "thinking", "Synthesizing 12 interviews"],
        ["Norbert", "PM · Billing", "idle", "Waiting for next assignment"],
        ["Lance", "PM · Platform", "done", "Shipped spec: webhooks v2"],
      ],
    ],
    [
      "dsn",
      "DSN",
      "Design",
      [
        ["Donny", "Design Lead", "working", "Reviewing onboarding screens"],
        ["Ken", "Product Designer", "working", "Onboarding flow v3"],
        ["Mike", "Brand Designer", "idle", "Waiting for next assignment"],
        ["John", "Motion Designer", "done", "Exported launch loop"],
        ["Paul", "Design Systems", "thinking", "Token audit across 4 apps"],
      ],
    ],
    [
      "mkt",
      "MKT",
      "Marketing",
      [
        ["Chris", "Head of Marketing", "blocked", "Needs approval: $2,400 budget shift"],
        ["Larry", "Content Writer", "working", "Drafting launch post"],
        ["Steve", "Paid Ads", "working", "A/B testing 6 creatives"],
        ["Jon", "Social", "idle", "Waiting for next assignment"],
        ["Dan", "Copywriter", "working", "Landing page headlines"],
        ["Stan", "SEO", "thinking", "Keyword clustering"],
        ["Gus", "Community", "done", "Weekly digest sent"],
      ],
    ],
    [
      "sal",
      "SAL",
      "Sales",
      [
        ["Bert", "Head of Sales", "working", "Weekly pipeline review"],
        ["Ned", "Account Executive", "working", "Proposal for Northwind"],
        ["Walt", "SDR", "working", "Outbound sequence #14"],
        ["Rudy", "SDR", "idle", "Waiting for next assignment"],
        ["Herb", "Solutions", "thinking", "Security questionnaire"],
        ["Lou", "RevOps", "done", "CRM hygiene pass"],
      ],
    ],
    [
      "sup",
      "SUP",
      "Support",
      [
        ["Sid", "Support Lead", "working", "Triaging queue (18 open)"],
        ["Ollie", "Tier 1", "working", "Ticket #9912"],
        ["Ziggy", "Tier 1", "working", "Ticket #9915"],
        ["Moe", "Tier 2", "error", "Refund API timeout"],
        ["Pete", "Tier 1", "idle", "Waiting for next assignment"],
        ["Hank", "Knowledge Base", "working", "Updating 4 articles"],
        ["Fred", "Tier 1", "done", "Resolved 31 tickets"],
        ["Gary", "Escalations", "thinking", "Reviewing churn-risk accounts"],
      ],
    ],
    [
      "fin",
      "FIN",
      "Finance",
      [
        ["Earl", "Finance Lead", "blocked", "Needs approval: vendor payment $8,120"],
        ["Rex", "Accounting", "working", "Month-end close"],
        ["Vic", "Billing Ops", "idle", "Waiting for next assignment"],
        ["Abe", "FP&A", "thinking", "Runway model v4"],
      ],
    ],
    [
      "ops",
      "OPS",
      "Operations",
      [
        ["Ray", "Operations Lead", "working", "Vendor contract review"],
        ["Ted", "Compliance", "working", "Collecting SOC 2 evidence"],
        ["Ernie", "Legal", "idle", "Waiting for next assignment"],
        ["Burt", "IT & Access", "done", "Rotated 12 API keys"],
      ],
    ],
  ];
  const depts = RAW.map(([id, code, name, list]) => ({
    id,
    code,
    name,
    agents: list.map(([n, role, state, task], i) => ({
      id: `${code}-${String(i + 1).padStart(2, "0")}`,
      name: n,
      role,
      state,
      task,
      dept: id,
      deptName: name,
    })),
  }));
  const ceo = {
    id: "EXEC-00",
    name: "Zibby",
    role: "Chief Orchestrator",
    state: "working",
    task: "Coordinating Q4 launch plan",
    dept: "exec",
    deptName: "Executive",
  };
  const all = [ceo].concat(...depts.map((d) => d.agents));
  const counts = {};
  ORDER.forEach((k) => (counts[k] = 0));
  all.forEach((a) => counts[a.state]++);
  const TOOLS = {
    eng: ["repo.read", "repo.write", "shell", "db.query", "pr.open", "ci.run"],
    prd: ["docs.write", "analytics.query", "issues.sync", "calendar"],
    dsn: ["canvas.read", "assets.export", "docs.write", "review.request"],
    mkt: ["cms.publish", "ads.manage", "analytics.query", "email.send"],
    sal: ["crm.write", "email.send", "calendar", "docs.write"],
    sup: ["tickets.reply", "kb.write", "refunds.issue", "crm.read"],
    fin: ["ledger.read", "payments.stage", "sheets.write", "bank.read"],
    ops: ["contracts.read", "iam.manage", "audit.log", "docs.write"],
    exec: ["agents.assign", "budget.allocate", "org.read", "reports.write"],
  };
  const FORGE_LOG = [
    ["14:32:04", "Running migration dry-run on billing_v2"],
    ["14:31:47", "db.query → 1,284 rows diffed"],
    ["14:30:12", 'Opened PR #491 "billing: v2 client"'],
    ["14:28:55", "Tests passed · 212 / 212"],
    ["14:26:30", "Read 38 files in services/billing"],
    ["14:24:02", "Task assigned by Kevin"],
  ];
  function lead(a) {
    if (a.dept === "exec") return null;
    const d = depts.find((x) => x.id === a.dept);
    return d.agents[0] === a ? ceo : d.agents[0];
  }
  function profile(a) {
    const r = rng(hash(a.name + "#p"));
    const pr = a.state === "done" ? 1 : a.state === "idle" ? 0 : 0.25 + r() * 0.6;
    const total = 4 + Math.floor(r() * 5),
      step = Math.max(a.state === "idle" ? 0 : 1, Math.round(pr * total));
    const tools = TOOLS[a.dept];
    const last = {
      working: "Executing step " + step,
      thinking: "Reasoning over context…",
      blocked: "Paused — waiting for human approval",
      error: "Tool call failed · retry 2 of 3",
      done: "Task complete · handed off",
      idle: "Listening for new tasks",
    }[a.state];
    const log =
      a.name === "Stuart"
        ? FORGE_LOG
        : [
            ["14:32:0" + Math.floor(r() * 9), last],
            ["14:3" + Math.floor(r() * 2) + ":1" + Math.floor(r() * 9), tools[1] + " → ok"],
            [
              "14:2" + (5 + Math.floor(r() * 4)) + ":4" + Math.floor(r() * 9),
              "Loaded context · " + (8 + Math.floor(r() * 40)) + " items",
            ],
            ["14:2" + Math.floor(r() * 5) + ":0" + Math.floor(r() * 9), tools[0] + " → ok"],
            [
              "14:1" + (5 + Math.floor(r() * 4)) + ":2" + Math.floor(r() * 9),
              "Picked up: " + a.task,
            ],
          ];
    const l = lead(a);
    return {
      tools,
      log,
      progress: Math.round(pr * 100),
      step: `STEP ${step}/${total}`,
      elapsed: 3 + Math.floor(r() * 40) + "m",
      metrics: [
        { k: "TASKS · 24H", v: String(6 + Math.floor(r() * 30)) },
        { k: "SUCCESS", v: (92 + r() * 7.9).toFixed(1) + "%" },
        { k: "SPEND · 24H", v: "$" + (1 + r() * 9).toFixed(2) },
      ],
      lead: l,
      seed: (hash(a.name) % 0xffff).toString(16).toUpperCase().padStart(4, "0"),
    };
  }
  const approvals = [
    ["Jerry", "Use Stripe production key"],
    ["Chris", "Shift $2,400 to paid social"],
    ["Earl", "Pay vendor invoice · $8,120"],
  ].map(([n, text]) => {
    const a = all.find((x) => x.name === n);
    return Object.assign({}, a, { text });
  });
  function segs(d) {
    return ORDER.map((k) => ({
      k,
      n: d.agents.filter((a) => a.state === k).length,
      c: S[k].c,
    })).filter((s) => s.n > 0);
  }
  function clock() {
    return new Date().toISOString().slice(11, 19);
  }
  window.ZB = {
    S,
    ORDER,
    depts,
    ceo,
    all,
    counts,
    approvals,
    glyph,
    pod,
    dot,
    packet,
    caret,
    profile,
    segs,
    clock,
    agent: (id) => all.find((a) => a.id === id),
  };
})();
