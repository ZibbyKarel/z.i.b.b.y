# TODO

1. [x] synchronizovat pull requesty a issues není třeba každých 60s. stačí co 15minut + když se stane v zibbycorpu akce, která query invaliduje - například vytvoření PR, mergnutí jiného atp... (main@c16ae06a)
2. [x] na stráce pull-requests máme duplicitní informace o počtu PR v jednotlivích sekcí - před i za názvem sekce. Stačí za názvem. (main@70c928de)
3. [x] na stráce pull-requests bude každá sekce sbalitelná. Sekce budou jako Accordion který bude defaáltně celý rozbalená. Sekce se ale dají sbalit. Sbalení sekce se pamatuje per session. (main@30c735bc)
4. [x] na stráce pull-requests - tlačítko "udělat code review" -> uděláme z něj dropdown button kde defaultní hodnota bude rychlé code-review ale na výběr budu mít možnosti udělat zevrubné code-review a pak i s testováním. Projdi jaké workflows se na to hodí. Moje idea by byla defaultně jen code-review agent a na výběr z několika workflows. Zkus tam něco vymyslet. Idea je taková abych měl možnost vybrat si level zevrubnosti code-review - jak moc důkladné bude. (main@459721d3)
5. [ ] V panelu rychlého připnutí nepotřebuji mít připnuté odkazy v accordionu. Odstraň komponentu accordion
6. [ ] stránka PullRequests - pokud pustím znovu code review na PR nepotřebuji dvakrát zobrazovat že běží - necháme jen odkaz "Review běží" na detail běhu
7. [ ] animace mimoňů:
       a. [ ] iddle - je málo výrazná. Z dálky to vypadá že se mimoni vůbec nehýbají
