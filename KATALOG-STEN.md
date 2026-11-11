# Katalog chování stěn a napojení (pilot metody „katalog → rozhodnutí → audit“)

Aplikace: **Zaměřování stavby** (tablet + S-Pen, použitelné i na PC). Stav k 2026-11-11 večer, rozhodnutí doplněna.
Navazuje na `KRESLENI-STEN-NAVRH.md` (tam jsou dříve schválená rozhodnutí) a na `kresleni-editace-koncu-a-smeru` (viz projekt v Claude).

## Jak číst dokument
- Sloupec **Rozhodnutí**: ✔ ano, ✗ ne, ↷ později, ✎ jinak (je popsáno). **(vy)** = rozhodl uživatel 2026-11-11. **(já)** = rozhodnutí ponechal uživatel na asistentovi, kdykoli jde změnit. Ostatní řádky jsou vyplněny podle sloupce „Návrh“ a platí, dokud je někdo nepřepíše.
- Sloupec „Stav“ byl původně z dokumentů projektu a částečně ho opravil audit Claude Code (`AUDIT-STEN.md`, platí ten). Řádky „audit“ ověřil nebo ověří Claude Code.
- U chování Revitu a Archicadu vychází většina buněk z oficiální nápovědy (zdroje na konci). **Z paměti nebo jen z názvu funkce** jsou: A5 (Revit), A9 (Archicad „magic wand“), D4 a D6 (Archicad), D5, D13 (Revit „Perpendicular snap“). Berte je jako k ověření.

---

## A. Vytvoření stěny

| # | Chování | Revit | Archicad | Návrh | Stav v aplikaci | Rozhodnutí |
|---|---|---|---|---|---|---|
| A1 | Přímá stěna dvěma body | ano, Line | ano, Straight / Single | MVP | hotovo | ✔ |
| A2 | Řetěz navazujících stěn (konec = začátek další) | volba **Chain** | Straight / Chained | MVP, zapnutelné | audit | ✔ |
| A3 | Obdélník jedním tahem | ano (Rectangle) | ano (Rectangular, Rotated Rectangular) | MVP | hotovo | ✔ |
| A4 | Oblouk, kruh | ano (Arc) | ano (Curved) | MVP | hotovo | ✔ |
| A5 | Lichoběžníková stěna (proměnná tloušťka po délce) | ne přímo | **ano, Trapezoid**: pro staré budovy | původně ? | ne | ✗ (vy) |
| A6 | Mnohoúhelníková stěna | tvar profilu | Polygonal | NE | ne | ✗ |
| A7 | Šikmé stěny (ve svislém řezu) | slanted | Slanted | NE | ne | ✗ |
| A8 | Odsazení při kreslení (zadané číslo) | volba **Offset** | Offset | POZ | audit | ↷ |
| A9 | Označit celou řetězovou linii (Tab) a vytvořit stěny podél ní | ano | magic wand | POZ | ne | ↷ |
| A10 | Přesná délka číslem při kreslení | ano | ano (Tracker) | MVP | hotovo | ✔ |
| A11 | Náhled stěny při kreslení (tloušťka, líc, směr) | ano | ano | MVP | audit | ✔ |
| A12 | Zrušení rozkreslené stěny (Esc / klepnutí mimo) | ano | ano | MVP | audit | ✔ |
| A13 | Nová stěna přebírá naposled zvolenou tloušťku | typ se pamatuje | nastavení nástroje | rozhodnuto dříve | návrh schválen, audit | ✔ |
| A14 | Minimální délka stěny | – | – | 5 cm | hotovo | ✔ |

## B. Referenční čára, strana a tloušťka

