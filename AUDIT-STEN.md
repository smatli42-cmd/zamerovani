# Audit stěn podle katalogu (fáze 1, 2026-11-11)

Podle `ZADANI-AUDIT-STEN.md`. Prošel jsem všechny řádky `KATALOG-STEN.md` s ✔ nebo ✎ (A–F) proti kódu. **V kódu jsem nic neměnil**; tři věci jsem ověřil jednorázovým testem, který jsem hned smazal (viz „Naměřeno“). Katalog je beze změny, navržené změny jsou jen tady.

Stav: **hotovo** / **částečně** / **chybí** / **nejasné**. „Test“ = existuje automatický test, který to kryje (ne = jen ověřeno v prohlížeči / čtením kódu).

## Souhrn
- Z 45 řádků: **hotovo 29**, **částečně 8** (A2, A10, B6, C1.9, C1.11, D2, D4, F4), **chybí 5** (C1.5, C1.6, D3, E7, F7), **rozpor s rozhodnutím 2** (D10 a E3: typ a materiál se kreslí na výkrese). C1.11 je „částečně“: stěny zůstanou dvě, ale hrana odskoku chybí.
- Největší mezery: nelze zrušit napojení konce (C1.6 + E7), křížení „+“ se kreslí jako dvě překrývající se stěny s čarami uvnitř (C1.5), chybí nástroj zkrátit/prodloužit do rohu (D3), chybí upozornění u otvoru u rohu (F7).

## A. Vytvoření stěny

| # | Co katalog chce | Stav | Kde v kódu | Test | Důkaz |
|---|---|---|---|---|---|
| A1 | Přímá stěna dvěma body | hotovo | `tools/wallTool.ts: up` → `actions/walls.ts: addWall` | ne (prohlížeč) | Tah perem vytvoří stěnu s aktivní tloušťkou. |
| A2 | Řetěz navazujících stěn, zapnutelné | **částečně** | `wallTool.ts: down` (`snapPoint` na roh) | ne | Každý tah je jedna stěna; navázat jde přichycením začátku na roh, ale **není režim „řetěz“** (konec = začátek další). |
| A3 | Obdélník jedním tahem | hotovo | `tools/shapeTools.ts`, `actions/walls.ts: addRectWalls` | ne | Čtyři čáry bez tloušťky (tak bylo rozhodnuto dřív). |
| A4 | Oblouk, kruh | hotovo | `shapeTools.ts`, `wallTool.ts` (režim Oblouková), `core/arcChain.ts`, `core/arc.ts` | ano (`arcChain.test`, `arc.test`, `wallBody.test`) | Oblouk i kruh jsou stěny; oblouk s tloušťkou v menu Stěny. |
| A10 | Přesná délka číslem při kreslení | **částečně** | `wallTool.ts: drawLengthBadge` (jen zobrazení), `input/keyboard.ts` (číslo u vybrané stěny), `actions/numpad.ts` | ano (jen `solver.test`) | Během tažení se délka jen ukazuje; zadat číslem jde **po nakreslení** (kóta nebo klávesa číslice u vybrané stěny). |
| A11 | Náhled stěny (tloušťka, líc, směr) | hotovo | `wallTool.ts: drawOverlay` | ne | Modrá čára líce, šedé tělo, délka. |
| A12 | Zrušení rozkreslené stěny | hotovo | `wallTool.ts: cancel`, `input/keyboard.ts` (Esc), `pointer.ts` (pointercancel) | ne | Esc / přerušení gesta zahodí `drawing`; tah kratší než 50 mm jen vybírá. |
| A13 | Nová stěna přebírá naposled zvolenou tloušťku | hotovo | `model/factory.ts: activeWallThickness`, `actions/project.ts: setActiveWallThickness` | ano (`wallPresets.test`) | Tloušťka se ukládá do `Project.wallThickness`. |
| A14 | Minimální délka 5 cm | hotovo | `wallTool.ts: up` (`>= 50`) | ne | Kratší tah stěnu nevytvoří. Pozn.: platí jen při kreslení, tažením rohu jde stěnu zkrátit pod 5 cm (nehlídá se). |

## B. Referenční čára, strana, tloušťka

