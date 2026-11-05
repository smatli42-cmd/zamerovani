# Zaměřování – seznam požadavků

Značky:
- ✅ = už je v prvním prototypu (převezmeme, případně vylepšíme)
- 💡 = nový návrh
- **[MVP]** = patří do první použitelné verze, ostatní později

Doplňuj klidně přímo sem – škrtej, přepisuj, přidávej do sekce „Moje doplnění“ na konci.

---

## 0. Základní principy
- 💡 **[MVP]** Offline aplikace (PWA) – nainstaluje se na plochu tabletu, funguje bez internetu.
- 💡 **[MVP]** Data se nikdy neztratí – automatické ukládání po každé změně.
- 💡 **[MVP]** Primárně Galaxy Tab S9 FE + S-Pen, ale funkční na jakémkoli tabletu (Android i iPad) a na PC s myší.
- 💡 **[MVP]** Program rozdělený na oddělené části (data / výpočty / kreslení / nástroje / panely / export), aby šel snadno rozšiřovat.
- 💡 Rychlost na stavbě je víc než krása – co nejméně ťuknutí na jeden rozměr.

## 1. Projekty a organizace
- 💡 **[MVP]** Seznam projektů (zakázek) – název, adresa, datum zaměření, kdo měřil, poznámka.
- 💡 **[MVP]** Projekt obsahuje více **podlaží** (1.PP, 1.NP, 2.NP, podkroví…), každé podlaží = jeden půdorys.
- 💡 Kopírování obrysu podlaží jako podkladu pro další podlaží (průsvitně).
- 💡 Duplikace / smazání / archivace projektu.

## 2. Kreslení půdorysu (stěny)
- ✅ **[MVP]** Kreslení stěn tažením stylusu, minimální délka 5 cm.
- ✅ **[MVP]** Rovnání do pravých úhlů (90°) – zapnout/vypnout.
- ✅ **[MVP]** Přichytávání na existující rohy a na hrany stěn, vodítka (zarovnání s jinými rohy).
- ✅ **[MVP]** Posun rohu tažením, sloučení rohů při přetažení na sebe.
- ✅ Obdélník jedním tahem (jako stěny nebo jako pomocný tvar).
- ✅ Oblouková stěna (vzepětí zadané číslem nebo tažením úchytu).
- ✅ Rozdělení stěny na úseky v místě napojení jiné čáry, vyříznutí jen jednoho úseku.
- ✅ Odbočení příčky ze středu stěny (napojení na hranu).
- 💡 **[MVP]** **Popisek stěny** – tloušťka (pokud jde změřit), materiál, typ (obvodová / nosná / příčka / SDK / neověřeno), volná poznámka. Graficky se tloušťka nekreslí.
- 💡 Úhel stěny zadaný číslem (pro šikmé stěny místo úhlopříčky).
- 💡 Plynulé kreslení navazujících stěn („řetěz“) – konec jedné stěny = začátek další bez zvednutí pera nebo dvojklikem.

## 3. Kótování a měření
- ✅ **[MVP]** Číselná klávesnice (NumPad) po ťuknutí na stěnu/kótu, podpora `+` a `−` (např. 1200+800).
- ✅ **[MVP]** Volba, který roh se posune (A→B, B→A, od středu, auto) i ťuknutím na roh.
- ✅ **[MVP]** „Další kóta / Tab“ – postupné zadání všech stěn místnosti dokola.
- ✅ **[MVP]** Rozlišení načrtnuto (~) vs. změřeno, upozornění na nesoulad.
- ✅ **[MVP]** Řetězové kóty: ostění – otvor – meziostění – ostění + celková délka.
- ✅ Úhlopříčky pro zachycení šikmých (nepravoúhlých) místností.
- ✅ Odemčení změřené kóty zpět na náčrt.
- ✅ Nastavitelná velikost písma kót.
- ✅ Psaní čísel z klávesnice / Bluetooth dálkoměru v režimu klávesnice.
- 💡 **[MVP]** Přehled „co ještě není změřeno“ – zvýraznit nezměřené stěny/otvory.
- 💡 *(odloženo – současný dálkoměr FIELDMANN FDLM 1040 Bluetooth nejspíš nemá)* Přímé napojení laserového dálkoměru přes Bluetooth (Leica DISTO, Bosch GLM…) – jen pokud by v budoucnu přibyl dálkoměr s Bluetooth.
- 💡 Chytrý řešič geometrie – vyrovná všechny změřené délky + úhlopříčky najednou a ukáže, kde a o kolik měření „nesedí“ (chyba uzávěru místnosti).
- 💡 Volná kóta mezi libovolnými dvěma body (např. roh – sloup).
- 💡 Výškové kóty (±0,000, rozdíl podlah, schod mezi místnostmi).
- 💡 Tloušťka stěny změřená v otvoru (špaleta) → automaticky se propíše do popisku stěny.

