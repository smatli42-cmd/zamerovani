# Postup práce (předávací deník mezi počítači)

Projekt je na OneDrive a uživatel střídá dva počítače (nikdy ne současně).
**Na začátku sezení tento soubor přečti. Na konci práce (nebo po větším kroku) ho aktualizuj.**
Nejnovější záznam je nahoře v sekci „Poslední stav“, starší jdou do „Historie“.

## Poslední stav (2026-11-10 – ostění; navazuje spárovaná příčka)

**Zadání:** `ZADANI-OKNA-DVERE.md` (ostění → spárovaná příčka → úpravy modelu pro 3D → značky detailů/schodiště → předměty/výstupy). Rozhodnutí uživatele: odstup otvoru se měří k okraji celého otvoru (včetně ostění); strana ostění přepínačem (dveře podle směru otevírání, okno tlačítkem „Strana ostění“); nika v příčce jen na jednom líci; **dvojčára zůstává beze změny** a přibude samostatný nástroj **Příčka** (dvě spárované čáry, dveře/okna se vloží jednou a kreslí na obou lících) – staré dvojčáry se nepřevádějí.

**Konec sezení 2026-11-10:** dveře se zárubní uživatel odzkoušel a funguje to (po úpravě: čerchované čáry v líci i bez ostění, plné čáry prahu mezi zárubněmi, `frame.offset` = odsazení zárubně od líce A bez ostění). **Další krok: doladit okna** (zatím staré ostění, sjednotit s novým chováním dveří – délky ostění, hloubka z obou líců v příčce). Poté dle `ZADANI-OKNA-DVERE.md` model pro 3D, detaily, výstupy.

**Hotovo – nová značka dveří se zárubní (2026-11-10):** uživatel přehodnotil dveře (značka jako v Revitu, tenké čáry). `Opening.frame {width 50, depth 100}` (jen dveře, nové dveře ho mají hned, staré bez něj kreslí postaru), `openingSpan = ostění L + zárubeň + dveře + zárubeň + ostění R`. `core/doorLayout.ts`: tloušťka příčky T = ostění A + zárubeň + ostění B; ukládá se jen `reveal.depth` (líc A), hloubka z líce B se dopočítá; změna jednoho ostění posune druhé, změna hloubky zárubně přerozdělí obě ostění. Kreslení `drawFramedDoor` (drawPlan.ts): líce se přeruší, s ostěním je okraj „vykousnutý“ (schod), čerchovaná čára na líci s ostěním, tenká plná bez ostění, zárubně jako obdélníky, křídlo s obloukem (hinge L/P, swing). U příčky jedna značka přes obě čáry (bez dvojího kreslení). Kóty zárubně klikací, panel: Šířka/Hloubka zárubně, Hloubka (líc A/B). Odpovědi uživatele: zárubeň výchozí uprostřed příčky (ostění 0), nové chování pro dveře (okna beze změny), „samostatné“ čáry příčky řešeny jen vizuálně (přerušení, ne dělení stěn v datech). 41 testů. **Neověřeno na tabletu; okna zatím staré ostění.**

**Hotovo – spárovaná příčka (sekce 2, první verze, čeká na posouzení uživatele):** nástroj ▥ Příčka (`pricka`, kreslí se jako dvojčára, `applyPartition(..., paired)`), v modelu volitelné `Wall.part {id, line 0|1|2}` (1 = první čára s otvory, 2 = druhá čára, 0 = uzavírací stěna volného konce; úseky rozdělené hostitelské stěny tag nemají), `core/pairing.ts` (`twinOffset`, `toPrimary`, `thicknessTarget`, `partitionThickness`). Otvory se ukládají na první čáru a kreslí na obou (dveře na druhé čáře bez křídla jako průchod), ťuknutí na druhou čáru vloží/zvolí otvor přes `toPrimary` (placeTools, pasteTool, pickOpening), klikací kóta tloušťky v otvoru (využívá `shiftJunction`), panel „Příčka“ (tloušťka, styl obou čar, kopírovat, smazat vše), zvýraznění celé příčky, mazání/kopírování celé příčky. Nika patří ke své čáře (zrcadlí se ne). 39 testů. Bez změny schématu (nepovinné pole). **Neověřeno na tabletu.** Možná vylepšení: kóty tloušťky/šířky se u malého zoomu překrývají, ostění na druhém líci zrcadlí jen směr, tažení konců příčky.