| # | Co katalog chce | Stav | Kde v kódu | Test | Důkaz |
|---|---|---|---|---|---|
| B1 | Referenční čára = vnitřní líc, tělo roste od ní | hotovo | `model/types.ts: Wall.side/thickness`, `core/wallBody.ts` | ano (`wallBody.test`) | Tělo = odsazení čáry líce o `thickness` na straně `side`. |
| B2 | Přehození strany dvojitou šipkou | hotovo | `actions/walls.ts: flipWallSide`, `canvas/drawPlan.ts: drawFlipArrow` (jen u vybrané) | částečně (`openingsInBody.test`: strana zvolená perem) | Šipka u vybrané stěny, jedno klepnutí. |
| B3 | Změna tloušťky: líc zůstane, tělo se přizpůsobí | hotovo | `actions/walls.ts: setWallThickness` | částečně (NumPad kóta v `openingsInBody.test`); **příklad C2/7 není testován** | Mění se jen `thickness`, čára líce a rohy se nehýbou. |
| B5 | Předvolby 100/150/200/300 + vlastní | hotovo | `model/factory.ts: WALL_PRESETS`, `ui/ToolOptions.tsx` | ano (`wallPresets.test`) | Seznam, aktivní označená, vlastní se přidá a jde odebrat. |
| B6 | Zadání tloušťky číslem při kreslení | **částečně** | `ToolOptions.tsx` (pole „Vlastní“), `ui/panels/WallPanel.tsx` | ano (`wallPresets.test`) | Číslem před kreslením (vlastní předvolba) a po nakreslení (panel, kóta); **ne uprostřed tahu**. |

## C. Napojení stěn

| # | Co katalog chce | Stav | Kde v kódu | Test | Důkaz |
|---|---|---|---|---|---|
| C1.1 | Automatické napojení při dotyku (sdílený roh / konec na čáře líce) | hotovo | `topology.ts: splitWallsAtNode`, `actions/walls.ts: addWall, mergeNodeIfCoincident` | ano (`topology.test`) | Konec na jiné stěně ji rozdělí a napojí. |
| C1.2 | Jeden typ napojení (butt/miter později) | hotovo | `wallBody.ts: wallBodies` (průsečík odsazených hranic sousedních konců) | ano (`wallBody.test` L-roh) | Žádný přepínač typů, což katalog chce. |
| C1.3 | Bez priorit, těla sjednocená bez čar uvnitř | hotovo | `wallBody.ts` (konce se řadí podle úhlu, spoje bez hran) | částečně (L, T; ne 3+ stěn) | Hrany spojů se nekreslí. |
| C1.4 | T-napojení | hotovo | `wallBody.ts`, `topology.ts` | ano (`wallBody.test` „napojení T“) | Příčka končí na líci průchozí stěny, ta se nepřeruší. |
| C1.5 | Křížení „+“ a 3+ stěny: stěny samostatné, těla sloučená, průchozí se nepřerušují | **chybí** | – (`topology.ts` dělí jen tam, kde leží **roh**; křížení bez rohu se nenapojí) | ne | **Naměřeno:** dvě stěny 300 a 100 se křížící bez společného rohu mají každá 4 vlastní hrany (`[4,4]`), čáry se uvnitř křížení kreslí. |
| C1.6 | Zrušit napojení u konkrétního konce | **chybí** | – (v modelu není pole) | ne | `grep` na „nespojovat/noJoin“ nic nenašel. |
| C1.8 | Různé tloušťky v rohu → průsečík vnějších čar | hotovo | `wallBody.ts: intersectBoundaries` | ano (`wallBody.test` „roh L s různými tloušťkami“) | Vnější roh v průsečíku odsazených čar. |
| C1.9 | Úhel jiný než 90° | **částečně** | `wallBody.ts` (obecný průsečík, pojistka `limit = 4 × tloušťka`) | ne (jen 90° a oblouky) | Počítá se obecně, ale **není test na 60°** (C2/3); u velmi ostrých úhlů se při překročení limitu spadne na kolmý řez. |
| C1.10 | Volný konec rovný, kolmo | hotovo | `wallBody.ts` (`free`, čelo v `edges`) | ano (`wallBody.test` „samostatná stěna“) | Obě čela volných konců jsou v `edges`. |
| C1.11 | Různá tloušťka v jedné přímce = dvě samostatné stěny + odskok | **částečně / rozpor** | `topology.ts: mergeStraightAt` (slučuje jen stejnou tloušťku), `wallBody.ts` | ano pro nesloučení (`openingsInBody.test` „jiná tloušťka se neslučuje“); **hrana odskoku ne** | Stěny zůstanou dvě ✔. **Naměřeno:** 300 + 200 v přímce → hrany `[1000,300→0,300]` a `[2000,200→1000,200]`, **chybí úsek (1000,200)–(1000,300)** = odskok se nekreslí, těla na konci zůstanou „otevřená“. |

## D. Úpravy po nakreslení

