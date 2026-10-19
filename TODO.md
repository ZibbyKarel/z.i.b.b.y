# TODO

1. [x] synchronizovat pull requesty a issues není třeba každých 60s. stačí co 15minut + když se stane v zibbycorpu akce, která query invaliduje - například vytvoření PR, mergnutí jiného atp... (main@c16ae06a)
2. [x] na stráce pull-requests máme duplicitní informace o počtu PR v jednotlivích sekcí - před i za názvem sekce. Stačí za názvem. (main@70c928de)
3. [x] na stráce pull-requests bude každá sekce sbalitelná. Sekce budou jako Accordion který bude defaáltně celý rozbalená. Sekce se ale dají sbalit. Sbalení sekce se pamatuje per session. (main@30c735bc)
4. [x] na stráce pull-requests - tlačítko "udělat code review" -> uděláme z něj dropdown button kde defaultní hodnota bude rychlé code-review ale na výběr budu mít možnosti udělat zevrubné code-review a pak i s testováním. Projdi jaké workflows se na to hodí. Moje idea by byla defaultně jen code-review agent a na výběr z několika workflows. Zkus tam něco vymyslet. Idea je taková abych měl možnost vybrat si level zevrubnosti code-review - jak moc důkladné bude. (main@459721d3)
5. [ ] V panelu rychlého připnutí nepotřebuji mít připnuté odkazy v accordionu. Odstraň komponentu accordion
6. [ ] stránka PullRequests - pokud pustím znovu code review na PR nepotřebuji dvakrát zobrazovat že běží - necháme jen odkaz "Review běží" na detail běhu
7. [ ] animace mimoňů:
       a. [ ] iddle - je málo výrazná. Z dálky to vypadá že se mimoni vůbec nehýbají
8. [ ] Stránka PullRequestů - zobrazíme PR v jednom sloupci pod sebou na šířku 25% stránky. Klik na PR otevře na zbylých 75% šířky detail se změnamy v PR. Použij na to nějakou knihovnu jako třeba je https://www.npmjs.com/package/react-diff-view (zkus prohledat i alternativy)
9. [ ] Všechny workflows, která dělají code-review by měla vracet seřazený seznam nálezů od nejkritičtějších po nejmíň kritické.
10. [ ] U code-reviews musím mít na konci možnost zvolit jeslti chci dané PR schválit, jestli si chci vyžádat změny nebo jestli chci jen postnout komentář (aproove/require changes/comment). Defaultně bude vybráno require changes pokud budou nějaký nálezy. pokud nebudou nálezy tak defaultně bude aproove
11. [ ] stránka pull requests - u PRs která vyžadují nějakou akci chci mít tlačítko na rebase větve na target branch. To pustí rebase proces kdy, v případě, že jsou konflikty se automaticky vyřeší agentem. (Možná pro to budem potřebovat nějakého rebase agenta. Klidně ho vytvoř)
12. [ ] stránka pull requests - pokud sekce neobsahuje žádná PR tak sekci vůbec neukazujeme. Pokud nejsou v žádné sekci PRs tak zobrazíme něco jako EmptyContent
13. [ ] stránka pull requests - Musíme tady nějak nastínit pokud se jedná o frontu PRs pokud jedno PR se merguje do druhého PR a tak dále.
14. [ ] stránka issues - musíme tady také nějak nastínit pokud se jedná o frontu issues - pokud jedno issue blokuje jiné a tak dále. Udělej to stejně jako v bodu 13 u PRs.
