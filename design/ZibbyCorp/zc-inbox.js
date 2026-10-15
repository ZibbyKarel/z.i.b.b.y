// Inbox mock: synced cache of Jira / GitHub roadmap items and GitHub PRs, already scoped to "mine".
(function () {
  const ZI = window.ZI = {};
  ZI.synced = Date.now() - 4 * 60000;
  ZI.myTeams = ['@acme/backend', '@zibby/core'];

  ZI.epics = [
    { id: 'api-100', key: 'API-100', src: 'JIRA', project: 'api', title: 'Webhooks v2', done: 7, total: 12 },
    { id: 'mob-40', key: 'MOB-40', src: 'JIRA', project: 'mobile', title: 'Offline mode for drivers', done: 3, total: 8 },
    { id: 'cp-12', key: 'CP-12', src: 'JIRA', project: 'client-portal', title: 'Enterprise SSO rollout', done: 2, total: 6 },
    { id: 'zibby-200', key: '#200', src: 'GITHUB', project: 'zibby', title: 'Inbox for issues and PRs', done: 1, total: 5 }
  ];

  // [id, key, src, project, team, epic, title, sourceStatus, zibbyStatus, updatedHours, scope, extra]
  ZI.items = [
    ['api-131', 'API-131', 'JIRA', 'api', 'dev', 'api-100', 'Retry webhook deliveries with exponential backoff', 'In Progress', 'waiting', 5, ['assigned'], { wait: 'DEV-02 asks: cap retries at 8 attempts or at 24 hours, whichever comes first?', desc: 'Failed deliveries are dropped after one attempt. Consumers behind flaky load balancers lose events.\nRetry with exponential backoff and jitter. Stop after a configurable limit and mark the delivery as failed in the log.' }],
    ['api-134', 'API-134', 'JIRA', 'api', 'dev', 'api-100', 'Sign webhook payloads with HMAC-SHA256', 'To Do', 'new', 20, ['assigned']],
    ['api-137', 'API-137', 'JIRA', 'api', 'ops', null, '/v2/events returns 500 instead of 429 under rate limit', 'To Do', 'new', 3, ['mentioned'], { desc: 'Priya Shah: @karel when the limiter trips we return a 500 with an empty body. Clients retry immediately and make it worse.' }],
    ['api-128', 'API-128', 'JIRA', 'api', 'dev', 'api-100', 'Delivery log endpoint for webhook consumers', 'In Progress', 'done', 50, ['assigned'], { drift: true, merged: { n: 471, title: 'Delivery log endpoint', repo: 'acme/api' } }],
    ['api-122', 'API-122', 'JIRA', 'api', 'dev', 'api-100', 'Deprecate the v1 webhook payload format', 'Done', 'done', 144, ['assigned']],
    ['mob-52', 'MOB-52', 'JIRA', 'mobile', 'dev', 'mob-40', 'Cache the last 50 shipments for offline viewing', 'In Progress', 'running', 1, ['assigned'], { task: true }],
    ['mob-55', 'MOB-55', 'JIRA', 'mobile', 'dev', 'mob-40', 'Queue barcode scans while offline and replay on reconnect', 'To Do', 'new', 48, ['watched']],
    ['mob-49', 'MOB-49', 'JIRA', 'mobile', 'qa', null, 'Crash on Android 15 when camera permission is denied', 'In Review', 'waiting', 9, ['reported'], { wait: 'Release Management needs your approval to ship 4.12.1 to the beta track.' }],
    ['cp-18', 'CP-18', 'JIRA', 'client-portal', 'dev', 'cp-12', 'SAML login with Okta', 'To Do', 'new', 26, ['reported', 'watched']],
    ['cp-21', 'CP-21', 'JIRA', 'client-portal', 'sec', 'cp-12', 'Per-tenant session timeout setting', 'Selected for Development', 'waiting', 52, ['assigned'], { wait: 'Security asks whether a tenant may set the timeout below 15 minutes.' }],
    ['cp-15', 'CP-15', 'JIRA', 'client-portal', 'dev', 'cp-12', 'Audit log for admin actions', 'Done', 'done', 96, ['assigned']],
    ['zibby-212', '#212', 'GITHUB', 'zibby', 'dev', 'zibby-200', 'Cross-project endpoint GET /roadmap/items', 'open', 'running', 2, ['assigned'], { task: true }],
    ['zibby-215', '#215', 'GITHUB', 'zibby', null, 'zibby-200', 'Persist hidden state in .zibby/data/inbox-state.json', 'open', 'new', 6, ['assigned']],
    ['site-31', '#31', 'GITHUB', 'personal-site', null, null, 'Update the talks page', 'open', 'new', 288, ['assigned']]
  ].map(([id, key, src, project, team, epic, title, ss, zs, upd, scope, x]) => Object.assign({ id, key, src, project, team, epic, title, ss, zs, upd, scope, desc: '' }, x || {}));

  // GitHub only for now; `src` keeps the list open for another source.
  ZI.prs = [
    { n: 488, src: 'GITHUB', repo: 'acme/api', project: 'api', team: 'dev', title: 'Bump pg driver to 8.12', author: 'renovate', age: 26, draft: false, ci: 'passing', review: 'none', mergeable: true, bucket: 'to-review', reason: 'team', reviewTeam: '@acme/backend' },
    { n: 311, src: 'GITHUB', repo: 'acme/mobile', project: 'mobile', team: 'dev', title: 'Migrate push notifications to FCM HTTP v1', author: 'tberg', age: 72, draft: false, ci: 'failing', review: 'none', mergeable: true, bucket: 'to-review', reason: 'direct' },
    { n: 94, src: 'GITHUB', repo: 'zibbykarel/z.i.b.b.y', project: 'zibby', team: 'ops', title: 'Channel adapter: reply in Slack threads', author: 'ops-bot', age: 5, draft: false, ci: 'passing', review: 'none', mergeable: false, bucket: 'to-review', reason: 'team', reviewTeam: '@zibby/core' },
    { n: 482, src: 'GITHUB', repo: 'acme/api', project: 'api', team: 'dev', title: 'Retry webhook deliveries with exponential backoff', author: 'zibby-dev', age: 5, draft: false, ci: 'passing', review: 'none', mergeable: true, bucket: 'mine', item: 'api-131' },
    { n: 479, src: 'GITHUB', repo: 'acme/mobile', project: 'mobile', team: 'dev', title: 'Offline cache for the shipment list', author: 'zibby-dev', age: 1, draft: true, ci: 'failing', review: 'none', mergeable: true, bucket: 'mine', item: 'mob-52' },
    { n: 476, src: 'GITHUB', repo: 'acme/mobile', project: 'mobile', team: 'qa', title: 'Handle denied camera permission on Android 15', author: 'zibby-dev', age: 9, draft: false, ci: 'passing', review: 'approved', mergeable: true, bucket: 'mine', item: 'mob-49' },
    { n: 474, src: 'GITHUB', repo: 'acme/client-portal', project: 'client-portal', team: 'sec', title: 'Per-tenant session timeout', author: 'zibby-dev', age: 52, draft: false, ci: 'passing', review: 'changes-requested', mergeable: true, bucket: 'mine', item: 'cp-21' }
  ];
  ZI.blocker = p => p.ci === 'failing' ? 'ci-failing' : p.review === 'changes-requested' ? 'changes' : !p.mergeable ? 'conflict' : p.review === 'approved' && p.ci === 'passing' ? 'ready' : 'awaiting';
  ZI.BL_ORDER = ['ci-failing', 'changes', 'conflict', 'awaiting', 'ready'];
  ZI.prs.forEach(p => { p.blocker = ZI.blocker(p); p.url = 'https://github.com/' + p.repo + '/pull/' + p.n; });
  ZI.prOf = it => ZI.prs.find(p => p.item === it.id) || (it.merged ? Object.assign({ ci: 'passing', review: 'approved', isMerged: true, url: 'https://github.com/' + it.merged.repo + '/pull/' + it.merged.n }, it.merged) : null);
  ZI.srcUrl = it => it.src === 'JIRA' ? 'https://acme.atlassian.net/browse/' + it.key : 'https://github.com/' + ((window.ZC.projects.find(p => p.id === it.project) || {}).repo || '') + '/issues/' + it.key.slice(1);

  // Operator-personal hide state (mirrors .zibby/data/inbox-state.json)
  const saved = JSON.parse(localStorage.getItem('zc-inbox-hidden') || 'null');
  ZI.hidden = new Set(saved || ['site-31']);
  ZI.setHidden = (id, on) => { on ? ZI.hidden.add(id) : ZI.hidden.delete(id); localStorage.setItem('zc-inbox-hidden', JSON.stringify([...ZI.hidden])); window.ZC && window.ZC.emit(); };

  // Global counters for the submenu: ignore filters, count only actionable.
  ZI.counts = () => ({
    issues: ZI.items.filter(i => !ZI.hidden.has(i.id) && (i.zs === 'new' || i.zs === 'waiting')).length,
    toReview: ZI.prs.filter(p => p.bucket === 'to-review').length,
    mineBlocked: ZI.prs.filter(p => p.bucket === 'mine' && ['ci-failing', 'changes', 'conflict'].includes(p.blocker)).length
  });
  ZI.ago = h => h < 1 ? 'NOW' : h < 24 ? Math.round(h) + 'H' : Math.round(h / 24) + 'D';
})();
