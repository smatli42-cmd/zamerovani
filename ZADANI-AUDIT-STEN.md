# Zadání pro Claude Code: audit stěn podle katalogu, testy z příkladů, doplnění chybějícího

Aplikace: **Zaměřování stavby** (tablet + S-Pen, PWA). Tohle zadání se týká jen kreslení stěn a jejich napojení.
Zadání vzniklo metodou „katalog chování → rozhodnutí uživatele → audit → testy → malé kroky“.

## Co přečíst na začátku
1. `CLAUDE.md` a `POSTUP.md` (jako vždy).
2. `KATALOG-STEN.md`. **Sloupec Rozhodnutí je závazný.** ✔ = má být v aplikaci, ✗ = nedělat, ↷ = později (teď neřešit), ✎ = jinak, jak je popsáno. Tam, kde je „(vy)“, rozhodl uživatel, a nesmí se to měnit.
3. `KRESLENI-STEN-NAVRH.md` a `ZADANI-OKNA-DVERE.md`. Při rozporu s katalogem má přednost katalog, ale rozpor **nahlas**, neřeš ho potichu.

## Pravidla (platí celou dobu)
- **Nesahej na testy ani na očekávání v katalogu, aby prošly.** Když test padá, je to nález, ne chyba testu. Nahlas ho uživateli a zeptej se.
- Katalog neupravuj. Navrhované změny piš do `AUDIT-STEN.md`.
- Jedna věc najednou. Po každé fázi se zastav a ukaž výsledek uživateli. Další fázi začni až po jeho souhlasu.
- Data měň jen přes `store/actions/`. Při změně struktury dat zvyš `SCHEMA_VERSION` a přidej migraci.
- Texty v aplikaci česky.
- Po každé změně v kreslení ověř výsledek v prohlížeči (screenshot, jako dosud) a zkontroluj, že vypadá jako příklad v katalogu. Nepiš „hotovo“, dokud ses nepodíval.
- Po každém kroku: testy (`npm test`), `npm run typecheck`, commit, aktualizace `POSTUP.md`.

## Fáze 1: audit (nic neměnit v kódu)
Vytvoř `AUDIT-STEN.md`. Pro **každý řádek katalogu s ✔ nebo ✎** (sekce A až F) vyplň:

| # | Co katalog chce | Stav (hotovo / částečně / chybí / nejasné) | Kde v kódu (soubor:funkce) | Je test? | Důkaz (1 věta) |

Dále v dokumentu uveď:
- **Rozpory** mezi katalogem a kódem nebo `CLAUDE.md`. Konkrétně prověř:
  - `WallLabel.type` a `material` existují v modelu. Zjisti, jestli se typ nebo materiál **kreslí na výkrese** (rozhodnutí D10/E3: jen ve vlastnostech, na výkrese ne).
  - `mergeStraightAt` slučuje rovné pokračování se stejnou tloušťkou. Ověř, že se **různá** tloušťka (příklad 6, C1.11) nesloučí a obě stěny zůstanou samostatné.
  - Dělení stěny a otvory (F4): co se děje s otvory teď.
  - Mazání stěny (D7): co se děje se sousedy a s otvory.
- **Navržené pořadí** doplnění chybějícího, od nejmenšího a nejdůležitějšího. Rozumný začátek podle mě: C1.6 + E7 (nespojovat konec), F4 (otvory při dělení), C1.11 (odskok), C1.5 (křížení), D3 (samostatný nástroj zkrátit/prodloužit do rohu).
- Odhad velikosti každého kroku (malý / střední / velký) a jestli sahá na datový model.

**Zastav se a ukaž `AUDIT-STEN.md`.**

## Fáze 2: testy z příkladů (jen testy, žádné opravy)
Z příkladů 1 až 11 v části C2 katalogu napiš testy ve vitest (soubor např. `core/wallJoins.catalog.test.ts`, případně rozšiř `core/wallBody.test.ts`).
- Souřadnice v katalogu mají osu Y nahoru. V aplikaci míří Y dolů, přepočítej a napiš do komentáře testu, jak.
- U každého testu uveď v názvu číslo příkladu (např. „C2/2: L-roh 300+100“).
- Test, který projde, nech. Test, který **neprojde**, nech v kódu jako nález, označ `it.fails` nebo `it.todo` s komentářem „podle katalogu má být…, aplikace dělá…“ a uveď to v `AUDIT-STEN.md`. Nic neopravuj.
- Příklad, který nejde otestovat bez úpravy rozhraní, vypiš a popiš proč.

**Zastav se a ukaž, které testy prošly, které ne a proč.**

## Fáze 3: doplnění chybějícího (po souhlasu, po jednom)
Podle pořadí schváleného uživatelem. Pro každý řádek zvlášť:
1. Napiš nebo odblokuj test podle katalogu.
2. Implementuj nejmenší změnu, která ho splní.
3. Ověř v prohlížeči (screenshot příkladu z katalogu).
4. Commit, `POSTUP.md`, zastav se a nech uživatele vyzkoušet.

Nezačínej další řádek, dokud uživatel předchozí nepotvrdí.

## Na závěr (jen s dovolením uživatele)
Navrhni řádek do `CLAUDE.md`: „Před novým nástrojem nebo větší změnou kreslení musí existovat schválený katalog chování (`KATALOG-*.md`) a změna se řídí jeho sloupcem Rozhodnutí.“ Nepřidávej ho bez souhlasu.
