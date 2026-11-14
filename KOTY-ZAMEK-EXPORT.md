# Kóty: zámek a výběr kót do exportu – návrh (2026-11-14)

Stav: **A (zámek) schváleno uživatelem v chatu 2026-11-14, nenaprogramováno.** B (export) jen návrh, později.

## A. Zámek kóty

### Rozhodnuto uživatelem
- Zámek může mít **každá kóta**.
- **Všechny kóty jsou ve výchozím stavu odemčené**, i když se zadají ručně (NumPad). Zamyká se **jen ručně**.
- **Pojem „změřeno × načrtnuto“ se ruší.** **Všechny kóty jsou černé** (bez oranžové „~“, bez červeného „⚠“). Jediný vizuální rozdíl je ikonka **zámečku** u zamčené kóty.
- Důvod zámku: prvky se při úpravě pohybují jinak, než je potřeba; zámek to vyřeší a chrání proti omylem posunu.

### Návrh (schváleno)
- Kóta vždy ukazuje **skutečnou délku z výkresu**. Po posunu se nezamčená kóta přepíše na novou délku, zamčená drží hodnotu.
- Zámek je **jediný mechanismus držení**. Řešič (`core/solver.ts`, `hasMeasuredWallAlong`) a posuny (tažení, `resolveDragPoint`) se řídí zámkem, ne `measured`.
- Nové nepovinné pole `locked?: true` (bez změny `SCHEMA_VERSION`, chybí = odemčeno).
- Stávající projekty: všechny kóty po načtení odemčené.
- Zámek dostane každý druh kóty: délky stěn, odstupy a šířky otvorů, tloušťky, kóty výstupků, úhlopříčky, volné kóty.
- Když zámek nejde dodržet: **akce se neprovede a lišta řekne, která zamčená kóta brání.** Nic se nezmění potichu.
- Ťuknutí na ikonu zámku zamkne / odemkne. Hromadně: zamknout / odemknout vše u vybrané stěny a místnosti.
- Ruční přepsání zamčené kóty: zámek se zruší jen po potvrzení (ověřit s uživatelem).

### Dotčený kód (podle prohlídky repa)
`model/types.ts` (`Wall.measured`), `core/solver.ts`, `canvas/drawDims.ts` (barvy, „~“, „⚠“), `ui/panels/WallPanel.tsx`, `ui/NumPad.tsx`, `store/actions/walls.ts` (`unlockWall`), `store/actions/numpad.ts`, `core/floorQueries.ts`, `core/topology.ts`, `core/trimExtend.ts`, `core/hosting.ts`. Katalog stěn je závazný – kde se dotýká „změřené“ stěny, Code nic nemění a zeptá se.

## B. Příznak „hlavní kóta“ pro export (později)
- Každá kóta má příznak **hlavní × jen pro kreslení**; nezávislý na zámku.
- Výchozí **automaticky**: do exportu celkové rozměry (délka stěny, celková délka řetězové kóty, rozměry místnosti); dílčí (ostění, otvor, meziostění, odstupy, tloušťky) ne.
- Ruční přepsání jedním ťuknutím u vybrané kóty.
- Export: DXF – hlavní kóty na hladině „Kóty“, ostatní na vypnuté hladině „Kóty pracovní“; PDF – jen hlavní; JSON/BIM – všechny kóty + příznak.
- Navazuje na požadavek „volná kóta mezi dvěma body“ (POZADAVKY.md).

## Otevřené
- Chování zámku při ručním přepsání a při změně měřítka.
- Pořadí ve frontě (návrh: po přichytávání k oběma lícům; B až s DXF/PDF exportem).

## Upřesněno v chatu 2026-11-14 (platí přednostně před textem výše)
- **Zámek patří ke konkrétní kótě**, ne k celému prvku (každá kóta se zamyká zvlášť).
- **Ikona zámku je uprostřed kóty u textu** (aby bylo poznat, ke které kótě patří), **modrá** – jinou barvou než kóta.
- Ikona je **jen pomocná** – při exportu výkresu se nekreslí.
- Platí to, co bylo domluveno v chatu; tento dokument byl dodán až po domluvě.
