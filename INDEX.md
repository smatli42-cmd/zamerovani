# Kde co leží

| Soubor / složka | Obsah |
|---|---|
| `CLAUDE.md` | Cíl projektu, struktura kódu, závazná pravidla a pracovní postup |
| `POSTUP.md` | Předávací deník: poslední stav, fronta kroků, rozhodnuto samostatně, historie |
| `KATALOG-STEN.md` | **Závazný** katalog chování stěn (ID A…F, příklady C2/1–16) |
| `AUDIT-STEN.md` | Audit kódu proti katalogu (hotovo / částečně / chybí) |
| `ZADANI-AUDIT-STEN.md` | Zadání auditu stěn |
| `KRESLENI-STEN-NAVRH.md` | Návrh stěn s tloušťkou a rozhodnutí uživatele |
| `KRESLENI-EDITACE-KONCU.md` | Návrh editace konců stěn (tažení, posun, `resolveDragPoint`) |
| `KRESLENI-VYSTUPKU.md` | Návrh výstupku / vybrání stěny (přizdívka, pilastr), kreslí se nástrojem Čára |
| `KOTY-ZAMEK-EXPORT.md` | Návrh zámku kót (A, schváleno) a výběru kót do exportu (B, později) |
| `ZADANI-OKNA-DVERE.md` | Zadání oken, dveří, ostění a dalších fází |
| `POZADAVKY.md` | Celkové požadavky a plán po fázích |
| `PREPNUTI-POCITACE.md` | Postup přepnutí mezi počítači pro uživatele |
| `src/` | Zdrojový kód (struktura v `CLAUDE.md`) |
| `src/core/wallJoins.catalog.test.ts` | Testy z příkladů katalogu C2 |
| `src/core/protrusion.ts`, `src/core/protrusionEdit.ts`, `src/store/actions/protrusions.ts`, `src/store/protrusion.test.ts` | Výstupek / vybrání stěny a nástroj Čára (katalog I, testy z příkladů I2): geometrie / kóty a úpravy rozměrů |
| `src/core/wallFace.ts`, `src/core/wallBody.ts`, `src/core/wallSide.ts` | Stěna s tloušťkou: tvar a líce / výpočet těl, napojení a ořez hran / strana těla |
| `src/canvas/drawPlan.ts`, `src/canvas/drawOpenings.ts` | Kreslení stěn a rohů / kreslení otvorů |
| `src/core/carried.ts`, `src/store/carried.test.ts` | Prvky nesené stěnou při zkrácení, dělení a smazání stěny (F4) – jediné místo pravidla |
| `src/core/cornerProtrusion.ts`, `src/store/cornerProtrusion.test.ts` | Výstupek přes roh dvou stěn (I1.11) – geometrie v souřadnicích rohu, rozpoznání z čar |
| `src/core/wallBodyEdges.ts` | Výstupky v těle stěny a ořez hran uvnitř spojů (i čáry mezi výstupkem a sousední stěnou) |
| `src/core/cornerOverlap.ts` | Prvek blízko rohu (F7) – upozornění pro otvory i výstupky, jediné místo pravidla |
| `src/tools/wallTool.ts`, `src/tools/wallToolSnap.ts`, `src/tools/wallChain.test.ts` | Nástroje Stěna a Čára ve stěnách (menu Stěny), přichycení na líce, kreslení řetězem (A2) |
| `src/tools/splitTool.ts`, `src/store/actions/split.ts`, `src/store/split.test.ts` | Nástroj Rozdělit (D4): rozdělení stěny a vyjmutí úseku |
| `src/core/endProtrusion.ts`, `src/store/endProtrusion.test.ts` | Výstupek přes volný konec stěny (I1.11) |
| `src/core/drawing.ts`, `src/core/drawing.test.ts` | **Kresba** (samostatná čára, obdélník, kruh, oblouk, dvojitá čára) – jediné místo pravidel: uzavřený tvar, šrafa, obrys, zásah, úchyty, hladiny exportu |
| `src/store/actions/drawings.ts`, `src/store/drawings.test.ts` | Akce kresby (přidání, navazování čáry, úpravy, šrafa) a testy tabulky „pravidlo × prvek“ |
| `src/tools/drawTools.ts`, `src/tools/drawSnap.ts`, `src/tools/drawingEdit.ts` | Nástroje Čára a Dvojitá; přichytávání kresby (jen pomůcka); úchyty vybrané kresby |
| `src/canvas/drawDrawings.ts`, `src/ui/panels/DrawingPanel.tsx` | Kreslení kresby a šraf (nad stěnami) / panel kresby |
| `src/persistence/migrateDrawings.ts` | Migrace 17 → 18: staré obdélníky, kruhy a volné oblouky tloušťky 0 → kresba |
| `KRESLENI-PREKLADU.md`, `KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md` | Podklady: dvojitá čára / překlady; samostatná čára a šrafy |
| `src/store/protrusionRow.test.ts` | Kopírování výstupku v řadě (I1.11) |
| `src/sizeGuard.test.ts` | Hlídání velikosti zdrojových souborů (nad 700 řádků selže, nad 500 upozorní) |
| `prototyp/` | Starý první prototyp (jen inspirace) |
| `.claude/agents/reviewer.md` | Agent pro nezávislou kontrolu kroku |
| `.claude/commands/` | `/pokracuji` (začátek sezení), `/konec` (konec sezení) |
| `.claude/settings.json` | Povolené příkazy bez ptaní |
| `.github/workflows/deploy.yml` | Nasazení z `main` na GitHub Pages |
