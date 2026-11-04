# TODO 34 — Chat cannot read devrel team KB notes

## Raw item (operator's words)

> vyřešit, proč v chatu nejdou načíst poznámky z devrel knowledge base, když operátor označí devrel tým. Zjištěno: search_team_kb vrací zásahy (např. wiki/notes/partner-portal-feasibility-meetingy.md, wiki/projects/partnerský-portál.md, wiki/notes/addon-repository.md), ale read_team_kb_note podle téže cesty (s prefixem wiki/ i bez něj, team=devrel) vrací „No note found in any reachable knowledge base"

## Summary

`search_team_kb` returns hits for the devrel team KB, but `read_team_kb_note`
called with the exact returned path (with or without the `wiki/` prefix,
`team=devrel`) answers "No note found in any reachable knowledge base". Find
the root cause (candidates: Unicode NFC/NFD normalization on macOS, path
prefix resolution, team KB root resolution), fix it, and add a regression test
that reproduces the search-hit to read-miss mismatch.