| # | Co katalog chce | Stav | Kde v kódu | Test | Důkaz |
|---|---|---|---|---|---|
| D1 | Tažení koncového bodu | hotovo | `tools/selectTool.ts` (drag `node`), `actions/walls.ts: moveNode, mergeNodeIfCoincident` | částečně (`solver.test`) | Roh se táhne, sousední stěny se otáčejí (těla se přepočítají). „Směr, hystereze“ z katalogu **nejasné** – nenašel jsem žádné omezení na směr. |
| D2 | Posun celé stěny | **částečně** | `selectTool.ts: down` (drag jen `node`/`opening`/`room`/`text`/skupina) | ne | Jednu vybranou stěnu **nelze přímo odtáhnout**; jde výběrem obdélníkem (skupina) nebo posunem rohů. |
| D3 | Zkrátit/prodloužit do rohu (samostatný nástroj) | **chybí** | – | ne | Nástroj v `tools/registry.ts` není. |
| D4 | Rozdělit stěnu (i s mezerou, smazat vnitřní úsek) | **částečně** | `topology.ts: splitWallAt` (jen automaticky při napojení) | ano (`topology.test`) | Ručně „Rozdělit“ ani „s mezerou“ uživatel nemá. |
| D6 | Kopírovat / otočit (zrcadlení později) | hotovo | `actions/copy.ts: duplicateSelection, rotateSelection` | ne | Zrcadlení ↷ (odloženo). |
| D7 | Smazání stěny, sousedé se přepočítají, otvory se smažou | hotovo | `actions/delete.ts`, `actions/shared.ts: cleanup` | ne | Těla se neukládají, přepočítají se samy; `cleanup` smaže otvory bez stěny a osiřelé rohy. |
| D8 | Výběr: klik, okno, křížení, vícenásobný | hotovo | `selectTool.ts`, `core/rectSelect.ts` | ano (`rectSelect.test`) | – |
| D9 | Zpět/vpřed po každé akci | hotovo | `store/store.ts: edit` (immer, historie) | částečně | Všechny akce jdou přes `store.edit()`; výběr tloušťky je záměrně mimo historii. |
| D10 ✎ | Typ stěny jen ve vlastnostech, na výkrese ne | **rozpor** | `canvas/drawDims.ts: wallLabelText` (řádky 27–35, volá se v řádku ~200) | ne | Popisek na výkrese skládá `tl. N · typ · materiál · poznámka`, tedy **typ i materiál se kreslí**. |

## E. Vlastnosti stěny

| # | Co katalog chce | Stav | Kde v kódu | Test | Důkaz |
|---|---|---|---|---|---|
| E1 | Tloušťka (mm), bez příznaku odhad/změřeno | hotovo | `Wall.thickness`, `WallPanel.tsx` | ano | V modelu příznak není. |
| E2 | Strana těla | hotovo | `Wall.side`, `Wall.sideLocked` | ano | – |
| E3 ✎ | Typ a materiál jen ve vlastnostech | **rozpor** | `WallPanel.tsx` (panel ✔), `drawDims.ts: wallLabelText` (výkres ✘) | ne | Viz D10. |
| E4 | Styl čáry | hotovo | `Wall.style`, `actions/walls.ts: updateWall` | ne | – |
| E7 | Příznak „nespojovat konec“ | **chybí** | – | ne | Viz C1.6. |

## F. Otvory a niky

| # | Co katalog chce | Stav | Kde v kódu | Test | Důkaz |
|---|---|---|---|---|---|
| F1 | Otvory jen ve stěnách, jsou jejich součástí | hotovo | `Opening.wallId`, `actions/openings.ts` | ano | `cleanup` maže otvory bez stěny. |
| F2 | Otvor skrz celé tělo, ukládá se jednou | hotovo | `canvas/drawPlan.ts` (otvor přes tloušťku), `tools/pick.ts: pickOpening, wallForOpening` | ano (`openingsInBody.test`) | Tloušťka otvoru = tloušťka stěny, jde chytit kdekoli v těle. |
| F3 | Při přehození strany / změně tloušťky otvor zůstane | hotovo | otvor = `offset` od rohu čáry líce (`Opening.offset/ref`) | částečně (`openingsInBody.test`: ostění, strana) | Poloha se nemění ani při `setWallThickness`, ani `flipWallSide`. |
| F4 | Otvor zůstane na části stěny, která se nemaže; v mazané se smaže | **částečně** | `topology.ts: splitWallAt` (otvor jde na část podle středu), `delete.ts` + `cleanup` (smaže otvory mazané části) | ano (`topology.test` „otvor přejde na část“) | Dělení: otvor přejde na část, ve které leží **střed**; leží-li otvor přes hranici dělení, posune se dovnitř části (`startInPart` oříznuto na 0, může přesáhnout kratší část). Smazání dílu smaže jeho otvory ✔. **Nejasné:** otvor přes bod dělení (měl by se zachovat, nebo upozornit?). |
| F5 | Nika, strana přístupu | hotovo | `actions/openings.ts` (výchozí strana) | ano (`openingsInBody.test` „výchozí strany“) | Nika na vnitřním líci. |
| F7 | Otvor blízko rohu: upozornění, ne zákaz | **chybí** | `actions/openings.ts: setStartFromA` (jen ořez do `0…délka−šířka`) | ne | Žádné upozornění; u rohu se neřeší překryv s tělem sousední stěny. |