**Hotovo – ostění (sekce 1):** `Opening.reveal?: {depth,left,right,top}` (nepovinné, bez bumpu schématu), `openingSpan(op)` = okno + ostění vlevo/vpravo používá se ve všech výpočtech polohy (`floorQueries`, `topology`, `actions`, `selectTool`), kreslení symbolu s ostěním (`drawPlan.ts`), řetězová kóta vlevo–okno–vpravo (`drawDims.ts`), NumPad cíl `opening-reveal`, panel otvoru (přepínač Ostění, hloubka/nahoře/vlevo/vpravo, Strana ostění). Zapnutí ostění nechá okno na místě. Nika ostění nemá. 37 testů. **Neověřeno na tabletu.** Zbývá: kóta hloubky ostění přímo na výkrese (zatím jen v panelu), pak sekce 2 (Příčka).

## Předchozí stav (2026-11-09 – přichytávání ke zvláštním bodům)

**Nově (testy OK, v prohlížeči/na tabletu neověřeno vizuálně):** při kreslení stěn/příček/tvarů se začátek i konec přichytí ke **zvláštním bodům** (`core/specialPoints.ts`): střed rovné stěny, vrchol a střed oblouku, 4 kvadranty kruhu/oblouku (středy kruhů jsou rohy). Značka je fialový kosočtverec. Body na stěně stěnu rozdělí. Priorita: roh → zvláštní bod → stěna. 34 testů. Rozdělený oblouk (části na téže kružnici) se chová jako jeden: tažení vrcholu, panel i kóta vzepětí mění celý řetěz (core/arcChain.ts, 35 testů; vizuálně neověřeno). **Výběr obdélníkem** (nástroj Vybrat, bez přepínání): ťuknutí na prvek = výběr jako dřív, tažení z prázdného místa = obdélník; zleva doprava „okno“ (jen celé prvky, modře), zprava doleva „křížení“ (i dotčené, zeleně čárkovaně). Výběr více prvků = `Selection.kind 'multi'`; panel „Vybráno N prvků“ + Smazat, tažením za vybraný prvek se posune celá skupina (`moveGroup`). Ověřeno Playwrightem (36 testů). **Kopírování:** tlačítko „📄 Kopírovat“ v panelu stěny/textu/místnosti/skupiny (`duplicateSelection`): kopie s odsazením 300 mm, otvory jdou se stěnou, kopie je hned vybraná a jde táhnout na místo. **Kopie otvorů:** vybrané jen otvory (jeden nebo skupina, např. balkonové + běžné okno) → Kopírovat → nástroj Vložit (`paste`, lišta „Hotovo“): ťuknutí na jinou rovnou stěnu vloží celou skupinu se zachovanými rozestupy (střed skupiny na místě ťuknutí, `pasteOpenings`, schránka `store.clipboard`). Kopie stěn je vždy skupina i s otvory, takže jde celá uchopit a přenést. **Kompaktní panely vlastností** (nízký displej tabletu): pole vedle sebe (`.field-grid`), přepínače s popiskem v řádku, Kopírovat + Smazat vedle sebe (`.panel-actions`, vždy vidět dole), odstraněny zkrácené předvolby popisu otvoru. Okno ~360 px, stěna ~520 px výšky (viz CSS na konci styles.css). **Otočení výběru:** v panelu skupiny (výběr obdélníkem) tlačítka ⟲/⟳ 90° a pole „Otočit o úhel“ (kladný = po směru hodin, kolem středu výběru, `rotateSelection`; texty se natočí také). **Odkazová šipka:** nástroj ↗️ Šipka (táhni od místa, na které se ukazuje, tam kam má přijít text; hrot se přichytává), v modelu volitelné `TextNote.leader` (hrot, bez bumpu schématu). Hrot vybraného textu je modrý úchyt k tažení; přepínač „Šipka“ v panelu textu; šipka se posouvá/otáčí/kopíruje s textem. **Oprava nastavení na tabletu:** okno nastavení (ozubené kolo) se zavíralo při zvednutí prstu (`onPointerLeave`), takže volby nešly zapnout; teď se zavírá ťuknutím mimo (`TopBar.tsx`). Ověřeno dotykovým testem v Playwrightu. Zbývá: vyzkoušet na tabletu (pero), případně kopírování a otočení zadáním úhlu.

