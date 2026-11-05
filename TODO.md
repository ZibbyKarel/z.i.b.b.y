# TODO

1. [ ] Při stahování a instalování nové verze (po kliknutí na tlačítko uppgrade) musí být tlačítko ve stavu loading
2. [ ] Na entitu týmu přidáme možnost vyplňit "slug" ten je unikátním identifikátorem na githubu/gitlabu. tedy pro DevRel tým je to "devrel-team" (a nebo "shoptet/devrel-team" tady si nejsem jistý. Koukni se k PR https://github.com/shoptet/cms4/pull/47546 tam je devrel tým přiřazený na code-review. Resp slug musí být stejný jako jsou id code-owners) aby se podle toho pak dalo filtrovat ve widgetu PRs
3. [ ] ze správy integrací (na úrovni firmy i Týmu) odstraníme autonomii roadmapy to je tři toggle/optionbuttony na nastavení automatické implementace,automatického zpracování komentářů u PR a automatické review - to bude teď řídit jen režim autopilota. řežim autopilota bude možné nově mít zapnutý stále (nemusí se posílat notifikace do Slacku při on/off) a při zapínání budu mít možnost zapnout si globálně ty tři toggly a nebo jen pro konkrétní firmy nebo tými - viděl bych to na stromové rozbalování kdy spodnější úroveň přepisuje vrchní úroveň. něco jako

```
Globální
(auto implementace / auto review / auto zpracování komentářů)
  - Shoptet
    (auto implementace / auto review / auto zpracování komentářů)
     - DevRel
       (auto implementace / auto review / auto zpracování komentářů)
    - Frontend
      (auto implementace / auto review / auto zpracování komentářů)
```

4. [ ] u widgetu PR
       a. [ ] zvětšíme avatara tak aby byl velikostně jako dva řádky - to samé u JIRA ikonky u issues ve widgetu issues
       b. [ ] odstraníme jednolitý border z PRs a vrátíme STAVOVÝ border který se zobrazoval jako boder-left
       c. [ ] sjednotíme vertikální velikosti komponent ve filterch
       d. [ ] filtry se budou moci zobrazit/skrýt ikonkou v hlavičce mezi ikonkami reload a nastavení. Defaultně budou schované
       e. [ ] chybý možnost vybrat devrel tým jehož jsem také členem
       f. [ ] Místo toggle buttonu "Jen moje" bude OptionButtonGroup (single select varianta) kdy budu moci vybrat "Moje" a "Cizí" PRs
