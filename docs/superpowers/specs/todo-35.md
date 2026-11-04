# TODO 35 — Run detail links back to the source PR

Raw item text (operator, Czech, verbatim):

> U běhů, které vznikli z PR tedy code-review, rebase, vyřešení komentářů a případné další musí mít v detailu odkaz do systému na původní PR abychom se mohli podívat

Meaning: a run started from a pull request (code review, rebase, address review comments,
fix CI, and any later PR action) must show, in its run detail, a link to the in-app PR
detail (ZIBBY's own `/dashboard/inbox/pull-requests?pr=<url>` page, not GitHub), so the
operator can jump to the PR the run was working on.
