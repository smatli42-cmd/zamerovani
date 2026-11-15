# Metoda: funkce, které ovlivňují více prvků (průřezové funkce)

Vznik: 2026-11-15, poučení z ladění kót (dva dny oprav, protože chování bylo rozeseté po jednotlivých prvcích a Code ho opravovalo prvek po prvku).

## Kdy platí
Funkce se dotýká více druhů prvků (stěna, otvor, ostění, výstupek, překlad, úhlopříčka, volná kóta…). Příklady: kóty, zámky, posun a tažení, přichytávání, mazání, kopírování, zpět/vpřed, export.

## Co dělá Claude v plánovacím chatu (automaticky, bez připomínání)
1. Funkci rozpozná jako průřezovou a řekne to uživateli jednou větou.
2. Udělá rozbor: krátký seznam pravidel. Většinu rozhodne podle Revitu/Archicadu sám (označí „(já)“), uživatele se ptá jen na opravdu jeho rozhodnutí, nejlépe tlačítky.
3. Sestaví tabulku **pravidlo × typ prvku**. Tabulka je kritérium hotovo.
4. Do zadání pro Code VŽDY dá požadavek na sjednocení: pravidlo na jednom centrálním místě, prvky ho jen využívají; pokud je chování dnes rozeseté po prvcích, Code ho nejdřív zmapuje a sjednotí.
5. Do zadání dá pravidla práce (viz blok níže) a tabulku k vyplnění.
6. Uživateli dá 5–10 krátkých zkoušek na tabletu. Víc kontrolovat nemá.
7. Nevymýšlí vlastní pojmy, které CAD programy nemají (poučení: „změřeno × načrtnuto“). Když si není jistý, ověří chování CAD a řekne, co je z paměti.

## Blok pro Code (je i v CLAUDE.md v repu)
- Pravidlo implementuj JEDNOU na jednom centrálním místě, prvky ho jen využívají.
- Před koncem sestav tabulku „pravidlo × typ prvku“, každou buňku ověř, nic nevynechej.
- Nic nerozhoduj sám. Pokud pravidlo u prvku nejde dodržet nebo je ve sporu s katalogem, prvek neměň, zastav se a vypiš otázku.
- Do závěrečné zprávy: tabulka ✔/✗ pro každý prvek a seznam míst, kde pravidlo dosud platí zvlášť.
- „Všude / všechny prvky“ platí opravdu pro všechny; výjimku vypiš s důvodem.

## Co se stalo u kót (stručně)
„Dělej to jako Revit“ nebylo zadání, Code si pravidla vymýšlelo po prvcích. Opraveno jedno, druhé zůstalo. Code hlásilo hotovo bez tabulky. Část chyby byla i v našem návrhu (pojem změřeno × načrtnuto).
