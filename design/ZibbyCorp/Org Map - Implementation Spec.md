# Org Map (Floorplan) – specifikace pro implementaci

Zdroj: `Floorplan Map.dc.html` (vložen do `Org Screens.dc.html` na route `org/map`). Nahrazuje původní stromový orgchart (Blueprint). Vizuál = Blueprint design system (tokeny `--bg --panel --panel2 --ink --ink2 --ink3 --line --line2 --grid`, stavové `--s-err --s-block --s-done`; Geist + Geist Mono, hranaté rohy, 1–2 px linky).

## 1. Koncept
Orgchart je **půdorys kanceláře**: každé oddělení je místnost, každý agent stůl s pixel-glyphem. Uprostřed nahoře lobby se Zibbym (COO), z něj svisle vede páteř (spine) a vodorovné chodby. Mapa je zoomovatelné a posouvatelné plátno. Cíl: na první pohled vidět, kdo co dělá a kde hoří (error/blocked).

## 2. Data
- **Oddělení (14)** `[id, code, name, zone]`: dev DEV Development · rnd RND R&D · qa QA QA & Architecture · sec SEC Security · rel REL Release Management (zóna `eng`) · ops OPS Monitoring & Ops · inc INC Incident Response (`ops`) · com COM Communications · knw KNW Knowledge Management · fin FIN Finance · dis DIS Distribution · pub PUB Publishing · dsn DSN Design (`biz`) · per PER Personal Office (`per`).
- **Agent**: `id` (`CODE-NN`, např. DEV-01), `name`, `role`, `state` (`idle|working|thinking|blocked|error|done`), `task` (TSK-xxxx), `now` (text aktuální činnosti), `t0` (začátek stavu), `prog` 0–100, `help` (text, co potřebuje), `dept`, volitelně `err {msg, log[]}`.
- **COO**: Zibby, id `COO`, role Chief Operating Officer, bez oddělení.
- V produkci: agenty a stavy brát živě z `ZC` (v prototypu `syncZC()` přepisuje stav/now podle `Z.byName`); seed data v souboru jsou jen mock.
- Počet místností/agentů se zobrazuje v hlavičce (`deptCount`, `total`) a legenda počítá agenty per stav.

## 3. Layout (generovaný, ne ručně)
Konstanty: stůl `CW=72 × CH=76`, padding `PX=12`, hlavička místnosti `26`, šířka páteře `SW=56`, chodba `CORR=44`, mezera mezi místnostmi `10`, okraj `40`.
1. Místnost: `cols = clamp(n, 2, 5)`, `rows = ceil(n/cols)`, základní šířka `max(150, cols*72 + 24)`, výška `26 + rows*76 + 12`.
2. Tři řady, každá rozdělená páteří na levou (L) a pravou (R) stranu:
   - Řada 1 (dveře dolů): L `dev` · R `com, knw, fin`
   - Řada 2 (dveře nahoru): L `rnd, qa` · R `dis, pub, dsn`
   - Řada 3 (dveře nahoru): L `sec, rel, per` · R `ops, inc`
3. Šířka strany `SIDE` = nejširší součet řady; místnosti v řadě se roztáhnou proporcionálně, aby všechny strany lícovaly. Celková šířka `W = 2*SIDE + SW + 2*40`.
4. Mezi řadou 1–2 a 2–3 vodorovná chodba (`--panel2`, přerušovaná osa). Řada 1 je zarovnána spodní hranou k chodbě, ostatní horní.
5. Lobby (120×120) nahoře na ose páteře, uvnitř Zibby 64 px. Páteř (`--panel2`, svislá přerušovaná osa) vede od lobby dolů přes celou výšku.
6. Dveře: 44×2 px otvor ve středu strany místnosti směrem k chodbě.

## 4. Místnost
- Rámeček 2 px `--ink`; pozadí `--panel` (zóna `ops` = `--bg`); zóna `per` = **čárkovaný** rámeček.
- Hlavička: `CODE` (Geist Mono 11/600, spacing .12em) · název (12 px, `--ink2`, ellipsis) · vpravo **strip** – čtvereček 7×7 px per agent v barvě jeho stavu.
- Klik na místnost → `org/dept/{id}/team`.
- Desky agentů v mřížce `cols`, vycentrované.