**Na konci sezení (2026-11-09):** vše commitnuto a pushnuto, vše ověřeno uživatelem na tabletu (přichytávání, oblouk jako celek, kruh s napojenými stěnami, výběr obdélníkem, kopírování, vkládání otvorů, kompaktní panely, otočení, odkazová šipka, nastavení). **Další krok si uživatel ujasňuje** – nabídnuto: schodiště (potřeba vědět druhy), zařizovací předměty (potřeba seznam symbolů), případně úklid velkých souborů (`actions.ts`, `SidePanel.tsx`, `selectTool.ts`) před exporty. Začít zeptáním, co si vybral.

## Předchozí stav (2026-11-08, večer – samostatný text)

**Nově (otestováno v prohlížeči na PC, na tabletu neověřeno):** nástroj **Text** (🅰️ v liště). Ťuknutí do prázdného místa vloží text a hned se dá psát (pole v panelu se samo aktivuje, tlačítko „Hotovo“ panel zavře), ťuknutí na text ho vybere (panel: víceřádkové pole, velikost Malé 50 / Střední 100 (výchozí) / Velké 200 mm nebo vlastní výška, natočení 0/90/180/270 nebo úhel), tažením se přesune, Smazat v panelu. Model: `Floor.texts` (`TextNote` {x, y, text, size v mm, angle ve °}), `SCHEMA_VERSION` = 5 s migrací (prázdné `texts`), 32 testů. Kód: `canvas/drawTexts.ts`, `canvas/textBox.ts` (odhad rozměrů pro kreslení i zásah), `tools/textTool.ts`, `pickText` v `tools/pick.ts`, akce `addText/updateText/moveText` v `actions.ts`.
- **Ověřit na tabletu:** zda S-Pen v textovém poli panelu převede rukopis na text (Samsung klávesnice / „Psaní rukou“). Vlastní rozpoznávání se nedělá.
- Rámeček zásahu textu je odhad podle počtu znaků (ne přesné měření), takže u velmi širokých písmen může být o kousek menší/větší.
- Tlačítko „Hotovo“ je v panelu textu hned pod polem (kvůli klávesnici na tabletu). Psaní perem na tabletu je „lepší než klávesnice“, ale zatím není naplánované.
- **Doporučený další krok:** přichytávání ke středům a rohům tvarů (navazuje kopírování a schodiště); před tím vyzkoušet tvary a text na tabletu.
- Dál podle plánu níže: přichytávání ke středům/rohům tvarů, kopírování, otočení zadáním úhlu, odkazová šipka s textem, schodiště, zařizovací předměty.
- Na tomto počítači (KUK2) jsem v gitu nastavil jméno/e-mail autora jen pro projekt (stejné jako dřívější commity).

## Dřívější stav (2026-11-08, programovací sezení – tvary jako stěny)

**Hotovo a uživatel potvrdil, že funguje (zatím jen na PC, na tabletu neověřeno):**
- **Všechny tvary jsou běžné stěny** (`Wall`), žádné samostatné „tvary“ v modelu nejsou:
  - **Obdélník** = 4 stěny, **kruh** = jedna stěna (`Wall.radius`, `a === b` = střed), **oblouk** = stěna s `Wall.sagitta` (vzepětí se znaménkem), rovnou stěnu lze v panelu přepnout na oblouk.
  - **Styl čáry** (plná / čárkovaná / čerchovaná) = `Wall.style`; čárkované se kreslí s ostrými konci (kulaté konce slévaly mezery).
  - Tvary se přichytávají ke stěnám a rohům, napojením stěnu rozdělí (i obloukovou – části zůstanou na téže kružnici).