| # | Chování | Revit | Archicad | Návrh | Stav | Rozhodnutí |
|---|---|---|---|---|---|---|
| B1 | Stěna se kreslí podél referenční čáry, tělo roste od ní | **Location Line** (6 poloh) | **Reference Line** (basic: venku/střed/uvnitř; složená 6 poloh) | ~~referenční čára = vnitřní líc místnosti~~ → **osa je volitelná: na líci (strana podle `side`) nebo uprostřed; výchozí vnitřní líc** | změněno 2026-11-11 (vy); v kódu zatím jen líc | ✎ (vy) |
| B2 | Přepnutí strany, kam stěna roste | flip (šipky) | Invert Wall Direction | dvojitá šipka, jedno klepnutí | rozhodnuto dříve | ✔ |
| B3 | Změna tloušťky po nakreslení | čára se drží, tělo se přizpůsobí | ref. čára zůstane, kontury se přesunou | líc zůstane, tělo se rozšíří/zúží | rozhodnuto dříve | ✔ |
| B4 | Změna osy nakreslené stěny (líc ↔ střed) | změna vlastnosti stěnu nepřesune | Modify Wall Reference Line | **osa (čára) zůstane na místě, tělo se posune** (uzly, rohy a napojení se nehýbou) | chybí | ✔ (vy) |
| B5 | Předvolby tloušťek + vlastní | typy stěn | typy / kompozity | 100/150/200/300 + vlastní | rozhodnuto dříve | ✔ |
| B6 | Zadání tloušťky číslem při kreslení | typ stěny | Info Box | MVP | audit | ✔ |
| B7 | Příznak „tloušťka odhadnutá / změřená“ | – | – | původně ? | audit | ✗ (vy) |
| B8 | Vícevrstvé stěny (skladba, jádro) | ano | kompozity | NE | – | ✗ |
| B9 | Tloušťka se přebírá z ostění | – | – | NE | rozhodnuto dříve | ✗ |
| B10 | Osa uprostřed: stěnu lze napojit **středem (osou)** na bod nebo střed jiné stěny; tělo roste na obě strany | Wall Centerline | Center | při kreslení volba osy líc / střed (menu Stěny), později jde změnit v panelu stěny | chybí | ✔ (vy) |

## C. Napojení stěn (hlavní téma)

### C1. Pravidla

| # | Chování | Revit | Archicad | Návrh | Stav | Rozhodnutí |
|---|---|---|---|---|---|---|
| C1.1 | Automatické napojení při dotyku | ano, výchozí | jen když se protínají referenční čáry; při kreslení se čára prodlouží/zkrátí | napojí se, když sdílejí koncový bod čáry líce, nebo konec dosedne na čáru líce jiné stěny | audit | ✔ |
| C1.2 | Typy napojení v rohu | **Butt** (výchozí), **Miter**, **Square off** | priorita materiálu skinů | jen jeden typ (viz příklady); Miter/Square off později | základ schválen | ✔ |
| C1.3 | Pořadí/priorita stěn v napojení | Previous / Next (do 4 stěn) | **Junction Order** pro 3+ stěny | bez priorit; těla se sjednotí bez čar uvnitř | – | ✔ |
| C1.4 | T-napojení | jen Butt | závisí na prioritách, častý problém | základní, ladit v praxi | rozhodnuto dříve | ✔ |
| C1.5 | Křížení „+“ a 3+ stěny v bodě | až 4 stěny přes Wall Joins | Junction Order | **každá stěna zůstane samostatná, těla se sloučí do jednoho obrysu bez čar uvnitř; průchozí stěny se nepřerušují** | ne | ✔ (já) |
| C1.6 | Zrušit napojení (mezi stěnami zůstane čára) | **Disallow Join** / Allow Join | Layer Intersection Number, vypínač čištění | přepínač „nespojovat“ u konkrétního konce; **od 2026-11-11 i fyzicky oddělený konec (viz C1.13)** | hotovo (`noJoinA/B` + vlastní uzel, viz C1.13) | ✔ (vy) |
| C1.7 | Zobrazení napojení podle pohledu | Wall Join Display | globální čištění | NE | – | ✗ |
| C1.8 | Různé tloušťky v rohu | průsečík vnějších líců | podle priorit | průsečík vnějších odsazených čar | rozhodnuto dříve | ✔ |
| C1.9 | Úhel jiný než 90° | Miter / Square off | ref. čáry se protnou | průsečík vnějších odsazených čar | rozhodnuto dříve | ✔ |
| C1.10 | Volný konec | rovný uzavřený | rovný | rovný uzavřený, kolmo | rozhodnuto dříve | ✔ |
| C1.11 | Stěny v jedné přímce s různou tloušťkou (odskok) | spojí se s přechodem | – | **dvě samostatné stěny; u spoje odskok na vnější straně; každá se dál upravuje zvlášť** | ne | ✔ (vy) |
| C1.12 | Sloučení souběžných stejných stěn v jednu | ne | – | POZ | ne | ↷ |
| C1.13 | Nespojený konec je i **fyzicky oddělený** | – | – | každá stěna má na nespojeném konci vlastní uzel (stejné souřadnice), táhnou se samostatně; přepnutí zpět na Spojený uzly sloučí; sloučení uzlů „při shodě souřadnic“ se u označeného konce nesmí provést samo | hotovo (2026-11-11, krok 1) | ✔ (vy) |