## 5. Stůl agenta (72×76)
- Stůl: 56×22 px `--panel2` + `--line2`, na něm monitor (24×4 `--ink2`) a klávesnice (16×5).
- Glyph agenta 28 px nad stolem (pixel avatar dle `seed=name`, `state`).
- Pod stolem: stavová tečka 5 px + `JMÉNO` (Geist Mono 9, uppercase, .1em).
- **Odznak stavu** (13×13, vpravo nahoře): `!` error (`--s-err`), `?` blocked (`--s-block`), `✓` done (`--s-done`); jiné stavy bez odznaku.
- **Puls**: u `error` (0.8 s) a `blocked` (1.2 s) rámeček kolem stolu s animací `zb-ring` (rozšiřující se prstenec ve stavové barvě).
- Klik na agenta → `org/agent/{id}` (stopPropagation, aby neotevřel oddělení).

## 6. Hover popover (agent i Zibby)
Fixní panel 300 px, `pointer-events:none`, 1 px `--ink`, vpravo od prvku (při nedostatku místa vlevo), svisle clamp na viewport.
- Hlava: glyph 38 + JMÉNO (mono 12/600) + `ID · ROLE`.
- Stavový řádek (`--panel2`): tečka + stav, vpravo `IN STATE mm:ss` (živý odpočet z `t0`).
- `01 — WORKING ON`: text `now` (u erroru `err.msg`); pokud má task a stav working/thinking/blocked/error: progress bar 2 px (barva stavu) + `TSK-xxxx · STEP n/6` + `%`.
- `02 — NEEDS HELP`: jen při `blocked`/`error` a vyplněném `help`.
- Poslední sekce `LAST ACTIVITY` (3 řádky s časem `−mm:ss`) nebo `ERROR LOG` (log z `err`). Číslování sekcí se posouvá (02/03) podle přítomnosti NEEDS HELP.

## 7. Navigace plátna
- Plátno s mřížkou 24 px (`--grid`), `cursor:grab`, `user-select:none`.
- Svět = jeden div s `transform: translate(tx,ty) scale(k)`, origin 0 0.
- **Wheel zoom** kolem kurzoru (`exp(-deltaY*0.0015)`), rozsah k = 0.2–2.5; listener `passive:false`. **Drag pan** myší; pohyb >4 px nastaví `moved` a potlačí následný klik (aby drag neotevřel místnost/agenta). Během pan/zoom se skryje popover.
- **FIT**: `k = max(0.35, min(vw/W, vh/H)*0.97)`, vycentrovat; volá se při mountu a resize.
- Ovládání vlevo dole: `− | % | + | FIT | WHEEL ZOOM · DRAG PAN`.
- **Minimapa** vpravo dole (max 150×300 px, `--panel`, 1 px `--ink`): místnosti jako obdélníky, agenti jako 3 px tečky ve stavové barvě, lobby rámeček, obdélník aktuálního viewportu; klik = vycentrovat tam.
- Kontejner: `height: calc(100vh - 170px)`, min 520 px, 1 px `--line2`, `overflow:hidden`.

## 8. Volitelné vrstvy (props, default vypnuto)
- `runners` – „doručovatelé“: agent odchází ze stolu s paketem (label např. `PR #322`) po cestě stůl → dveře → chodba → (páteř) → dveře cílové místnosti, tam 4.5 s zůstane a vrací se. Rychlost 150 px/s, glyph na původním stole zprůhlední na .18. Dvojice ve `RUNNERS`.
- `simulate` – každých 4.5 s náhodně změní stav 2 agentům (working→done/thinking/blocked, blocked→working, idle→working…). Jen pro demo; v produkci vypnout a brát stavy z backendu.

## 9. Stavy a barvy
Barvy/labely stavů z `ZB.S[state]` (`c`, `label`), pořadí `ZB.ORDER`. Tečka `ZB.dot(state, size)`, glyph `ZB.glyph({seed,state,size,glow})`, Zibby `ZB.zibby({state,size})`. Nepřidávat nové barvy.

## 10. Chování / hraniční případy
- Vykreslit až po načtení `window.ZB` a dat (polling 50 ms); do té doby prázdný stav.
- Re-render každých 120 ms kvůli živému časovači a runnerům – v produkci omezit na změny dat + 1 s tick pro hover.
- Prázdné oddělení: stále místnost min. 2 sloupce, bez stolů.
- Responsivita: plátno vyplní šířku panelu; layout se nepřeskupuje, jen FIT.
- Přístupnost: místnosti a stoly jsou klikací divy – doplnit `role="button"`, `aria-label` (`DEV · Development, 10 agentů`), klávesová navigace (Tab/Enter) a popover také na focus.
