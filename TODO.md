- [x] CommandLine komponenta - inline nápověda - výsledky musejí být scrollovatelné — fáze 59

- [x] CommandLine komponenta - odstraníme tagy přidaných agentů/pipelin zeshora. Po přidání entity zůstane jen zvýrazněný inline zápis. — fáze 59

- [x] CommandLine komponenta - seznam souborů bude pozicován "uvnitř inputu nad tlačítkem přidat přílohu". Nebude se roztahovat na celou šířku ale bude obsahovat ikonové reprezentace souborů a jejich názvu a velikosti a tlačítka na odstranění. Soubory budou renderovány v řádku, který se bude zalamovat pokud se nevejde — fáze 59

- [x] Stránka Běhy a aktivita - Detail běhu - header - hero obrázek na pozadí nebudeme roztahovat na celou šířku ale zobrazíme ho úplně v pravo zmenšený na výšku headeru. Šířka se pak dopočítá — fáze 60

- [x] Stránka Běhy a aktivita - Detail běhu - header - v hlavičce je spoustu akcí. Musíme je schovat za "tří tečkové menu". V pravo nahoře headeru bude IconButton tři tečky který po rozkliknutí zobratí plachtu s možnostmy, které jsou momentálně přímo viditelné v headeru (smazat, resume, zastavit běh, přiřadit do projektu, ...) — fáze 61

- [x] Stránka Běhy a aktivita - Detail běhu - header - přeskupíme spodní řádek kde jsou statistiky běhu (jak dlouho běžel, kdy s spustil, ...) podívej se do design složky a implementuj podle toho. Nemusíš tam dávat striktně to co je v designu jen okopíruj styl a zobraz informace, které zobrazujeme teď — fáze 62

- [x] Stránka Běhy a aktivita - Detail běhu - tlačítko "otevřít pipeline" odstraníme. Na detail přiřazeného agenta/pipeliny/... se pak uživatel bude moci dostat klikem na jméno workera uvedené v headeru běhu — fáze 63

- [x] Stránka Běhy a aktivita - Detail běhu - dlouhé popisy úkolů - Popisy budou často dlouhé a budou obsahovat přílohové soubory. Nebudeme to cpát do headeru ale vytvoříme novou sekci pod ním "Vstup" která bude defaultně sbalená a po rozbalení ukáže kompletní naformátovaný vstup úkolu spolu s možností otevřít všechny přílohové soubory — fáze 64+65

- [x] Stránka Běhy a aktivita - Karta běhu - odstraníme informaci zobrazovanou v pravém horním rohu (agent/pipeline/naplánovaný task) a odstraníme description. — fáze 66

- [x] Stránka Běhy a aktivita - Detail běhu - header - položka "spuštěno" bude vždy naformátovaný datum a čas počátku běhu nikoliv ve formátu "před 80h" — fáze 67

- [x] Stránka Běhy a aktivita - Detail běhu - header - položka "projekt" bude prokliknutelná na detail projektu do kterého je task přiřazen — fáze 67

- [x] Zaveď koncept "Company" (firma) do z.i.b.b.y — nadřazenou entitu nad Project. — fáze 68–72
      Toto je návrh z brainstormingu:

## Kontext

- Project je dnes plochý registr: `.zibby/data/projects/_projects.json`,
  definovaný v libs/contracts/src/projects/project.schema.ts +
  projects.contract.ts, perzistovaný přes apps/api/src/projects/
  projects.storage.service.ts (atomic rewrite celého pole).
- Integration (libs/contracts/src/integrations/integration.schema.ts) má
  dnes jediný vlastnický klíč projectId a komentář "the project (one
  project = one company) this integration belongs to" — tenhle předpoklad
  padá a komentář je potřeba smazat/přepsat.
- Žádná Company/Org/Tenant entita v repu zatím neexistuje.

## Rozhodnutí z brainstormingu (závazná, neotvírej znovu bez důvodu)

1. Company je plnohodnotná entita s vlastní detail stránkou (/companies/:id),
   ne jen atribut na Projectu.
2. Company je na Projectu VOLITELNÁ (companyId?: string) — standalone
   projekty bez firmy musí zůstat plně funkční jako dnes.
3. Override sémantika je sloučení/doplnění, ne úplné nahrazení:
   - people: firma má canonical roster (ProjectPersonSchema[], KAŽDÁ osoba
     potřebuje stabilní `id` — dnes ho nemá, přidej + zvaž migraci existujících
     dat v \_projects.json). Projekt override/matching probíhá PODLE person id,
     ne podle jména. Projekt může přidat vlastní osoby a/nebo přepsat pole
     (např. role) pro konkrétní osobu z firemního rosteru jen v rámci sebe.
   - budget/limits: firma má defaultní ProjectBudgetSchema. Projekt dědí
     pole, která sám nenastavil; pole, která nastavil, firemní default
     přebijí (field-level merge, ne all-or-nothing).
   - integrations: Integration dostává volitelné companyId (mutually
     exclusive s projectId — patří buď firmě, nebo projektu). Efektivní
     integrace projektu = firemní integrace + projektové, sloučené podle
     `kind`: pokud má projekt integraci stejného kind jako firma, projektová
     vyhrává (override); jiné kindy se sčítají (union).
4. Merge se počítá AT READ TIME v service vrstvě (stejný idiom jako dnešní
   computed `hasSecrets` na Projectu) — company data se needitují do
   projektu, jsou to živě propojené záznamy. Uprav firmu → změna se hned
   projeví ve všech navázaných projektech.

## Rozsah implementace (navrhovaný, uprav dle plánu)

- libs/contracts/src/companies/: company.schema.ts + companies.contract.ts
  (CRUD, zrcadlí projects.contract.ts).
- apps/api/src/companies/: NestJS modul + controller + storage service,
  perzistence do .zibby/data/companies/\_companies.json (stejný atomic-write
  vzor jako projects.storage.service.ts).
- Nová service/util pro "resolved project context" — spočítá efektivní
  people/budget/integrations pro daný projekt podle pravidel výše; použij ji
  všude, kde dnes čteš tato pole přímo z Project.
- project.schema.ts: přidat companyId?: string.
- integration.schema.ts: přidat companyId?: string, upravit/odstranit starý
  komentář o 1:1 vztahu, doplnit validaci "právě jedno z companyId/projectId".
- apps/web/features/companies/: queries/mutations + detail stránka
  /companies/:id (seznam projektů pod firmou, editace sdíleného rosteru/
  limitů/integrací) — vzor podle apps/web/features/projects.
- apps/web/features/projects/: detail stránky doplnit o výběr/zobrazení
  firmy a effective (sloučená) data, ne jen syrová projektová.
