# TODO

1. [ ] synchronizovat pull requesty a issues není třeba každých 60s. stačí co 15minut + když se stane v zibbycorpu akce, která query invaliduje - například vytvoření PR, mergnutí jiného atp...
2. [ ] na stráce pull-requests máme duplicitní informace o počtu PR v jednotlivích sekcí - před i za názvem sekce. Stačí za názvem.
3. [ ] na stráce pull-requests bude každá sekce sbalitelná. Sekce budou jako Accordion který bude defaáltně celý rozbalená. Sekce se ale dají sbalit. Sbalení sekce se pamatuje per session.
4. [ ] na stráce pull-requests - tlačítko "udělat code review" -> uděláme z něj dropdown button kde defaultní hodnota bude rychlé code-review ale na výběr budu mít možnosti udělat zevrubné code-review a pak i s testováním. Projdi jaké workflows se na to hodí. Moje idea by byla defaultně jen code-review agent a na výběr z několika workflows. Zkus tam něco vymyslet. Idea je taková abych měl možnost vybrat si level zevrubnosti code-review - jak moc důkladné bude.
5. [ ] na všech stránkách kurzor myši nefunguje správně. Vždy se na odkazu změní na pointer ale pak zase na default. a celkově tak divně přeblikává při přejíždění po stránce.
