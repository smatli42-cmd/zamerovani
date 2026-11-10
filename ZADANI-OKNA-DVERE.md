# Zadání: úklid souborů, stěny s tloušťkou, otvory, ostění, detaily (aktualizace 2026-11-10, večer)

Určeno pro implementaci v Claude Code. **Změna oproti dřívější verzi:** spárovaná příčka se ruší, zůstávají jen stěny s tloušťkou. Podrobnosti o stěnách s tloušťkou jsou v `KRESLENI-STEN-NAVRH.md` (ten má při rozporu přednost). Geometrie ostění je potvrzena.

## Postup pro Claude Code (začni tady)
1. Přečti `CLAUDE.md`, `POSTUP.md`, tento soubor a `KRESLENI-STEN-NAVRH.md`. Zkontroluj `git status`. **Rozpracované věci nejdřív commitni** (jako samostatný commit, ať je k čemu se vrátit), pak `git pull` a ověř, že `npm test` a `npm run typecheck` procházejí.
2. Pořadí práce: **(−1) rozdělení velkých souborů**, pak **(0) stěny s tloušťkou**, **(1) úprava otvorů a ostění na stěny s tloušťkou**. Sekci 3 (detaily) a úpravy modelu pro 3D neděl, dokud o to uživatel nepožádá.
3. Před každým krokem krátce navrhni řešení a **zeptej se na body označené „ověřit s uživatelem“**. Nic nerozhoduj sám.
4. Dodržuj pravidla z `CLAUDE.md`: změny dat jen přes `store.edit()` / `actions.ts`, při změně struktury zvýšit `SCHEMA_VERSION` a doplnit migraci, texty česky, `core/` bez DOM a s testy. **Pravidlo „tloušťka se graficky nekreslí“ se mění na „tloušťka se kreslí vždy“; zapiš to do `CLAUDE.md`.**
5. Ke každé novince přidej testy a spusť `npm test`, `npm run typecheck`.
6. Zkus změny vizuálně v prohlížeči a řekni uživateli, co má ověřit na tabletu.
7. Po každém kroku aktualizuj `POSTUP.md`, commitni a pushni (každý krok zvlášť).

## Krok −1: rozdělení velkých souborů (bez změny chování)
Cíl: úklid před velkými změnami. **Jen přesuny kódu, žádné nové funkce ani změny chování.** Po kroku musí projít stejné testy a typecheck jako před ním.
- **`src/store/actions.ts` (cca 820 řádků)** rozdělit podle sekcí, které v něm už jsou: stěny, otočení/kopírování, mazání, otvory, místnosti, texty, podlaží, NumPad (návrh: `src/store/actions/walls.ts`, `copy.ts`, `openings.ts`, `rooms.ts`, `texts.ts`, `floors.ts`, `numpad.ts`, společné pomocné funkce např. `shared.ts`). Přidat `src/store/actions/index.ts`, který vše znovu exportuje, aby ostatní soubory nemusely měnit importy. Pravidlo „jediné místo, kde se mění výkres“ platí dál.
- **`src/ui/panels/SidePanel.tsx` (cca 450 řádků)** rozdělit na samostatné soubory panelů (`WallPanel`, `OpeningPanel`, `TextPanel`, `RoomPanel`, případně panel příčky) + malý `SidePanel.tsx`, který vybírá panel podle výběru.
- `selectTool.ts` zatím nechat; `drawPlan.ts`, `drawDims.ts` ponechat, pokud nejsou nad ~500 řádků (zkontrolovat a případně navrhnout).
- Zkontrolovat, že se při přesunu neztratily žádné exporty a že kruhové závislosti nevznikly.
- Po kroku: testy + typecheck, zkouška v prohlížeči, samostatný commit „Rozdělení actions.ts a SidePanel.tsx (beze změny chování)“, aktualizace `POSTUP.md`.

## Krok 0: stěny s tloušťkou
Viz `KRESLENI-STEN-NAVRH.md` (menu Stěny s předvolbami tloušťky, naposled vybraná tloušťka, tělo stěny ven od místnosti, dvojitá šipka pro přehození strany, uzavřené konce, přichytávání, rohy, základní T-napojení, změna tloušťky ponechává čáru líce).

