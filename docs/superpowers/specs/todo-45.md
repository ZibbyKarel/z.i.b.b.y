# TODO 45: Closing the run sheet also closes the approval it opened

> pokud mám otevřený detail schválení přímo z plachty detailu běhu. pokud zavřu plachtu běhu, měl by se zavřít i detail schválení

When the approval detail (`?approval=`) was opened from inside the dashboard run sheet
(`?run=`), closing the run sheet must close the approval detail too. An approval detail opened
any other way keeps working as before.
