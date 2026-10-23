# TODO

1. [ ] widgety - pokud widget načítá nějaká data poprvé, měl bych vidět loader aby DOM nebyl prázdný (widget pull-requests)
2. [ ] widget právě běží a ukončené - musíme předělat animaci když widget pracuje. Měl bych vidět progressbar odpovídající procentům fází, které jsou hotové. Pokud se jedná o single agent run tak musíme něco vymyslet tam nejsme schopni odhadnout jak dlouho bude práce trvat nebo kolik procent je již hotovo.
3. [ ] detail pull requestu
   - tlačítka jako rebase, fix CI, merge, zapracovat komentáře, merge na githubu musejí být zobrazena jen pro MOJE PRs. Pullrequesty ostatních můžeme jen dělat code-review.
   - panel s detaily je redundantní. Všechny informace už máme v hlavičce.
   - title bude odkaz a povede na github na novém tabu (stejně tak uděláme i title u Issue v detailu - ten povede na JIRU v novém tabu) a můžeme smazat tlačítka otevírající github protože už máme title jako proklik
   - seznam změněných souborů váme jako sidepanel vedle diffu souborů tak jako to má github. Klik na soubor automaticky sescroluje diff souborů k danému souboru. Sidebar se soubory jde sbalit do úzkého proužku
   - sekce kontroly je také zbytečná a už to máme v hlavičce
   - akční tlačítka přesuneme nahoru tak jak to máme v detailu behu třeba
4. [ ] Detail běhu
   - je málo výrazná fáze, která zrovna běží. Můžná by to chtělo výraznější border v běrve running a nebo výraznější kontrast pozadí
5. [ ] Learn from operator rework notes: distil recurring revised-gate notes (approval reason, <phase>.note.md, book/rejections.md) into rules via review-learning (2nd occurrence → approval → vault note grounded into illustrator/creative-director/kids-book-qa); add a workflow source next to the GitHub PR fetcher. Example: coloring-book_1792627255797 (three eyes, malformed animals, unfinished lines)
6. [ ] stránku Agenti změníme na stránku AI a v subMenu pak budou Agenti, a Skills, Commands a MCPs, které přesuneme ze záložky System. Záložka System se pak stává záložkou nastavení kde se položky z tabů (Obecné, runtime, aktivita, stav) posunou o level výše a budou tedy v submenu. V topPanelu úplně nahoře v pravo můžeme odstranit ozubené kolečko směřující na stránku nastavení
7. [ ] widget issues - ikonka zdroje (jira) zabírá dva řádky a je vycentrovaná vertikálně na střed těch dvou řádků