### Stav kódu ke dni zadání (důležité pro migraci)
V kódu už je podle starší verze zadání hotovo (a uživatel to zkoušel):
- ostění (`Opening.reveal`), `openingSpan`,
- dveře se zárubní a okna s rámem (`Opening.frame`, `core/doorLayout.ts`, `drawFramed` v `drawPlan.ts`, Francouzské okno),
- **spárovaná příčka** (`Wall.part {id, line 0|1|2}`, `core/pairing.ts`, nástroj Příčka, panel Příčka).
Nové rozhodnutí uživatele: **příčka (dvojčára i spárovaná příčka) se ruší**; příčka je stěna s malou tloušťkou. Proto:
- Migrace (`SCHEMA_VERSION` +1): spárované příčky (`Wall.part`) a případně dvojčáry převést na **jednu stěnu s tloušťkou** (= vzdálenost čar) a **sloučit jejich otvory** (otvory z první čáry; zárubně a ostění zachovat). Pokud nejde převod jednoznačně poznat, ponechat jako dvě stěny a **nahlásit uživateli**. Dotaz „sloučit automaticky, nebo se zeptat?“ je v `KRESLENI-STEN-NAVRH.md` otevřený; **ověřit s uživatelem**.
- Po převodu odstranit nástroj Příčka a kód párování (`Wall.part`, `pairing.ts`), jakmile nic nepoužívá.
- **Ostění, zárubně a okna s rámem zachovat** a přizpůsobit stěně s tloušťkou (tloušťka příčky T = ostění A + zárubeň + ostění B ze `doorLayout.ts` se stává tloušťkou stěny).

## Krok 1: otvory a ostění ve stěně s tloušťkou
- Otvor (dveře, okno, průchod) se vkládá jedním klepnutím, uloží se **jednou** a kreslí se **skrz celé tělo stěny** (na obou lících), jak to dnes dělá příčka. Nika patří k líci, ze kterého je přístupná (`side`); **ověřit s uživatelem** výchozí chování.
- Ostění: `Opening.reveal?: { depth, left, right, top }`; celková šířka otvoru = vlevo + okno (s rámem) + vpravo; odstup od rohu se měří k okraji celého otvoru; hloubka ostění se **nepropisuje** do tloušťky stěny. Kóty klikací. Většina je hotová (viz stav kódu), zbývá přizpůsobit stěně s tloušťkou a dodělat kótu hloubky ostění na výkrese.
- Výběr ťuknutím vybere celou stěnu; jedna klikací kóta tloušťky.
- Zaměřování zůstává po místnostech: kóty místností jsou vnitřní míry (líc–líc), kótování zatím beze změny.
- Export později: stěna s tloušťkou a jejími otvory, `reveal` jako data.

## Pořadí práce (rozhodnuto uživatelem)
−1. **Rozdělení `actions.ts` a `SidePanel.tsx`** (beze změny chování).
0. **Stěny s tloušťkou** a migrace příčky.
1. **Otvory a ostění ve stěně s tloušťkou.**
2. Úpravy modelu pro 3D (výška a úroveň podlaží, pravidlo výšky stěn, vazba stěn na místnost).
3. Značky detailů (sekce 3), schodiště.
4. Zařizovací předměty a symboly, fotky, výstupy (PDF, DXF, JSON).

## Sekce 3: značky detailů (zachovat, převzít z prototypu)
V novém kódu (`src/`) zatím nejsou, jsou jen v původním prototypu (`prototyp/`).
- **Značka detailu v půdorysu** s číslem (D1, D2…) a názvem (popiskem).
- **Po klepnutí se otevře samostatné okno** se skicou detailu: pero, přímka, text, kóta, guma, zoom/posun, barvy, zpět.
- **Poznámky k detailu** (skladba, materiály) a předvolby názvů.
- Detaily jsou **jen k dokumentaci, nejdou do strukturovaného exportu**. Mohou jít do PDF jako příloha.
- Později (nepovinné): fotka jako podklad skici, detail jako řez stěnou s vrstvami.
- Změna dat → nová položka v modelu podlaží/projektu (`details`), zvýšit `SCHEMA_VERSION` a doplnit migraci.
