# TODO 46 — Tab selects an autocomplete suggestion; mentions highlighted after sending

Raw operator text (verbatim, Czech):

> při autocomplete (například v chatu) kdy se zobrazují výsledky (agenti, týmy, projekty, workflows,...) musí fungovat tabulátor na výběr. Momentálě funguje jen entr a mě to štve. Zároveň položky z autocomplete musí být zvýrazněny i v odeslané zprávě chatu (přpadně zadání tasku a další)

## Meaning

1. In every mention/autocomplete input (chat composer, new-task brief, every host of the shared
   `CommandLine`), Tab picks the highlighted suggestion exactly like Enter — only while the
   suggestion list is open with a result; otherwise Tab keeps its normal focus behaviour.
2. Mentions inserted from autocomplete (agents, teams, projects, workflows, skills, …) are also
   highlighted when rendered read-only: the sent chat message (user bubble) and the submitted task
   brief (run INPUT view). Reuse the input's own token recognition (`mentionRanges`) and the
   `HighlightTextAreaField` segmenter/tones — no second parser.