- **Dvojčára** = příčka ze dvou rovnoběžných stěn (tloušťka a strana v liště nad plátnem, výchozí 100 mm). Konce opřené o stěnu ji rozdělí na úseky (úsek mezi čarami má délku tloušťky), volný konec se uzavře krátkou stěnou. Změna tloušťky = zadání délky toho úseku (využívá `shiftJunction` v řešiči).
- **Oblouk:** středový bod vybraného oblouku (modrý) jde táhnout = mění vzepětí; funguje i při nástrojích Stěna/Oblouk. Kruh: modrý bod na obvodu mění poloměr. Kóty: tětiva + vzepětí (u oblouku), Ø (u kruhu).
- **Odstupy skupin stěn** (např. sloup): u vybrané stěny samostatné skupiny se ukážou klikací odstupy ke stěnám okolí (vlevo/vpravo/nahoře/dole); zadání posune celou skupinu (`core/components.ts`).
- Dveře a okna zatím **jen na rovné stěny**; dvojčára se o obloukovou stěnu neopře přesně.
- `SCHEMA_VERSION` = 4; migrace z dřívějších vývojových verzí (tvary → stěny, dvě půlkruhové stěny → kruh) v `persistence/migrate.ts`, pokryto testy. Testů je 31.
- Kóty se u niky odsunou za ni, u oblouku za vyklenutí.

**Nedělá se / vědomě chybí:** přetažení celého sloupu najednou (posouvá se odstupem nebo rohy), otvory v obloukových stěnách, tažení koncových bodů oblouku jinak než jako rohů. Drobnost: kóta vzepětí se může překrývat s odstupem dolů.

**Další krok (návrh):** samostatný text na výkresu (ověřit na tabletu převod rukopisu S-Penem) → přichytávání ke středům/rohům tvarů (středy kruhů, vrcholy oblouků, kvadranty) → kopírování, otočení zadáním úhlu, odkazová šipka s textem → schodiště → zařizovací předměty a symboly. Před dalším vývojem by pomohlo vyzkoušet nové tvary na tabletu (pero, velikost úchytů).

## Starší rozhodnutí a plán (z 2026-11-06)

**Rozhodnutí o dalším postupu (uživatel):**
- Výstupy (fáze 2) odložit až **ke konci projektu** – aplikace ještě nemá všechny prvky a export by se musel předělávat.
- **Plochy a obvody místností NEDĚLAT** (program není na výpočty, zjednodušené otvory by dávaly špatné hodnoty, názory na výpočet se liší).
- **Tabulky místností/otvorů zatím ne.**
- **Číslování místností ne** – stačí název (je to jen zaměření).
- **PDF ano** (až na konci) – formát **podle velikosti výkresu**, s razítkem.
- **DXF ano, ale později** (až budou schodiště, zařizovací předměty atd.). Názvy hladin zatím neurčené – udělat je snadno změnitelné (nastavení/konstanta).

**Plán kreslení tvarů (kroky 1–3 hotovy jinak než původně – tvary jsou stěny; zbývá 4–5):**
Nové tvary jsou plnohodnotné prvky v modelu (vlastní ID, výběr, vlastnosti, NumPad, později DXF entity LINE/CIRCLE/ARC). Představují sloup, překlad, komín apod.
1. **Společný základ:** nový typ prvku (tvar), **styl čáry** (plná / čárkovaná / čerchovaná – vlastnost prvku v panelu vlastností, výchozí podle typu, např. překlad čárkovaně), **popisek** (název + poznámka jako u stěn), výběr a panel vlastností. Při změně dat zvýšit `SCHEMA_VERSION` + migrace.
2. **Obdélník** (dva rohy nebo střed + rozměry, lze natočit) a **kruh** (střed + poloměr/průměr).
3. **Dvojitá čára** – jen RÁVNÁ, dvě rovnoběžné čáry se zadanou vzdáleností (NumPad). **Oblouk** – dva koncové body + vzepětí (sagita), případně tři body.
4. **Samostatný text** na výkresu (přetáhnout, otočit). Rukopis: nepsat vlastní rozpoznávání – použít běžné textové pole, Samsung S-Pen ho převede sám (OVĚŘIT na tabletu). Přepínač „psát klávesnicí / perem“; ruční písmo, které má zůstat, patří do volného kreslení.
5. **Přichytávání** k bodům nových tvarů (středy, rohy, kvadranty kruhu) – uživatel výslovně chce. Dále kopírování/duplikace, otočení zadáním úhlu, šipka s textem (odkazová čára); volitelně výplň/šrafování a zámek rozměru.
- Tloušťky a barvy čar řešit až u volného kreslení; u tvarů stačí styl čáry.