## 4. Otvory ve stěnách
- ✅ **[MVP]** Dveře, okno, volný otvor, nika – vložení ťuknutím na stěnu.
- ✅ **[MVP]** Odstup od rohu A nebo B, šířka, výška, parapet, hloubka niky.
- ✅ **[MVP]** Rychlé předvolby šířek a popisků (1-dílné, 2-křídlé, posuvné…).
- ✅ **[MVP]** Dveře: strana pantů, směr otevírání.
- ✅ Tažení otvoru po stěně, posun se zachováním rozestupů ostatních otvorů.
- ✅ Sestava oken vedle sebe s odstupem 0 mm.
- 💡 **[MVP]** Automatické číslování otvorů (O1, O2… / D1, D2…) a **výpis otvorů** (tabulka).
- 💡 Výška nadpraží, hloubka ostění/špalety, šířka zárubně.
- 💡 Další typy: posuvné dveře do pouzdra, dvoukřídlé dveře, střešní okno, vrata.

## 5. Další prvky výkresu
- ✅ **[MVP]** Pomocné čáry – plná / čárkovaná / čerchovaná, 3 tloušťky (překlady, průvlaky, trámy, podhledy).
- ✅ Dvojitá čára jedním tahem (překlad / průvlak přes místnost).
- ✅ Kružnice (kruhový sloup), vzdálenost sloupu od stěny.
- ✅ Přímé schodiště – délka, šířka, počet stupňů, výška stupně, směr výstupu.
- 💡 **[MVP]** Volný text kdekoli na výkresu.
- 💡 Knihovna symbolů: komín, šachta, WC, umyvadlo, vana, sprcha, kuchyňská linka, radiátor, kotel, elektro rozvaděč, plynoměr, vodoměr…
- 💡 Lomené a točité schodiště.
- 💡 Šipka severu, značka řezu.

## 6. Místnosti
- ✅ **[MVP]** Štítek místnosti – název + více světlých výšek s poznámkou.
- ✅ Předvolby názvů (Obývák, Kuchyň, Koupelna…).
- 💡 **[MVP]** Automatické rozpoznání místnosti z uzavřených stěn → **plocha (m²) a obvod**.
- 💡 **[MVP]** Číslo místnosti (1.01, 1.02…).
- 💡 Povrchy: podlaha, stěny, strop (materiál/stav), poznámka.
- 💡 Výpis místností (tabulka s plochami) – do PDF i DXF.

## 7. Konstrukční detaily
- ✅ **[MVP]** Značka detailu v půdorysu (D1, D2…) s názvem.
- ✅ **[MVP]** Samostatná skica detailu – pero, přímka, text, kóta, guma, zoom/posun, barvy, zpět.
- ✅ Poznámky k detailu (skladba, materiály), předvolby názvů.
- 💡 Fotka jako podklad skici detailu (kreslení přímo přes fotku).
- 💡 Volitelně detail jako řez stěnou s vrstvami (skladba konstrukce).

## 8. Fotografie
- 💡 **[MVP]** Vyfotit přímo z aplikace (fotoaparát tabletu) nebo vybrat z galerie.
- 💡 **[MVP]** Značka fotky v půdorysu se **směrem pohledu** (šipka/kužel), číslování F1, F2…
- 💡 **[MVP]** Přiřazení fotky k místnosti / stěně / otvoru / detailu.
- 💡 Kreslení a popisky přímo do fotky (šipky, kóty, poznámky).
- 💡 Automatické zmenšení fotek (úspora místa), galerie fotek projektu.

## 9. Poznámky a skici
- ✅ **[MVP]** Kreslení od ruky v samostatné vrstvě (barvy, tloušťky, guma, skrýt/zobrazit).
- 💡 **[MVP]** Poznámkový „špendlík“ v půdorysu s textem (např. „vlhkost u paty zdi“).
- 💡 Obecné poznámky k podlaží / projektu.
- 💡 Hlasová poznámka (nahrát na místě, přepsat později).

## 10. Ovládání a vzhled
- ✅ **[MVP]** Stylus kreslí, prst posouvá (ochrana proti dlani), dva prsty zoom, myš na PC.
- ✅ **[MVP]** Zpět / vpřed.
- ✅ Vycentrování pohledu, mřížka, grafické měřítko, klávesové zkratky.
- 💡 **[MVP]** Nové rozložení pro tablet: svislá lišta nástrojů, kontextový panel jen pro vybraný prvek, velká tlačítka pro prst.
- 💡 Tlačítko na stylusu S-Pen = rychlé přepnutí nástroje (např. výběr / guma).
- 💡 Kontrastní režim pro práci venku na slunci.
- 💡 Nastavení pro leváky (panely na druhé straně).

