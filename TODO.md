- stránka detailu projektu je moc chaotická. Použij taby a rozděl obsah do několika stránek. Každá z ze stránek by měla být přístupná přes URL přímo

- běhy a aktivita - detail běhu pipeline logy u jednotlivých fází pipeliny jsou jen "výstupy" z dané fáze. Potřebuji ale vidět kompletní log od začátku do konce, jak agent přemýšlel a co dělal než sepsal "Hotovo..."

- odkazy na pages jsou plain string ("/overview", "/runs", ...) viz NAV_ITEMS. Nemá next.js nějakou podporu pro typování rout ? pokud ano udělej to standartním způsobem pro Next.js pokud ne vymysli způsob jak mít routy typované abychom nemohli udělat typo v odkazu na stránku

- search bar nahoře zobrazuje zkratku cmd+k ale neexistuje na ní listener. Také by měl ukazovat vždy poslední výsledky pokud ho znovu focusnu

- Běhy a aktivita - pokud nějaký task dojede v pořádku a existuje výstup (některé tasky nemusejí mít výstup) pak bychom u běhu měli vidět tlačítko "pokračovat v novém úkolu" (klidně vymysli lepší label), které otevře new task dialog kam uživatel vyplní standartní popis co se má dělat. Task se zpracuje uplně normálně a navíc se do kontextu běhu vezme ten výstup původního tasku. (to bychom také měli vidět v otevřeném new task dialogu že se přidává i ten kontext)

- Běhy a aktivity - pokud má nějaký task výstup měli bychom mít způsob jak ho otevřít