### C2. Příklady „vstup → očekávaný výsledek“ (podklad pro testy)

Souřadnice v mm. Vnitřní roh místnosti = (0, 0), místnost leží v kladném směru os x a y. Pokud není uvedeno jinak, osa (referenční čára) = vnitřní líc a tělo roste ven od místnosti. (Pozor: v aplikaci míří osa Y dolů, při psaní testů přepočítat.)

1. **L-roh, obě stěny 300, 90°.** Stěna A podél osy x (tělo y ∈ [−300, 0]), stěna B podél osy y (tělo x ∈ [−300, 0]). Vnější roh = (−300, −300). Výsledek: jeden plný čtverec v rohu, **žádná čára uvnitř**, vnitřní roh (0,0) přesný.
2. **L-roh, A = 300, B = 100.** Tělo A: y ∈ [−300, 0], tělo B: x ∈ [−100, 0]. Vnější roh = (−100, −300). A končí na x = −100, B končí na y = −300. Překryv [−100,0] × [−300,0] se vykreslí jako jeden celek bez čáry.
3. **L-roh, úhel 60°, obě 200.** Vnější líce = odsazené čáry o 200, vnější roh je jejich průsečík. Vnitřní roh je ve sdíleném bodě čar líců.
4. **Volný konec, tloušťka 200.** Konec = úsečka kolmá ke stěně délky 200, na straně těla, v bodě čáry líce.
5. **T-napojení, A = 300 průchozí, B = 100 dosedá z místnosti.** A se nepřerušuje. B končí na vnitřním líci A (y = 0). Mezi B a A žádná čára, obrys je jeden tvar.
6. **Odskok (rozhodnuto uživatelem).** Dvě stěny v jedné přímce, 300 a 200, sdílí bod čáry líce. Zůstávají **dvě samostatné stěny** (každá se vybírá a upravuje zvlášť, mají vlastní tloušťku). U spoje je na vnější straně odskok 100 mm (schod). Mezi stěnami se nekreslí dělicí čára přes tělo, jen hrana odskoku. (Rovné pokračování se **stejnou** tloušťkou se dál automaticky slučuje, viz `mergeStraightAt`; tento příklad se týká jen **různé** tloušťky.)
7. **Změna tloušťky A z 300 na 200** v příkladu 1. Líc zůstane, vnější roh se přesune na (−300, −200), napojení se přepočítá, kóty místností se nemění.
8. **Přehození strany B** v příkladu 1 (tělo B roste do místnosti). Napojení se přepočítá, jde vrátit zpět.
9. **Přesunutí konce stěny A tažením** po její přímce: B drží svůj druhý konec a otáčí se, roh zůstává čistý.
10. **Odpojení (C1.6):** v příkladu 1 se vypne spojení v rohu. Dvě samostatná těla s čárou mezi nimi, každé dojde ke své čáře líce. **Od 2026-11-11 platí i fyzicky (C1.13):** po odpojení jsou dva uzly se stejnými souřadnicemi a tažení za jeden roh nehýbe druhou stěnou.
11. **Křížení (C1.5, rozhodl asistent):** stěna A = 300 a stěna B = 100 se kříží. Obě zůstanou samostatné a nepřerušené, těla se sloučí do jednoho obrysu, uvnitř křížení žádné čáry. Ladit na reálné stavbě.
12. **Osa uprostřed, tloušťka 300.** Stěna A podél osy x, osa y = 0, tloušťka 300: tělo y ∈ [−150, 150]. Změna tloušťky na 200: osa zůstane, tělo y ∈ [−100, 100].
13. **Změna osy líc → střed (B4).** Stěna A 300 s osou na líci y = 0, tělo y ∈ [−300, 0]. Po přepnutí na střed zůstane osa y = 0 a tělo je y ∈ [−150, 150]. Uzly se nehýbou, sousední stěny se neprodlouží ani neotočí, jen se přepočítá jejich napojení.
14. **Napojení středem na střed jiné stěny.** A = 300 s osou uprostřed (y = 0), B = 100 s osou uprostřed začíná ve středu osy stěny A a jde kolmo. B se zastaví na líci A (T-napojení), osa B prochází osou A, mezi nimi žádná čára.
15. **L-roh, obě stěny s osou uprostřed (A = 300, B = 100).** A podél +x (osa y = 0, tělo y ∈ [−150, 150]), B podél +y (osa x = 0, tělo x ∈ [−50, 50]), sdílený uzel (0, 0). Vnitřní roh = (50, 150), vnější roh = (−50, −150). Jeden obrys bez čáry uvnitř.
16. **Kolmice.** Při tažení stěny (nebo jejího konce) k jiné stěně se v okamžiku pravého úhlu zobrazí ikona kolmice (⊥) a poloha se na pravý úhel přichytí. Mimo toleranci ikona zmizí.

## D. Úpravy po nakreslení

| # | Chování | Revit | Archicad | Návrh | Stav | Rozhodnutí |
|---|---|---|---|---|---|---|
| D1 | Tažení koncového bodu | ano | ano (stretch) | MVP | hotovo (bez držení směru, viz D11) | ✔ |
| D2 | Posun celé stěny | ano | ano | MVP | částečně (viz D12) | ✔ |
| D3 | Zkrátit/prodloužit do rohu: klepnete na část, kterou ponecháte | Trim/Extend: do rohu, jeden prvek, více prvků | – | původně ? | audit | ✔ jako **samostatný nástroj** (vy) |
| D4 | Rozdělit stěnu (případně s mezerou, smazat vnitřní úsek) | Split Element / Split with Gap | Split | MVP | audit | ✔ |
| D5 | Zámek zarovnání | Align + zámek | – | POZ | ne | ↷ |
| D6 | Kopírovat / otočit / zrcadlit | ano | ano | MVP kopie a otočení, zrcadlení později | kopie a otočení hotovo | ✔ (zrcadlení ↷) |
| D7 | Smazání stěny, sousedé se přepočítají | přepočítá | přepočítá | otvory se smažou se stěnou | audit | ✔ |
| D8 | Výběr: klik, okno, křížení, vícenásobný | ano | ano | MVP | hotovo | ✔ |
| D9 | Zpět/vpřed po každé z těchto akcí | ano | ano | MVP | audit | ✔ |
| D10 | Typ stěny (obvodová / nosná / příčka / SDK / neověřeno) | typ stěny | typ | původně popisek | audit | ✎ **jen ve vlastnostech (panel), na výkrese se nezobrazuje** (vy) |
| D11 | Tažení konce stěny drží původní směr (pomocná čára, zachycení, hystereze; u společného konce více stěn se směr volí tažením po pomocné čáře) | čáry přichycení | – | přesně podle `kresleni-editace-koncu-a-smeru.md` (projekt v Claude) | **chybí** (v kódu jen vodicí čáry zarovnání s rohy, ne držení směru) | ✔ (vy, rozhodnuto dříve) |
| D12 | **Posun celé stěny** tažením (včetně jedné samostatné stěny) s pomocnou čárou původního směru | ano | ano | volný posun, k původnímu směru se přichytí pomocnou čárou (jako u D11) | částečně (jen skupinou, jedna stěna nejde) | ✔ (vy) |
| D13 | Přichycení **kolmice** při tažení stěny nebo konce k jiné stěně, s ikonou ⊥ jako indikací pravého úhlu | ano (Perpendicular snap) | ano | v okamžiku přichycení se ukáže ikona kolmice | chybí | ✔ (vy) |
| D14 | **Výběr jednoho z překrývajících se koncových bodů** (např. oddělený roh, kde leží dva konce přes sebe): uživatel si vybere, kterým bude hýbat | Tab přepíná mezi prvky pod kurzorem | – | **dvě cesty**: (1) konec **vybrané stěny má při tažení přednost**, takže se stěna nejdřív vybere ťuknutím do těla a pak se táhne za její konec; (2) opakované ťuknutí na stejné místo přepíná mezi překrývajícími se konci | chybí (vybere se vždy jen jeden) | ✔ (vy, 2026-11-11 23:21) |

## E. Vlastnosti stěny

| # | Údaj | Návrh | Stav | Rozhodnutí |
|---|---|---|---|---|
| E1 | Tloušťka (mm) | MVP | schváleno | ✔ (bez příznaku odhad/změřeno, B7) |
| E2 | Strana těla (vlevo/vpravo od čáry) | MVP | schváleno | ✔ |
| E3 | Typ a materiál | původně popisek | – | ✎ jen ve vlastnostech, na výkrese nic (vy) |
| E4 | Styl čáry | hotovo | hotovo | ✔ |
| E5 | Výška stěny | POZ | ne | ↷ |
| E6 | Poznámka, fotky | POZ | ne | ↷ |
| E7 | Příznak „nespojovat konec“ (C1.6) | MVP | hotovo (spolu s C1.13, krok 1 z 2026-11-11) | ✔ |

## F. Otvory a niky ve stěně

| # | Chování | Revit | Archicad | Návrh | Stav | Rozhodnutí |
|---|---|---|---|---|---|---|
| F1 | Otvory se vkládají jen do stěn a jsou jejich součástí | ano | ano | MVP | hotovo | ✔ |
| F2 | Otvor se kreslí skrz celé tělo stěny a ukládá se jednou | ano | ano | rozhodnuto dříve | audit | ✔ |
| F3 | Při přehození strany nebo změně tloušťky otvor zůstane na místě | ano | ano | odstup se drží od rohu čáry líce | audit | ✔ |
| F4 | Co s otvory při dělení / smazání části stěny | zůstane na kusu, na kterém leží | – | původně ? | audit | ✔ **Otvor zůstane na části stěny, která se nemaže; pokud leží v mazané části, smaže se** (vy) |
| F5 | Nika, strana přístupu | – | – | rozhodnuto dříve | rozhodnuto | ✔ |
| F6 | Otvor na obloukové stěně | ano | ano | POZ | ne (známá mezera) | ↷ |
| F7 | Otvor blízko rohu | omezení | omezení | upozornění, ne zákaz | audit | ✔ |

## G. Obecný kontrolní seznam životního cyklu objektu (použít u každého nástroje)

- [ ] Vytvoření (jak se spouští, jak se ruší)
- [ ] Náhled během kreslení
- [ ] Přichytávání (body, čáry, směry) a jeho vypnutí
- [ ] Zadání číslem
- [ ] Výběr (jednotlivě, více, okno/křížení)
- [ ] Úprava konců a polohy
- [ ] Změna vlastností (tloušťka, strana, typ)
- [ ] Kopírování, otočení, zrcadlení
- [ ] Rozdělení a spojení
- [ ] Smazání a vliv na sousedy a otvory
- [ ] Zpět/vpřed po každé akci
- [ ] Uložení a načtení (migrace dat)
- [ ] Vzhled při různém přiblížení a při tisku/exportu
- [ ] Vliv na kóty a místnosti
- [ ] Chybové stavy (příliš krátká, nulová tloušťka, překryv stěn)
- [ ] Export (DXF hladiny, později strukturovaný JSON)

## H. Co z toho plyne pro datový model aplikace Zaměřování

