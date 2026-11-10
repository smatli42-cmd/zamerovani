# Zaměřování – poznámky pro vývoj

Offline PWA pro zaměřování skutečného stavu budov na tabletu (primárně Galaxy Tab S9 FE + S-Pen).
Požadavky a plán po fázích: `POZADAVKY.md`. Starý první prototyp (jen pro inspiraci): `prototyp/`.

## Předávání mezi počítači
Uživatel střídá dva počítače (projekt je na OneDrive). **Na začátku sezení přečti `POSTUP.md`** a na konci práce / po větším kroku ho aktualizuj (poslední stav, rozpracované, další kroky) a změny commitni. Uživatelův postup přepnutí je v `PREPNUTI-POCITACE.md`; když řekne „končím“, udělej aktualizaci POSTUP.md + commit + push.

## Příkazy
- `npm run dev` – vývojový server (http://localhost:5173, `--host` = dostupné i z tabletu ve stejné Wi-Fi)
- `npm test` – testy (vitest), `npm run typecheck`, `npm run build` – produkční sestavení do `dist/`

## Struktura `src/`
- `model/` – datové typy (`types.ts`) a vytváření prvků. Rozměry v mm, prvky v objektech podle ID.
- `core/` – čistá geometrie, dotazy nad půdorysem, řešič délek, přichytávání. Bez DOM, testovatelné.
- `store/` – `store.ts` (stav + historie Zpět/Vpřed přes immer), `actions/` (JEDINÉ místo, kde se mění výkres; rozdělené podle oblastí – `walls`, `copy`, `delete`, `openings`, `rooms`, `texts`, `floors`, `numpad`, společné `shared`; veřejné rozhraní přes `actions/index.ts`), `numpadController.ts`.
- `persistence/` – IndexedDB (`db.ts`), automatické ukládání, záloha do souboru, migrace dat.
- `canvas/` – vykreslování (jen při změně), klikací kóty (`hitTargets.ts`).
- `tools/` – nástroje (rozhraní `Tool`), registr v `registry.ts`.
- `input/` – pero/prst/myš (`pointer.ts`), klávesnice.
- `ui/` – Preact komponenty (seznam projektů, editor, NumPad, panely). Panely vlastností v `ui/panels/` (`SidePanel.tsx` jen vybírá panel: `WallPanel`, `OpeningPanel`, `TextPanel`, `RoomPanel`; společné `common.ts`, prvky formulářů `fields.tsx`).

## Pravidla
- Vývojový server běží z OneDrive: když hromadná úprava souborů (skript) neprojde do prohlížeče, Vite ji nezachytil – restartovat `npm run dev` (a ověřit, co server posílá).
- Data projektu měnit jen přes `store.edit()` / `store/actions/`, nikdy přímo.
- Při změně struktury dat zvýšit `SCHEMA_VERSION` a doplnit migraci v `persistence/migrate.ts`.
- Všechny tvary (obdélník, kruh, oblouk) jsou běžné stěny (kruh = jedna stěna `Wall.radius` s a === b = střed) (`Wall`); oblouk = `Wall.sagitta` (vzepětí se znaménkem), styl čáry = `Wall.style`. Žádné samostatné „tvary“ v modelu nejsou. Otvory (dveře, okna) jdou zatím jen na rovné stěny. Příčka = stěna s malou tloušťkou (nástroje Příčka a Dvojčára byly zrušeny).
- Texty v aplikaci česky. **Tloušťka stěn se kreslí vždy**: stěna = čára líce (`Wall.a/b`) + tělo `Wall.thickness` na straně `Wall.side` (geometrie těla a napojení v `core/wallBody.ts`). `thickness = 0` = čára bez tloušťky (tvary: obdélník, kruh, oblouk). Oblouková stěna = stěna s tloušťkou a `sagitta` (kreslí se z menu Stěny: Rovná / Oblouková + výška oblouku); nástroj Oblouk mezi tvary kreslí jen čáru.
