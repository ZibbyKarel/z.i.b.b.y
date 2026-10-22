# TODO

1. [x] upravit coloring_book workflow tak aby výstupní soubory ilustrací pojmenovávalo s číslem stránky v názvu. Momentálně je název jen aprooved.png a je to ve složce s číslem stránky ale potřeboval bych čísla stránky i v souborech uvnitř stránky pro rychlejší review moje. (main@a9f22056)
2. [x] potřebuju v systému přehodit barvy. Momentálně máme barva fialová je OK/hotovo a zelená je Running. Potřebuju je prohodit (main@63f42c82)
3. [x] pull-requests - potřebuju mít u PRs v detailu i v plachtě možnost PR rovnou aproovnout/přidat komentář/request changes. uděláme to jako jeden OptionButton s předvyplněným "Aproove". a možnostmi requested changes a comment. Když na něj kliknu otevře se dialog s textareou kam vyplním komentář (optional) a po submitu dialogu se PR stav změní na to co jsem vybral. Idea je abych mohl udělat code-review PR i manuálně a né jen přes workflow. (main@351bf6e7)
4. [x] U PRs které jsou neaktuální musím mít vždy tlačítko "rebase". (main@c962921d)
5. [x] U PRs, u kterých selhává CI musím mít tlačítko "Fix CI", které pustí workflow (vytvoř ho), které zjistí v čem je problém a opraví to. (main@6e1c955d)
6. [x] Při editaci layoutu na dashboardu - změna velikosti widgetu znamená "změna jeho maximální velikosti". Pokud nejsou data, který ve widgetu zobrazit, widget se automaticky zmenší. Resp má height auto a max-height je ta nastavená velikost (main@20c52ec9)
7. [x] tlačítko "uložit jako" při editaci layoutu na dashboardu by mělo zobrazit dialog s inputem na zadání jména layoutu. Zároveň musím mít možnost si layouty odstranit a označit jako favorites. Favorites layouty budou zobrazeny rovnou jako dnes "výchozí" a "review" a ostatní budou schované přes icon dropdown. (main@3ab87673)
8. [x] Widget issues - u issue místo labelu JIRA zobrazíme přímo ikonku integrace na levé straně. ID tasku posuneme na řádek k názvu issue. (main@b5f9deb5)
9. [x] Widget issues - popis tasku musí být formátovaný markdown (main@30ee6976)
