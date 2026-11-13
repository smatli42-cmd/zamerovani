# Postup práce (předávací deník mezi počítači)

Projekt je na OneDrive a uživatel střídá dva počítače (nikdy ne současně).
**Na začátku sezení tento soubor přečti. Na konci práce (nebo po větším kroku) ho aktualizuj.**
Nejnovější záznam je nahoře v sekci „Poslední stav“, starší jdou do „Historie“.

## Deník změn
(Nejnovější nahoře, starší záznamy se nemažou. Formát: datum – co se změnilo · viditelně v aplikaci · rozhodnuto samostatně · otevřené · chyby od uživatele.)

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

## Poslední stav (2026-11-12, konec sezení)

**Hotové (uživatel vše vyzkoušel na PC a potvrdil „vše funguje“; na tabletu neověřeno):** osa stěny líc / střed a kóty po líci (B1, B4, B10, 2a, 2b); výběr konce u rozpojeného rohu (D14); tažení s držením směru, posun vybrané stěny, kolmice ⊥ (D11, D12, D13, C2/16); T-napojení bez dělení průběžné stěny i oblouku (`Node.host`, `core/hosting.ts`, migrace na schéma 9); řešič délek nehýbe jinými skupinami; kreslení nové stěny libovolným směrem s pomocnými čarami; křížení stěn bez dělení (C1.5, `wallCrossings`, `junctionPoints`, ořez hran). Podrobnosti v Deníku změn. Testy 186 + 1 `it.fails` (C2/6), typecheck a build OK.

**Rozpracované:** výstupek / vybrání a nástroj Čára hotové (2026-11-13), **čeká na vyzkoušení uživatelem**; chybí oblouk v obrysu (I1.10).

**Fronta kroků (pořadí):**
1. **Oblouk v obrysu výstupku** (I1.10): úchyt vzepětí na úseku obrysu vybraného výstupku (`ProfilePt` + vzepětí úseku, vykreslení, kóta).
2. **Kóta polohy napojení na průběžné stěně** (od zrušení dělení se poloha příčky na stěně nekótuje) – řetězová kóta s NumPadem.
3. **D3** – samostatný nástroj zkrátit / prodloužit do rohu (vyčnívající konce po křížení).
4. **Přichytávání k oběma lícům stěny** (připomínka uživatele) – zároveň vyřešit polohu napojeného rohu mimo osu; souvisí s D3 a okny.
5. **F4** (otvory při dělení stěny – napojení už nedělí, dělí se jen výslovně).
6. **C1.11** (hrana odskoku; test C2/6 je `it.fails`; u středových os odskok symetricky).
7. Z auditu: F7, D4, A2 / A10 / B6. Dále doladit okna (ostění / rám).

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