## 11. Ukládání a data
- 💡 **[MVP]** Automatické ukládání v tabletu (bez internetu).
- 💡 **[MVP]** Export / import celého projektu do jednoho souboru (včetně fotek) – záloha, přenos na PC nebo jiný tablet.
- 💡 Historie verzí projektu (návrat k dřívějšímu stavu).
- 💡 Později: synchronizace přes cloud (OneDrive / Google Drive) – volitelné.

## 12. Výstupy
- 💡 **[MVP]** **DXF** pro CAD – rozdělené do hladin (stěny, otvory, kóty, texty, pomocné čáry, místnosti, poznámky), v milimetrech 1:1.
- 💡 **[MVP]** **PDF** – půdorys v měřítku (1:50 / 1:100), rohové razítko (projekt, podlaží, datum, kdo měřil).
- 💡 PDF příloha: výpis místností, výpis otvorů, detaily, fotodokumentace s čísly fotek.
- 💡 PNG obrázek výkresu (rychlé sdílení).
- 💡 **Pohledy na stěny** – automaticky vygenerovaný rozvinutý pohled stěny z půdorysu (otvory mají šířku, výšku a parapet, místnost má výšku), případně ručně doplněný.
- 💡 Strukturovaný export (JSON, později IFC) – stěny, otvory, výšky jako *data*, ne jen čáry. Podklad pro hrubé vytvoření 3D modelu (Revit, BIMCraft + AI).

## 13. Technika (jak se to postaví)
- 💡 **[MVP]** Git (historie změn kódu).
- 💡 **[MVP]** Moderní struktura: ES moduly + Vite (vývojový server a sestavení), případně TypeScript pro odhalení chyb.
- 💡 **[MVP]** PWA + hosting zdarma (GitHub Pages / Netlify) – instalace na tablet jedním klepnutím.
- 💡 **[MVP]** Úložiště IndexedDB (projekty + fotky).
- 💡 Překreslování jen při změně (šetří baterii).
- 💡 Automatické testy pro výpočty (geometrie, řešič, export).

---

## Plán po fázích (každá fáze = použitelná aplikace)
1. **Základ:** nová struktura, offline PWA, projekty + podlaží, kreslení stěn, kótování NumPadem, otvory, místnosti, popisky stěn, automatické ukládání, záloha do souboru. *(≈ prototyp, ale bez ztráty dat)*
2. **Výstupy:** DXF s hladinami, PDF s razítkem, plochy místností, výpis místností a otvorů.
3. **Fotky:** focení z aplikace, značky se směrem pohledu, kreslení do fotek.
4. **Doplňky:** detaily, pomocné čáry, schodiště, kružnice, symboly, poznámky, kreslení od ruky, nové ovládání.
5. **Pokročilé:** pohledy na stěny, chytrý řešič geometrie, JSON/IFC export, napojení na BIMCraft.

## Otevřené otázky (zodpovězeno níže)
1. Má výkres obsahovat i **řezy / pohledy**, nebo jen půdorysy?
2. Kreslí se stěny vždy **vnitřním lícem** (měří se uvnitř místností)? Jak řešit obvodové zdi zvenku?
3. Bude aplikaci používat jen jeden člověk, nebo více lidí (sdílení projektů)?
4. Jaký laserový dálkoměr používáš (pokud nějaký)?
5. V čem se DXF dál otevírá (AutoCAD, ArchiCAD, Revit, jiný)?

## Moje doplnění
-Na stavbě se řeza nekreslí, ale pohled by byl dobrý
Kreslí se vnitřek místnosti ani to jinak nejde. Na obvodove zdi bude zatím stacit to co uz program umí, případne si požadavek dodá architekt.
Aplikaci bude používat jeden clovek, nevim jestli by v budoucnu mohl byt nejaky požadavek na sdileni ale spise ne.
Dalkomer je FIELDMANN Laserový dálkoměr 40 m FDLM 1040
DXF se bude otevírat v autocadu a mozna v revitu. Ted sleduji tento projekt https://github.com/IPedrax/BIMCraft Je v uplnych začátcích, ale ma velky potencial. pokud to autor dotahne do pouzitelne podoby pro jednoduche projekty tak v tomto programu. Tam by se asi potom při importu dala pouzit i AI na kterou bude mit program napojeni třeba pro hrube vytvoreni modelu podle vykresu z tohoto programu. ušetřilo by ti hromadu práce.
