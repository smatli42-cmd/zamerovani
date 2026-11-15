# Zaměřování – poznámky pro vývoj

Offline PWA pro zaměřování skutečného stavu budov na tabletu (primárně Galaxy Tab S9 FE + S-Pen).
Cíl: zaměřit a zakreslit skutečný stav stavby přímo na místě, bez internetu. Vrstvy: `model → core → store → canvas/tools/input → ui` (viz Struktura). Nasazení: každý push do `main` sestaví a nasadí GitHub Actions na GitHub Pages (https://smatli42-cmd.github.io/zamerovani/).
Požadavky a plán po fázích: `POZADAVKY.md`. Kde co leží: `INDEX.md`. Starý první prototyp (jen pro inspiraci): `prototyp/`.

## Pracovní postup (závazné)
- **`KATALOG-STEN.md` je závazný.** Testy ani katalog nikdy neměň kvůli tomu, aby něco prošlo. Selhávající test = nález → `it.fails` / `it.todo` s důvodem.
- Pracuj přímo na `main`: commit + push, **bez pull requestů**. Odpovídej česky, stručně, pro nekodéra.
- **Samostatnost:** pracuj bez uživatele, dokud to jde – plánuj, implementuj, testuj, spusť agenta `reviewer` a nálezy oprav sám. Rozhodnutí, která nejsou v katalogu, udělej podle nejrozumnější varianty, zapiš do `POSTUP.md` (sekce „Rozhodnuto samostatně“) a pokračuj. **Neplatí pro průřezové funkce** – tam se zastav a zeptej (viz „Pravidlo pro průřezové funkce“).
- **Zeptej se jen u:** (a) nevratných věcí, (b) rozporu katalogu a požadavku uživatele, (c) testu, který nejde opravit bez změny zadání.
- **Zastav se jen po krocích, které mění viditelné chování aplikace** – napiš na 3 řádky, co má uživatel vyzkoušet. Technické kroky dělej souvisle dál.
- **Deník změn:** v `POSTUP.md` veď sekci „Deník změn“. Po každém dokončeném kroku a při `/konec` přidej **nahoru** záznam: datum; co se změnilo (česky, 1–2 věty); co se změnilo viditelně v aplikaci; rozhodnutí udělaná samostatně; co zůstává otevřené. Chyby nahlášené uživatelem při testování zapiš také (co nefungovalo, jak je opraveno). Starší záznamy nemaž.
- Příkazy `/pokracuji` (začátek sezení) a `/konec` (konec sezení) jsou v `.claude/commands/`.

## Pravidlo pro průřezové funkce
Když se funkce týká více druhů prvků (stěna, otvor, ostění, výstupek, překlad, úhlopříčka, volná kóta…):
1. Pravidlo implementuj JEDNOU na jednom centrálním místě, prvky ho jen využívají. Žádné kopie chování pro každý prvek zvlášť.
2. Před koncem sestav tabulku „pravidlo × typ prvku“, každou buňku ověř (test nebo průchod kódem), nic nevynechej.
3. Nic nerozhoduj sám. Pokud se pravidlo u prvku nedá dodržet nebo je ve sporu s katalogem, tento prvek NEMĚŇ, zastav se a vypiš otázku.
4. Do závěrečné zprávy dej tabulku ✔/✗ pro každý prvek a seznam míst, kde pravidlo dosud platí zvlášť.
5. „Všude / všechny prvky“ platí opravdu pro všechny. Výjimku vypiš s důvodem, neponechávej ji potichu.

## Předávání mezi počítači
Uživatel střídá dva počítače (projekt je na OneDrive). **Na začátku sezení přečti `POSTUP.md`** a na konci práce / po větším kroku ho aktualizuj (poslední stav, rozpracované, další kroky) a změny commitni. Uživatelův postup přepnutí je v `PREPNUTI-POCITACE.md`; když řekne „končím“, udělej aktualizaci POSTUP.md + commit + push.

## Příkazy
- `npm run dev` – vývojový server (http://localhost:5173, `--host` = dostupné i z tabletu ve stejné Wi-Fi)
- `npm test` – testy (vitest), `npm run typecheck`, `npm run build` – produkční sestavení do `dist/`

## Struktura `src/`
- `model/` – datové typy (`types.ts`) a vytváření prvků. Rozměry v mm, prvky v objektech podle ID.
- `core/` – čistá geometrie, dotazy nad půdorysem, řešič délek, přichytávání. Bez DOM, testovatelné.
- `store/` – `store.ts` (stav + historie Zpět/Vpřed přes immer), `actions/` (JEDINÉ místo, kde se mění výkres; rozdělené podle oblastí – `walls`, `copy`, `delete`, `openings`, `rooms`, `texts`, `floors`, `numpad`, `protrusions`, společné `shared`; veřejné rozhraní přes `actions/index.ts`), `numpadController.ts`.
- `persistence/` – IndexedDB (`db.ts`), automatické ukládání, záloha do souboru, migrace dat.
- `canvas/` – vykreslování (jen při změně), klikací kóty (`hitTargets.ts`).
- `tools/` – nástroje (rozhraní `Tool`), registr v `registry.ts`.
- `input/` – pero/prst/myš (`pointer.ts`), klávesnice.
- `ui/` – Preact komponenty (seznam projektů, editor, NumPad, panely). Panely vlastností v `ui/panels/` (`SidePanel.tsx` jen vybírá panel: `WallPanel`, `OpeningPanel`, `TextPanel`, `RoomPanel`; společné `common.ts`, prvky formulářů `fields.tsx`).

## Pravidla
- **Velké soubory:** zdrojový soubor nad cca 500 řádků se při další úpravě **nejdřív rozdělí podle odpovědností** (čistý přesun bez změny logiky, v samostatném commitu) a teprve potom se do něj přidává. Hlídá to test `src/sizeGuard.test.ts` (nad 700 řádků selže, nad 500 upozorní). **Když test velikosti selže, má oprava přednost před další funkcí.**
- Vývojový server běží z OneDrive: když hromadná úprava souborů (skript) neprojde do prohlížeče, Vite ji nezachytil – restartovat `npm run dev` (a ověřit, co server posílá).
- Data projektu měnit jen přes `store.edit()` / `store/actions/`, nikdy přímo.
- **Zámek kót** (`KOTY-ZAMEK-EXPORT.md`, `core/dimLock.ts`): každá kóta může být zamčená (`Floor.dimLocks`); `store.edit` zastaví každou úpravu, která by zamčenou kótu změnila, s hlášením. Pojem „změřeno × náčrt“ je zrušený.
- **Prvky nesené stěnou se při změně délky stěny kótou / NumPadem nehýbou** (rozhodnutí uživatele 2026-11-14) – platí pro **všechny**: okna, dveře, průchody, niky, výstupky, napojené příčky (T) **i každý nový druh prvku na stěně**. Zůstanou ve výkresu na místě; s koncem stěny jede jen to, co je k němu přivázané zamčenými kótami (řetěz zámků). Kód: `keepOpeningsAfterResize` / `keepOpeningsOnResizedWalls` v `core/openingChain.ts` – **nový druh prvku na stěně tam musí přibýt i s testem** (`store/openingChain.test.ts`). Tažení konce stěny perem se neřídí tímto pravidlem (prvky drží odstup od rohu, katalog I1.6). Platí pro rovné stěny (oblouk a kruh zatím ne). Když prvek nejde nechat na místě (vyjel by ze stěny, narazil na jiný prvek, je přivázaný k oběma koncům), úprava se neprovede a zobrazí se hlášení.
- **Prvky nesené stěnou při zkrácení / dělení / smazání stěny** (F4, I1.13, rozhodnutí uživatele 2026-11-15): prvek celý na zbývajícím kusu zůstane na místě; prvek i jen zčásti v mazaném kusu nebo přes dělicí bod se smaže celý; napojená příčka se jen odpojí (volný konec). Jediné místo: `core/carried.ts` – **nový druh prvku na stěně tam musí přibýt i s testem** (`store/carried.test.ts`).
- **Prvek blízko rohu** (F7): jen upozornění v panelu prvku, nic se nezakazuje. Prvek má ležet tam, kde je vidět líc, na kterém leží; hlídá se i příčka napojená doprostřed stěny. Rozhodnutí uživatele 2026-11-15: platí pro otvory i výstupky / vybrání, i na obloukové stěně; otvor hlídá oba líce, nika a výstupek jen svůj líc, vybrání přes celou tloušťku oba líce. Výjimka: otvor na obloukové stěně se nehlídá (otvory na oblouku zatím nejsou, F6; poloha po tětivě). Jediné místo: `core/cornerOverlap.ts` – **nový druh prvku na stěně tam musí přibýt i s testem**.
- **Napojení stěny doprostřed jiné stěny (rovné i oblouku) ji nedělí:** roh má `Node.host` (`core/hosting.ts`), průběžná stěna zůstává jedna; graf skupin/místností přes `wallSegments`, `syncHosted` v `store.edit` drží roh na stěně.
- Při změně struktury dat zvýšit `SCHEMA_VERSION` a doplnit migraci v `persistence/migrate.ts`.
- Všechny tvary (obdélník, kruh, oblouk) jsou běžné stěny (kruh = jedna stěna `Wall.radius` s a === b = střed) (`Wall`); oblouk = `Wall.sagitta` (vzepětí se znaménkem), styl čáry = `Wall.style`. Žádné samostatné „tvary“ v modelu nejsou. Otvory (dveře, okna) jdou zatím jen na rovné stěny. **Výstupek / vybrání** = samostatný prvek `Floor.protrusions` s obrysem v souřadnicích stěny (u od rohu A, v od líce; `core/protrusion.ts`), stěna zůstává celá; vzniká nástrojem Čára (čára bez tloušťky) s oběma konci na stejném líci. Příčka = stěna s malou tloušťkou (nástroje Příčka a Dvojčára byly zrušeny).
- Texty v aplikaci česky. **Tloušťka stěn se kreslí vždy**: stěna = čára líce (`Wall.a/b`) + tělo `Wall.thickness` na straně `Wall.side` (geometrie těla a napojení v `core/wallBody.ts`). `thickness = 0` = čára bez tloušťky (tvary: obdélník, kruh, oblouk). Oblouková stěna = stěna s tloušťkou a `sagitta` (kreslí se z menu Stěny: Rovná / Oblouková + výška oblouku); nástroj Oblouk mezi tvary kreslí jen čáru.