**Pak (původní návrh):** schodiště → zařizovací předměty a symboly → poznámkový „špendlík“ → pomocné čáry a kreslení od ruky (tloušťky, barvy) → fotky se značkou směru → nakonec výstupy (PDF podle velikosti výkresu + DXF s hladinami, případně JSON pro BIMCraft).

**Hotovo a funguje:**
- Fáze 1: kreslení stěn perem, NumPad pro rozměry, otvory (dveře/okna/průchody/niky), místnosti, popisky stěn, patra, automatické ukládání (IndexedDB), záloha do souboru.
- Stěny plnou černou čarou, čerchované nadpraží v otvorech, příčka dělí napojenou stěnu, Revit logika (ťuknutí na prvek = vlastnosti, ťuknutí na kótu = rozměr, Smazat v panelu).
- Nasazení na GitHub Pages (https://smatli42-cmd.github.io/zamerovani/ – lomítko na konci je nutné), po prvním načtení funguje offline. Repo: https://github.com/smatli42-cmd/zamerovani, větev main.
- Kóty se u niky odsunou za ni (`src/canvas/drawDims.ts`) – uživatel potvrdil, že funguje. Commitnuto a pushnuto.
- Přidán `PREPNUTI-POCITACE.md` (přesný postup přepnutí mezi počítači pro uživatele).
- Vývojový server na konci sezení zastaven; na dalším počítači spustit `npm run dev`.

**Rozpracované / neověřené:**
- Obrázek příčky dělící místnost, který uživatel chtěl poslat (zatím nedorazil / už mohl být vyřešen).

**Později:** pohledy na stěny, chytřejší řešič, JSON/IFC export pro BIMCraft.

**Otevřené drobnosti:**
- Kóty se mohou překrývat s obloukem dveří (odloženo, uživateli nevadí).
- 6 npm audit varování jen ve vývojových závislostech (vite-plugin-pwa) – neřešit.

## Důležité při přechodu mezi počítači
- Po přepnutí spusť `git pull` (kód je i na GitHubu) a pokud se změnil `package.json`, `npm install`.
- Před odchodem od počítače změny **commitni a pushni** – OneDrive synchronizuje soubory, ale `node_modules` a `.git` je lepší nechat na GitHubu (`npm install` si je obnoví).
- Paměť Claude (`~/.claude/...`) je vázaná na konkrétní počítač, proto je veškerý kontext zde a v `CLAUDE.md` / `POZADAVKY.md`.
- Data projektů (zaměření) jsou v prohlížeči daného zařízení; přenos mezi zařízeními jen přes zálohu `*.zamer.json`.

## Historie
- 2026-11-08: tvary jako stěny (obdélník, kruh, oblouk), dvojčára/příčka, tažení vzepětí, odstupy sloupů, čerchovaná čára; schema 4.
- 2026-11-06 (2. sezení): jen plánování – tablet OK, výstupy odloženy na konec, plochy/tabulky/číslování vypuštěny, schválen plán: nejdřív kreslení tvarů (obdélník, kruh, oblouk, dvojitá čára, styl čáry, text, přichytávání).
- 2026-11-06: opraveno nasazení (adresa musí končit `/`), kóty za nikou.
- 2026-11-05: GitHub Pages workflow, repo založeno a pushnuto.
- Dříve: nová architektura (model/core/store/persistence/canvas/tools/input/ui), testy (14), příčky dělí stěny, Revit logika výběru, plné stěny + čerchované nadpraží.
