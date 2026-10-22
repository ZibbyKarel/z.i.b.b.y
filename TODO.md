# TODO

1. [x] upravit coloring_book workflow tak aby výstupní soubory ilustrací pojmenovávalo s číslem stránky v názvu. Momentálně je název jen aprooved.png a je to ve složce s číslem stránky ale potřeboval bych čísla stránky i v souborech uvnitř stránky pro rychlejší review moje. (main@a9f22056)
2. [x] potřebuju v systému přehodit barvy. Momentálně máme barva fialová je OK/hotovo a zelená je Running. Potřebuju je prohodit (main@63f42c82)
3. [ ] pull-requests - potřebuju mít u PRs v detailu i v plachtě možnost PR rovnou aproovnout/přidat komentář/request changes. uděláme to jako jeden OptionButton s předvyplněným "Aproove". a možnostmi requested changes a comment. Když na něj kliknu otevře se dialog s textareou kam vyplním komentář (optional) a po submitu dialogu se PR stav změní na to co jsem vybral. Idea je abych mohl udělat code-review PR i manuálně a né jen přes workflow.
4. [ ] U PRs které jsou neaktuální musím mít vždy tlačítko "rebase".
5. [ ] U PRs, u kterých selhává CI musím mít tlačítko "Fix CI", které pustí workflow (vytvoř ho), které zjistí v čem je problém a opraví to.
