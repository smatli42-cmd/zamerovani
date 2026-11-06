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
- `store/` – `store.ts` (stav + historie Zpět/Vpřed přes immer), `actions.ts` (JEDINÉ místo, kde se mění výkres), `numpadController.ts`.
- `persistence/` – IndexedDB (`db.ts`), automatické ukládání, záloha do souboru, migrace dat.
- `canvas/` – vykreslování (jen při změně), klikací kóty (`hitTargets.ts`).
- `tools/` – nástroje (rozhraní `Tool`), registr v `registry.ts`.
- `input/` – pero/prst/myš (`pointer.ts`), klávesnice.
- `ui/` – Preact komponenty (seznam projektů, editor, NumPad, panely).

## Pravidla
- Data projektu měnit jen přes `store.edit()` / `actions.ts`, nikdy přímo.
- Při změně struktury dat zvýšit `SCHEMA_VERSION` a doplnit migraci v `persistence/migrate.ts`.
- Texty v aplikaci česky. Tloušťka stěn se graficky nekreslí (jen popisek stěny).
