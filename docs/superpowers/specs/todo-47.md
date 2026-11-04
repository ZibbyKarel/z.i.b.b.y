# TODO 47 — Approval card in the run sheet opens the detail; button opens the output

## Raw item (operator, Czech)

> v plachtě na kartě schválení nebude Výstup fáze. ten bude jen v detailu schválení. Celá karta bude otevírat detail a místo tlačítka "otevřít detail" bude tlačítko na otevření výstupu (pr v novém tabu, soubor v novém tabu nebo se otevře složka ve Finderu)

## Meaning

On the approval card inside the run sheet (dashboard):

1. Remove the "Výstup fáze" (phase output) preview — it stays only in the approval detail.
2. The whole card is clickable and opens the approval detail (through `RunSheet`'s `openApproval`
   wrapper, so closing the run sheet also closes the approval).
3. Replace the "Otevřít detail" button with an "open output" button: a PR URL in a new tab, a file,
   or the run folder revealed in Finder. Its click must not also trigger the card click.