## Rozpory (katalog × kód × dokumenty)
1. **D10 / E3 – typ a materiál na výkrese.** Rozhodnutí: jen v panelu. Kód: `wallLabelText` (`canvas/drawDims.ts`) kreslí `tl. N · typ · materiál · poznámka`. `WallLabel.type` a `material` v modelu existují (správně), problém je jen kreslení. **Návrh:** na výkrese ponechat jen tloušťku (a poznámku, pokud ji chcete), typ a materiál vyřadit. Malá změna, bez modelu. Nechávám na vašem rozhodnutí, zda zmizí i „poznámka“ a „tl. N“.
2. **C1.11 – odskok.** Stěny se nesloučí ✔ (potvrzuje `openingsInBody.test`), ale **hrana odskoku se nekreslí** (naměřeno viz C1.11). Příklad C2/6 podle katalogu dnes neplatí.
3. **C1.5 – křížení** se nechová podle katalogu (viz C1.5), je to mezera, ne rozpor s rozhodnutím.
4. **`CLAUDE.md` × `ZADANI-OKNA-DVERE.md`:** `ZADANI-OKNA-DVERE.md` sekce 2 (spárovaná příčka, `Wall.part`) je zastaralá, příčka byla zrušena (migrace 6→7). `CLAUDE.md` i katalog jsou v souladu. Doporučuji do zadání doplnit poznámku „sekce 2 nahrazena stěnou s tloušťkou“ (zatím jsem nesahal).
5. **Katalog, sloupec Stav:** řádky A2, A8–A9, D1, F3 mají „audit“, ověřeno výše. Katalog beze změny.

## Naměřeno (jednorázový test, smazán)
- Odskok: stěna 300 (0→1000) a 200 (1000→2000) na ose x: hrany A `[0,0→1000,0] [1000,300→0,300] [0,300→0,0]`, hrany B `[1000,0→2000,0] [2000,200→1000,200] [2000,0→2000,200]`. Úsek odskoku x = 1000, y ∈ ⟨200, 300⟩ chybí.
- Křížení: A (0,0)→(1000,0) tloušťky 300 a B (500,−500)→(500,500) tloušťky 100 bez společného rohu: `wallBodies` vrací 4 + 4 hrany, tedy žádné sloučení těl.

## Navržené pořadí doplnění (od nejmenšího a nejdůležitějšího)
| Krok | Co | Velikost | Sahá na model? |
|---|---|---|---|
| 1 | **D10 / E3**: typ a materiál z výkresu pryč | malý | ne |
| 2 | **C1.6 + E7**: „nespojovat konec“ (přepínač u konce stěny, `wallBodies` pak nekreslí spoj a konec ukončí čelem) | střední | ano, nepovinné pole na stěně (např. `noJoinA/noJoinB`), bez zvýšení `SCHEMA_VERSION` |
| 3 | **F4**: ověřit/dotáhnout otvory při dělení (otvor přes bod dělení) + test | malý | ne |
| 4 | **C1.11**: hrana odskoku u stěn v přímce s různou tloušťkou | malý až střední | ne (jen `wallBody.ts`) |
| 5 | **F7**: upozornění u otvoru u rohu | malý | ne |
| 6 | **D2**: přetažení jedné vybrané stěny | malý až střední | ne |
| 7 | **C1.5**: křížení, sjednocení těl bez čar uvnitř | **velký** (kreslení sjednocení obrysů, nový výpočet překryvů) | ne |
| 8 | **D3**: nástroj zkrátit/prodloužit do rohu | střední | ne |
| 9 | **D4**: ruční „Rozdělit“ (i s mezerou) | střední | ne |
| 10 | **A2** režim „řetěz“, **A10/B6** číslo při tažení | střední | ne (nastavení v zařízení) |

Pozn. k vašemu návrhu začátku (C1.6+E7, F4, C1.11, C1.5, D3): doporučuji před něj dát jen **krok 1** (malý rozpor s rozhodnutím) a **C1.5 odsunout za D2–D3**, protože je největší a pro zaměřování stavu je křížení vzácné.

## Další doporučení
- Do testů z fáze 2 patří příklady C2/1–11 (příklady 7, 8, 9, 10, 11 dnes nemají test).
- `core/wallBody.ts` (386 řádků) je na hranici; než se přidá C1.5, rozdělit na výpočet napojení a kreslení hran.
