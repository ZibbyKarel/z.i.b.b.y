# Phase N5b — machine přes chat + maps lookup + čitelná brána

> Druhý N5 slice: (a) operátorský vstup — chat tools nad machine propose (propose
> je bezpečné pro chat: NIKDY nevykonává, jen parkuje bránu); (b) druhá
> referenční úloha z ROADMAPy „open Maps and find…" jako akce `open-maps`
> (Apple Maps URL scheme, `open "maps://?q=…"`); (c) machine approval s
> víceřádkovým preview je v bráně čitelný.

## Rozhodnutí

1. **Kontrakt**: `OpenMapsActionSchema {kind:"open-maps", query}` do
   discriminated union. Record beze změny (preview [] pro maps — nic se
   nepřejmenovává). Exekuce = otevření okna Maps: reversibilní, risk `low`,
   ale POŘÁD za bránou (Tier-3 default; akce na stroji se nevykonává tiše).
2. **MachineService** per-kind dispatch: propose → preview+detail+risk podle
   kindu; resume → executeRenames / opener(`maps://?q=<enc>`). Opener
   injektovatelný (@Optional, default `execFile("open", [url])` — jira adapter
   vzor), takže testy nespouští nic.
3. **Chat tools** `machine_rename {folder, find, replace}` a `open_maps
   {query}` v ChatMcpController + ChatToolsService (`proposeRename`,
   `proposeOpenMaps` → česká konfirmace „zaparkováno, čeká na schválení";
   MachineActionRejectedError → vrací zprávu guardu, ne crash). ChatModule
   importuje MachineModule. `--allowedTools mcp__zibby__*` pokrývá nové tools.
4. **Web (c)**: RunApprovalGate — víceřádkový `approval.text` renderuje přes
   `CodeBlock` (zachová řádky preview), jednořádkový beze změny.

## DoD (testy)

- [ ] machine.contract.test: union přijímá open-maps, odmítá neznámý kind
- [ ] machine.service.test: open-maps propose (preview [], risk low) + approve
      volá opener s zakódovanou URL, reject ne; rename beze změny
- [ ] chat-tools.service.test: proposeRename/proposeOpenMaps delegují a vrací
      konfirmaci; guard error → text zprávy
- [ ] RunApprovalGate.test (či nový): víceřádkový text → CodeBlock
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené
