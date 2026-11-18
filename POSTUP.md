# Postup práce (předávací deník mezi počítači)

Projekt je na OneDrive a uživatel střídá dva počítače (nikdy ne současně).
**Na začátku sezení tento soubor přečti. Na konci práce (nebo po větším kroku) ho aktualizuj.**
Nejnovější záznam je nahoře v sekci „Poslední stav“, starší jdou do „Historie“.

## Deník změn
(Nejnovější nahoře, starší záznamy se nemažou. Formát: datum – co se změnilo · viditelně v aplikaci · rozhodnuto samostatně · otevřené · chyby od uživatele.)

### 2026-11-18 (14) – posun celé stěny kótou u otevřeného půdorysu (chyba od uživatele)
- **Chyba od uživatele:** výkres s horní, pravou a spodní stěnou (levá chybí); kóta od čelní hrany výstupku na horní stěně ke spodní stěně – zadání délky hlásilo „zamčené kóty by úpravu vrátily zpět“, i když zamčená kóta nebránila. Příčina (rozbor na záloze výkresu uživatele): posun celé stěny bral s sebou „volné větve“ – u tvaru U celou zbývající místnost i se spodní stěnou, kóta se nezměnila a dorovnání zamčené kóty 1340 vyvolalo hlášení.
- **Co se změnilo:** `moveWallStretch` v `core/solver.ts` – posun celé stěny kótou (konec kóty na líci stěny i čelní hrana výstupku) posune jen oba rohy stěny, sousední stěny se protáhnou. Jedno místo pro obě použití. Test s výkresem uživatele (`store/__fixtures__/protDimUser.json`) a tvar U s kótou mezi líci (`store/freeDimOpenPlan.test.ts`).
- **Viditelně v aplikaci:** kóta mezi výstupkem a protější stěnou (i mezi líci dvou stěn) posune jen tu jednu stěnu, i když půdorys není uzavřený.
- **Rozhodnuto samostatně:** volné větve (pahýly stěn) na posouvané stěně se při posunu kótou protáhnou, neposouvají se s ní (posun rohu tažením / délkou stěny se nemění).
- **Otevřené:** nic.

### 2026-11-18 (13) – volná kóta k hraně výstupku / vybrání (fronta bod 2, průřezové)
- **Co se změnilo:** nový konec kóty `{ prot, i, at }` = rovný úsek obrysu výstupku / vybrání na stěně, v rohu i na konci stěny (SCHEMA_VERSION 22 bez převodu). Geometrie a přichycení v `core/dimRefs.ts` (hrana má přednost před lícem, na kterém leží; těla stěn se pro rohové výstupky počítají jednou), posun v novém `core/protrusionDimMove.ts`, volá `freeDim.ts`; pevné spojení (`dimFollow`) funguje stejně. Koncové body posouvané hrany jedou po sousedních hranách (krajní po líci) – funguje i šikmá hrana a zkosení. Kontrola výsledku: obrys se nepřetočí, výstupek se vejde na stěnu a nepřekryje souseda, rozměry ≥ 10 mm; jinak se nic nezmění. Hrana výstupku, který se dočasně nekreslí (neplatný roh, nevolný konec), kótu nesmaže. Testy `store/freeDimProt.test.ts` (21). Po kontrole revieweru opraveno: chyběla kontrola výsledku (výstupek za koncem stěny, překřížení hran), šikmé hrany nešly nastavit, kóta zanikala s dočasně neplatným rohem, výkon, geometrie přesunuta do dimRefs.
- **Viditelně v aplikaci:** nástroj Kóta zvýrazní a přichytí hrany výstupků a vybrání (ověřeno v prohlížeči); zadání délky podle pravidel níže.
- **Rozhodnuto uživatelem:** výstupek se chová jako část stěny – boční hrana: posune se jen hrana, se zamčeným rozměrem celek; čelní hrana: posune se celá stěna; v rohu: jen hrana (zamčený rozměr → stěna rovnoběžná s hranou); na konci: hrana za čelem mění přesah (zamčený → stěna se prodlouží); platí pro všechny 4 druhy.
- **Rozhodnuto samostatně:** kóta mezi hranou a lícem / rohem vlastní stěny výstupku = jen rozměr (hloubka), jinak by se nic nezměnilo; vybrání: dno (čelní hrana) od jiného prvku posune stěnu jako u výstupku; kóta k hraně dočasně nekresleného výstupku zůstane (zanikne se smazáním výstupku).
- **Tabulka pravidlo × druh (✔ test):** přichycení – výstupek ✔, vybrání ✔ (kód), roh ✔, konec ✔ (kód); jen hrana – výstupek ✔, vybrání ✔, roh ✔, zkosení vybrání v rohu ✔, konec (za čelem ✔, na líci ✔); šikmá hrana ✔; zamčený rozměr → celek – výstupek (šířka) ✔, roh (a ✔, b ✔), konec (přesah) ✔; čelní hrana → stěna – výstupek ✔, vybrání ✔, konec ✔; vlastní líc → hloubka ✔; kontrola výsledku (za konec stěny, překřížení) ✔; pevné spojení – výstupek ✔; dočasně neplatný roh ✔; Zpět ✔.
- **Výjimky (zatím nejde):** výstupek na obloukové stěně a obloukové úseky obrysu (kóta se k nim nepřichytí).
- **Otevřené:** vyzkoušet; výchozí posouvaný bod (`defaultFreeDimMove`) nebere čelní hranu jako „hýbe stěnou“.

### 2026-11-18 (12) – volná kóta ke druhé čáře dvojité čáry (fronta bod 2)
- **Uživatel potvrdil:** pevné spojení zamčené kóty (11) funguje.
- **Co se změnilo:** úseky dvojité čáry mají pro kóty pevné číslování na jednom místě (`drawSeg` / `drawSegCount` v `core/dimRefs.ts`): 0 = první čára, 1 = druhá čára, 2 / 3 = uzavřené konce (jen s uzavřenými konci). Kóta se přichytí i ke druhé čáře a ke koncům. Zadání délky: k jinému prvku se posune celá dvojitá čára; mezi čarami téže dvojité čáry se mění šířka (posouvaná čára jede, druhá stojí; strana se může přehodit); mezi konci se posune bod konce (`moveDoubleSeg` v `core/freeDim.ts`). Znovunapojení kót (`rescueFreeDims`) používá stejné číslování – kóta na druhé čáře nepřeskočí na první. Vypnutí uzavřených konců smaže kóty ke koncům. Testy `store/freeDimDouble.test.ts` (10). Po kontrole revieweru: šířka po 0,1 mm, přesnější test, test vypnutí konců a posunu o šířku.
- **Viditelně v aplikaci:** nástroj Kóta zvýrazní a přichytí i druhou čáru dvojité čáry (ověřeno v prohlížeči) a její uzavřené konce.
- **Rozhodnuto samostatně:** kóta mezi čarami téže dvojité čáry mění šířku (obdoba obdélníku – mění se jen ten úsek); body druhé čáry zatím nejsou bodovým koncem kóty (stačí hrana).
- **Otevřené:** zbytek fronty bodu 2 (hrany výstupků, oblouky, kopie a výběr obdélníkem, odsazení ve Vybrat, úhlopříčka se zachováním délek stěn).

### 2026-11-18 (11) – zamčená volná kóta = pevné spojení (průřezové pravidlo, chyba od uživatele)
- **Chyba od uživatele:** změna celkové délky pravé stěny (5180) se zamčenou kótou nad oknem hlásila „brání zamčená kóta 1340“ (obdélník kresby – spodní stěna). Uživatel chce jedno pravidlo pro všechny prvky, ne opravy po jednom.
- **Co se změnilo:** `core/dimFollow.ts` (`followLockedDims`, volá `store.edit` po každé úpravě před kontrolou zámků): u zamčené volné kóty, kterou úprava změnila a pohnul se jen jeden konec, se druhý konec posune zpět na zamčenou délku (posun konce jako při zadání délky kóty), i řetězem kót. Po posunu stěn: napojené rohy (`syncHosted`) a prvky nesené stěnou na místě (`keepOpeningsOnResizedWalls`). `followDisturbsEdit`: když by dorovnání pohnulo tím, co úprava sama změnila (rohy, body kreseb, délky stěn, nezamčené volné kóty, poloha otvorů ve výkresu), úprava se zastaví s hlášením. Zapsáno v CLAUDE.md a KOTY-ZAMEK-EXPORT.md. Testy `store/dimFollow.test.ts` (15); test „zamčená kóta drží: posun rohu se neprovede“ ve `store/freeDim.test.ts` přepsán na kótu k pevnému bodu (změna zadání uživatelem).
- **Viditelně v aplikaci:** u tvého výkresu: změna délky pravé stěny posune spodní stěnu a obdélník sjede s ní (1340 zůstane). Ověřeno v prohlížeči (5000 → 5300, obdélník o 300 dolů, kóta 1500 drží).
- **Rozhodnuto uživatelem:** pravidlo „pevné spojení“; posouvá se kresba, okno / dveře po stěně, roh a líc stěny; pevný bod výkresu ne.
- **Rozhodnuto samostatně:** posouvá se jen konec, který se úpravou nepohnul; pohnuly-li se oba, nedorovnává se; každá kóta se v jedné úpravě dorovná nejvýš jednou (řetěz bez zacyklení).
- **Tabulka konec kóty × spouštěč (✔ test):** kresba – délka stěny ✔, řetěz otvorů ✔, posun kresby ✔; okraj otvoru – délka stěny ✔, volná kóta (zablokuje, vyjel by) ✔; líc stěny – volná kóta ✔ (i okna na protažené stěně na místě ✔); roh – tažení rohu (store.edit) ✔; pevný bod – zablokuje ✔ (délka stěny, posun rohu); obě strany zamčené (úprava by se vrátila) – zablokuje ✔; neúspěšné dorovnání → výkres beze změny ✔. Neověřeno testem: tažení nástrojem perem (jde přes store.edit, stejné místo).
- **Kde zámek dál platí zvlášť (jen blokuje):** zamčené kóty stěn (délka, tloušťka, vzepětí), kóty výstupků, polohy napojení; řetěz kót otvorů má vlastní „spojení“ zámky (`core/openingChain.ts`). Rozšířit pravidlo i na ně = otázka pro uživatele.
- **Otevřené:** vyzkoušet na PC / tabletu.

### 2026-11-18 (10) – poslední kóta řetězu okna posune okno (chyba od uživatele, mění (9))
- **Chyba od uživatele:** automatická kóta okna 1900 (poslední úsek k rohu B) hlásila „brání zamčená kóta 1340“ (obdélník kresby – spodní stěna), ruční kóta 2200 okno posunula. Příčina: poslední úsek řetězu prodlužoval stěnu → posunula se spodní stěna. V (9) jsem otázku položil nesrozumitelně; po upřesnění uživatel rozhodl: kóta 1900 posune okno.
- **Co se změnilo:** `pushChainLeftFromEnd` v `core/openingChain.ts` (zrcadlo `pushChainRight`): poslední otvor a otvory s ním spojené zamčenými meziostěními se posunou k rohu A, první nezamčený úsek vlevo změnu spolkne, stěna zůstane. Zapsáno v KOTY-ZAMEK-EXPORT.md. Testy v `store/openingChain.test.ts` upraveny podle nového rozhodnutí uživatele (poslední kóta, zamčená délka stěny, konec B v T) + nové; test podle obrázku v `store/freeDimMove.test.ts`.
- **Viditelně v aplikaci:** ťuknutí na poslední úsek kóty okna (k rohu B) a zadání hodnoty posune okno, stěna zůstane.
- **Rozhodnuto samostatně:** když jsou otvory zámky přivázané až k rohu A (nemohou se pohnout), poslední kóta prodlouží stěnu jako dřív.
- **Rozhodnuto uživatelem (zásada):** co se pohne, určují zámky – zamčená kóta drží, ostatní se hýbe od ní / k ní; nesouvisející zamčená kóta nesmí blokovat. Postupné zadávání „Další“ bez výjimky (hodnoty, které mají zůstat, se zamknou). Zapsáno v KOTY-ZAMEK-EXPORT.md. Doplněny testy (zmenšení, otvor od B, zamčená délka stěny, přesah souseda).
- **Otevřené:** posun otvorů řetězem nehlídá kolizi s výstupky a napojenými příčkami na stejné stěně (platí pro všechny úseky řetězu, ne nové).

### 2026-11-18 (9) – poslední úsek řetězové kóty otvorů (dotaz uživatele)
- **Hlášení uživatele:** změna automatické kóty okna (poslední úsek řetězu k rohu B) okno neposune, ruční volná kóta ano.
- **Co se změnilo:** nic v kódu – je to pravidlo z 2026-11-14 (11) (poslední kóta k rohu B prodlouží / zkrátí stěnu, otvory stojí; KOTY-ZAMEK-EXPORT.md).
- **Rozhodnuto uživatelem:** pravidlo zůstává beze změny (**zrušeno v (10)** – otázka byla nesrozumitelná). Okno se posouvá první kótou řetězu (od rohu A), meziostěním, „Odstup od B“ v panelu otvoru nebo volnou kótou.
- **Otevřené:** nic.

### 2026-11-18 (8) – kóta k oknu posune okno, ne stěnu (chyba od uživatele)
- **Chyba od uživatele:** okno s ostěním, volná kóta 2200 mezi okrajem okna a lícem spodní stěny; zadání délky hlásilo „brání zamčená kóta: kóta 1340“ (obdélník kresby – spodní stěna) a okno se neposunulo. Příčina: NumPad i panel kóty vždy předvybraly 2. bod – tady líc spodní stěny → posouvala se celá stěna. Se zapnutím ostění to nesouviselo (ve zkoušce se okno s ostěním posouvá správně).
- **Co se změnilo:** výchozí posouvaný bod volné kóty určuje `defaultFreeDimMove` (`core/freeDim.ts`): když 2. konec hýbe stěnami (roh, líc stěny) a 1. ne (okraj otvoru, kresba, pevný bod), předvybere se 1. Použito v NumPadu (`openTarget`) i panelu Kóta. Testy `store/freeDimMove.test.ts` (4).
- **Viditelně v aplikaci:** ťuknutí na číslo kóty mezi oknem a stěnou předvybere v NumPadu „okraj otvoru“ – zadáním se posune okno.
- **Rozhodnuto samostatně:** přednost má konec, který neposouvá stěny; když hýbou stěnami oba nebo žádný, dál 2. bod.
- **Otevřené:** nic.

### 2026-11-18 (konec sezení 2)
- **Co se změnilo:** Sezení ukončeno; za tuto část dne: vybrání v rohu (3), volná kóta / úhlopříčka (4), kóta přichycená k hranám – líce stěn, čáry, okraje otvorů, kolmá jako v CAD (5), šířka okna / ostění / zárubeň se zámkem na jedné straně rostou na volnou stranu (6, 7). Testy 618, typecheck a build OK.
- **Viditelně v aplikaci:** viz záznamy (3)–(7).
- **Rozhodnuto samostatně:** viz (3)–(5).
- **Otevřené:** uživatel bude hlásit další chyby kótování (nástroj Kóta); vyzkoušet vybrání v rohu a kóty výstupků v rohu / na konci; vše na tabletu.
- **Chyby od uživatele:** kóta se nepřichytávala k lícům, čarám a oknům a nebylo vidět přichycení – opraveno (5); změna šířky okna zablokovaná nesouvisející zamčenou kótou – opraveno (6, 7).
- **Soubory nad 500 řádků:** žádné (největší `canvas/drawDims.ts` 464, `tools/selectTool.ts` 454, `tools/wallTool.ts` 446).

### 2026-11-18 (7) – ostění a zárubeň se zámkem na jedné straně
- **Co se změnilo:** Pravidlo z (6) platí i pro ostění vlevo / vpravo a šířku zárubně (mění celkovou šířku otvoru): zamčený úsek na straně růstu a volný na druhé → otvor roste / se zužuje na volnou stranu; zamčené meziostění k dalšímu otvoru (řetěz nekončí u rohu) → spojené otvory se posunou jako u šířky (`pushChainRight`). Díly, které šířku nemění (hloubka, nahoře, hloubka / odsazení zárubně), beze změny. Větev `opening-reveal` v `store/actions/numpad.ts`. Testy v `store/openingWidthLocks.test.ts` (14). Po kontrole revieweru sjednoceno chování s šířkou otvoru (řetěz zámků).
- **Viditelně v aplikaci:** ostění / zárubeň u okna se zamčeným úsekem k rohu rostou na volnou stranu.
- **Rozhodnuto uživatelem:** „ano, i tam“.
- **Otevřené:** nic.

### 2026-11-18 (6) – šířka okna se zámkem na jedné straně (chyba od uživatele)
- **Chyba od uživatele:** změna šířky okna (úseky 1100 | okno 1200 | 700, úsek 700 k rohu zamčený) nešla – hlášení „brání zamčená kóta: kóta 800“, která s oknem nesouvisí (kóta mezi čtvercem kresby a spodní stěnou). Příčina: podle pravidla řetězu zámků se okno rozšiřovalo k zamčenému úseku → prodloužila se stěna → posunula se spodní stěna → změnila by se zamčená kóta 800.
- **Co se změnilo:** Když je úsek na straně, kam otvor roste, zamčený (u otvoru měřeného od A celý řetěz až k rohu B, u otvoru od B úsek vlevo) a úsek na druhé straně volný, otvor se rozšíří / zúží na volnou stranu a stěna se neprodlužuje (`openingSideLocks` v `core/openingChain.ts`, větev v `store/actions/numpad.ts`; platí pro NumPad i panel). Zapsáno v `KOTY-ZAMEK-EXPORT.md`. Testy `store/openingWidthLocks.test.ts` (8).
- **Viditelně v aplikaci:** u tvého okna: šířka 1300 → horní úsek 1000, zamčených 700 zůstane.
- **Rozhodnuto uživatelem:** rozšířit na volnou stranu.
- **Otevřené:** ostění a zárubeň – hotovo v (7).

### 2026-11-18 (5) – kóta se přichytí k hranám (líce stěn, čáry, okraje otvorů), kolmá jako v CAD
- **Chyby / požadavek od uživatele:** kóta se nepřichytávala ke všem prvkům (obě strany stěny, čáry, okna, dveře); při najetí myší nebylo vidět, k čemu se přichytí; kóta má být „rovnoběžná jako v CAD“ (první ťuknutí třeba na stěnu, druhé na čáru).
- **Co se změnilo:** Podle zarovnané kóty v Revitu (Aligned Dimension: kóta mezi rovnoběžnými hranami nebo body, měří kolmo) může být konec kóty i **hrana**: líc rovné stěny (oba líce; u stěny bez tloušťky čára), rovný úsek čáry kresby (i obdélník, první čára dvojité), okraj otvoru napříč stěnou (dveře, okno, průchod, nika). Hledání a geometrie konců jen v `core/dimRefs.ts`. Hrana – rovnoběžná hrana a hrana – bod: kolmá vzdálenost; bod – bod: přímo; nerovnoběžné hrany: kóta nevznikne (hlášení). Zadaná délka: líc = posune se celá stěna (sousední se protáhnou), čára kresby = celá kresba (na téže kresbě jen úsek – obdélník zůstane obdélníkem), okraj otvoru = otvor po stěně (nesmí najet na jiný otvor ani vyjet ze stěny), oba okraje téhož otvoru = šířka otvoru (levý okraj stojí). Délka se ověřuje až po vrácení otvorů na místo. Po dělení / sloučení stěny kóta přejde na líc na stejné přímce. SCHEMA_VERSION 21. Testy v `store/freeDim.test.ts` (40). Po kontrole revieweru opraveno: posun okraje otvoru na sousední otvor, pořadí kontroly délky, dělení stěny mazalo kótu, akce přijala nerovnoběžné hrany, úseky otevřené čáry.
- **Viditelně v aplikaci:** nástroj Kóta při najetí myší / perem zvýrazní modře hranu nebo bod, ke kterému se přichytí; 1. konec zůstane zeleně; nerovnoběžná hrana červeně; mezi nimi náhled kolmé kóty s délkou. Ověřeno v prohlížeči (líc – čára 1000, líc – okraj okna 2600).
- **Rozhodnuto samostatně:** bod (roh, bod kresby) má při přichycení přednost před hranou, mezi hranami nejbližší; nerovnoběžné hrany odmítnout (jako Revit); kóta mezi okraji téhož otvoru mění šířku; přehození strany stěny – kóta zůstane na geometricky stejné straně (na líci, který je teď na té straně).
- **Otevřené:** druhá čára dvojité čáry, líc obloukové stěny a oblouk kresby se nepřichytí; hrany výstupků a místnosti zatím ne; kopie kót; ťuknutí podruhé na tentýž líc jinde nic nehlásí.

### 2026-11-18 (4) – volná kóta mezi dvěma body, úhlopříčka (fronta bod 1)
- **Co se změnilo:** Nový prvek **volná kóta** (`Floor.dims`, SCHEMA_VERSION 20 bez převodu). Pravidla na jednom místě `core/freeDim.ts`. Konec kóty je roh stěny (jede s ním), bod kresby (vrchol, střed kruhu) nebo pevný bod výkresu. Kóta je řídicí: zadaná délka (NumPad, panel) posune zvolený bod ve směru kóty – roh jako při změně délky stěny (řešič „gumička“; když druhý konec není roh, posune se celá skupina stěn), kresbu celou, oba body na jedné kresbě jen ten bod (obdélník zůstane obdélníkem), pevný bod jen sám. Prvky nesené stěnou zůstanou na místě (`keepOpeningsOnResizedWalls`), zámky se dodržují, výsledek se ověří po dorovnání napojených rohů. Kóta jde zamknout (`free-dim` v `core/dimLock.ts`). Po každé úpravě (`store.edit`) se konce kót znovu napojí: zaniklý roh → roh na stejném místě / pevný bod, když tam dál vede stěna (sloučení stěn); přečíslovaný bod kresby (prodloužení čáry od začátku, spojení čar) → vrchol na stejném místě; jinak kóta zanikne se svým prvkem. Do rohu / K hraně přepojí kótu s koncem stěny (`remapDimNode`), stejně přetažení rohu na roh. Nástroj 📏 **Kóta** (`tools/dimTool.ts`), kreslení `canvas/drawFreeDims.ts`, panel `ui/panels/DimPanel.tsx`, akce `store/actions/dims.ts`. Testy `store/freeDim.test.ts` (25). Po kontrole revieweru opraveno: okna při změně délky stěny přes kótu ujížděla; kóta ke kresbě po prodloužení čáry od začátku skočila na jiný bod; spojení čar a Do rohu kótu smazaly; ťuknutí na roh, kde končí jiná kóta, místo nové kóty chytlo tu starou; kóta ležící na stěně zakrývala stěnu při výběru (kóta je teď ve výběru až za stěnou).
- **Viditelně v aplikaci:** v liště 📏 Kóta – ťuknout na dva body (roh, bod kresby, místo ve výkresu), kóta se nakreslí a vybere; ťuknutím na číslo NumPad s volbou „Posunout bod: 1. / 2.“; tažením za čáru kóty (nástrojem Kóta) se mění odsazení; panel Kóta (délka, odsazení, zámek, smazat). Ověřeno v prohlížeči (úhlopříčka místnosti 5000 → posun rohu po úhlopříčce).
- **Rozhodnuto uživatelem:** kóta řídicí; nástroj Kóta, odsazení tažením; kóta kresby jen dvěma body; výběr posouvaného prvku „nejjednodušší řešení“.
- **Rozhodnuto samostatně:** výchozí posouvaný bod = 2. (na který se ťuklo jako druhý), přepínač v NumPadu i panelu; posun rohu řešičem délek (u úhlopříčky v místnosti se posune jen roh – zamčené délky stěn úpravu zastaví; dopočet úhlopříčky se zachováním délek stěn = budoucí „chytrý řešič“); nová kóta má odsazení 0 (leží přímo mezi body); kóta zaniká se svým prvkem; odsazení se zadává v panelu bez znaménka.
- **Tabulka konec kóty × operace:** vznik / hodnota / kreslení ✔✔✔ (roh / bod kresby / pevný bod); zadání délky ✔✔✔; zámky ✔✔✔; Zpět ✔✔✔; smazání prvku → kóta zanikne ✔✔ –; přetažení rohu na roh ✔; Do rohu / K hraně ✔; sloučení rovných stěn ✔ (pevný bod); dělení stěny ✔; prodloužení / spojení čáry kresby ✔; posun a otočení skupiny ✔✔, pevný bod ✗ (zůstane na místě); kopie ✗ (kóty se nekopírují); výběr obdélníkem ✗ (kóty nezahrne). Jako konec kóty zatím **nejde**: okraj otvoru, roh výstupku, roh líce (mimo roh stěny), text.
- **Otevřené:** vyzkoušet na PC a tabletu; konce na otvorech / výstupcích / lících; kopie a výběr obdélníkem; odsazení tažením i nástrojem Vybrat; úhlopříčka se zachováním délek stěn (řešič).

### 2026-11-18 (3) – vybrání v rohu (fronta bod 1)
- **Co se změnilo:** Výstupek v rohu umí i vybrání (`CornerProtrusion.mode = 'subtract'`, SCHEMA_VERSION 19 bez převodu). Lomená čára nástrojem Čára ve stěnách z líce jedné stěny na líc druhé stěny téhož rohu vedená celá tělem stěn = vybrání; plocha se vyřízne z těl obou stěn (`core/wallBodyEdges.ts`), líce se pod ním nekreslí. Vnitřní roh = zářez do obou stěn, vnější roh = ukousnutý roh, zkosení vnějšího rohu stačí jednou čárou. Jinak platí vše jako u výstupku v rohu (drží se rohu, F4, změna délky kótou, kopie, sloučení, kóty a NumPad, zámky, smazání). Kreslení těl s výřezy (`canvas/drawPlan.ts`): výřez smí přesahovat tělo, každý výřez se ořízne zvlášť, bez švu ve spoji. Testy `store/cornerRecess.test.ts` (18). Po kontrole revieweru opraveno: vnější zářez jde kótou zmenšit i pod tloušťku stěny (`cornerOverhang` měří přečnívání jen směrem od rohu); po zúžení stěny pod hloubku vybrání se vybrání nekreslí (dřív by stěnu prořízlo) a vrátí se po rozšíření; třetí stěna v rohu vybrání skryje; překrývající se výřezy se při kreslení sečtou.
- **Viditelně v aplikaci:** Čárou ve stěnách nakreslený zářez v rohu (dovnitř stěn) = bílé vybrání bez čar líců, ťuknutím se vybere, panel „Vybrání v rohu“, kóty podél obou stěn leží na straně líce mimo tělo. Ověřeno v prohlížeči.
- **Rozhodnuto uživatelem:** vnější i vnitřní roh; kreslí se čárou jako výstupek v rohu.
- **Rozhodnuto samostatně:** zkosení jednou čárou jen u vybrání (výstupek v rohu dál aspoň dvěma čarami – nemění se dosavadní chování); čára zčásti v těle a zčásti mimo zůstane čarami; vybrání přes celou tloušťku stěny v rohu nevznikne (zůstanou čáry); hloubka vybrání v rohu se kótou nemění (jen rozměry podél stěn, jako u výstupku v rohu); obrys a plocha patří první stěně (výběr), výřez oběma.
- **Otevřené:** vyzkoušet na PC a tabletu.

### 2026-11-18 (konec sezení)
- **Co se změnilo:** Sezení ukončeno; za 2026-11-17/18: D3 K hraně (17 (7)), napojení na líc oblouku (18 (1)), kóty výstupku v rohu a na konci stěny + sjednocený překryv výstupků `core/wallSpans.ts` (18 (2)). Testy 546, typecheck a build OK.
- **Viditelně v aplikaci:** viz záznamy níže.
- **Rozhodnuto samostatně:** viz (2).
- **Otevřené:** vyzkoušet kóty výstupku v rohu / na konci (uživatel zatím nezkoušel); vše na tabletu.
- **Chyby od uživatele:** žádné nové.
- **Soubory nad 500 řádků:** žádné (největší `canvas/drawDims.ts` 464, `tools/selectTool.ts` 454, `tools/wallTool.ts` 446).

### 2026-11-18 (2) – kóty výstupku v rohu a na konci stěny (fronta bod 1)
- **Co se změnilo:** Vybraný výstupek v rohu a výstupek na konci stěny mají klikací kóty na výkrese jako obyčejný výstupek (`canvas/drawCornerEndDims.ts`): v rohu rozměr podél 1. a 2. stěny od rohu; na konci stěny podél každého líce od čela, přesah za čelo a hloubka od každého líce. Ťuknutím NumPad (Další projde kóty v řadě), mění se jen výstupek, kóty jdou zamknout (`corner-dim`, `end-dim` v `core/dimLock.ts`). Změna, po které by výstupek vyjel za konec stěny nebo najel na jiný výstupek, se neprovede (`applyCornerDim` / `applyEndDim` v `store/actions/protrusions.ts`). Rozměry i v panelech (u výstupku na konci nově). Testy `store/cornerEndDims.test.ts` (10). Po kontrole revieweru: pravidlo „výstupky na stěně se nepřekrývají“ sjednoceno na jedno místo `core/wallSpans.ts` (dřív na třech místech a bez dvojic roh × konec a roh × roh) – používá ho vkládání výstupku, kóty i změna délky stěny; kóty u vnějšího rohu leží vně výstupku (dřív uvnitř); minimum polí v panelu podle kóty.
- **Viditelně v aplikaci:** po ťuknutí na výstupek v rohu / na konci stěny kóty kolem něj; panel výstupku na konci má pole rozměrů.
- **Rozhodnuto uživatelem:** „jako u výstupku“.
- **Rozhodnuto samostatně:** změna rozměru zvětší / zmenší v poměru jen tu část obrysu, které se týká (podél líce = body toho líce před čelem, přesah = body za čelem, hloubka = body toho líce); přesah se kótuje u prvního líce (řetěz s „podél líce“); odstupy od sousedních prvků se u těchto výstupků nekótují.
- **Otevřené:** vybrání v rohu (zbytek bodu 1 fronty).

### 2026-11-18 (1) – napojení stěny na líc obloukové stěny (fronta bod 2)
- **Co se změnilo:** Stěna se dá napojit i na líc obloukové stěny (dřív jen na čáru oblouku). Líc oblouku je soustředný oblouk (`offsetAxis` v `core/floorQueries.ts`), roh na něm má `Node.hostFace` jako u rovné stěny a drží se ho při změně vzepětí, tloušťky, strany i osy (`core/hosting.ts`). Platí pro oba líce i osu uprostřed; stěna vedoucí z líce přes tělo se nenapojí (křížení). Sloučení oblouku (migrace) roh na líci zachová. Opravena chyba v tělech stěn (`core/wallBody.ts`): konce ve spoji se počítají každý od svého bodu – u rovné stěny se to neprojevilo, u oblouku by se líc na ose v místě napojení přerušil. Testy `store/hostArcFace.test.ts` (11, na starém kódu selhávají). Po kontrole revieweru: nástroj Rozdělit v místě stěny napojené na líc oblouku posune dělicí bod na okraj jejího těla a stěna zůstane napojená (jako u rovné stěny, `avoidFaceTees` teď v souřadnicích stěny); vnitřní líc velmi malého oblouku (tloušťka ≥ poloměr) se k napojení nenabízí; F7 (`core/cornerOverlap.ts`) a F4 počítají v souřadnicích stěny, platí i pro oblouk.
- **Viditelně v aplikaci:** stěna kreslená k vnějšímu (i vnitřnímu) líci obloukové stěny se přichytí na líc a začne na něm; líc oblouku je pod ní přerušený. Ověřeno v prohlížeči.
- **Rozhodnuto samostatně:** nic nového – pravidlo je stejné jako u rovné stěny.
- **Uživatel vyzkoušel na PC (2026-11-18):** „funguje“.
- **Otevřené:** vyzkoušet na tabletu; kóta polohy napojení (řetězová) zatím jen u rovné stěny; nástroj Do rohu / K hraně oblouky odmítá.

### 2026-11-17 (7) – D3 doplněno: zkrátit / prodloužit jednu stěnu k hraně druhé (T)
- **Co se změnilo:** Nástroj ⌐ Do rohu má přepínač **Do rohu | K hraně** (`Settings.trimEdge`). V režimu K hraně se upraví jen první stěna: její konec dosedne na líc druhé stěny (ten, na jehož straně zůstává ponechaná část; u stěny bez tloušťky na čáru) a napojí se na ni jako T (`Node.host` / `hostFace`); druhá stěna se nemění. Funguje pro zkrácení přečnívající příčky i prodloužení krátké stěny. Prvky nesené stěnou podle F4 (`core/carried.ts`). Kód `trimExtendToEdge` v `core/trimExtend.ts`, akce `trimToEdge`. Testy `store/trimEdge.test.ts` (13). Po kontrole revieweru opraveno: stěna, jejíž ponechaný konec leží v těle druhé stěny (líc na čáře stěny), se už nezkrátí celá dovnitř těla („příliš krátká“); bod napojení se nezaokrouhluje (leží přesně na líci); doplněny testy výstupku a napojené příčky (F4).
- **Viditelně v aplikaci:** po volbě Do rohu nahoře přepínač; v režimu K hraně návod „Ťukni na stěnu, kterou zkrátit / prodloužit…“, pak „…ke které ji zkrátit / prodloužit (ta se nezmění)“; kroužek ukáže místo napojení. Ověřeno v prohlížeči (ťuknutím).
- **Rozhodnuto samostatně:** pořadí ťuknutí jako u Do rohu (nejdřív upravovaná stěna, pak hrana – Revit to má obráceně); konec mimo délku druhé stěny se neprovede („nedosedla by“); jen rovné stěny; ponechaný konec uvnitř těla druhé stěny = příliš krátká. Výstupek na konci stěny se při prodloužení K hraně nemaže – konec přestane být volný, takže se jen nekreslí (stejně jako u Do rohu a pravidla výstupku na konci).
- **Uživatel vyzkoušel na PC (2026-11-17):** „vše funguje“.
- **Otevřené:** vyzkoušet na tabletu; řetězová kóta užšího otvoru při vypnutém vnitřním ostění (zbytek bodu 1 fronty).

### 2026-11-17 (6) – připomínky uživatele po zkoušce: dvojitá čára, kolmo k protější stěně
- **Chyby od uživatele:** (1) dvojitá čára se kreslila jako obdélník – má být jen dvě čáry vedle sebe, bez výplně (ta jen u uzavřených prvků); (2) čára od jedné stěny ke druhé: pomocná kolmice zmizela, jakmile pero dojelo k protější stěně, a čára nešla napojit kolmo – u všech čar kresby.
- **Co se změnilo:** nová dvojitá čára má výchozí **otevřené konce** (nastavení `doubleEnds`, dřívější volba „uzavřené“ se nepřenáší); uzavřít jde dál v panelu. Přichytávání kresby (`tools/drawSnap.ts`): zachycená pomocná čára platí až ke stěně – u líce i u čáry stěny se konec dá na jejich průsečík s pomocnou čárou (ne na nejbližší bod líce); pomocná čára má držení (hystereze). Platí pro Čáru, Dvojitou i Obdélník/Kruh/Oblouk (společné místo). Stěna a Čára ve stěnách to uměly už dřív (ověřeno). Testy v `store/drawings.test.ts` (na starém kódu selhávají).
- **Viditelně v aplikaci:** dvojitá čára = dvě čáry; tah kolmo přes místnost dosedne přesně kolmo na protější líc.
- **Rozhodnuto uživatelem:** kóty kresby vyřeší budoucí prvek Kóta s přiřazením k jednotlivým čarám (zapsáno v POZADAVKY.md); do té doby rozměry v panelu.
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-17 (5) – opravy po kontrole revieweru, tabulka „pravidlo × prvek“
- **Co se změnilo:** Migrace 17→18 nechá stěnou i tvar se zamčenou kótou (zámek by zmizel). Otevření uzavřené čáry smaže vzepětí zrušeného uzavíracího úseku (další navázaný úsek je rovný). Úsek z konce jedné čáry na konec druhé obě spojí do jedné (pak jde uzavřít a šrafovat). Úchyty vybrané kresby bere jen nástroj Vybrat – v nástrojích kreslení tah z konce vybrané čáry kreslí dál. Tabulka „pravidlo × typ prvku“ vyplněna v `KRESLENI-SAMOSTATNE-CARY-A-SRAFY.md`. Testy 508.
- **Viditelně v aplikaci:** čáry se spojují; vrcholy kresby se tahají jen nástrojem Vybrat.
- **Rozhodnuto samostatně:** pořadí výběru ťuknutím: roh → čára kresby → otvor, text, místnost, výstupek, stěna → vnitřek šrafovaného tvaru → tělo stěny (překlad nad otvorem jde vybrat; text pod čárou kresby se vybere ťuknutím mimo čáru). Migrace nepozná, čím tvar vznikl – volný pravoúhlý čtyřúhelník nebo volný oblouk nakreslený starou Čárou se převede také.
- **Otevřené:** klikací kóty kresby na plátně (vzdálenost čar, délky úseků); tloušťka čáry kresby je pevná (2 px), „tlustá čerchovaná“ z KRESLENI-PREKLADU.md zatím ne; konečné názvy dvou „Čár“; testy př. 12/14 katalogu kreslené nástrojem Čára ve stěnách (dnes přes `addRectWalls`).

### 2026-11-17 (4) – krok 3: šrafy uzavřených tvarů a barvy kresby
- **Co se změnilo:** V panelu kresby **Šrafa**: Žádná (výchozí) / Šikmá / Křížová / Tečky / Plná a **Barva šrafy**; **Barva čáry** u každé kresby a v liště nástrojů kresby (černá, šedá, červená, modrá, zelená). Šrafa jde zapnout jen u uzavřeného tvaru (obdélník, kruh, uzavřená čára, dvojitá čára s uzavřenými konci – pravidlo `canHatch` v `core/drawing.ts`); otevřením tvaru šrafa zmizí. Šrafa se kreslí po stěnách a otvorech, tedy **nad šedou výplní** (`canvas/drawDrawings.ts`). Export zatím není – šrafa je uložená jako údaj tvaru (`hatch`, `hatchColor`), názvy hladin pro budoucí DXF/PDF `DRAWING_LAYER` / `HATCH_LAYER`. Testy `store/drawings.test.ts`.
- **Viditelně v aplikaci:** vybraný obdélník / kruh / uzavřená čára / dvojitá čára s uzavřenými konci má v panelu Šrafu a barvy; u otevřené čáry a oblouku věta „Šrafu jde zapnout jen u uzavřeného tvaru“.
- **Rozhodnuto uživatelem:** šrafy šikmá, křížová, tečky + plná výplň (bez vlnovky), bez úhlu a rozteče, výběr základních barev u šraf i tvarů.
- **Rozhodnuto samostatně:** sada 5 barev (černá, šedá, červená, modrá, zelená); šrafa má stejnou hustotu na obrazovce při každém přiblížení (rozteč 10 px) – v exportu se rozteč určí až s exportem; barva šrafy výchozí = barva čáry.
- **Otevřené:** export DXF/PDF (až vznikne export).

### 2026-11-17 (3) – krok 2: samostatná Čára; Obdélník, Kruh, Oblouk jsou kresba
- **Co se změnilo:** Nový nástroj ╱ **Čára** v liště (vedle Dvojité, Obdélníku…) – lomená čára jako kresba (`Drawing.shape = 'line'`): další úsek navazuje na volný konec, úsek zpět do počátku čáru uzavře; oblouky úchytem uprostřed úseku. Obdélník, Kruh a Oblouk kreslí kresbu místo stěn (rozhodnutí uživatele) – nikdy stěna ani výstupek, stěnu nedělí, nenapojují se. Migrace 17 → 18 (`persistence/migrateDrawings.ts`) převede staré obdélníky, kruhy a volné oblouky tloušťky 0 na kresbu. Katalog I1.2, I1.10, př. 12 a 14 a `CLAUDE.md` upraveny podle rozhodnutí uživatele. Dva testy migrace přepsané na nové zadání (tvary → kresba). Testy `store/drawings.test.ts`.
- **Viditelně v aplikaci:** samostatná Čára a tvary se přichytí ke stěnám a bodům, ale zůstanou čárami (ani na líci stěny nevznikne výstupek, nic se nevyplní šedou). Vybraná kresba má úchyty: vrcholy (u obdélníku zůstane obdélníkem), oblouky, poloměr kruhu. Panel kresby: rozměry (obdélník šířka × výška, průměr, vzepětí), styl čáry, uzavřít / otevřít lomenou čáru.
- **Rozhodnuto uživatelem:** tvary jsou grafické prvky; staré tvary převést na kresbu.
- **Rozhodnuto samostatně:** migrace převádí jen jednoznačné tvary – zůstane stěnou: tvar s otvorem / výstupkem / napojenou stěnou, se štítkem místnosti uvnitř, s vyplněným popiskem (typ, materiál, poznámka – kresba popisek nemá), obdélník se stranami různého stylu, rovné čáry vždy; dlouhá kliknutelná kóta stěn na kresbě není (rozměry v panelu).
- **Otevřené:** kóty kresby na plátně (klikací) – zatím jen v panelu; kopírování v řadě pro kresbu.

### 2026-11-17 (2) – krok 1: Čára ve stěnách přesunuta do menu Stěny
- **Co se změnilo:** Dnešní nástroj Čára (stěnový: výstupky, vybrání, napojení na stěnu, šedá výplň) zmizel z lišty a je v menu Stěny jako přepínač **Stěna | Čára** (ToolId `line` beze změny, chování beze změny).
- **Viditelně v aplikaci:** v liště už není ╱ Čára; po ťuknutí na ✏️ Stěna je nahoře přepínač Stěna | Čára. U Čáry krátká nápověda (výstupek / vybrání).
- **Rozhodnuto samostatně:** název zatím „Čára“ (doladí se, dle zadání); přepnutím se ukončí řetěz stěn.
- **Otevřené:** konečný název.

### 2026-11-17 (1) – krok 0: dvojitá čára zpět jako kresba
- **Co se změnilo:** Nový druh prvku **kresba** (`Floor.drawings`, `SCHEMA_VERSION` 17 bez převodu dat) – čistě grafické prvky, jejichž pravidla jsou na jednom místě v `core/drawing.ts` (uzavřený tvar, šrafa, obrys, zásah, úchyty, obdélník). Kresba nikdy není stěnou ani výstupkem (kód stěn ji nevidí). Přichytávání kresby na jednom místě `tools/drawSnap.ts` (body kresby, rohy, líce, čáry stěn, pomocné čáry – jen pomůcka, nic se nepamatuje). Vrácena **dvojitá čára** (`KRESLENI-PREKLADU.md`) jako samostatný nástroj ═ Dvojitá: dvě rovnoběžné čáry jako jeden objekt, styl i „čerchovaná se dvěma tečkami“ (výchozí), konce otevřené / uzavřené (výchozí uzavřené), bez výplně, nad stěnami i otvory. Výběr, posun, úchyty (konce, vzdálenost čar), mazání, kopie, otočení, Zpět. Testy `core/drawing.test.ts`, `store/drawings.test.ts`.
- **Viditelně v aplikaci:** v liště ═ **Dvojitá**; nahoře vzdálenost čar (předvolby jako tloušťky stěn), konce, styl. Tah od líce stěny podél ní = čáry přes celou tloušťku stěny (překlad). Panel „Dvojitá čára“.
- **Rozhodnuto uživatelem:** dvojitá čára zůstává samostatným nástrojem nezávislým na stěnách (KRESLENI-PREKLADU.md).
- **Rozhodnuto samostatně:** výchozí vzdálenost 250 mm, konce uzavřené, styl čerchovaná se dvěma tečkami; tah od líce podél stěny (do ~2°) vezme tloušťku stěny a druhou čáru dá do těla, jinak strana podle odchýlení pera.
- **Otevřené:** kóta vzdálenosti čar na plátně (zatím jen v panelu).

### 2026-11-15 (konec sezení)
- **Co se změnilo:** Sezení ukončeno; za den kroky (1)–(11) níže. Uživatel vše vyzkoušel na PC: „vše funguje“. Přidán dokument `metoda-pruchozi-funkce.md` (metoda pro funkce, které ovlivňují více prvků – od uživatele).
- **Viditelně v aplikaci:** viz záznamy (1)–(11).
- **Rozhodnuto samostatně:** nic nového.
- **Otevřené:** fronta kroků v „Poslední stav“; vyzkoušet na tabletu.
- **Chyby od uživatele:** výstupek v rohu tvarem U nechával čáru na sousední stěně – opraveno (7).
- **Soubory nad 500 řádků:** žádné (největší `canvas/drawDims.ts` 464, `tools/wallTool.ts` 446, `tools/selectTool.ts` 439).

### 2026-11-15 (11) – výstupek přes volný konec stěny (I1.11)
- **Co se změnilo:** Nový prvek `Floor.endProtrusions` (SCHEMA_VERSION 16 bez převodu dat, `core/endProtrusion.ts`): lomená čára nástrojem Čára z líce stěny kolem čela jejího volného konce na protější líc se sama změní na výstupek. Souřadnice od čela (s dovnitř, v ven od líce; každý bod si pamatuje, ke kterému líci patří), takže se drží konce stěny a při změně tloušťky jede část u protějšího líce s ním. Kreslení (`core/wallBodyEdges.ts`): líce i čelo pod výstupkem se nekreslí. Výběr, panel „Výstupek na konci stěny“ (výška, název, materiál, poznámka), smazání, kopie se stěnou, F4 (`core/carried.ts`: dělení / zkrácení / smazání), změna délky kótou (jede s koncem; zkrácení pod jeho dosah se neprovede), sloučení s rovným pokračováním (výstupek na sloučeném konci zanikne, na druhém konci zůstane). Testy `store/endProtrusion.test.ts` (15), `store/carried.test.ts`, `store/openingChain.test.ts`. Po kontrole revieweru opraveno: Do rohu, který odřízne konec s výstupkem, ho smaže (F4); hlášení nástroje Rozdělit ho počítá; kopie stěny nekopíruje skrytý výstupek; změna délky kótou hlídá i překryv výstupků na koncích; kopie v řadě (a rozměry výstupku) se nepoloží přes výstupek na konci ani v rohu; ťuknutí na tělo stěny u konce vybere stěnu; panel kopírování v řadě se po přepnutí výstupku vynuluje a hlásí i zastavení zámkem.
- **Viditelně v aplikaci:** nástrojem Čára obtočit konec stěny (z jednoho líce ven, za čelo, na druhou stranu a zpět na druhý líc) = šedý výstupek bez čar uvnitř. Ověřeno v prohlížeči.
- **Rozhodnuto uživatelem:** čárami z líce na líc kolem čela, drží se konce stěny.
- **Rozhodnuto samostatně:** jen rovná stěna s volným koncem; když konec přestane být volný (napojí se jiná stěna, i oddělený konec dosedající na jinou stěnu, i prodloužení nástrojem Do rohu), výstupek se jen nekreslí (jako u výstupku v rohu); F7 se ho netýká; kopie v řadě nekontroluje otvory (I1.14 – zásah do otvoru se nezakazuje); rozměry se v panelu nemění (tvar = nakreslit znovu); bod obrysu patří líci, ke kterému má blíž.
- **Otevřené:** vyzkoušet na tabletu; kóty výstupku na konci a v rohu na výkrese; vybrání v rohu.
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (10) – kopírování výstupku v řadě (I1.11)
- **Co se změnilo:** Akce `copyProtrusionRow` (`store/actions/protrusions.ts`): kopie výstupku / vybrání podél stěny po zadané rozteči (osová vzdálenost) směrem k rohu B nebo A; kopie, která by vyjela ze stěny nebo se překryla s jiným výstupkem na stejném líci, se nevloží (`protrusionFits`). Jeden krok Zpět. Testy `store/protrusionRow.test.ts` (4).
- **Viditelně v aplikaci:** v panelu výstupku část **Kopírovat v řadě**: Počet kopií, Rozteč, Směr k B / k A, tlačítko 📄 Kopírovat a hlášení, kolik kopií se vložilo. Ověřeno v prohlížeči.
- **Rozhodnuto uživatelem:** tlačítko v panelu (počet + rozteč).
- **Rozhodnuto samostatně:** výchozí 2 kopie, rozteč 2× šířka (nejméně 1000 mm); směr volbou k B / k A; jen výstupky na jedné stěně (výstupek přes roh se v řadě nekopíruje).
- **Otevřené:** vyzkoušet na tabletu.
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (9) – D4: nástroj Rozdělit (i s mezerou)
- **Co se změnilo:** Nový nástroj **✂️ Rozdělit** (`tools/splitTool.ts`, akce `store/actions/split.ts`: `splitWall`, `cutWallSegment`, `splitPoint`): ťuknutí na stěnu (čáru i tělo) ji rozdělí na dvě – bod po 10 mm od rohu A, zarovnání s rohy jiných stěn (svisle / vodorovně), u oblouku na oblouku. Režim **S mezerou** (`Settings.splitGap`): první ťuknutí označí začátek, druhé na téže stěně konec – úsek zmizí (u konce stěny ji jen zkrátí). Prvky nesené stěnou podle F4 (`core/carried.ts`): zůstanou na své části, přes dělicí bod nebo v úseku zaniknou, napojené příčky se odpojí; hlášení řekne, kolik prvků zaniklo. Jeden krok Zpět. Testy `store/split.test.ts` (17). Po kontrole revieweru opraveno: dělení v místě příčky napojené na čáru stěny použije její roh (vznikne T, dřív se příčka odpojila); oblouk se dělí podle polohy po oblouku (u oblouku přes půlkruh dřív chybné hlášení / vyjmutí skoro celého oblouku); vyjmout úsek ze stěny se zamčenou délkou nejde (pravidlo zámků).
- **Viditelně v aplikaci:** v liště nástrojů ✂️ Rozdělit; nahoře volba Rozdělit / S mezerou a návod. Pod perem červený křížek v místě dělení, u mezery červeně úsek, který zmizí. Ověřeno v prohlížeči.
- **Rozhodnuto uživatelem:** nový nástroj; mezera dvěma ťuknutími; zamčená kóta (např. odstup okna od rohu A) dělení zastaví s hlášením; příčka napojená na líc v místě dělení zůstane napojená – dělicí bod se posune na okraj jejího těla.
- **Rozhodnuto samostatně:** po 10 mm a zarovnání s rohy (jako kreslení); u oblouku bez zaokrouhlení; kruh rozdělit nejde; mezera přes celou stěnu se neprovede (stěnu smazat); po prvním ťuknutí mezery se stěna vybere (jako u nástroje Do rohu); ťuknutí na jinou stěnu začne mezeru znovu.
- **Otevřené:** vyzkoušet na tabletu.
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (8) – kreslení řetězem (A2, A10, B6)
- **Co se změnilo:** Nástroj Stěna umí kreslit řetězem (`Settings.wallChain`, stav `chainNode` v `store.ts`, `tools/wallTool.ts`): další tah začne v konci poslední stěny a tah perem se přenese odkudkoli na plátně. Řetěz končí, když konec dosedne na existující roh nebo stěnu (uzavření místnosti), ťuknutím bez tažení, tlačítkem Ukončit řetěz nebo změnou nástroje; po Zpět (roh řetězu zmizel) začne další stěna zase u pera. Předtím čistý přesun `wallTool.ts` → `wallToolSnap.ts` (samostatný commit). Testy `tools/wallChain.test.ts` (12). Po kontrole revieweru opraveno: napojení konce na líc stěny (a zvláštní bod) řetěz také ukončí; tlačítko Ukončit se ukazuje jen při běžícím řetězu na aktuálním podlaží; Esc řetěz ukončí.
- **Viditelně v aplikaci:** v liště Stěny přepínač **Řetěz Vyp / Zap**; při běžícím řetězu zelený kroužek v konci poslední stěny a tlačítko **⏹ Ukončit řetěz**. Délka se zadává ťuknutím na kótu (jako dřív), tloušťka tlačítky mezi tahy. Ověřeno v prohlížeči.
- **Rozhodnuto uživatelem:** další tah navazuje (odkudkoli); NumPad délky se sám neotevírá; tloušťka tlačítky mezi tahy.
- **Rozhodnuto samostatně:** řetěz je ve výchozím stavu vypnutý (nemění dosavadní kreslení; volba se pamatuje); řetěz končí i napojením na existující stěnu (T), nejen uzavřením do rohu; jen nástroj Stěna (ne Čára).
- **Uživatel vyzkoušel na PC (2026-11-15):** „funguje to“.
- **Otevřené:** vyzkoušet na tabletu (lišta Stěny je delší – na užším displeji se zalomí). Známá omezení: tah začatý perem přímo na klikací kótě otevře NumPad místo kreslení (jako dřív – začít kousek vedle); po Zpět řetěz končí úplně (nepokračuje z předchozí stěny).
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (7) – výstupek přes roh (I1.11) a oprava čáry u výstupku v rohu
- **Chyby / požadavek od uživatele:** výstupek v rohu šel udělat jen tvarem U jako uprostřed stěny a na sousední stěně, ke které je jen přisazený, zůstala uvnitř čára; přání: v rohu výstupek jen dvěma čarami přes roh.
- **Co se změnilo:** Nový prvek výstupek přes roh (`Floor.cornerProtrusions`, SCHEMA_VERSION 15 bez převodu dat, `core/cornerProtrusion.ts`): lomená čára z líce jedné stěny na líc druhé stěny téhož rohu (líce se v rohu potkávají) vedená mimo těla se sama změní na výstupek. Obrys je v souřadnicích rohu (průsečík líců + směry stěn), takže se drží rohu. Kreslení (`core/wallBodyEdges.ts`): líce obou stěn se pod ním nekreslí; obecně se nekreslí čára, která má z obou stran tělo stěny nebo plochu výstupku (oprava tvaru U v rohu). Výběr, panel (rozměry podél obou stěn, výška, název…), smazání, kopie se stěnami, pravidlo F4 (`core/carried.ts`: zkrácení, dělení, smazání). Předtím čistý přesun `wallBody.ts` → `wallBodyEdges.ts` (samostatný commit). Testy `store/cornerProtrusion.test.ts` (21).
- **Viditelně v aplikaci:** nástrojem Čára: dvě čáry přes vnitřní roh (např. 600 od rohu po jedné stěně, pak k druhé stěně) = šedý výstupek v rohu bez čar uvnitř – i v rohu u příčky napojené doprostřed stěny; kolem vnějšího rohu stejně třemi a více čarami. Ťuknutím se vybere, panel „Výstupek v rohu“. Výstupek tvaru U nakreslený v rohu už nemá čáru podél sousední stěny. Ověřeno v prohlížeči.
- **Rozhodnuto uživatelem:** vnitřní i vnější roh; drží se rohu; vybrání v rohu zatím ne. Po kontrole revieweru: i roh u napojení T; sousední výstupky se slévají (čára mezi nimi se nekreslí); když stěny přestanou tvořit roh (rozpojení, oblouk, čára bez tloušťky, třetí stěna napojená do rohu), výstupek se jen nekreslí a vrátí se, až roh znovu vznikne; smaže se se stěnou.
- **Rozhodnuto samostatně:** obrys a plocha patří první stěně (od které se kreslilo), výběr jako výstupek; rozměry v panelu = délka podél líce každé stěny od rohu (změna mění jen tu část obrysu, která leží podél dané stěny); kóty na výkrese u výstupku v rohu zatím nejsou (jen panel).
- **Po kontrole revieweru opraveno:** sloučení stěny rohu s rovným pokračováním výstupek zachová (dřív zanikl); roh přetažený na jiný roh – výstupek patří spojenému rohu (dřív zůstal neviditelný záznam); zkrácení stěny kótou pod rozměr výstupku se neprovede (pravidlo prvků nesených stěnou); vybrání hned vedle výstupku si nechá boční čáru; roh se kontroluje při každém kreslení (třetí stěna v rohu ho skryje).
- **Tabulka pravidlo × prvek (nový druh – výstupek přes roh):** F4 zkrácení Do rohu ✔, dělení ✔, smazání stěny ✔ (testy); změna délky stěny kótou ✔ (na vzdáleném konci na místě, zkrácení pod rozměr se neprovede – testy; s rohem jede – rozhodnutí uživatele); sloučení stěn ✔, spojení rohů ✔ (testy); kopie ✔; posun / otočení skupiny ✔ (souřadnice vůči rohu); F7 – netýká se (leží v rohu záměrně, výjimka).
- **Uživatel vyzkoušel na PC (2026-11-15):** „všechno funguje“.
- **Otevřené:** kóty výstupku v rohu na výkrese; vybrání v rohu; výstupek přes konec stěny a kopírování v řadě (I1.11).
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (6) – F7 i pro výstupky a vybrání (rozhodnutí uživatele)
- **Co se změnilo:** Kontrola „prvek blízko rohu“ je na jednom místě `core/cornerOverlap.ts` (přejmenováno z `openingCorner.ts`) pro všechny prvky nesené stěnou: otvor hlídá oba líce, nika, výstupek a vybrání jen svůj líc; příčka napojená doprostřed stěny se hlásí, když se dotýká hlídaného líce. Po kontrole revieweru a dalších rozhodnutích uživatele: hlídá se i výstupek / vybrání na obloukové stěně (souřadnice stěny `wallFrame`), vybrání přes celou tloušťku hlídá oba líce, tolerance 1,5 mm (jako při kreslení výstupku – u volného konce se nehlásí falešný přesah). Testy `core/cornerOverlap.test.ts` (24). Pravidlo v `CLAUDE.md`, katalog F7 doplněn.
- **Viditelně v aplikaci:** žluté upozornění i v panelu výstupku / vybrání („Výstupek zasahuje do rohu A o 200 mm – …“); u niky „Nika zasahuje …“ a jen na líci, ze kterého je přístupná. Ověřeno v prohlížeči (i strana niky podle kresby).
- **Rozhodnuto uživatelem:** upozornění platí i pro výstupky a vybrání; nika jen svůj líc; i na obloukové stěně; vybrání přes celou tloušťku oba líce.
- **Rozhodnuto samostatně:** text „Otvor“ pro dveře / okna / průchod (gramaticky jednotně), „Nika“ pro niku; konec textu „– překrývá se se sousední stěnou nebo vede za konec stěny“.
- **Tabulka pravidlo × prvek:** dveře ✔, okno ✔, francouzské okno ✔, průchod ✔ (oba líce), nika ✔ (svůj líc), výstupek ✔ (svůj líc, rovná i oblouková stěna), vybrání ✔ (svůj líc; průraz oba líce; rovná i oblouková); stěna / příčka, text, místnost – netýká se. Otvor na obloukové stěně (vznikne přepnutím stěny s otvorem na oblouk, F6) se nehlídá – poloha otvoru se měří po tětivě. Kruhová stěna se nehlídá (nemá rohy). Pravidlo jinde zvlášť neplatí (jen dva panely ho zobrazují).
- **Otevřené:** jako v (5) – oddělený konec, velmi ostrý úhel, křížení.
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (5) – F7: upozornění u otvoru blízko rohu
- **Co se změnilo:** Nová kontrola `core/openingCorner.ts`: otvor jde skrz celé tělo, takže má ležet tam, kde jsou vidět oba líce stěny; když zasahuje za začátek / konec líce (do těla napojené stěny v rohu), spočítá se o kolik mm. Po kontrole revieweru doplněno: otvor přes příčku napojenou doprostřed stěny (T) se hlásí také. Testy `core/openingCorner.test.ts` (8).
- **Viditelně v aplikaci:** v panelu vybraného otvoru se u rohu ukáže žluté upozornění „Otvor zasahuje do rohu A o 300 mm – překrývá se s tělem sousední stěny.“ (u příčky „… do napojené příčky o 100 mm …“). Ověřeno v prohlížeči. Úpravu nic nezakazuje (F7: upozornění, ne zákaz).
- **Rozhodnuto samostatně:** upozornění jen v panelu otvoru (ne na výkresu); hlídají se rovné stěny s tloušťkou (otvory na oblouku zatím nejsou); měří se proti oběma lícům (rozhoduje ten, který začíná dál od rohu).
- **Otevřené:** vyzkoušet na tabletu. Nehlídá se: oddělený konec (C1.13, těla se překrývají bez napojení), velmi ostrý úhel rohu (pod ~20°, napojení „natupo“), křížení stěn přes otvor. Otázka „i výstupky?“ – uživatel: ano, viz (6).
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (4) – C1.11: hrana odskoku u stěn v přímce s různou tloušťkou
- **Co se změnilo:** Dvě stěny v jedné přímce s posunutým lícem (různá tloušťka, opačná strana, osa uprostřed) mají v rohu nakreslenou hranu odskoku (`computeWallBodies` v `core/wallBody.ts`: hranice líců se neprotnou a stěny pokračují opačným směrem → schod mezi konci líců). Hrana patří stěně, jejíž čelo zůstalo odkryté. Test C2/6 už není `it.fails` – v projektu nezůstal žádný; nové testy v `core/wallBody.test.ts` (osa uprostřed, opačná strana, stejná tloušťka, oblouky na jedné kružnici, stěny skoro v přímce, tečně navazující oblouk).
- **Viditelně v aplikaci:** u stěny 300 navazující rovně na stěnu 200 je na vnější straně čára schodu (dřív tam tělo zůstalo „otevřené“). Ověřeno v prohlížeči měřením pixelů.
- **Rozhodnuto samostatně:** odskok se kreslí i u osy uprostřed (na obou stranách) a u stěn se stejnou tloušťkou, ale opačnou stranou těla (celé odkryté čelo); oblouky na jedné kružnici stejně (radiální hrana). U konců, které pokračují téměř rovně (odchylka do ~8°, i rovná stěna s tečně navazujícím obloukem), se líce napojí průsečíkem jen do vzdálenosti tloušťky od rohu – jinak odskok (dřív se líc silnější stěny u naměřených stěn „skoro v přímce“ protáhl až o 1 m za roh, nález revieweru).
- **Otevřené:** vyzkoušet na tabletu. Vybrání sahající přesně k rohu odskoku kreslí tutéž čáru dvakrát (vypadá stejně).
- **Soubory nad 500 řádků:** žádné.

### 2026-11-15 (3) – úklid velkých souborů a hlídání velikosti
- **Co se změnilo:** Tři čisté přesuny bez změny logiky (každý zvlášť commit): `core/wallBody.ts` (678 ř.) → `wallFace.ts` (tvar a líce, 74), `wallBody.ts` (těla a ořez hran, 463), `wallSide.ts` (strana těla, 161); `canvas/drawPlan.ts` (604) → `drawPlan.ts` (stěny a rohy, 241) + `drawOpenings.ts` (otvory, 374); `core/protrusion.ts` (508) → `protrusion.ts` (geometrie, 351) + `protrusionEdit.ts` (kóty a úpravy rozměrů, 171). Kromě importů přibylo jen `export` u pomocných funkcí `isSel`, `cornersOf`, `r1`; testy změněny jen v cestách importů. Nový test `src/sizeGuard.test.ts` (nad 700 řádků selže, nad 500 upozorní); pravidlo „Velké soubory“ v `CLAUDE.md`, kontrola velikosti v reviewerovi a v `/konec`.
- **Viditelně v aplikaci:** nic – ověřeno v prohlížeči: stejná scéna (místnost s obloukem, dveře, okno, výstupek, vybrání, příčka; bez výběru i s vybranou stěnou, obloukem a výstupkem) vykreslená starým i novým kódem je pixelově shodná.
- **Rozhodnuto samostatně:** dělení a názvy souborů podle zadání; `straightContinuation` (navázání kreslené stěny) patří do `wallSide.ts`; `wallBody.ts` má 463 řádků (cíl „cca 450“, další dělení by trhalo výpočet těl).
- **Otevřené:** nic.
- **Soubory nad 500 řádků:** žádné (největší `tools/wallTool.ts` 491, `canvas/drawDims.ts` 464, `core/wallBody.ts` 463).

### 2026-11-15 (2) – F4: prvky nesené stěnou při zkrácení, dělení a smazání stěny
- **Co se změnilo:** Pravidlo F4 je na jednom místě `core/carried.ts` (první krok podle „Pravidla pro průřezové funkce“) a používá ho nástroj Do rohu (`core/trimExtend.ts`), dělení stěny (`splitWallAt`, v aplikaci zatím nevolané) i smazání stěny (`cleanup`). Prvek celý na zbývajícím kusu zůstane na místě; prvek i jen zčásti v mazaném kusu nebo přes dělicí bod se smaže celý; napojená příčka se jen odpojí. Katalog F4 upřesněn a I1.13 změněn (se souhlasem uživatele). Testy `store/carried.test.ts` (10), starý test I1.13 přepsán na rozhodnutí uživatele. Po kontrole revieweru: napojený roh v konci kusu (bod dělení, nový roh) se odpojí přímo v `carried.ts` (dřív to dořešil až `syncHosted`), test příčky v bodě dělení a polohy ponechaných příček.
- **Viditelně v aplikaci:** nástroj Do rohu smaže i výstupek / vybrání, které do odříznutého kusu zasahuje jen zčásti (dřív přečníval přes konec stěny).
- **Rozhodnuto uživatelem:** výstupek zčásti v odříznuté části → smazat celý; příčka na odříznuté části → zůstane s volným koncem; otvor zčásti v odříznuté části → smazat celý (potvrzeno); dělení sjednotit; prvek přes dělicí bod → smazat (změna I1.13).
- **Opraveno navíc (nález testu):** dělení stěny odpojovalo i příčky napojené na část, která zůstává – teď zůstanou napojené na svou část.
- **Tabulka pravidlo × prvek:** otvor (okno, dveře, průchod, nika, s ostěním) ✔; výstupek ✔; vybrání ✔; napojená příčka na čáře ✔ a na líci ✔ (výjimka: nemaže se, jen odpojí – rozhodnutí uživatele); zámky kót ✔ (zanikají se svým prvkem, `pruneLocks`); překlad, úhlopříčka, volná kóta – v aplikaci zatím nejsou (musí přibýt do `carriedBy`).
- **Pravidlo dosud zvlášť:** sloučení rovného pokračování stěn (`mergeStraightAt` v `core/topology.ts`) přenáší otvory a výstupky každý svým kódem – jiná operace (nic se nemaže), ponecháno.
- **Otevřené:** vyzkoušet nástroj Do rohu na tabletu. Prvek se zamčenou kótou, který leží v odříznutém kusu, se smaže bez hlášení (zámek hlídá jen kóty prvků, které zůstávají – jako dosud); zamčená poloha odpojené příčky zanikne.

### 2026-11-15 (1) – výstupek při přehození strany stěny (fronta bod 1)
- **Co se změnilo:** Ověřeno, že ruční přehození strany (⇅) i automatické natočení rovné stěny ven po uzavření místnosti odpovídá katalogu I1.7 (výstupek zůstane na své straně a posune se s lícem). Opravena chyba u obloukové stěny: po uzavření místnosti se oblouk překlopí ven (zrcadlí se podle tětivy), ale výstupek zůstal na původní straně a přeskočil z vnějšího líce na vnitřní. Teď se výstupek zrcadlí s obloukem (`orientLoopOutward` v `core/wallBody.ts`), test v `store/protrusionArc.test.ts`.
- **Viditelně v aplikaci:** výstupek nakreslený na obloukové stěně před uzavřením místnosti zůstane po uzavření na vnějším líci oblouku (dřív skočil dovnitř místnosti).
- **Rozhodnuto samostatně:** bod fronty uzavřen podle schváleného I1.7 – při ručním přehození strany se výstupek nepřesouvá na protější stranu stěny; zrcadlení výstupku jen tehdy, když se zrcadlí celý oblouk.
- **Otevřené:** nic nového; další ve frontě F4 a C1.11.

### 2026-11-14 (konec sezení)
- **Co se změnilo:** šířka okna = otvor ve stěně bez kót rámu (17) a přichytávání nové stěny k oběma lícům jiné stěny (18); uživatel potvrdil „funguje to jak má“. Testy 355 + 1 `it.fails`, typecheck a build OK.
- **Viditelně v aplikaci:** viz (17) a (18).
- **Rozhodnuto samostatně:** viz (17) a (18).
- **Otevřené:** fronta kroků v „Poslední stav“ – další je výstupek při přehození strany stěny.
- **Chyby od uživatele:** kóty rámu okna a rám přičítaný k šířce okna – opraveno (17).

### 2026-11-14 (18) – přichytávání nové stěny k oběma lícům jiné stěny
- **Co se změnilo:** Nástroj Stěna přichytí začátek i konec nové stěny nejen na čáru jiné stěny, ale i na její **protější (vnější) líc** a u osy uprostřed na oba líce. Nová stěna se na líc napojí (T bez dělení), roh leží přímo na líci (`Node.hostFace`, schéma 14) – délka nové stěny je viditelná délka od líce. Roh drží na líci i při změně tloušťky, strany, osy a posunu průběžné stěny. Testy `store/hostFace.test.ts`, `tools/wallTool.draw.test.ts`.
- **Viditelně v aplikaci:** stěnu jde začít / ukončit ťuknutím na šedý vnější okraj jiné stěny; napojí se čistě bez čáry mezi stěnami.
- **Rozhodnuto samostatně:** jen rovné stěny (oblouk zatím ne); čára stěny má přednost, když je pero blíž k ní; po přehození strany průběžné stěny zůstane roh na líci na své straně (může to být čára stěny) – napojená stěna se prodlouží / zkrátí, vzdálený konec zůstane. Na líc se napojí jen stěna vedoucí od líce ven (stěna přes tělo a osu je křížení); konec stěny začaté na téže stěně se na její líc nepřichytí. Po kontrole revieweru opraveno: kopie zachová napojení na líc, odpojení a slučování stěn mažou / otáčejí stranu líce.
- **Otevřené:** vyzkoušet na tabletu (v náhledu na PC se tažení myší nepodařilo nasimulovat – ověřeno testy).

### 2026-11-14 (17) – šířka okna = otvor ve stěně, bez kót rámu
- **Chyby od uživatele:** po zrušení zadávání šířky rámu zůstaly v kótě okna dělicí značky rámu a k šířce okna se rám dál přičítal (okno 1000 zabralo ve stěně 1100).
- **Co se změnilo:** rám okna a francouzského okna (50 mm) leží UVNITŘ zadané šířky okna; šířka okna = otvor ve stěně mezi ostěními (`frameOutside` / `openingSpan` v `core/floorQueries.ts`). Řetězová kóta okna nemá značky rámu. Zárubeň dveří se nemění (přičítá se, má kótu). Křídlo francouzského okna se kreslí na světlost mezi rámy.
- **Viditelně v aplikaci:** okno 1000 je ve stěně 1000 mm, kóta ukazuje jen odstup – šířku okna – odstup.
- **Rozhodnuto samostatně:** bez migrace dat – zadané šířky oken zůstávají (to je číslo, které uživatel změřil), existující okna se ve výkresu zúží o 100 mm a o 100 mm se změní kóta na straně okna, od které se neměří (mezera k sousednímu otvoru / k protějšímu rohu) – **i když je zamčená** (zámek hlídá jen úpravy, ne změnu pravidla). Okno s rámem musí být široké aspoň 200 mm (světlost mezi rámy 100 mm).
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (16) – oprava: změna celkové kóty hlásila zamčenou kótu
- **Chyby od uživatele:** u stěny s dveřmi, průchodem, nikou a dvěma okny těsně u sebe hlásila změna celkové kóty „brání zamčená kóta“ (mezi průchodem a nikou), místo aby se posunul konec stěny. Příčina: kontrola střetů po změně délky brala jako chybu i stav, který už ve výkresu byl (okna s rámy těsně u sebe / s malým překryvem), a hlášení pak ukázalo na zamčenou kótu.
- **Co se změnilo:** Vadí jen NOVÝ střet (překryv otvorů ve všech dvojicích, vyjetí ze stěny, příčka v otvoru, výstupky) – porovnává se se stavem před úpravou. Hlášení říká skutečný důvod (zamčená kóta jen u prvků přivázaných k oběma koncům). Testy v `store/openingChain.test.ts` (29).
- **Viditelně v aplikaci:** změna celkové kóty u takové stěny projde, otvory zůstanou na místě.
- **Otevřené:** vyzkoušet na tabletu (po aktualizaci aplikace – případně stránku znovu načíst).

### 2026-11-14 (15) – pravidlo „prvky nesené stěnou zůstanou na místě“ pro všechny prvky
- **Co se změnilo:** Ověřeno, že průchod a nika (druhy otvorů) zůstávají při změně délky stěny na místě; doplněny napojené příčky (T): zůstanou na místě, se zamčenou polohou napojení jedou s koncem stěny (řetěz zámků, `keepOpeningsAfterResize`). Pravidlo zapsáno jako závazné do `CLAUDE.md`, `KOTY-ZAMEK-EXPORT.md` a do hlavičky `core/openingChain.ts` – platí i pro budoucí druhy prvků na stěně. Testy v `store/openingChain.test.ts` (27).
- **Viditelně v aplikaci:** příčka napojená na stěnu se zamčenou kótou polohy jede při změně délky stěny s jejím koncem; jinak zůstane na místě.
- **Rozhodnuto uživatelem:** platí úplně pro všechny prvky, které stěna nese, i pro budoucí.
- **Rozhodnuto samostatně:** zkrácení stěny za napojenou příčku se neprovede s hlášením (dřív se příčka potichu odpojila); příčka přivázaná zámky nesmí dosednout do otvoru; pravidlo zatím jen pro rovné stěny (oblouk, kruh ne). Katalog I1.6 doplněn o všechny prvky nesené stěnou včetně napojených příček (se souhlasem uživatele).
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (14) – výstupky při změně délky stěny jako otvory (rozhodnutí uživatele)
- **Co se změnilo:** Při změně délky stěny kótou / NumPadem zůstanou ve výkresu na místě i výstupky; s koncem stěny jedou jen ty, které jsou k němu přivázané zamčeným odstupem od konce a dál zamčenými odstupy mezi sousedy na stejném líci (řetěz jako u otvorů). Překryv výstupků nebo vyjetí ze stěny → nic se nezmění, hlášení. Katalog I1.6 doplněn o upřesnění uživatele (tažení beze změny). Testy v `store/openingChain.test.ts` (24).
- **Viditelně v aplikaci:** zadání délky stěny už neposouvá přizdívky / pilastry měřené od posunutého rohu.
- **Rozhodnuto uživatelem:** „Ano, stejně“ (výstupky jako otvory).
- **Rozhodnuto samostatně:** tažení konce stěny dál nese výstupek od rohu A (katalog I2/6 př. 6 platí); výstupky na obloukové stěně a změny délky mimo kótu stěny (např. jiné nástroje) se nemění.
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (13) – otvory při změně délky stěny vždy na místě (rozhodnutí uživatele)
- **Co se změnilo:** Při změně délky stěny kótou / NumPadem (celková délka i délka po líci) zůstanou otvory ve výkresu vždy na místě, i bez zámků; s posunutým rohem jedou jen otvory přivázané zamčeným odstupem a zamčenými meziostěními. Platí pro všechny stěny, kterým řešič změnil délku posunem konce podél stěny (protější stěna místnosti, navazující stěna) – `keepOpeningsOnResizedWalls` v `core/openingChain.ts`. Testy v `store/openingChain.test.ts` (21); dva testy se starým chováním přepsané podle rozhodnutí uživatele.
- **Viditelně v aplikaci:** změna délky stěny už nehýbe okny a dveřmi měřenými od posunutého rohu; zkrácení stěny pod otvor se neprovede s hlášením „otvor by vyjel ze stěny“.
- **Rozhodnuto uživatelem:** „Ano, vždy na místě“ (otvory při změně délky stěny).
- **Rozhodnuto samostatně:** tažení konce stěny myší / perem se nemění – otvory dál drží odstup od svého rohu (katalog I1.6, I2/6 „jako u otvorů“ popisuje tažení); výstupky se při změně délky přes NumPad dál vedou od rohu A (katalog I2/6) – kdyby se měly chovat jako otvory, je to otázka na uživatele (rozpor s katalogem).
- **Otevřené:** výstupky sjednoceny s otvory – viz (14).

### 2026-11-14 (12) – celková kóta stěny protáhne volný konec
- **Co se změnilo:** Kóta celkové délky stěny posouvá volný (nepřipojený) konec, pokud je volný jen jeden (`openTarget`). Když by otvory jedoucí se svým referenčním rohem porušily zamčenou kótu, zůstanou ve výkresu na místě a s rohem jedou jen otvory k němu přivázané zamčeným odstupem a zamčenými meziostěními (`keepOpeningsAfterResize` v `core/openingChain.ts`); rozdíl spolkne nezamčená krajní kóta. Další (NEXT) pokračuje od napojeného konce. Testy v `store/openingChain.test.ts` (19).
- **Viditelně v aplikaci:** u stěny se zamčenými meziostěními zadání celkové délky stěnu protáhne na volném konci, otvory zůstanou a krajní kóta se přepíše (dřív hlášení „brání zamčená kóta“).
- **Chyby od uživatele:** celková kóta hlásila zamčenou kótu místo protažení stěny – opraveno.
- **Rozhodnuto samostatně:** bez porušení zámku zůstává staré chování – otvor drží odstup od svého referenčního rohu (např. volný konec u rohu A: otvory měřené od A jedou s ním); když jsou otvory zámky přivázané k oběma koncům, změna délky se neprovede s hlášením.
- **Otevřené:** vyzkoušet na tabletu. (Otvory i bez zámků na místě – rozhodnuto, viz (13).)

### 2026-11-14 (11) – řetězová kóta otvorů se zámky (požadavek uživatele z tabletu)
- **Co se změnilo:** Zamčená meziostění spojují otvory na stěně do celku (`core/openingChain.ts`, `pushChainRight`). Změna úseku řetězu (odstup od rohu A, meziostění, šířka otvoru měřeného od A) posune vše napravo, co je s ním spojené zamčenými kótami; první nezamčený úsek napravo změnu spolkne; když žádný není, posune se roh B (stěna se prodlouží). Změna poslední kóty k rohu B nechá otvory na místě a prodlouží / zkrátí stěnu. Když to nejde, nic se nezmění a dole se ukáže důvod. Recept `store.edit` může vrátit false = úprava se zahodí celá. Testy `store/openingChain.test.ts` (14) podle příkladu uživatele.
- **Viditelně v aplikaci:** ťuknutí na první kótu vlevo a zadání nové hodnoty posune všechny otvory spojené zámky; poslední kóta vpravo prodlouží stěnu (otvory zůstanou). Bez zámků se mění jen nejbližší soused (meziostění za ním se přepíše) – dřív změna meziostění posouvala všechny otvory napravo.
- **Rozhodnuto samostatně:** pravidlo zobecněno na všechny úseky řetězu (směr vždy k rohu B, protože řetěz se měří od rohu A); šířka otvoru měřeného od rohu B se mění postaru (drží se okraj u B); „Odstup od B“ v panelu otvoru otvor dál posouvá (stěnu prodlužuje jen kóta v řetězu na výkresu / v pořadí Další); konec B napojený doprostřed jiné stěny (T) se prodloužit nedá; zamčená délka stěny prodloužení zastaví.
- **Otevřené:** vyzkoušet na tabletu. Totéž pro řadu poloh napojení příček zatím není (jen otvory).

### 2026-11-14 (10) – zámek kót (KOTY-ZAMEK-EXPORT.md, A)
- **Co se změnilo:** Pojem „změřeno × náčrt“ (`Wall.measured`) je zrušený – pole zůstává jen ve starých datech, aplikace ho nečte ani nezapisuje. Každá kóta může mít vlastní **zámek** (`Floor.dimLocks`, klíč = kóta, `core/dimLock.ts`; bez změny schématu, staré projekty mají vše odemčené). Řešič délek drží jen zamčené délky (`hasLockedWallAlong`). Každá úprava výkresu (`store.edit`) se kontroluje: když by změnila zamčenou kótu, neprovede se a nahoře se ukáže hlášení s tlačítkem Odemknout (`lockBlock`, `ui/LockNotice.tsx`). Testy `store/dimLock.test.ts` (16); testy, které ověřovaly „změřeno“, přepsané na zámek (změna zadání uživatelem).
- **Viditelně v aplikaci:** všechny kóty černé, vždy skutečná délka z výkresu (žádná oranžová „~“ ani červený „⚠“). Zamčená kóta má za číslem **modrou ikonu zámku** (ťuknutím odemkne). V NumPadu tlačítko **Zamknout kótu / Zamčeno – odemknout**; změna zamčené kóty chce druhé potvrzení („Přepsat zamčenou kótu“) a zámek pak drží novou hodnotu. V panelu stěny a místnosti **Zamknout vše / Odemknout vše**. Tažení prvku se zamčenou kótou se nepohne a ukáže hlášení. Panel stěny už neříká „náčrt / změřeno“.
- **Rozhodnuto samostatně:** zámek je uložený v podlaží podle kóty (kóty nejsou samostatné prvky); ruční přepsání zamčené kóty po potvrzení zámek ponechá; tažení se blokuje průběžně (prvek se nepohne), ne až po puštění; zámek kóty smazaného prvku zaniká; kóta měřená od souseda (poloha napojení, odstup výstupku), jehož soused přibyl / zmizel, je jiná kóta – zámek zaniká a úpravu nezastaví; mezera mezi otvory zablokuje přesun otvoru na jinou stěnu (kóta by zmizela); u oblouku drží zámek délky tětivu (tu kóta ukazuje); pokračování zamčené stěny rovným směrem se nesloučí (zůstanou dvě stěny); rozdělení stěny předá zámek délky / tloušťky oběma částem; hromadné zamknutí bere jen kóty viditelné u vybrané stěny (délka, vzepětí, tloušťka, řetěz otvorů s ostěním vlevo / vpravo a zárubní, polohy napojení), hloubky ostění / výstupky / líce se zamykají jednotlivě v NumPadu; místnost = nejmenší uzavřený obrys stěn kolem štítku (volné příčky uvnitř patří k ní, sloup se přeskočí); ikona zámku je pomocná (`setDimLockContext(…, helpers)` – export ji kreslit nebude). Zámek odemčené kóty se na plátně nezobrazuje – zamyká se v NumPadu nebo hromadně.
- **Otevřené:** vyzkoušet na tabletu (čitelnost modré ikony na slunci). Úhlopříčky a volné kóty v aplikaci zatím nejsou – zámek je na ně připravený obecně. Část B (hlavní kóta pro export) později s exportem.

### 2026-11-14 (9) – D3: nástroj „Do rohu“ (zkrátit / prodloužit do rohu)
- **Co se změnilo:** Nový nástroj **⌐ Do rohu** na liště: ťukne se na první stěnu a pak na druhou, vždy na část, která má zůstat. Referenční čáry obou rovných stěn se protnou; přečnívající část se odřízne, krátká stěna se prodlouží a obě sdílejí jeden roh (`core/trimExtend.ts`, akce `trimToCorner`, nástroj `tools/trimTool.ts`, zpráva v liště voleb `toolMsg`). Jeden krok Zpět. Testy `store/trimExtend.test.ts` (11).
- **Viditelně v aplikaci:** nové tlačítko „Do rohu“; v liště nahoře návod, co ťuknout, a upozornění, když to nejde (oblouk, rovnoběžné stěny, příliš krátká stěna, už spojené). Při volbě druhé stěny kroužek v místě budoucího rohu.
- **Rozhodnuto samostatně:** přesouvá se jen konec dané stěny (roh sdílený s další stěnou se pro ni oddělí, sousedé zůstanou); otvor, který leží v odříznuté části **i jen zčásti**, se smaže (F4), ostatní otvory a výstupky drží polohu ve výkresu; změřená délka se zruší (stěna je zase náčrt); oddělený konec (C1.13) v místě rohu se spojí; oblouky a kruhy nástroj odmítne; napojení společného rohu na třetí stěnu zůstává.
- **Otevřené:** z křížení T (příčka přečnívá přes průběžnou stěnu) nástroj vždy udělá roh L – varianta „zkrátit jen jednu stěnu k hraně druhé“ (Revit: jeden prvek) zatím není; stěna napojená na odříznutou část zůstane s volným koncem; výstupek přesahující nový konec se neořízne.

### 2026-11-14 (8) – opravy po kontrole revieweru
- **Co se změnilo:** NumPad: „−“ hned po otevření zase dá výraz (1200 − 150), jak tomu bylo dřív. Migrace rámu okna zachová celou díru ve zdivu (rozdíl staré šířky rámu přejde do šířky okna, okno se neposune). Pole hloubek u vypnuté strany ostění se jmenují „Rám od vnitř. / vnějš. líce“. Wake Lock: ošetřené uvolnění zámku.
- **Viditelně v aplikaci:** popisky hloubek v panelu otvoru podle zapnuté strany ostění.
- **Rozhodnuto samostatně:** řetězová kóta podél líce ukazuje ostění vlevo / vpravo i při vypnutém vnitřním ostění (kótuje celý otvor; nechávám, dokud uživatel nerozhodne jinak).
- **Otevřené:** nic nového.

### 2026-11-14 (7) – Nevypínat displej (Screen Wake Lock)
- **Co se změnilo:** Nový modul `input/wakeLock.ts` drží displej zapnutý přes Screen Wake Lock API: žádá o zámek při spuštění, při každém ťuknutí, dokud ho nemá (Safari chce dotyk), a znovu po návratu do aplikace (`visibilitychange`). Volba `Settings.keepAwake` (ukládá se v prohlížeči jako ostatní nastavení). Testy s falešným prohlížečem.
- **Viditelně v aplikaci:** v Nastavení (⚙️) přepínač **Nevypínat displej**, výchozí **zapnuto**. Bez podpory API se pod ním ukáže rada prodloužit časový limit obrazovky v nastavení tabletu.
- **Rozhodnuto samostatně:** výchozí stav zapnuto (při zaměřování je usínání horší než spotřeba baterie; zámek platí jen, když je aplikace vidět). Náhradní trik s neviditelným videem (NoSleep) se nedělá.
- **Podpora:** Chrome a Edge na Androidu (Galaxy Tab) ano; Safari na iPadOS od 16.4 (v aplikaci přidané na plochu spolehlivě až od 18.4); vyžaduje https (GitHub Pages ano; vývojový server přes IP adresu v síti ne).
- **Otevřené:** ověřit na tabletu (náhledový prohlížeč v Claude zámek zakazuje).

### 2026-11-14 (6) – značka okna: plná čára v lících
- **Co se změnilo:** Čára přes otvor v rovině líců (navazuje na hrany stěny) je u okna a francouzského okna plná, u dveří a průchodu zůstává čerchovaná (`faceLineDashed` v `core/doorLayout.ts`, test ve `windowFrame.test.ts`).
- **Viditelně v aplikaci:** okno ve stěně má v obou lících plnou tenkou čáru místo čerchované.
- **Rozhodnuto samostatně:** platí i pro francouzské okno a okno ve stěně kreslené jednou čarou.
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (5) – rám okna pevně 50 mm (schéma 13)
- **Co se změnilo:** Šířka rámu okna a francouzského okna je vždy 50 mm: pole „Šířka rámu“ zmizelo z panelu, `applyRevealPart('frameWidth')` u oken nic nemění, migrace `fixWindowFrames` (12 → 13) přepíše starou uloženou šířku rámu na 50. Zárubeň dveří se dál nastavuje.
- **Viditelně v aplikaci:** v řetězové kótě okna už nejsou klikací čísla 50 u rámu (zůstaly jen dělicí značky), u okna je jen kóta šířky (+ ostění vlevo / vpravo, pokud je zapnuté). Hloubka rámu zůstává nastavitelná.
- **Rozhodnuto samostatně:** šířka okna (`width`) dál znamená světlou šířku mezi rámy (otvor = šířka + 2 × 50 + ostění) – význam dat se nemění; hloubka rámu zůstává v panelu.
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (4) – francouzské okno s křídlem
- **Co se změnilo:** Francouzské okno se kreslí s křídlem a obloukem otevírání jako dveře (sdílený kód křídla v `drawFramed`, `hasLeaf` ve `factory.ts`). Panel má u francouzského okna stejná tlačítka jako dveře: **Panty L/P** a **Dovnitř/ven**. Přepnutí druhu přes akci `setWindowKind`. Bez změny dat (panty a směr už otvor měl).
- **Viditelně v aplikaci:** francouzské okno = rám + křídlo s obloukem místo čáry skla; ve stěně s tloušťkou se výchozí otevírá do místnosti (i po přepnutí z okna).
- **Rozhodnuto samostatně:** francouzské okno nemá čáru skla (jen křídlo, jako dveře); ve stěně kreslené jednou čarou zůstává výchozí strana rámu ven (jako dřív), směr se přepne tlačítkem.
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (3) – ostění vnitřní a vnější zvlášť (schéma 12)
- **Co se změnilo:** Místo přepínače „Bez ostění / S ostěním“ má panel otvoru dvě samostatná tlačítka **Vnitřní** a **Vnější** (ve stěně s tloušťkou; u čáry bez tloušťky jedno tlačítko „Ostění“). `Reveal.inner` / `Reveal.outer`, akce `setRevealSides`, obrys okraje v `jambOutline`. SCHEMA_VERSION 12, migrace `revealSides`.
- **Viditelně v aplikaci:** nic nevybráno = bez ostění. Líc bez ostění má okraj stěny rovně až k rámu / zárubni (otvor v tom líci je užší o ostění vlevo a vpravo, zdivo šedé), líc s ostěním má schod jako dřív.
- **Rozhodnuto samostatně:** vnitřní = líc A (čára stěny), vnější = líc B; dřívější „S ostěním“ → **obě ostění zapnutá** (kresba se nemění); zapnutí / vypnutí ostění nechá rám i zárubeň na místě (při vypnutí se hloubka uloží do odsazení rámu). Okno má rám u vnitřního líce, takže vnitřní ostění je po zapnutí hluboké 0 mm – hloubku je třeba zadat („Hloubka zevnitř“).
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-14 (2) – oprava: pravé ostění ve značce dveří a oken
- **Co se změnilo:** Okraj stěny po pravé straně otvoru se kreslil zrcadlením levé strany, takže bral šířku levého ostění. Nová čistá funkce `jambOutline` v `core/doorLayout.ts` počítá každou stranu s vlastní šířkou (L / R); testy v `doorLayout.test.ts`.
- **Viditelně v aplikaci:** u dveří i oken s různě širokým ostěním vlevo a vpravo sedí „schod“ ostění vpravo na správném místě.
- **Rozhodnuto samostatně:** oprava (bod 7 zadání) udělána před bodem 2, protože ten mění stejné kreslení.
- **Chyby od uživatele:** různě velká ostění → pravé ostění špatně (dveře i okna); opraveno.

### 2026-11-14 (1) – NumPad u všech číselných polí, tlačítko 000
- **Co se změnilo:** Všechna číselná pole v panelech (výška, parapet, hloubka niky, tloušťka stěny, výstupek, text, úhel otočení, výška oblouku, vlastní tloušťka, světlé výšky místnosti) otevírají po ťuknutí NumPad místo malého políčka (`openField` v `numpadController.ts`, cíl `field`). NumPad má tlačítko **000**.
- **Viditelně v aplikaci:** pole vypadají jako modrá tlačítka s hodnotou; ťuknutí otevře velkou klávesnici; 2 + 000 = 2000. U obecných polí chybí tlačítko „Další“ (nemají pořadí).
- **Rozhodnuto samostatně:** záporné číslo (úhel otočení) jde zadat „−“ na začátku jen u polí, která ho připouští; výběr na výkrese se otevřením pole nemění.
- **Otevřené:** vyzkoušet na tabletu.

### 2026-11-13 (konec sezení)
- **Co se změnilo:** Sezení ukončeno. Za den: výstupky a vybrání stěn (nástroj Čára, obdélník, uzavřené tvary, tvary přes líc a přes celou tloušťku, obloukové stěny, oblouk v obrysu), zarovnání s rohem při kreslení, kóta polohy napojení; katalog doplněn (I1.2, I1.3, I1.15, příklady I2/12–14) se souhlasem uživatele.
- **Viditelně v aplikaci:** viz záznamy níže (2026-11-13, 1–9).
- **Rozhodnuto samostatně:** pořadí fronty – nejdřív D3, pak přichytávání k lícům u stěn, pak chování výstupku při přehození strany.
- **Otevřené:** vyzkoušet vše na tabletu (s novou verzí PWA).
- **Chyby od uživatele:** všechny nahlášené dnes opraveny (popis v záznamech níže).

### 2026-11-13 (9) – uzavřený tvar přes líc stěny
- **Co se změnilo:** Uzavřený tvar (čáry nebo plný obdélník), který líc stěny protíná ve dvou bodech (část zasahuje do těla), se v líci ořízne a venkovní část je výstupek (`profileFromLoop` v `core/protrusion.ts`). Platí pro rovné i obloukové stěny.
- **Viditelně v aplikaci:** výstupek vznikne i z „kompletního obrazce“ nakresleného přes líc stěny (strana tvaru nemusí ležet přesně na líci); část uvnitř stěny zmizí.
- **Rozhodnuto samostatně:** plný obdélník překrývající stěnu je teď také výstupek (sloup přiložený ke stěně / do ní); tvar přes celou tloušťku stěny (obě strany venku) zůstane čarami; při více možnostech se vezme nejhlubší výstupek.
- **Po kontrole revieweru opraveno:** tvar ve vnitřním rohu dvou stěn zůstane čarami (výstupek by zapadl do sousední stěny); tvar převážně v těle (jen kousek přes líc) není výstupek; testy ořezu v líci, rohu a Zpět.
- **Otevřené:** průsečíky tvaru s lícem oblouku se hledají jen mezi rohy tvaru – velmi dlouhá rovná strana, která oblouk protne dvakrát, se ořízne nepřesně (vzácné).
- **Otevřené:** ověřit na tabletu; katalog I1.3 a příklady I2/13–14 doplněny na pokyn uživatele.
- **Chyby od uživatele:** „Tvar, který protíná oblouk, se nevytvoří (s třemi čarami to funguje), může to mást“ (obrázek). Doplněno, testy `tools/arcPicture.test.ts`.

### 2026-11-13 (8) – výstupek na vypouklém líci oblouku
- **Co se změnilo:** Konec čáry tažené po pomocné čáře (vodorovně / svisle) se na líc oblouku přichytí do skutečného průsečíku (`lineFaceCrossing` v `tools/wallTool.ts`, dřív průsečík s přímkou tětivy). Když zarovnání s rohem odtáhne konec do těla, líc se hledá podle polohy pera a má přednost.
- **Viditelně v aplikaci:** výstupek jde nakreslit i na vypouklém líci obloukové stěny (protější k čáře stěny s rohy), i s vodorovnými / svislými čarami.
- **Rozhodnuto samostatně:** přichycení na líc má přednost před zarovnáním s rohem (když pomocná čára líc v okolí neprotne, konec padne kolmo na líc a opustí pomocnou čáru).
- **Otevřené:** ověřit na tabletu.
- **Chyby od uživatele:** „Funguje to jen z jedné strany“ (obrázek: oblouk, výstupek na vypouklém líci zůstal čarami – levý dolní roh skončil uvnitř stěny). Opraveno, test `tools/arcPicture.test.ts` (bez opravy selže).

### 2026-11-13 (7) – výstupek kreslený od čáry stěny přes celou tloušťku
- **Co se změnilo:** Obrys, který začne i skončí na jednom líci (typicky na čáře stěny s rohy) a vyjde ven za protější líc, se ořízne na protějším líci a vznikne výstupek tam (`throughBody` v `core/protrusion.ts`). Části uvnitř těla se zahodí.
- **Viditelně v aplikaci:** výstupek ven jde kreslit i od vnitřní čáry stěny přes celou tloušťku (rovná i oblouková stěna) – dřív zůstaly čáry.
- **Rozhodnuto samostatně:** test „vybrání hlouběji než tloušťka nevznikne“ (můj dřívější odhad, ne pravidlo katalogu) přepsán na nové chování podle obrázku od uživatele.
- **Po kontrole revieweru opraveno:** obrys jen do 10 mm za protějším lícem = vybrání přes celou tloušťku (ne tenký výstupek); výstupek se nepřiřadí cizí stěně u rohu; náhled při kreslení ukazuje to, co opravdu vznikne.
- **Otevřené:** ověřit na tabletu (pozor na starou verzi v mezipaměti – aplikaci zavřít a otevřít, případně dvakrát načíst).
- **Chyby od uživatele:** „Nic se nezměnilo“ (obrázek: oblouková stěna, tvary kreslené od vnitřní čáry). Horní tvar procházel celou tloušťkou → dřív nesmyslné vybrání, teď výstupek na vnějším líci. Dolní tvar (vybrání) v nové verzi funguje (test `tools/arcPicture.test.ts`) – u uživatele nejspíš běžela stará verze z mezipaměti.

### 2026-11-13 (6) – výstupek a vybrání na obloukové stěně
- **Co se změnilo:** Souřadnice výstupku (u, v) fungují i na oblouku: u = délka po oblouku osy od rohu A, v radiálně od líce (`Frame` s `at` / `project` v `core/protrusion.ts`). Řez líce po oblouku (`cutAlongFace`), plocha uzavřená po oblouku líce (`protrusionPolygon`). Katalog: nový řádek I1.15 (přesunuto z I1.11 „později“ na požadavek uživatele).
- **Viditelně v aplikaci:** nástrojem Čára jde nakreslit výstupek i vybrání na vnější i vnitřní líc obloukové stěny – konce se přichytí na líc oblouku, tvar zešedne a patří stěně; kóty a úchyty vzepětí jako u rovné stěny.
- **Rozhodnuto samostatně:** nakreslené rovné čáry zůstanou ve výkresu rovné (neohýbají se podle oblouku); poloha se ukládá po oblouku osy (při změně tloušťky se výstupek neposune podél stěny), kóty šířky a odstupů ukazují délku po líci výstupku (I1.8); při změně vzepětí stěny se poloha přepočítá v poměru délek (oblouk → rovná nepřečnívá); konce čar se na obloukovou stěnu s tloušťkou přichytávají na líce (jako u rovné).
- **Po kontrole revieweru opraveno:** rozdělení obloukové stěny výstupky nepřenášelo (ztratily by se); změna vzepětí stěny nechávala výstupek za koncem; kóty ukazovaly délku po ose místo po líci; řez líce přesně na oblouku. Testy dělení, vzepětí, Zpět, smazání, kopie, záporného vzepětí a osy uprostřed.
- **Otevřené:** ověřit na tabletu; nástroj Obdélník u oblouku výstupek neudělá (rovná strana obdélníku neleží na zakřiveném líci) – na oblouk kreslit Čárou; konce obyčejných čar se na obloukovou stěnu s tloušťkou napojují jen na líc (bez napojení rohu, jako u rovné).
- **Chyby od uživatele:** „Přidání a vybrání k obloukové stěně nefunguje“ (obrázek). Doplněno, testy `store/protrusionArc.test.ts`, `tools/lineTool.test.ts`.

### 2026-11-13 (5) – kóta polohy napojení na průběžné stěně
- **Co se změnilo:** Průběžná stěna s T-napojenými příčkami má řetězovou kótu polohy napojení (`hostedChain`, `setHostedGap` v `core/hosting.ts`, NumPad cíl `junction-gap`).
- **Viditelně v aplikaci:** u stěny, na kterou dosedají příčky, je nad celkovou délkou řada kót: roh A → příčka → … → roh B. Ťuknutím se otevře NumPad; zadáním se příčka posune podél stěny (Další přejde na další úsek řetězu).
- **Rozhodnuto samostatně:** měří se po ose průběžné stěny (jako celková délka); příčka se posouvá rovnoběžně – její vzdálený konec jde s ní, je-li volný nebo napojený na jinou stěnu, konec v rohu dalších stěn zůstane (příčka se natočí); napojení se nesmí přeskočit (pořadí zůstává) ani dostat za roh; křížení a oblouky se zatím nekótují; kóty se ukazují vždy (jako dřív kóty částí rozdělené stěny).
- **Po kontrole revieweru opraveno:** konec příčky napojený na jinou (i šikmou / obloukovou) stěnu na ní zůstane – nový průsečík ve směru příčky; natočená příčka ztratí změřenou délku (jinak by kóta hlásila nesoulad); příčku nejde číslem posunout do otvoru v průběžné stěně; testy pořadí Další a oblouku.
- **Otevřené:** ověřit na tabletu; kóta k líci příčky / po líci průběžné stěny (zatím osa – osa).
- **Chyby od uživatele:** žádné.

### 2026-11-13 (4) – oblouk v obrysu výstupku (I1.10)
- **Co se změnilo:** Bod obrysu výstupku má nepovinné vzepětí úseku `ProfilePt.s` (SCHEMA_VERSION 11, bez převodu dat). Obrys, plocha, hrany i hloubka počítají s obloukem (`profilePolyline`); úchyty a nastavení vzepětí v `core/protrusion.ts`.
- **Viditelně v aplikaci:** u vybraného výstupku je uprostřed každé strany (mimo líc) modrý kulatý úchyt. Tažením se strana vyklene do oblouku (po 10 mm, nejvýš půlkruh, zpět k tětivě = rovná). Ťuknutím na úchyt nebo na kótu „vzepětí“ se otevře NumPad.
- **Rozhodnuto samostatně:** nový oblouk zadaný číslem se vyklene ven od plochy výstupku; při změně hloubky / šířky se vzepětí mění s délkou tětivy úseku; strana ležící po líci oblouk mít nemůže.
- **Po kontrole revieweru opraveno:** vzepětí vybrání nesmí prorazit stěnu; boční oblouk se počítá do šířky (líc pod ním se nekreslí) a nesmí přes souseda ani konec stěny; při změně hloubky / šířky se oblouky mění s délkou své tětivy (nejvýš půlkruh) a hloubka sedí přesně i s obloukem na čele.
- **Otevřené:** ověřit na tabletu.
- **Chyby od uživatele:** žádné.

### 2026-11-13 (3) – výstupek i z uzavřeného tvaru přiloženého ke stěně
- **Co se změnilo:** Uzavřený tvar z čar (čtyři čáry nástrojem Čára) nebo plný obdélník (nástroj Obdélník), který jednou stranou leží na líci stěny, se změní na výstupek / vybrání – strana po líci se vynechá (`lineLoop`, `openLoopOnFace` v `store/actions/protrusions.ts`).
- **Viditelně v aplikaci:** obdélník nakreslený u stěny (zevnitř i zvenku) se přidá ke stěně jako šedý výstupek; čárkovaný obdélník (překlad) a obdélník volně v místnosti zůstanou čarami.
- **Rozhodnuto samostatně:** převádí se jen plný obdélník (čárkovaný = překlad / konstrukce nad řezem); tvary nakreslené před touto opravou se samy nepřevedou (stačí je nakreslit znovu).
- **Po kontrole revieweru doplněno:** čára po líci, která jen uzavírá už hotový výstupek, se smaže (nezůstane navíc); obdélník se převádí i když některá jeho strana už existovala; testy vybrání, Zpět, dotyku rohem.
- **Otevřené:** ověřit na tabletu; tvar v rohu místnosti (na lících dvou stěn) patří jen jedné stěně – líc druhé se v něm dál kreslí (blízké I1.11 „přes roh“, později); obdélník sdílející roh s jinou čárou zůstane čarami. Katalog I1.2 a příklad I2/12 doplněny na pokyn uživatele.
- **Chyby od uživatele:** „Tvar nakreslený u stávající stěny zůstane samostatný bez výplně (přidání nefunguje, vybrání ano)“ – obrázek: oba tvary byly uzavřené (i se stranou po líci), program uměl jen otevřenou čáru ze tří stran. Opraveno, testy `tools/lineTool.test.ts`.

### 2026-11-13 (2) – oprava: výstupek ven, zarovnání s rohem při kreslení
- **Co se změnilo:** Nástroj Čára přichytí konec úseku na líc stěny jen, když se k líci vrací; na samotnou čáru stěny se nepřichytává (jen na líce). Při kreslení po pomocné čáře (stěna i čára) se konec zase zarovná svisle / vodorovně s jiným rohem (fialové vodítko).
- **Viditelně v aplikaci:** výstupek ven od stěny vznikne i mělký (dřív se úsek „přilepil“ zpět na líc); čtverec – konec třetí stěny se srovná pod začátek první.
- **Rozhodnuto samostatně:** přichycení na líc platí pro konec úseku, jehož začátek je od líce aspoň 2× dál než konec; zarovnání s rohy má přednost před zaokrouhlením délky na 10 mm.
- **Po kontrole revieweru opraveno:** Čára se dál napojuje na oblouky a kruhy (na líce přichytává jen u rovných stěn s tloušťkou); úsek začínající na líci nekončí na protějším líci téže stěny (hluboké vybrání neprojde celou tloušťkou).
- **Otevřené:** ověřit na tabletu.
- **Chyby od uživatele:** „Přidání (výstupek) nefunguje – tvar zůstane samostatný bez výplně.“ Příčina: u mělkého výstupku (pod tolerancí přichycení) se konce úseků přichytily zpět na líc / čáru stěny. „Zmizelo přichycení ke koncovému bodu – třetí čára čtverce se nesrovná se začátkem první.“ Příčina: od kreslení s pomocnými čarami (C1.5) se na zachycené čáře nepočítalo zarovnání s rohy. Obojí opraveno, testy `tools/lineTool.test.ts`.

### 2026-11-13 – výstupek / vybrání stěny a nástroj Čára (sekce I)
- **Co se změnilo:** Uživatel schválil sekci I katalogu celou („Schvaluji vše“). Nový prvek `Protrusion` (`Floor.protrusions`, SCHEMA_VERSION 10) s obrysem v souřadnicích stěny (`core/protrusion.ts`); tělo stěny ho zahrne (`applyProtrusions` ve `wallBody.ts`: líc se v šířce nekreslí, výstupek se vyplní, vybrání vyřízne). Nový nástroj Čára (`wallTool` v režimu čáry, `addLine` v `store/actions/protrusions.ts`). Výstupek se přenáší při sloučení / rozdělení stěny a kopíruje se se stěnou.
- **Viditelně v aplikaci:** v liště nástroj **Čára**. Čára z líce stěny zpět na týž líc (i vnější, u osy uprostřed jen líc těla) se po posledním úseku sama změní na výstupek (ven) nebo vybrání (do těla) – při kreslení šedý náhled a čárkovaná uzavírací čára. Vybraný výstupek je modrý, má kóty (odstup před, šířka, odstup za, hloubka; ťuknutím NumPad) a panel (šířka, hloubka, výška, název, materiál, poznámka, Smazat).
- **Rozhodnuto samostatně:** čára se kreslí úsek po úseku tažením (žádné tlačítko Hotovo – výstupek vznikne sám po úseku, který dosedne na líc); NumPad kót výstupku jde v pořadí odstup před → šířka → odstup za → hloubka; šířka se mění od okraje u rohu A; hloubka úměrně (i u nepravoúhlého tvaru); vybrání nejvýš přes celou tloušťku; přehození strany stěny nechá výstupek na „své“ straně (posune se s tělem); výstupek nejde táhnout (jen kótami).
- **Po kontrole revieweru opraveno:** výstupek jde začít / ukončit v rohu stěny (u0 = 0); obrys přes konec stěny zůstane čarou; kóty nepustí výstupek za konec stěny ani přes sousední výstupek; výstupek na stěně změněné na tloušťku 0 / oblouk se jen skryje (smaže se jen se stěnou); kóty výstupku se řídí vypínačem kót; testy rohu, hranic, dělení přes výstupek a přehození strany.
- **Otevřené:** oblouk v obrysu výstupku (úchyt vzepětí na úseku obrysu, I1.10) zatím chybí – úseky jsou rovné; výstupek přes roh / na oblouku / kopie v řadě (I1.11, později); výstupek nejde vybrat obdélníkem ani kopírovat samostatně (jen se stěnou); po zkrácení stěny může výstupek přečnívat přes konec (kreslí se, ale kóta za ním je záporná).
- **Chyby od uživatele:** žádné.

### 2026-11-13 – výstupek / vybrání: pravidla a příklady do katalogu (jen dokumentace)
- **Co se změnilo:** Do `KATALOG-STEN.md` přidána sekce „I. Výstupek a vybrání“ (pravidla I1.1–I1.14, příklady I2/1–11) podle `KRESLENI-VYSTUPKU.md`. Čeká na schválení uživatelem, pak testy a implementace.
- **Viditelně v aplikaci:** nic.
- **Rozhodnuto samostatně (návrhy k potvrzení, v katalogu označené ?):** nový nástroj Čára (v aplikaci chybí) jako lomená čára tloušťky 0, oblouky v obrysu až dodatečně úchytem vzepětí (I1.10); výstupek drží odstup od konce A jako otvory (I2/6); výstupek na protějším líci se posouvá se změnou tloušťky (I1.7); zásah do otvoru se nezakazuje (I1.14); data jako `Floor.protrusions` v souřadnicích stěny (odstup po líci + hloubka) se zvýšením SCHEMA_VERSION.
- **Otevřené:** schválení sekce I uživatelem.
- **Chyby od uživatele:** žádné.

### 2026-11-12 (konec sezení)
- **Co se změnilo:** Uživatel potvrdil, že vše funguje, a ukončil sezení. Aktualizován Poslední stav a fronta kroků (výstupek z jiného sezení zařazen jako první, kóta polohy napojení, D3, líce).
- **Viditelně v aplikaci:** nic nového (souhrn sezení viz záznamy níže).
- **Rozhodnuto samostatně:** pořadí fronty (výstupek první, protože je schválený; pak kóta polohy napojení, která po zrušení dělení chybí).
- **Otevřené:** vyzkoušet vše na tabletu; fronta kroků v Posledním stavu.
- **Chyby od uživatele:** žádné nové.

### 2026-11-12 (noc, 5) – kreslení libovolným směrem, křížení stěn (C1.5)
- **Co se změnilo:** Uživatel potvrdil předchozí kroky („vše funguje“). Nástroj Stěna kreslí libovolným směrem; pomocné čáry (`drawLinesFrom` v `core/dragResolve.ts`: vodorovně / svisle, pokračování a kolmice stěn v počátečním rohu, kolmice ⊥ k blízkým stěnám) se zachycením a hysterezí jako při tažení konce. Zarážky pomocných čar i na obloucích. Křížení dvou stěn s tloušťkou se počítá z geometrie (`wallCrossings` ve `floorQueries`): obě stěny zůstanou celé, těla se spojí bez čar uvnitř (C1.5, C2/11 už není nález), křížení patří do grafu skupin a místností. Oblouky se kreslí jemněji (64 úseků).
- **Viditelně v aplikaci:** stěna jde nakreslit šikmo; blízko vodorovného / svislého směru se přilepí na fialovou čárkovanou čáru (tučná = zachyceno), u kolmice ke stěně ikona ⊥; konec u stěny / oblouku se na ni přichytí a napojí. Stěny nakreslené nebo protažené přes sebe (i přes oblouk) se v křížení spojí bez čar uvnitř. Z nastavení zmizel přepínač „Pravé úhly (90°)“.
- **Rozhodnuto samostatně:** přepínač Pravé úhly zrušen (nahrazen pomocnými čarami); křížení jen u stěn s tloušťkou (čáry bez tloušťky se nespojují); křížení se neukládá, počítá se – přesune se samo s posunem stěn; konec dál než 5 mm od průsečíku = křížení, blíž = konec (T se řeší napojením).
- **Otevřené:** přichytávání k oběma lícům stěny (připomínka uživatele) – odloženo, souvisí s polohou napojeného rohu (dnes na ose) a s dalšími kroky (okna, zkrátit/prodloužit do rohu D3); vyčnívající konec po protažení přes stěnu zatím ručně (D3).
- **Po kontrole revieweru opraveno:** body uprostřed stěn (napojené rohy, křížení) se slučují podle polohy (`junctionPoints`) – tři stěny v bodě i T na kříži jsou jeden spoj; kreslené hrany stěn ve spojích se navíc ořežou o těla ostatních stěn (`clipInsideEdges`) – žádná čára uvnitř ani u ostrých křížení a u oblouku protnutého dvakrát; řešič přes křížení neprochází (samostatná stěna se zase neposouvala s větví); kreslení bez tichého srovnání do os pod 4°, při zachycené čáře u stěny se konec napojí na stěnu; místnost se najde i přes přesahující uzavírací stěnu; křížení se hledá i blízko konců, vynechá se jen skutečné napojení; mezipaměť těl, křížení a spojů pro hotové výkresy; odstraněno nepoužívané nastavení `ortho`.
- **Chyby od uživatele:** „Nová stěna jde kreslit jen vodorovně nebo svisle.“ Opraveno (testy `tools/wallTool.draw.test.ts`). „Stěny nakreslené přes sebe se nespojí, např. stěnu protaženou přes oblouk nepřipojím.“ Opraveno (testy `core/crossings.test.ts`, C2/11).

### 2026-11-12 (noc, 4) – oblouky se při napojení také nedělí
- **Co se změnilo:** Napojení na oblouk funguje stejně jako na rovnou stěnu: roh má `Node.host`, oblouk zůstane jedna stěna. `wallBodies` počítá virtuální konce oblouku (tečna, soustředné kružnice), líce se přeruší jen u napojené stěny; při změně vzepětí roh sleduje oblouk (průsečík napojené stěny s kružnicí). Migrace spojí i staré rozdělené oblouky (`mergeArcAt`). `attachOrSplitAtNode` přejmenováno na `attachAtNode` (už nic nedělí).
- **Viditelně v aplikaci:** oblouk s napojenou příčkou je jeden (jedna kóta, jeden úchyt vzepětí, vybírá se celý); prohloubení oblouku příčku prodlouží a nechá napojenou. Staré výkresy: rozdělené oblouky se po načtení spojí.
- **Rozhodnuto samostatně:** spojený starý oblouk má délku jako náčrt (změřené tětivy částí se nesčítají – součet tětiv není délka tětivy celku).
- **Po kontrole revieweru opraveno:** zadání délky příčky napojené na hlubší oblouk ji odtrhlo (řešič bral jako směr oblouku spojnici ke koncům, teď tečnu v rohu – oblouk se posune s příčkou); SCHEMA_VERSION 9 – spojování se zopakuje i pro výkresy uložené verzí 8 (ta ještě dělila oblouky); `mergeArcAt` nespojí překrývající se oblouky; zastaralé komentáře o dělení. Testy v `store/hosting.test.ts`.
- **Otevřené:** začátek nové stěny přesně ve vrcholu oblouku chytí úchyt vzepětí (známé); změna průměru kruhu posune i cizí roh, který náhodou leží přesně na obvodu (stará drobnost, `resizeCircle`) – napojit se dá kousek vedle vrcholu nebo kreslením směrem k oblouku; kóta polohy napojení (viz níže).
- **Chyby od uživatele:** „Oblouky také nerozděluj, je to zbytečné.“ Hotovo, testy v `store/hosting.test.ts` (napojení na oblouk, změna vzepětí, migrace rozděleného oblouku); test z minulého kroku, který hlídal dělení oblouku, přepsán na pokyn uživatele.

### 2026-11-12 (noc, 3) – změna rozměru hýbe upravovaným objektem, ne zbytkem výkresu
- **Co se změnilo:** Řešič délek („gumička“, `core/solver.ts`) posouval jako „volnou větev“ vše, k čemu se nedalo dojít od pevného rohu – tedy i samostatné místnosti. Teď posouvá jen to, co je napojené na posouvaný roh.
- **Viditelně v aplikaci:** při zadání rozměru se mění jen upravovaná místnost / stěna; jiné samostatné místnosti a stěny zůstanou na místě.
- **Rozhodnuto samostatně:** nic.
- **Otevřené:** —
- **Chyby od uživatele:** „Když změním rozměr, upravovaný objekt zůstane na místě a pohybuje se vše ostatní (druhá samostatná místnost se posune).“ Opraveno, test `core/solver.groups.test.ts`.

### 2026-11-12 (noc, 2) – T-napojení bez dělení průběžné stěny
- **Co se změnilo:** Na požadavek uživatele se stěna při kolmém napojení jiné stěny už **nedělí**. Napojený roh nese `Node.host` (ID průběžné stěny, `core/hosting.ts`); tělo v místě napojení počítá `wallBodies` virtuálními konci, graf skupin / místností / řešiče `wallSegments`. Po každé úpravě `syncHosted` (v `store.edit`) drží napojený roh na průběžné stěně. SCHEMA_VERSION 8, migrace `joinSplitWalls` spojí staré rozdělené stěny zpět.
- **Viditelně v aplikaci:** průběžná stěna s napojenou příčkou je jedna (jedna kóta, jde vybrat, posunout a smazat celá); při posunu ji napojená stěna sleduje (prodlouží / zkrátí se), při posunu podél sebe napojení zůstane na místě. Staré výkresy: rozdělené stěny se po načtení spojí (změřené délky se sečtou).
- **Rozhodnuto samostatně:** oblouky se při napojení dál dělí (rozdělený oblouk se tvaruje jako celek); rozpojení konce (Nespojený) na T odpojí napojenou stěnu i fyzicky, Spojený ji znovu napojí; roh odtažený ze stěny se odpojí, přetažený na stěnu se napojí; zkrácením průběžné stěny za napojení se napojení zruší; kopie bez průběžné stěny je samostatná; migrace spojuje jen části se stejnou tloušťkou, stranou, osou, stylem a popiskem (bez rozpojeného konce).
- **Po kontrole revieweru opraveno:** migrace starého křížení „+“ spojí jen jednu průběžnou dvojici (roh zůstane společný); zadání délky příčky mezi dvěma stěnami posune protější průběžnou stěnu (řešič vidí napojený roh); průběžná stěna změněná na oblouk se v napojených rozích rozdělí (rohy na oblouku); dorovnání v pořadí řetězu napojení; tolerance 5 mm, když se pohne roh i stěna (otočení); migrace spojí i rozdělené čáry bez tloušťky; `wallSegments` jedním průchodem. Testy v `store/hosting.test.ts` (Zpět/Vpřed, řešič, oblouk, otočení, kříž, idempotence, čáry).
- **Otevřené:** poloha napojení se na průběžné stěně zatím nekótuje (dřív ji ukazovaly kóty částí) – navrhnout řetězovou kótu napojení s NumPadem; F4 (otvory při dělení) se tím zjednodušuje (dělení jen u oblouků).
- **Chyby od uživatele:** „Stěna se při kolmém napojení rozdělí na dvě a rozdělení zůstane i po odpojení; při posunu se hýbe jen kousek, v Revitu celá stěna.“ Opraveno: napojení stěnu nedělí, staré rozdělení spojí migrace. Testy `store/hosting.test.ts`, C2/5 a C2/14 bez dělení v `wallJoins.catalog.test.ts`. Tři testy z tohoto sezení, které hlídaly staré dělení (`wallAxis`, `wallFaceLength`, `selectTool.drag`), přepsány na nové chování podle pokynu uživatele (katalog beze změny).

### 2026-11-12 (noc) – tažení s držením směru, posun stěny, kolmice (D11, D12, D13, C2/16)
- **Co se změnilo:** Uživatel potvrdil opravu D14. Nová čistá funkce `resolveDragPoint` (`core/dragResolve.ts`): zachycení na pomocné čáře, držení s hysterezí, uvolnění, zarážky na průsečících se stěnami; použitá v nástroji Vybrat pro tažení rohu a posun celé stěny.
- **Viditelně v aplikaci:** při tažení konce stěny se ukáže fialová čárkovaná pomocná čára původního směru (u rohu více stěn jedna pro každou stěnu); konec se na ni „lepí“, zachycená čára je tučná; v pravém úhlu k blízké stěně se přichytí a ukáže ikona ⊥, konec dosedne přesně na stěnu (a rozdělí ji). Podržení pera 0,7 s na místě zachycení uvolní. **Vybranou** stěnu jde tažením za tělo posunout celou (přichytí se ke směru stěny nebo kolmo na něj).
- **Rozhodnuto samostatně:** posun celé stěny jen u už vybrané stěny (ochrana proti nechtěnému posunu na tabletu); u rohu více stěn se ostatní stěny otáčejí kolem svých vzdálených konců (otevřená otázka v `KRESLENI-EDITACE-KONCU.md`, zvolen návrh); „magnet“ = stávající vypínač Přichytávat v nastavení (vypne i pomocné čáry); rovnoběžnost s blízkými stěnami se nenabízí (jen kolmice, jak říká D13).
- **Otevřené:** použít `resolveDragPoint` i při kreslení nové stěny (nástroj Stěna má zatím vlastní přichytávání); naladit poloměry na tabletu (10 px pero, 16 px prst, uvolnění 2×, prodleva 0,7 s).
- **Po kontrole revieweru doplněno:** časovač prodlevy se ruší při zrušení / novém gestu a nepřevezme cizí tažení (úchyt oblouku); po uvolnění prodlevou přesná poloha pod perem (ne krok 10 mm); posun stěny vypnut pro část rozděleného oblouku; testy přednosti rohu, rohu dvou stěn, odděleného rohu a prodlevy (600 ms ještě drží).
- **Chyby od uživatele:** žádné. (Při ověření v prohlížeči nalezena a opravena chyba: kolmice ke dvěma rovnoběžným stěnám splývaly a nabízela se jen ta ke vzdálené – test v `core/dragResolve.test.ts`.)

### 2026-11-12 (večer) – výběr konce u rozpojeného rohu (D14)
- **Co se změnilo:** Uživatel potvrdil, že osy fungují. Opravena nahlášená chyba u rozpojeného rohu: ťuknutí na roh teď bere v úvahu, co je vybrané (`chooseNodeAt`, `nextNodeAt` v `core/floorQueries.ts`, `pickAny(..., current)`).
- **Viditelně v aplikaci:** u rozpojeného rohu se po výběru stěny ťuknutím na roh vybere konec **té** stěny; další ťuknutí na stejné místo přepne na konec druhé stěny; tažením se hýbe jen vybraným koncem.
- **Rozhodnuto samostatně:** vybraný roh se při dalším dotyku drží (aby šel táhnout), na druhý konec se přepne až po ťuknutí bez tažení. Přepínání ťuknutím jen v nástroji Vybrat (v nástrojích Stěna/tvary ťuknutí jen vybírá).
- **Po kontrole revieweru doplněno:** přednost konce vybrané stěny platí i při otevřeném NumPadu délky stěny (ťuknutí na roh = který konec se posune), u výběru skupiny (tažení za roh táhne skupinu) a v nástrojích tvarů; testy `tools/selectTool.d14.test.ts`.
- **Otevřené:** zbytek kroku „tažení a posun jako blok“ (D2, D11, D12, D13, C2/16).
- **Chyby od uživatele:** „U rozpojených stěn šel vybrat koncový bod jen u stěny, u které se rozpojení nastavilo; u druhé se vybrala zase ta první.“ Příčina: dva rohy na stejném místě a výběr bral vždy ten naposled vytvořený. Opraveno podle katalogu D14 (přednost konce vybrané stěny + přepínání opakovaným ťuknutím), testy `core/nodePick.test.ts`, ověřeno v prohlížeči.

### 2026-11-12 – osa stěny, kóty po líci, pracovní postup
- **Co se změnilo:** Stěna může mít osu na líci nebo uprostřed tloušťky. U osy uprostřed se dá kótovat a zadat i míra po líci. Nastaven samostatný pracovní postup (CLAUDE.md, reviewer, `/pokracuji`, `/konec`, deník změn).
- **Viditelně v aplikaci:** přepínač Osa Líc | Střed v menu Stěny a v panelu stěny; u vybrané stěny s osou uprostřed čerchovaná osa a modré klikací kóty „líc“; celková délka má podpis „osa“; u osy uprostřed chybí dvojitá šipka a tlačítko „Strana těla“.
- **Rozhodnuto samostatně:** viz sekce „Rozhodnuto samostatně“ (záznamy 2026-11-12).
- **Otevřené:** vyzkoušet na tabletu; další krok tažení a posun jako blok (D2, D11–D14).
- **Chyby od uživatele:** zatím žádné.

## Poslední stav (2026-11-18, sezení 3)

**Hotové (na webu):** opravy kótování od uživatele – výchozí posouvaný bod volné kóty (8), poslední kóta řetězu okna posune okno (10), **zamčená volná kóta = pevné spojení** (11, uživatel potvrdil), kóta ke druhé čáře dvojité čáry (12), kóta k hraně výstupku / vybrání (13), posun stěny kótou u otevřeného půdorysu (14). Testy 680, typecheck a build OK. SCHEMA_VERSION 22.

**Rozpracované:** nic.

**Čeká na vyzkoušení:** kóta ke druhé čáře dvojité čáry (12), kóta k hranám výstupků (13); dříve: vybrání v rohu, kóty výstupku v rohu / na konci; na tabletu vše od 2026-11-14.

**Fronta kroků:**
1. **Chyby kótování od uživatele** – mají přednost.
2. Volná kóta – doplnit: oblouky (i výstupky na oblouku) (líc obloukové stěny, oblouk kresby), kopie a výběr obdélníkem, odsazení tažením i ve Vybrat, úhlopříčka se zachováním délek stěn (řešič). Později část B KOTY-ZAMEK-EXPORT.md (hlavní kóta pro export) s exportem DXF / PDF.
3. Pevné spojení i pro ostatní zamčené kóty (stěny, výstupky, napojení)? – otázka pro uživatele.
4. Drobnosti: řetězová kóta polohy napojení i u oblouku; Do rohu / K hraně pro oblouky; řetězová kóta užšího otvoru při vypnutém vnitřním ostění; posun otvorů řetězem nehlídá výstupky / napojené příčky.

## Předchozí stav (2026-11-18, konec sezení 2)

**Hotové (na webu):** kresba, D3 K hraně, napojení na líc oblouku – uživatel vyzkoušel na PC. Kóty výstupku v rohu a na konci stěny (Deník 2026-11-18 (2)), vybrání v rohu (3), volná kóta / úhlopříčka (4), kóta přichycená k hranám jako v CAD (5), šířka okna / ostění / zárubeň se zámkem na jedné straně (6, 7). Testy 618, typecheck a build OK. SCHEMA_VERSION 21.

**Rozpracované:** nic.

**Čeká na vyzkoušení:** nástroj Kóta (uživatel ho zkouší a bude hlásit chyby kótování), vybrání v rohu, kóty výstupku v rohu / na konci (PC); na tabletu vše od 2026-11-14.

**Fronta kroků:**
1. **Chyby kótování od uživatele** (začne je hlásit v příštím sezení) – mají přednost.
2. Volná kóta – doplnit: hrany výstupků, oblouky (líc obloukové stěny, oblouk kresby), druhá čára dvojité čáry, kopie a výběr obdélníkem, odsazení tažením i ve Vybrat, úhlopříčka se zachováním délek stěn (řešič). Později část B KOTY-ZAMEK-EXPORT.md (hlavní kóta pro export) s exportem DXF / PDF.
3. Drobnosti: řetězová kóta polohy napojení i u oblouku; Do rohu / K hraně pro oblouky; řetězová kóta užšího otvoru při vypnutém vnitřním ostění.

## Předchozí stav (2026-11-18, volná kóta)

**Hotové (na webu):** kresba, D3 K hraně, napojení na líc oblouku – uživatel vyzkoušel na PC. Kóty výstupku v rohu a na konci stěny (2026-11-18 (2)), vybrání v rohu (3), volná kóta / úhlopříčka (4), kóta na hranách (5), šířka okna / ostění se zámkem (6, 7) – **čeká na vyzkoušení**. Testy 618, typecheck OK. SCHEMA_VERSION 21.

**Rozpracované:** nic.

**Čeká na vyzkoušení:** kóty výstupku v rohu / na konci, vybrání v rohu, nástroj Kóta (PC); na tabletu vše od 2026-11-14.

**Fronta kroků:**
1. Volná kóta – doplnit podle zkoušky uživatele: hrany výstupků, oblouky, druhá čára dvojité čáry, kopie, výběr obdélníkem, odsazení tažením i ve Vybrat; úhlopříčka se zachováním délek stěn (řešič). Později část B KOTY-ZAMEK-EXPORT.md (hlavní kóta pro export) s exportem DXF / PDF.
2. Drobnosti: řetězová kóta polohy napojení i u oblouku; Do rohu / K hraně pro oblouky; řetězová kóta užšího otvoru při vypnutém vnitřním ostění.

## Předchozí stav (2026-11-15, konec sezení)

**Hotové (na webu, uživatel vyzkoušel na PC a potvrdil „vše funguje“):** výstupek při přehození strany (Deník 2026-11-15 (1)); F4 – prvky nesené stěnou při zkrácení / dělení / smazání, centrálně `core/carried.ts` (2); úklid velkých souborů + test velikosti `src/sizeGuard.test.ts` (3); C1.11 hrana odskoku (4); F7 upozornění u prvku blízko rohu – otvory i výstupky (5, 6); výstupek přes roh I1.11 (7); kreslení řetězem A2 / A10 / B6 (8); nástroj Rozdělit D4 (9); kopírování výstupku v řadě (10); výstupek přes volný konec stěny (11). Testy 476, žádný `it.fails`, typecheck a build OK. SCHEMA_VERSION 16.

**Rozpracované:** nic.

**Čeká na vyzkoušení na tabletu:** vše z 2026-11-14 a 2026-11-15 (na PC ověřeno uživatelem); u kreslení řetězem délka lišty Stěny na užším displeji.

**Nová pravidla práce (CLAUDE.md):** „Pravidlo pro průřezové funkce“ (jedno centrální místo, tabulka pravidlo × prvek, nic nerozhodovat sám, výjimky vypsat) – popis metody v `metoda-pruchozi-funkce.md`; „Velké soubory“ (nad ~500 řádků nejdřív rozdělit čistým přesunem v samostatném commitu).

**Fronta kroků:**
1. D3 doplnit: zkrátit jen jednu stěnu k hraně druhé (T místo L); případně řetězová kóta užšího otvoru při vypnutém vnitřním ostění.
2. Napojení na líc obloukové stěny (zatím jen rovné stěny).
3. Kóty výstupku v rohu a na konci stěny na výkrese; vybrání v rohu.
4. Kóty: volná kóta / úhlopříčka (POZADAVKY.md) – zámek je připravený; později část B KOTY-ZAMEK-EXPORT.md (hlavní kóta pro export) spolu s exportem DXF / PDF.

## Předchozí stav (2026-11-14, konec sezení)

**Hotové (na webu):** šířka okna = otvor ve stěně, rám uvnitř, bez kót rámu (Deník (17)); nová stěna se přichytí a napojí i na protější líc jiné stěny, roh na líci (`Node.hostFace`, schéma 14, Deník (18)) – uživatel vyzkoušel a potvrdil. Kótování (zámky, řetěz otvorů, celková kóta) uživatel potvrdil jako funkční. Testy 355 + 1 `it.fails` (C2/6), typecheck a build OK.

## Předchozí stav (2026-11-14 – úpravy oken, dveří, ostění, displeje)

**Hotové (na webu po push; na PC ověřeno v náhledu, na tabletu neověřeno):** NumPad u všech číselných polí + tlačítko 000; oprava pravého ostění ve značce; ostění vnitřní / vnější zvlášť (schéma 12); francouzské okno s křídlem (panty, dovnitř / ven); rám okna pevně 50 mm (schéma 13); plná čára v lících u okna; Nevypínat displej (Wake Lock, výchozí zapnuto). Reviewer: nálezy opraveny. Testy 280 + 1 `it.fails` (C2/6), typecheck OK.

**Čeká na vyzkoušení uživatelem (tablet):** všech 7 úprav – podrobnosti v Deníku změn 2026-11-14 (1–8). Zvlášť Nevypínat displej (jen přes https, tedy na GitHub Pages).

**Hotové navíc (2026-11-14):** D3 – nástroj „Do rohu“ (viz Deník změn (9)); **zámek kót** místo „změřeno × náčrt“ (Deník (10), KOTY-ZAMEK-EXPORT.md) a řetěz otvorů se zámky (Deník (11)–(16)). Vše čeká na vyzkoušení. Testy 338 + 1 `it.fails`.

**Fronta kroků:**
1. ~~Přichytávání k oběma lícům stěny~~ – hotovo 2026-11-14 (18); zbývá líc oblouku.
2. **Výstupek při přehození strany stěny** (rozhodnout, zda zůstává na svém líci).
3. **F4** (otvory při dělení stěny), **C1.11** (hrana odskoku, test C2/6 `it.fails`).
4. Z auditu: F7, D4, A2 / A10 / B6; výstupek přes roh / kopie v řadě (I1.11).
5. D3 doplnit: zkrátit jen jednu stěnu k hraně druhé (T místo L); případně řetězová kóta užšího otvoru při vypnutém vnitřním ostění.
6. Kóty: volná kóta / úhlopříčka (POZADAVKY.md) – zámek je připravený; později část B KOTY-ZAMEK-EXPORT.md (hlavní kóta pro export) spolu s exportem DXF / PDF.

## Předchozí stav (2026-11-13, konec sezení)

**Hotové (vše na webu; uživatel zkoušel průběžně na PC, na tabletu neověřeno):** výstupek / vybrání stěny jako samostatný prvek (`Floor.protrusions`, schéma 11, katalog sekce I) – nástroj **Čára**, převod otevřené čáry, uzavřeného tvaru i plného obdélníku u líce / přes líc, obrys přes celou tloušťku = výstupek na protějším líci, rovné i obloukové stěny (I1.15), oblouk v obrysu (úchyt vzepětí, I1.10), kóty a panel; zarovnání konce s rohem na pomocné čáře; kóta polohy T-napojení na průběžné stěně (posun příčky číslem). Testy 260 + 1 `it.fails` (C2/6), typecheck a build OK.

**Rozpracované:** nic.

**Čeká na vyzkoušení uživatelem (tablet):** výstupky na rovné i obloukové stěně (oba líce, tvar přes líc, obdélník), oblouk v obrysu, kóta polohy napojení. Pozor na starou verzi PWA v mezipaměti (zavřít a otevřít aplikaci, případně načíst dvakrát).

**Fronta kroků (pořadí):**
1. **D3** – samostatný nástroj zkrátit / prodloužit do rohu (vyčnívající konce po křížení).
2. **Přichytávání k oběma lícům stěny** u nástroje Stěna (připomínka uživatele) – zároveň poloha napojeného rohu mimo osu; souvisí s D3 a okny.
3. **Výstupek při přehození strany stěny** (nález revieweru): rozhodnout, zda má výstupek při přehození strany (ručně i automaticky po uzavření místnosti, u oblouku se mění i vzepětí) zůstat na svém líci ve výkresu.
4. **F4** (otvory při dělení stěny).
5. **C1.11** (hrana odskoku; test C2/6 je `it.fails`).
6. Z auditu: F7, D4, A2 / A10 / B6. Doladit okna (ostění / rám). Výstupek přes roh / kopie v řadě (I1.11).

**Známé drobnosti:** začátek nové stěny přesně ve vrcholu oblouku chytí úchyt vzepětí; `resizeCircle` posune cizí roh přesně na obvodu; dlouhá rovná strana tvaru, která protne líc oblouku dvakrát, se ořízne nepřesně; nástroj Obdélník u oblouku výstupek udělá jen přes líc (strana nemůže ležet na zakřiveném líci); kóty výstupku na straně kót stěny se mohou překrývat; Vite z OneDrive občas pošle starý soubor → restart vývojového serveru.

## Předchozí stav (2026-11-12, konec sezení)

**Hotové (uživatel vše vyzkoušel na PC a potvrdil „vše funguje“; na tabletu neověřeno):** osa stěny líc / střed a kóty po líci (B1, B4, B10, 2a, 2b); výběr konce u rozpojeného rohu (D14); tažení s držením směru, posun vybrané stěny, kolmice ⊥ (D11, D12, D13, C2/16); T-napojení bez dělení průběžné stěny i oblouku (`Node.host`, `core/hosting.ts`, migrace na schéma 9); řešič délek nehýbe jinými skupinami; kreslení nové stěny libovolným směrem s pomocnými čarami; křížení stěn bez dělení (C1.5, `wallCrossings`, `junctionPoints`, ořez hran). Podrobnosti v Deníku změn. Testy 186 + 1 `it.fails` (C2/6), typecheck a build OK.

**Rozpracované:** výstupek / vybrání a nástroj Čára hotové, opraveno přidání výstupku a zarovnání s rohem (2026-11-13), **čeká na vyzkoušení uživatelem**, oblouk v obrysu (I1.10) hotový – vše **čeká na vyzkoušení uživatelem**.

**Fronta kroků (pořadí):**
1. **D3** – samostatný nástroj zkrátit / prodloužit do rohu (vyčnívající konce po křížení).
2. **Přichytávání k oběma lícům stěny** (připomínka uživatele) – zároveň vyřešit polohu napojeného rohu mimo osu; souvisí s D3 a okny.
3. **F4** (otvory při dělení stěny – napojení už nedělí, dělí se jen výslovně).
4. **C1.11** (hrana odskoku; test C2/6 je `it.fails`; u středových os odskok symetricky).
5. Z auditu: F7, D4, A2 / A10 / B6. Dále doladit okna (ostění / rám).
6. **Výstupek při přehození strany stěny** (nález revieweru): ověřit / rozhodnout, zda má výstupek při přehození strany (ručně i automaticky po uzavření místnosti, u oblouku se tím mění i vzepětí) zůstat na svém líci ve výkresu.

**Známé drobnosti:** začátek nové stěny přesně ve vrcholu oblouku chytí úchyt vzepětí; změna průměru kruhu posune i cizí roh ležící přesně na obvodu (`resizeCircle`); sloupec „Stav“ v katalogu (B1/B4/B10, C1.5) je zastaralý – katalog se bez pokynu uživatele nemění; Vite z OneDrive občas pošle starý soubor → restart vývojového serveru.

## Předchozí stav (2026-11-12 – osa stěny líc / střed, kóty 2a + 2b)

**Hotovo (čeká na vyzkoušení uživatelem):**
- **Pracovní postup** nastaven: `CLAUDE.md` (samostatnost, kdy se ptát / zastavit), `INDEX.md`, agent `reviewer` (`.claude/agents/`), příkazy `/pokracuji` a `/konec`, sdílená oprávnění `.claude/settings.json`.
- **Osa stěny (B1, B4, B10, C2/12–15)**: nepovinné `Wall.axis?: 'center'` (chybí = líc, SCHEMA_VERSION zůstává 7). `core/wallBody.ts`: `bodyRange`, `bodyStart`; napojení v rozích počítá s osou. Akce `setWallAxis` (osa a rohy zůstanou, posune se tělo; strana se pamatuje, návrat na líc ji vrátí). Přepínač **Osa Líc | Střed** v menu Stěny (`settings.wallAxis`) a v panelu stěny. Osa uprostřed se kreslí čerchovaně jen u vybrané stěny. Otvory, kóta tloušťky a hloubky ostění jdou přes celé tělo. Dělení stěny osu přenáší, rovné pokračování se slučuje jen při stejné ose.
- **Kóty 2a**: celková délka zůstává uzel–uzel po ose, u osy uprostřed s podpisem „osa“.
- **Kóty 2b**: u vybrané rovné stěny s osou uprostřed jsou navíc dvě klikací kóty „líc“ (vnější za celkovou délkou, vnitřní na druhé straně). Zadání míry líce dopočítá délku osy (posune konec B, `setFaceLength` v `store/actions/numpad.ts`, jeden krok Zpět); `measured` = výsledná délka osy. `WallBody.faces`, `faceLength`.
- Testy: C2/12–15 v `wallJoins.catalog.test.ts`, `store/wallAxis.test.ts`, `store/wallFaceLength.test.ts` → 102 + 2 it.fails. Ověřeno v prohlížeči (T napojení středem na střed, přepnutí osy v panelu, okno ve stěně s osou uprostřed, zadání líce 1400 → osa 1550). **Na tabletu neověřeno.** Reviewer: krok osa bez závažných nálezů, drobnosti opraveny.
- Pozor: Vite z OneDrive znovu poslal starý soubor (`faceLength is not defined`) – pomohl restart `npm run dev` (viz CLAUDE.md).

## Rozhodnuto samostatně
(Rozhodnutí mimo katalog, udělaná bez uživatele – nejnovější nahoře. Uživatel je může kdykoli změnit.)
- 2026-11-18: Kóty výstupku v rohu / na konci: změna rozměru mění v poměru jen dotčenou část obrysu; přesah za čelo se kótuje u prvního líce; odstupy od sousedů se u nich nekótují. Napojení na líc platí i pro oblouk (líc = soustředný oblouk). D3 K hraně: nejdřív upravovaná stěna, pak hrana; konec mimo délku druhé stěny se neprovede.
- 2026-11-17: Kresba – viz Deník 2026-11-17 (1)–(6) (výchozí hodnoty dvojité čáry, sada barev, pořadí výběru, rozsah migrace).
- 2026-11-15: Výstupek při přehození strany stěny: platí I1.7 beze změny (zůstane na své straně, posune se s lícem); jen při automatickém překlopení oblouku po uzavření místnosti se výstupek zrcadlí s obloukem (zůstane na vnějším líci).
- 2026-11-14: Napojení na líc jen u rovných stěn a jen pro stěnu vedoucí od líce ven; po přehození strany / změně tloušťky průběžné stěny jede roh s lícem (napojená stěna se prodlouží / zkrátí). Šířka okna bez migrace dat (existující okna se zúží o 100 mm, i u zamčených kót); okno s rámem min. 200 mm.
- 2026-11-14: Zámek kót – přepsání zamčené kóty v NumPadu po druhém potvrzení, zámek zůstane (dokument navrhoval zrušení – uživatel nerozhodl); tažení prvku se zamčenou kótou se blokuje průběžně; další drobná rozhodnutí v Deníku změn (10).
- 2026-11-13: Čárkovaný obdélník (překlad) u líce zůstane čarami (uzavřený tvar = výstupek schválil uživatel, I1.2).
- 2026-11-13: Výstupek – čára se kreslí tažením úsek po úseku, výstupek vznikne sám po úseku, který dosedne na líc (bez tlačítka Hotovo); NumPad kót: odstup před → šířka → odstup za → hloubka; šířka se mění od okraje u rohu A, hloubka úměrně; výstupek nejde táhnout (jen kóty); přehození strany stěny ho nechá na „své“ straně (ven od těla, posune se s tělem); na stěně bez tloušťky / oblouku se jen nekreslí.
- 2026-11-12: D11 – „kolmo na původní směr“ a „vodorovně / svisle“ se nabízí jen u konce jediné stěny; u rohu více stěn jen jejich původní směry (přehlednost) a kolmice k blízkým stěnám.
- 2026-11-12: D12 – kruh a část rozděleného oblouku se posunem stěny nehýbou (oblouk se tvaruje jako celek úchytem).
- 2026-11-12: Na pomocné čáře se poloha zaokrouhlí na 1 mm v x a y (u šikmé stěny odchylka do 0,7 mm – zanedbatelné).
- 2026-11-12: D12 – celou stěnu jde tažením posunout jen, když je už vybraná (ochrana proti nechtěnému posunu).
- 2026-11-12: D11 – u rohu více stěn se při tažení po čáře jedné stěny ostatní otáčejí kolem svých vzdálených konců.
- 2026-11-12: Vypnutí pomocných čar = stávající vypínač Přichytávat (nastavení), žádné nové tlačítko magnetu; rovnoběžnost s okolními stěnami se nenabízí.
- 2026-11-12: D14 – už vybraný roh se při dalším dotyku drží (kvůli tažení); na překrývající se roh se přepne až ťuknutím bez tažení, a to jen v nástroji Vybrat.
- 2026-11-12: Stěna s osou uprostřed se při uzavření místnosti neotáčí „ven“ (`orientLoopOutward`) – strana se jen pamatuje, aby se po návratu na líc vrátila ta původní.
- 2026-11-12: Přichycení u B10 = na čáru / střed čáry cílové stěny (u osy uprostřed je to přímo osa). Zvláštní bod „střed těla“ u cílové stěny s osou na líci se nepřidal (stávající přichycení na střed čela volného konce zůstává).
- 2026-11-12: Kóty líců (2b) jen u vybrané stěny a jen u rovné; oblouk s osou uprostřed má jen kótu po ose.
- 2026-11-12: U osy uprostřed se skryje dvojitá šipka a tlačítko „Strana těla“ (strana nemá viditelný účinek, jen se pamatuje).
- 2026-11-12: Rovné pokračování se slučuje jen při stejné ose (jinak dvě stěny).
- 2026-11-12: Test C2/14 ověřuje konec B na kreslených čarách – výplň těla vede přes roh jako u C2/5 (leží uvnitř těla A, nic nepřečnívá).
- 2026-11-12: `CLAUDE.md` existoval – nepřepsán, jen doplněn o cíl, nasazení a pracovní postup.

## Předchozí stav (2026-11-11 – oprava kóty odstupu u odděleného rohu)

**Chyba z krok 1 opravena (čeká na vyzkoušení):** přes oddělený roh ležela kóta „odstup skupiny“ (`core/components.ts` → `drawComponentDims.ts`, NumPad `comp-gap`; ne `shiftJunction`) a bránila ťuknutí na roh. Teď: `visibleComponentGap` – kóta se nekreslí (ani nenabízí) u skupin s odděleným koncem a při nulovém odstupu; ostatní kóty beze změny. Obecně: v `input/pointer.ts: handleOverlayTap` má roh pod perem (`findNodeNear`, `HIT_PX.node`) přednost před klikacími kótami. Testy: `core/components.test.ts` (+3 → 88 + 2 it.fails). Ověřeno v prohlížeči (L-roh před/po odpojení, tažení za roh posunulo jen uzel odděleného konce). **Krok 2 (osa stěny): návrh odeslán, čeká se na schválení (3 otázky: kóty 2a/2b, kreslení osy, zapamatování strany).**

## Předchozí stav (2026-11-11 – C1.13 fyzicky oddělený konec)

**Známé (2026-11-11):** detekce uzavřených smyček pro natočení těl ven (`orientLoopOutward`) se na oddělených (nespojených) rozích může zlomit; plochy a obvody místností se neřeší (automatické vytváření a počítání místností není potřeba – katalog).

**Hotovo (čeká na vyzkoušení):** katalog + `KRESLENI-EDITACE-KONCU.md` commitnuté. Krok 1 podle nového pořadí uživatele: **nespojený konec má vlastní uzel** – `setWallNoJoin` (`actions/walls.ts`) při zapnutí vytvoří stěně nový uzel na stejných souřadnicích, při přepnutí zpět uzly sloučí (pokud tam není jiný oddělený konec); `mergeNodeIfCoincident` a `getOrCreateNode` (`actions/shared.ts: nodeHasNoJoin`) označený konec samy nespojí. Testy: `store/noJoin.test.ts` (+4), C2/10 rozšířen (+1) → 85 + 2 it.fails. Ověřeno v prohlížeči (uzly 3 → 4 → 3). Pozn.: starý projekt s příznakem na sdíleném uzlu se kreslí správně, ale uzel zůstane sdílený, dokud se přepínač nepřepne; místnosti (rooms) přes oddělený roh zatím neřešeno.

**Další kroky (pořadí uživatele):** 2) osa stěny (B1/B4/B10, C2/12–15) – nejdřív návrh datového modelu a čekat na schválení; 3) tažení a posun jako blok (D2, D11–D13, C2/16, `resolveDragPoint`) – nejdřív návrh; 4) F4, D3, C1.11, C1.5.

## Předchozí stav (2026-11-11 – audit stěn, fáze 3, krok C1.6 + E7)

**Hotovo (čeká na vyzkoušení uživatelem):** „nespojovat konec“. Model: nepovinná pole `Wall.noJoinA?: true` / `noJoinB?: true` (bez zvýšení SCHEMA_VERSION, chybí = napojuje se jako dřív, stávající projekty beze změny). `core/wallBody.ts: wallBodies` – konec s příznakem se z napojení v uzlu vyřadí a uzavře vlastním čelem kolmo na čáře líce; zbylé konce v uzlu se napojují mezi sebou (jediný zbylý = také čelo). `core/topology.ts`: dělení stěny dává příznak původním koncům (nový roh uprostřed ho nemá), sloučení rovného pokračování přenese příznak vzdáleného konce. Akce `setWallNoJoin(wallId, end, noJoin)` v `store/actions/walls.ts`; panel stěny má přepínač **Konec A / B: Spojený | Nespojený**, nabízí se jen tam, kde se na konci stýká další stěna s tloušťkou (nebo je už vypnutý). Test C2/10 už není `it.todo` (80 testů prochází + 2 `it.fails`). Ověřeno v prohlížeči (L-roh 300+300: po vypnutí dvě samostatná těla s čárou mezi nimi). **Nad rámec návrhu nic; T-napojení používá stejný přepínač (konec se zastaví na líci jako volný konec) – v prohlížeči neověřeno.** Další krok fáze 3: F4 (otvory při dělení stěny) – až po potvrzení uživatele.

## Předchozí stav (2026-11-11 – audit stěn, fáze 1 a 2)

**Fáze 2 hotová (zastaveno, čeká na uživatele):** `src/core/wallJoins.catalog.test.ts` – testy z příkladů C2/1–11 (79 testů prochází, 2 `it.fails` = nálezy C2/6 hrana odskoku a C2/11 křížení, 1 `it.todo` = C2/10 odpojení; nic neopraveno). **Hotová i oprava D10/E3:** popisek stěny na výkrese zrušen (`drawDims.ts`), typ/materiál/poznámka jen v panelu, tloušťka jen jako kóta u vybrané stěny. Pořadí fáze 3 schváleno: D10/E3 ✔ → C1.6+E7 → F4 → C1.11 → F7 → D2 → D3 (nástroj) → D4 → A2/A10/B6 → C1.5 (nakonec). Katalog a zadání auditu jsou teď v repozitáři. Po jednom kroku se zastavit a nechat uživatele vyzkoušet.

**Audit stěn podle `KATALOG-STEN.md` (zadání `ZADANI-AUDIT-STEN.md`):** hotová **fáze 1** = jen dokument `AUDIT-STEN.md` (v kódu nic neměněno). Výsledek: hotovo 29, částečně 8, chybí 5 (C1.5 křížení, C1.6+E7 nespojovat konec, D3 zkrátit/prodloužit, F7 upozornění u rohu), rozpor D10/E3 (typ a materiál se kreslí na výkrese v `drawDims.ts: wallLabelText`) a C1.11 (hrana odskoku se nekreslí – naměřeno). **Čeká se na souhlas uživatele s pořadím** (návrh v `AUDIT-STEN.md`), pak **fáze 2** (testy z příkladů C2/1–11, bez oprav). Zadání a katalog (`KATALOG-STEN.md`, `ZADANI-AUDIT-STEN.md`) jsou zatím necommitnuté soubory uživatele. Pravidla: katalog a testy neupravovat, po každé fázi se zastavit.

## Předchozí stav (2026-11-11 – oblouková stěna)

**Oprava napojení na obloukovou stěnu (poznatek uživatele s obrázkem):** stěny napojené na oblouk se špatně ořezávaly (hrana zajela do těla oblouku, mezera u stěny procházející tělem, škvíra pod příčkou), protože roh se počítal z tečny oblouku. Teď se hranice obloukové stěny při napojení berou jako **skutečné kružnice** (průsečík přímka × kružnice / kružnice × kružnice nejbližší rohu, jako v Revitu) a hranice oblouku se v místě napojení **ořízne** (vynechají se body lomené čáry za koncovým bodem). `core/wallBody.ts`: `Boundary`, `intersectBoundaries`, `paramOnArc`. Současně opravena starší chyba `arcChain`: u přesného **půlkruhu** rozděleného napojením se určila opačná strana vyklenutí (úchyt vzepětí se kreslil pod obloukem) – strana se teď určí podle vrcholu části řetězu. +3 testy (68). Ověřeno v prohlížeči (příčka z líce ven, z líce dovnitř přes tělo, ve vrcholu).

**Doplněno (požadavek uživatele – chytací bod uprostřed oblouku):** úchyt pro tažení vzepětí byl dřív jen u **vybrané** stěny, takže po nakreslení nebyl vidět. Teď je **úchyt uprostřed každého oblouku pořád** (světle modrý, u vybrané stěny tmavší a větší), při nástroji Stěna i Vybrat; tažením se mění vzepětí, ťuknutím bez tažení se stěna vybere. Rozdělený oblouk má jeden úchyt ve vrcholu celého řetězu. `arcHandles` v `core/arcChain.ts` (+ test), `arcUnderPen` / `drawArcHandle` ho používají. 65 testů. Ověřeno v prohlížeči (tažení 820 → 400 bez výběru). Pozn.: začátek nové stěny přesně ve vrcholu oblouku teď chytí úchyt – kdyby vadilo, řešit.

**Požadavek uživatele:** oblouková stěna patří do **menu Stěny** (ne mezi tvary), kreslí se stejně jako rovná stěna, jen má navíc **výšku oblouku**. Rozhodnutí: oblouk se ve výchozím stavu **vyklene ven, na stranu těla** (překlopení perem otočí tělo i vyklenutí spolu; vyklenutí jde otočit v panelu).

**Hotovo:**
- Menu Stěny: přepínač **Rovná / Oblouková** (`settings.wallShape`, v zařízení) a u obloukové pole **Výška oblouku** (`Project.wallArcHeight`, výchozí 500, mimo historii – `setWallArcHeight`). Lišta se na úzkém displeji zalomí.
- Nástroj Stěna v režimu Oblouková: náhled oblouku (modrá čára líce, šedé tělo podél oblouku), vzepětí = výška oblouku na stranu těla (max. půlkruh), překlápění perem jako u rovné; rovné pokračování se u oblouku neslučuje.
- `core/wallBody.ts`: tělo i pro obloukové stěny (`facePath` – lomená čára s tečnami, napojení podle tečny na konci, hranice těla jako odsazené oblouky), `facePointAt`, `WallBody.snaps` (body přichytávání bez vzorků oblouku). Po uzavření místnosti se u oblouku s tělem otočí i vyklenutí (zůstane ven s tělem). Kruhy a tvary zůstávají čárami.
- Panel stěny: pole Tloušťka i u obloukové stěny, vzepětí zaokrouhlené (dřív ukazovalo `500.0000000000001`). Dvojitá šipka u oblouku mimo vrchol (tam je úchyt vzepětí), kóta tloušťky kolmo k oblouku.
- +4 testy (64). Ověřeno v prohlížeči (náhled a překlopení oblouku, místnost s obloukovou stěnou – tělo i vyklenutí ven, výběr, panel). **Na tabletu neověřeno.** Otvory do obloukových stěn zatím nejdou (jako dřív).

## Předchozí stav (2026-11-10, noc – sloučení rovného pokračování stěny)

**Uživatel potvrdil (2026-11-10): „vše funguje“** – stěny s tloušťkou, menu Stěny, otvory skrz tělo, kreslení s náhledem a překlápěním perem, sloučení rovného pokračování. **Další krok si uživatel vybere:** oblouk s tloušťkou (rozhodnuto, že bude potřeba), nebo dle `ZADANI-OKNA-DVERE.md` úpravy modelu pro 3D, značky detailů, schodiště.

**Připomínka uživatele:** když se kreslení stěny přeruší a naváže se na její koncový bod se stejnou tloušťkou, mají se stěny sloučit do jedné (jinak by šlo každou část překlopit zvlášť).

**Hotovo:** rovné pokračování (stejný směr, stejná tloušťka, volný konec stěny – v rohu není jiná stěna) se při dokončení **sloučí do jedné stěny** (`mergeStraightAt` v `core/topology.ts`, `straightContinuation` v `core/wallBody.ts`); platí i pro kreslení proti směru ke konci jiné stěny a na obou koncích najednou. Zůstane původní stěna (strana těla, zámek strany, popisek), otvory zůstanou na svém místě, změřená délka se zruší (náčrt), mezilehlý roh zmizí. Během takového pokračování se tělo perem nepřeklápí (náhled ukazuje stranu navazující stěny). Zalomení nebo jiná tloušťka = dvě stěny spojené rohem jako dřív. +3 testy (61). Ověřeno v prohlížeči. **Na tabletu neověřeno.**

## Předchozí stav (2026-11-10, noc – kreslení stěny rovnou s tloušťkou, překlápění perem)

**Připomínka uživatele:** stěna se kreslila jako čára a tloušťka se přidala až po dokončení; chce rovnou kreslit tloušťku a překlápět ji perem na jednu či druhou stranu (osa = čára líce modře, zbytek šedě).

**Hotovo:** nástroj Stěna při tažení ukazuje **modrou čáru líce** a **šedé tělo** v aktuální tloušťce. Když se pero odchýlí od přichycené čáry o víc než 10 px (`FLIP_PX` v `tools/wallTool.ts`), tělo se **překlopí na stranu pera**; bez odchýlení platí automatická strana (`initialSideAt` – navázání na tah, jinak ven od středu). U přichycení konce na roh / stěnu / zvláštní bod se strana už nemění. Strana zvolená perem se uloží jako ručně zvolená (`addWall(..., { side })` → `sideLocked`), takže ji uzavření místnosti nepřeklopí. `core/wallBody.ts`: `sideFromPen`, `initialSideAt` (+ testy). 58 testů. Ověřeno v prohlížeči (náhled, překlopení během tahu, uložená strana). **Na tabletu ověřit:** zda 10 px není příliš citlivé (třes ruky by mohl stěnu zamknout na nechtěnou stranu) – případně zvětšit `FLIP_PX`.

## Předchozí stav (2026-11-10, noc – krok 1: otvory skrz tělo stěny)

**Rozhodnutí uživatele:** rám **okna bez ostění sedí u vnitřního líce** (dveře se zárubní dál uprostřed tloušťky); kóty tloušťky stěny a hloubky ostění **jen u vybraného prvku**.

**Hotovo (krok 1):**
- Otvor ve stěně s tloušťkou se kreslí **skrz celé tělo**: tělo se v otvoru vyčistí, oba líce se přeruší, okraje stěny po stranách (2 px), čerchované čáry v obou lících; dveře/okna se zárubní/rámem přes `drawFramed` s T = tloušťka stěny (ostění z obou líců, šedé „zuby“ zdiva u zárubně/rámu), **průchod** jen okraje a čerchované čáry, dveře/okna bez rámu (starší) také přes tělo. `openingThickness` = tloušťka stěny (u čar null → kreslení jako dřív).
- **Nika** ve stěně s tloušťkou patří k líci: výchozí **vnitřní líc** (zahlubuje se do těla), tlačítko „Líc niky“ přepne na vnější líc (`drawNicheInBody`, `swing` ve směru těla = líc A).
- Výchozí strany: dveře se otevírají do místnosti (od těla), nika na vnitřním líci; zapnutí ostění ve stěně s tloušťkou nechá zárubeň/rám na místě (hloubka zevnitř = jeho odsazení).
- **Vkládání a výběr otvoru ťuknutím kamkoli do těla** (`wallForOpening`, `pickOpening` s pásem tloušťky) – nástroje Dveře/Okno/Otvor/Nika i Vložit.
- Kóty (jen u vybraného, `drawBodyDims`): **tloušťka** vybrané stěny (klikací → NumPad cíl `wall-thickness`), **hloubky ostění** vybraného otvoru zevnitř/zvenku (klikací). Panel otvoru: „Hloubka zevnitř / zvenku“, NumPad popisky „od vnitřního / vnějšího líce“; tlačítka „Strana rámu / Strana ostění“ jen u stěn bez tloušťky.
- Testy `store/openingsInBody.test.ts` (+4), upraven test výchozí polohy rámu okna. 56 testů, typecheck OK. Ověřeno v prohlížeči na PC (dveře do 150/200 stěny, okno do 300 stěny + ostění + kóta, nika, tloušťka přes kótu a panel, Zpět). **Na tabletu neověřeno.**

**Známé / další:** dvojitá šipka u vybrané stěny může překrýt otvor uprostřed stěny; oblouky s tloušťkou zatím ne (dle rozhodnutí zařadit – zeptat se, zda teď); pak dle `ZADANI-OKNA-DVERE.md` úpravy modelu pro 3D, značky detailů, schodiště.

## Předchozí stav (2026-11-10, noc – krok 0 hotový, část 0d: zrušení příček)

**Hotovo (0d):** nástroje **Příčka** a **Dvojčára** jsou zrušené (příčka = stěna s malou tloušťkou z menu Stěny). Odstraněno: `core/pairing.ts`, `core/partition.ts`, `tools/partitionTool.ts`, `ui/panels/PartitionPanel.tsx` (+ jejich testy), `Wall.part`, akce `addPartition/applyPartition/setPartitionStyle`, nastavení `partThickness/partSide`, kreslení otvorů „na druhém líci“, kóta tloušťky příčky, vkládání přes druhou čáru (`toPrimary`). `SCHEMA_VERSION` = 7, migrace 6→7 odstraní `part` (staré čáry příček zůstanou čárami s tloušťkou 0 a otvory na své čáře – výkresy jsou jen zkušební; čáru jde vybrat a v panelu jí dát tloušťku). `openingThickness` zatím vrací null (otvor se kreslí jen na líci) – v kroku 1 bude tloušťka stěny. 52 testů, typecheck, build OK; v prohlížeči ověřeno (lišta bez Příčky/Dvojčáry, staré projekty se načtou, výběr staré čáry, kóty).

**Pozor (vývoj na OneDrive):** po hromadné úpravě souborů skriptem Vite změnu nezachytil a posílal starý kód (chyba `twinOffset is not defined`). Pomohl restart `npm run dev`. Zapsáno do `CLAUDE.md`.

**Krok 0 (stěny s tloušťkou) je tím hotový.** **Další krok: krok 1 – otvory a ostění ve stěně s tloušťkou** (`ZADANI-OKNA-DVERE.md`): otvor se vkládá ťuknutím na čáru líce i do těla, uloží se jednou a kreslí se skrz celé tělo (přerušení obou líců, dveře/okna se zárubní/rámem přes tloušťku, ostění z obou líců = `doorLayout` s T = tloušťka stěny), nika na vnitřním líci (ze strany místnosti), kóta hloubky ostění na výkrese. Před začátkem krátce navrhnout a zeptat se na nejasnosti. Potom (dle rozhodnutí) oblouk s tloušťkou.

## Předchozí stav (2026-11-10, noc – krok 0, část 0c: menu Stěny)

**Hotovo (0c):** při nástroji Stěna je v liště nad plátnem **menu tloušťky**: předvolby 100 / 150 / 200 / 300 + vlastní (pole „Vlastní“ přidá předvolbu a hned ji vybere, vlastní předvolby mají křížek k odebrání). Aktuální tloušťka je označená, nové stěny se kreslí jí. Uloženo **s projektem** (nepovinná pole `Project.wallThickness`, `Project.wallPresets`, bez změny schématu); výběr **není v historii Zpět/Vpřed** (`store.editProjectSettings`, `restore` zachová nastavení). Kód: `model/factory.ts` (`WALL_PRESETS`, `activeWallThickness`, `wallPresets`), `store/actions/project.ts`, `ui/ToolOptions.tsx`, CSS `.wall-options`. Test `store/wallPresets.test.ts`. 57 testů. Ověřeno v prohlížeči (stěna 100, vlastní 450, uložení po obnovení stránky). **Na tabletu neověřeno.**

**Další krok:** ~~0d~~ (hotovo), pak krok 1.

## Předchozí stav (2026-11-10, noc – krok 0, části 0a + 0b: stěny s tloušťkou)

**Rozhodnutí uživatele (zapsaná v `KRESLENI-STEN-NAVRH.md`):** migrované stěny bez tloušťky 300 mm; příčky slučovat automaticky; nika výchozí na vnitřním líci; Obdélník/Kruh/Oblouk zatím čáry bez tloušťky; **stěny s tloušťkou budou potřebovat minimálně oblouk** (zařadit později); výplň těla světle šedá; dvojitá šipka jen u vybrané stěny; **stávající výkresy jsou jen zkušební** – migrace je nemusí věrně zachovat, stačí, že se načtou.

**Hotovo (0a + 0b):**
- Model (`SCHEMA_VERSION` = 6): `Wall.thickness` (mm, 0 = čára/tvar), `Wall.side` (1/−1 = strana těla vůči normal(a→b)), `Wall.sideLocked` (ručně přehozeno). `WallLabel.thickness` zrušeno. Migrace 5→6 v `persistence/migrate.ts` (tvary, čárkované/čerchované čáry a čáry příček = 0, jinak tloušťka z popisku nebo 300; těla uzavřených místností ven) + test.
- `core/wallBody.ts` (+ 9 testů): obrys těla, napojení v rohu (konce kolem rohu seřazené podle úhlu, sousední hranice se protnou = miter; L, T, X, různé tloušťky; čáry uvnitř spojů se nekreslí; u T vede obrys přes roh, aby nezůstal klín), `findBodyAt` (ťuknutí do těla), `bodySnapPoints` (vnější rohy + středy čel volných konců → přidány do zvláštních bodů přichytávání), `initialSide` (navazuje na tah, jinak ven od středu ostatních rohů), `orientLoopOutward` (po uzavření místnosti otočí těla všech stěn smyčky ven, kromě ručně přehozených).
- Nástroj Stěna kreslí stěny 300 mm (`DEFAULT_WALL_THICKNESS`, menu předvoleb přijde v 0c). Rozdělení stěny přenáší tloušťku a stranu.
- Kreslení: výplň `#d4d4d8`, líce 2 px, vybraná stěna modře; **dvojitá šipka** přes tělo vybrané stěny (klikací, `HitAction 'flipWall'`). Kóty se u stěny s tělem na straně kót odsunou za vnější líc. Popisek „tl. …“ z `Wall.thickness`.
- Panel stěny: pole **Tloušťka** (změna drží čáru líce) a tlačítko **⇅ Strana těla** (rovné stěny). Akce `setWallThickness`, `flipWallSide`.
- Ověřeno v prohlížeči na PC: místnost ze 4 stěn (po uzavření těla ven), vnitřní stěna do T, výběr ťuknutím do těla, šipka, tloušťka 150, načtení starého zkušebního projektu. 55 testů, typecheck, build OK. **Na tabletu neověřeno.**

**Známé (patří do dalších částí):** otvory se zatím kreslí jen na čáře líce a šedé tělo je pod nimi vidět (krok 1: otvor skrz celé tělo); dveře/okno se vkládá jen ťuknutím na čáru líce, ne do těla (krok 1); přichycení na libovolný bod vnějšího líce zatím ne (jen rohy a čela); oblouk s tloušťkou zatím ne.

**Další kroky:** ~~0c – menu Stěny~~ (hotovo); 0d – převod/odstranění příček a dvojčár (Příčka, Dvojčára, `Wall.part`, `pairing.ts`); pak krok 1 (otvory skrz tělo). Oblouk s tloušťkou zařadit po kroku 1 (zeptat se).

## Předchozí stav (2026-11-10, noc – krok −1: rozdělení souborů)

**Zadání se změnilo:** platí aktualizovaný `ZADANI-OKNA-DVERE.md` a `KRESLENI-STEN-NAVRH.md` (při rozporu má přednost). Spárovaná příčka i dvojčára se **ruší**, nově budou jen **stěny s tloušťkou**. Pořadí: (−1) rozdělení velkých souborů → (0) stěny s tloušťkou + migrace příček → (1) otvory a ostění ve stěně s tloušťkou.

**Hotovo – krok −1 (beze změny chování):**
- `src/store/actions.ts` → složka `src/store/actions/`: `walls.ts` (stěny, příčky, tvary, oblouky, popisky, posun rohů/skupin), `copy.ts` (otočení, kopírování, schránka otvorů), `delete.ts`, `openings.ts`, `rooms.ts`, `texts.ts`, `floors.ts`, `numpad.ts`, `shared.ts` (`getOrCreateNode`, `cleanup`, `MERGE_TOL`). `index.ts` znovu exportuje přesně těch 39 veřejných jmen co dřív; pomocné funkce mezi soubory (`setStartFromA`, `setReveal`, `resizeCircle`…) ven nejdou. Importy `'…/store/actions'` se nemusely měnit.
- `src/ui/panels/SidePanel.tsx` (85 řádků, jen vybírá panel; panel skupiny a rohu zůstal v něm) + `WallPanel.tsx`, `PartitionPanel.tsx`, `OpeningPanel.tsx`, `TextPanel.tsx`, `RoomPanel.tsx`, `common.ts` (`close`, `LINE_STYLES`; `SidePanel` dál re-exportuje `LINE_STYLES` pro `ToolOptions`).
- Kontrola: skript porovnal řádky kódu (nic nechybí, nic nepřibylo), žádné kruhové importy. 45 testů, typecheck, build OK. V prohlížeči na PC vyzkoušeno: kreslení stěn, příčka, dveře do příčky, okno + přepnutí na francouzské + ostění, kopírování a vložení okna do jiné stěny, text, kopie stěny, otočení a smazání skupiny; konzole bez chyb. `CLAUDE.md` – aktualizovaná struktura.
- `selectTool.ts` (242 ř.), `drawPlan.ts` (407 ř.), `drawDims.ts` (323 ř.) jsou pod ~500 řádků → ponechány.

**Další krok: krok 0 – stěny s tloušťkou** (`KRESLENI-STEN-NAVRH.md`). Otevřené body uživatel rozhodl (zapsáno v `KRESLENI-STEN-NAVRH.md`): migrované stěny bez tloušťky = 300 mm, dvojčáry a spárované příčky se slučují automaticky, nika výchozí na vnitřní líc. Pravidlo v `CLAUDE.md` „tloušťka se graficky nekreslí“ změnit na „kreslí se vždy“.

## Předchozí stav (2026-11-10 – ostění, příčka, dveře, okna)

**Hotovo – okna s rámem (2026-11-10, druhý počítač):** podle obrázku uživatele má okno stejnou značku jako dveře se zárubní, jen místo křídla je **čára skla uprostřed hloubky rámu** (`drawFramed` v `drawPlan.ts`, dřív `drawFramedDoor`). Okno má `frame` jako dveře (výchozí `WINDOW_FRAME` 50 × 50 mm, otvor = ostění L + rám + okno + rám + ostění P). Ostění, odsazení rámu, hloubky z obou líců v příčce fungují stejně jako u dveří (`core/doorLayout.ts`). Nový druh **`french` = Francouzské okno** (stejná značka, výchozí parapet 50 mm, výška 2200, šířka 900; číslování O1, O2… společné s okny). Nástroj Okno má v liště nad plátnem volbu Okno / Francouzské okno (`settings.windowKind`), v panelu okna přepínač Druh (přepnutí nastaví výchozí parapet). Okno ve stěně kreslené jednou čarou: rám začíná v líci a jde do stěny; výchozí strana = ven od středu výkresu (`outwardSwing`), přepíná se tlačítkem „Strana rámu“. Starší okna bez `frame` se kreslí postaru (bez migrace, jako u dveří). Bez změny schématu. 45 testů. Ověřeno v prohlížeči na PC, **na tabletu neověřeno**. Přidán `.claude/launch.json` (náhled dev serveru v Claude).

**Zadání:** `ZADANI-OKNA-DVERE.md` (ostění → spárovaná příčka → úpravy modelu pro 3D → značky detailů/schodiště → předměty/výstupy). Rozhodnutí uživatele: odstup otvoru se měří k okraji celého otvoru (včetně ostění); strana ostění přepínačem (dveře podle směru otevírání, okno tlačítkem „Strana ostění“); nika v příčce jen na jednom líci; **dvojčára zůstává beze změny** a přibude samostatný nástroj **Příčka** (dvě spárované čáry, dveře/okna se vloží jednou a kreslí na obou lících) – staré dvojčáry se nepřevádějí.

**Konec sezení 2026-11-10:** dveře se zárubní uživatel odzkoušel a funguje to (po úpravě: čerchované čáry v líci i bez ostění, plné čáry prahu mezi zárubněmi, `frame.offset` = odsazení zárubně od líce A bez ostění). ~~Další krok: doladit okna~~ (hotovo, viz výše). **Další krok:** uživatel vyzkouší okna na tabletu. Poté dle `ZADANI-OKNA-DVERE.md` model pro 3D, detaily, výstupy.

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