- Stěna je **objekt s osou (referenční čárou) a tloušťkou**. Osa je buď líc (strana podle `side`), nebo střed. Osa je pravda, těla se odvozují a přepočítávají. Změna osy ani tloušťky nehýbe uzly.
- Napojení se **neukládá jako geometrie**, ale počítá se z čar líců a tlouštěk. Ukládá se jen výjimka („nespojovat“ u konce) a nespojený konec má vlastní uzel.
- Každá stěna zůstává samostatný objekt, i když se vizuálně slévá s jinými (odskok, křížení).
- Otvor patří stěně (`wallId`, odstup od začátku čáry líce, šířka, výška, parapet).
- Typ a materiál stěny jsou vlastnost (panel), na výkrese se nezobrazují.
- Všechno, co jde přepočítat (rohy, těla, překryvy), se neukládá, jen vstupy.

## Rozhodnutí z 2026-11-11 (shrnutí)
1. Lichoběžníková stěna: **ne**.
2. Příznak odhad/změřeno u tloušťky: **ne**.
3. Křížení: **sjednocení těl, každá stěna samostatná** (rozhodl asistent). Odskok: **dvě samostatné stěny s odskokem, dál samostatně upravitelné** (uživatel).
4. Zkrátit/prodloužit do rohu: **samostatný nástroj**.
5. Typ stěny: **jen ve vlastnostech, na výkrese ne**.
6. Otvory při dělení: **zůstávají na části, která se nemaže**.

## Rozhodnutí z 2026-11-11 (druhá část večera)
1. **Nespojený roh/T** je i fyzicky oddělený: každá stěna má vlastní uzel (C1.13).
2. **Osa stěny je volitelná:** líc (jedna nebo druhá strana) nebo střed (B1, B10). Při přepnutí osa (čára) zůstane a tělo se posune (B4).
3. **Posun celé stěny** (D12): volný posun, k původnímu směru se přichytí pomocnou čárou. Přibývá **přichycení kolmice s ikonou ⊥** (D13).
4. **Tažení konce s držením směru** (D11) je rozhodnuté dříve a zatím nenaprogramované.
5. **Výběr z překrývajících se koncových bodů** (D14): přednost má konec vybrané stěny, opakované ťuknutí přepíná.
6. **Automatické vytváření a počítání místností není potřeba** (rozhodnuto dříve, potvrzeno 2026-11-11). Detekce uzavřených smyček pro natočení těl ven se proto nesmí na oddělených rozích zlomit, ale plocha ani obvod místností se neřeší.

## Zdroje
- Revit, napojení stěn: [Change the Configuration of a Wall Join](https://help.autodesk.com/cloudhelp/2022/ENU/RevitLT-ArchDes/files/GUID-19EAF7A9-331F-4271-94CC-43B76B13011E.htm), [Modify Wall Joins](https://help.autodesk.com/cloudhelp/2023/ENU/Revit-ArchDesign/files/GUID-7AFCACAC-9ED2-44A4-A30E-7D7ED16E01E5.htm), [Revit Pure: wall joins tips](https://bimpure.com/blog/8-tips-to-understand-revit-wall-joins)
- Revit, Location Line a kreslení: [About the Wall Location Line](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-F26DB6DA-A0EC-424D-B656-3BDF47607F4F.htm), [Placing Walls](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-05BAFEAA-5186-484E-80F4-8D900C454748.htm)
- Revit, úpravy: [Trim and Extend Elements](https://help.autodesk.com/cloudhelp/2015/ENU/Revit-Model/files/GUID-D9AB5E1D-2D76-4D92-8000-24B78AAF09CC.htm), [Split walls tutorial](https://www.autodesk.com/learn/ondemand/tutorial/create-split-walls)
- Archicad, stěny: [How to Model Walls in Archicad](https://community.graphisoft.com/t5/Getting-started/How-to-Model-Walls-in-Archicad/ta-p/303968), [Wall Tool Settings](https://help.graphisoft.com/AC/24/INT/_AC24_Help/140_UserInterfaceToolSettings/140_UserInterfaceToolSettings-3.htm), [Basic wall reference line](https://helpcenter.graphisoft.com/user-guide/89510)
- Archicad, napojení: [How Walls are Connected in Archicad](https://helpcenter.graphisoft.com/knowledgebase/87136/), [Incorrect wall intersection](https://support.graphisoft.com/hc/en-us/articles/19243962225553-Incorrect-wall-intersection-showing-on-floor-plan)
