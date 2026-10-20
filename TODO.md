# TODO

1. [x] synchronizovat pull requesty a issues není třeba každých 60s. stačí co 15minut + když se stane v zibbycorpu akce, která query invaliduje - například vytvoření PR, mergnutí jiného atp... (main@c16ae06a)
2. [x] na stráce pull-requests máme duplicitní informace o počtu PR v jednotlivích sekcí - před i za názvem sekce. Stačí za názvem. (main@70c928de)
3. [x] na stráce pull-requests bude každá sekce sbalitelná. Sekce budou jako Accordion který bude defaáltně celý rozbalená. Sekce se ale dají sbalit. Sbalení sekce se pamatuje per session. (main@30c735bc)
4. [x] na stráce pull-requests - tlačítko "udělat code review" -> uděláme z něj dropdown button kde defaultní hodnota bude rychlé code-review ale na výběr budu mít možnosti udělat zevrubné code-review a pak i s testováním. Projdi jaké workflows se na to hodí. Moje idea by byla defaultně jen code-review agent a na výběr z několika workflows. Zkus tam něco vymyslet. Idea je taková abych měl možnost vybrat si level zevrubnosti code-review - jak moc důkladné bude. (main@459721d3)
5. [x] V panelu rychlého připnutí nepotřebuji mít připnuté odkazy v accordionu. Odstraň komponentu accordion (main@38d75086)
6. [x] stránka PullRequests - pokud pustím znovu code review na PR nepotřebuji dvakrát zobrazovat že běží - necháme jen odkaz "Review běží" na detail běhu (main@6ae8eb7d)
7. [x] animace mimoňů: (main@ea586ba9)
       a. [ ] iddle - je málo výrazná. Z dálky to vypadá že se mimoni vůbec nehýbají
8. [x] Stránka PullRequestů - zobrazíme PR v jednom sloupci pod sebou na šířku 25% stránky. Klik na PR otevře na zbylých 75% šířky detail se změnamy v PR. Použij na to nějakou knihovnu jako třeba je https://www.npmjs.com/package/react-diff-view (zkus prohledat i alternativy) (main@bc9a05d7)
9. [x] Všechny workflows, která dělají code-review by měla vracet seřazený seznam nálezů od nejkritičtějších po nejmíň kritické. (main@c3b73908)
10. [x] U code-reviews musím mít na konci možnost zvolit jeslti chci dané PR schválit, jestli si chci vyžádat změny nebo jestli chci jen postnout komentář (aproove/require changes/comment). Defaultně bude vybráno require changes pokud budou nějaký nálezy. pokud nebudou nálezy tak defaultně bude aproove (main@4e844fab)
11. [x] stránka pull requests - u PRs která vyžadují nějakou akci chci mít tlačítko na rebase větve na target branch. To pustí rebase proces kdy, v případě, že jsou konflikty se automaticky vyřeší agentem. (Možná pro to budem potřebovat nějakého rebase agenta. Klidně ho vytvoř) (main@378283d3)
12. [x] stránka pull requests - pokud sekce neobsahuje žádná PR tak sekci vůbec neukazujeme. Pokud nejsou v žádné sekci PRs tak zobrazíme něco jako EmptyContent (main@7faca6bb)
13. [x] stránka pull requests - Musíme tady nějak nastínit pokud se jedná o frontu PRs pokud jedno PR se merguje do druhého PR a tak dále. (main@0a0af532)
14. [x] stránka issues - musíme tady také nějak nastínit pokud se jedná o frontu issues - pokud jedno issue blokuje jiné a tak dále. Udělej to stejně jako v bodu 13 u PRs. (main@4b338ced)
15. [x] stránka pull requests - pokud zobrazím diff PR tak nechci abych scrolloval celou stránkou. Scrollovat by se měl jen ten diff. Zároveň pokud máme takto úzké karty Prs tak se tam nevejde text. Musíme kartu PR udělat responzivní a pokud je title dloouhý tak se bude zalamovat. Zároveň ale nesmí přesahovat do labelů v pravo nahoře (main@a1c8d4eb)
16. [x] detail tasku - pravý panel s detaily - názvy firmy, projektu, týmu, musejí být odkazy + nezobrazuj zdroj a epic (epic není entita u nás v systému) (main@64e124a6)
17. [x] pokud při rebase PR nejsou konflikty není potřeba nic řešit. Tento agent má být rychlý. Pokud konflikty nastanou, vyřeši je a pushne do větve. Projede jen rychlé checky. Není třeba kompletní otestování celé větve na to je pak CI v githubu (main@633b1214)
18. [ ] úkoly ve frontě bych měl být schopen "stopnout" -> odstraní se z fronty a nikdy se tak nenastartují
