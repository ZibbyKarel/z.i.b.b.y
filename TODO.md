# TODO

1. [x] Detail PR - kliknu na vyřešit thread checkbox a vedle něj na submit tlačítko -> při submitování bych měl na tlačítku mít loading stav a po úspěšném submitu by se měla invalidovat query pro PRs aby se načetly nové počty nevyřešených thredů (main@676fc4a8e)
2. [x] smazat všude pozůsatatek verze 1 systému a to patičku stránek "ZIBBY — Zestful Intuitive Brainy Butler for You" (main@4622bf1e5)
3. [x] Widget zmínky by měl ignorovat ale u PR to když si někdo ode mě nebo od mého týmu vyžádá review - na to máme widget Pull Requesty (main@f33f2d845)
4. [ ] tlačítko "Upgrade" v topbaru musíme udělat jako icon primary button signalizující upgrade (třeba plné kolečko se šipkou nahoru uvnitř) a musí se zobrazovat jen pokud je novější release. Zároveň název "ZIBBYOS" změníme na "ZibbyOS" v levo v topbaru a pod ním zobrazíme aktuální release verzi kterou používáme (nějaký malý text aby to nepoutalo moc pozornost)
5. [ ] Detail behu - řádek nad názvem běhu specifikující workflow/agenta musí pak obsahovat i ID běhu na ktéré když najedu tak se vedle objeví ikonka ke zkopírování ID stejně tak bude řešené i id issue v detailu issue
6. [x] Nerefreshují se běhy. Když nějaký task skončí svůj běh tak musím refreshnout stránku abych viděl že task čeká na schválení (main@a5b74e604)
7. [ ] Tlačíko Zapracovat do úkolu v detailu Issue zobrazí stránku nového tasku s předanou referencí na task a předvyplněným jménem tasku jako "Implementation of issue [ID]" a uživatel může promt upravit i název upravit. Target by se měl také automaticky předvyplnit ale můžu ho také pak upravit pokud by nevyhovoval.
8. [ ] u issues smažeme příznak "Nové ve zdroji" a "Běží" místo toho budeme zobrazovat status jaký má issue v JIRA
