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

## B. Příznak „hlavní kóta“ pro export (hotovo 2026-11-23: `core/dimRole.ts`; výchozí role podle druhu kóty – volná kóta hlavní, kóty schodiště a výstupků pracovní, rozhodnutí uživatele 2026-11-23)
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
- **Řetěz kót se zámky:** zamčené kóty spojují prvky na stěně do celku. Změna úseku řetězové kóty posune vše napravo spojené zámky, první nezamčený úsek změnu spolkne, jinak se prodlouží stěna. Poslední kóta k rohu B (rozhodnutí uživatele 2026-11-18, mění dřívější „prodlouží stěnu“) posune poslední otvor a otvory s ním spojené zámky k rohu A, první nezamčený úsek vlevo změnu spolkne, stěna zůstane; stěnu prodlouží jen tehdy, když jsou otvory zámky přivázané až k rohu A.
- **Šířka otvoru se zámkem na jedné straně** (rozhodnutí uživatele 2026-11-18, po chybě při zkoušce): když je úsek na straně, kam otvor roste, zamčený (u otvoru měřeného od A celý řetěz až k rohu B) a úsek na druhé straně volný, otvor se rozšíří / zúží na volnou stranu – stěna se neprodlužuje. Zamčené obě strany = jako dřív. Platí i pro ostění vlevo / vpravo a šířku zárubně (vy, 2026-11-18).
- **Změna délky stěny (celková kóta, délka po líci): všechny prvky nesené stěnou zůstanou ve výkresu na místě** – okna, dveře, průchody, niky, výstupky, napojené příčky i každý budoucí druh prvku na stěně; s koncem stěny jedou jen prvky k němu přivázané zamčenými kótami. Celková kóta posouvá volný (nepřipojený) konec stěny.
- **Hlavní zásada (uživatel 2026-11-18):** o tom, co se při změně kóty pohne, rozhodují zámky – zamčená kóta drží, ostatní se hýbe směrem od ní / k ní podle zadané hodnoty; co se pohne bez zámků, není důležité. Zamčená kóta, která s měněným prvkem nesouvisí, nesmí změnu blokovat. Postupné zadávání řetězu („Další“) se řídí stejně – hodnoty, které mají zůstat, se zamknou.
- **Zamčená volná kóta = pevné spojení** (rozhodnutí uživatele 2026-11-18): když se pohne prvek na jednom konci, prvek na druhém konci se posune s ním (i víc kót za sebou) – kresba celá, okno / dveře po stěně, roh, celá stěna (sousední se protáhnou). Pevný bod výkresu se neposune. Blokuje se jen to, co nejde (prvek by vyjel ze stěny, jiný zámek, prvek přivázaný z obou stran tak, že by se úprava vrátila). Kód: `core/dimFollow.ts`.
- **Hrana výstupku** (rozhodnutí uživatele 2026-11-18, výstupek = část stěny): boční hrana posune jen sebe, se zamčeným rozměrem výstupku celek; čelní hrana posune celou stěnu, a když tomu brání zámek (délka sousední stěny, řetěz otvorů…), změní se hloubka výstupku. Kód: `core/protrusionDimMove.ts`.
