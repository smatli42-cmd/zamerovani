# Úprava koncových bodů čar a stěn: držení směru a přichytávání (aktualizace 2026-11-10 noc, doplnění 2026-11-11)

Kopie dokumentu z projektu v Claude (`kresleni-editace-koncu-a-smeru.md`), aby ji Claude Code měl v repozitáři. Stav v kódu: **nenaprogramováno** (audit `AUDIT-STEN.md`, řádek D1/D11).

## Problém (od uživatele)
Když uživatel uchopí myší nebo stylusem **konec existující stěny nebo čáry**, má se konec **dál držet původního směru** (prodloužení / zkrácení po téže přímce) a **teprve po větším vychýlení se uvolnit a „uhnout stranou“**. Dnes se do původního směru nejde znovu trefit.

## Rozhodnuto uživatelem (2026-11-10 noc)
- **Žádný popisek „původní směr“.** Stačí **pomocná čára**, ta je jasně vidět.
- **Přichytávání po 45° se vypíná** (nebude; není ve výchozím nastavení ani jako volba v této fázi).
- **Tažení konce, kde se stýkají napojené stěny:** konec se musí dát **táhnout oběma směry** (ve směru kterékoli z napojených stěn). **Směr se vybere tažením po pomocné čáře.**

## Doplnění uživatele (2026-11-11 večer)
- **Posun celé stěny** (i jedné samostatné stěny) tažením je potřeba. Posun je **volný**, ale k **původnímu směru** stěny se přichytí **pomocnou čárou** (stejná mechanika jako u tažení konce). Dnes jednu stěnu přímo posunout nejde (jen skupinou nebo posunem rohů).
- **Přichycení kolmice:** při tažení stěny nebo jejího konce k jiné stěně se v okamžiku **pravého úhlu** přichytí poloha a zobrazí se **ikona kolmice (⊥)**, aby uživatel věděl, že je úhel opravdu 90°. Mimo toleranci ikona zmizí.
- **Nespojený roh** (katalog C1.6/C1.13) je fyzicky oddělený: dva uzly, tažení za jeden nehýbe druhou stěnou. Pomocné čáry se pak počítají pro každou stěnu zvlášť.

## Jak to dělají jiné programy (výzkum)
- **AutoCAD – Polar Tracking.** Kurzor je veden k nastaveným úhlům a po přiblížení k úhlu se zobrazí vodicí čára; po vzdálení zmizí ([Autodesk](https://help.autodesk.com/cloudhelp/2015/ENU/AutoCAD-LT-MAC/files/GUID-B0BA3C27-D97A-4083-85DB-74187D19AFAA.htm)). Úhly lze měřit od osy nebo **relativně k poslednímu segmentu** ([Autodesk](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-LT/files/GUID-D7CBB7B0-9140-4C53-88EF-08EAA09FA9D7.htm)). Vodicí čára se objeví jen v malém pásmu kolem úhlu, ne neustále ([výukový text](https://internal.varsitytutors.com/practice/subjects/autocad/lessons/ortho-and-polar-tracking)).
- **AutoCAD – Object Snap Tracking.** Z „nasbíraných“ bodů vedou vodicí čáry a lze najít bod na průsečíku dvou vodicích čar ([Autodesk](https://help.autodesk.com/cloudhelp/2027/ENU/AutoCAD-LT/files/GUID-392167BC-8032-44D9-B4A9-DF4AC00DF5C4.htm)).
- **SketchUp – inference.** Rovnoběžnost s osou nebo geometrií se ukáže barvou čáry. **Klávesou Shift se směr zamkne** a kurzorem se pak dá přichytit k jiným bodům, aniž by se směr opustil ([O'Reilly](https://www.oreilly.com/library/view/google-sketchup-the/9780596804060/ch04.html), [fórum](https://community.sketchucation.com/post/1003411)). Zamknout lze i prodloužení existující hrany ([fórum](https://community.sketchucation.com/post/955671)).
- **Revit.** Zobrazuje body a čáry přichycení; dočasné přepsání přichycení platí pro jedno klepnutí ([Autodesk](https://help.autodesk.com/cloudhelp/2015/ENU/Revit-Customize/files/GUID-A3947840-1F30-41D7-AF75-B61687952A07.htm)). Nová stěna se snaží být rovnoběžná s existujícími ([fórum AUGI](https://forums.augi.com/archive/index.php/t-25458.html?pda=1)).
- **Sweet Home 3D – magnetismus.** Vypíná se ikonou magnetu ([fórum](https://www.sweethome3d.com/support/forum/printpost_post,60325)).
- **Tabletové aplikace (Concepts).** Při tažení úchytu se zobrazí vodicí čára; pustíš-li úchyt, když je vidět, přichytí se; **počkáš-li s úchytem na místě, vodicí čára zmizí a nastaví se přesný úhel** ([Concepts](https://concepts.app/ja/android/manual/precisiontools)). Tablet nemá Shift, proto prodleva a tlačítka.
- **Lepivé přichycení (hystereze).** Přichytí se do určitého poloměru a drží, dokud ukazatel neodejde za **větší poloměr uvolnění**, což brání cukání ([pub.dev](https://pub.dev/documentation/resizable_splitter/latest/resizable_splitter/StickySnap-class.html), [Dockview](https://dockview.dev/typedocs/interfaces/dockview-core.SmartGuidesOptions.html)).

## Navržené chování
Platí při tažení **koncového bodu existující stěny nebo čáry** (a obdobně při kreslení nové a při posunu celé stěny).

1. **Při uchopení se zapamatuje původní směr** (od pevného konce k původní poloze uchopeného konce) a zobrazí se **pomocná čára** v tomto směru (přes pevný konec, po obou stranách). **Bez popisku.**
2. **Kandidátní směry** v pořadí důležitosti:
   1. původní směr (prodloužení / zkrácení po téže přímce),
   2. kolmo na původní směr,
   3. vodorovně / svisle,
   4. rovnoběžně nebo kolmo k blízkým stěnám (u kolmice se zobrazí ikona ⊥).
   **Přichytávání po 45° se neimplementuje.**
3. **Zachycení (capture):** směr se zachytí, když je kurzor od pomocné čáry vzdálen méně než zvolený počet pixelů (příčná vzdálenost), případně úhlově do několika stupňů pro krátké čáry. **Původní směr má větší zachycovací poloměr** (např. 1,5×).
4. **Držení (hystereze):** zachycený směr se uvolní až po vychýlení za **poloměr uvolnění** (cca 2× zachycení). Po uvolnění se konec volně pohybuje; vrátí-li se kurzor do pásma, zachytí se znovu.
5. **Délka podél zachyceného směru je volná**, případně se přichytí k bodům jiných objektů: **průsečík zachyceného směru s jinou stěnou nebo čárou**, kolmý bod na konec jiné stěny.
6. **Přednost přichycení:** konec nebo roh jiné stěny uvnitř svého poloměru má přednost před směrovým přichycením.
7. **Vizuální zpětná vazba:** pomocná čára (čárkovaná) od pevného konce přes zachycený směr, **tučnější, když je zachycen**; zvýrazněný bod přichycení; ikona ⊥ u kolmice. **Žádný text s názvem směru.**
8. **Dočasné vypnutí bez klávesnice:**
   - **prodleva**: podrží-li uživatel úchyt na místě cca 0,5–1 s, zachycení se uvolní a nastaví se přesná poloha pod perem,
   - tlačítko **magnet** v panelu nástrojů (vypne / zapne všechna přichycení směru).

### Konec, kde se stýkají napojené stěny (rozhodnuto)
Uchopí-li uživatel **společný konec dvou (nebo více) napojených stěn** (roh, případně T):
- Zobrazí se **pomocná čára pro každou napojenou stěnu**, vždy ve směru té stěny (čára prochází pevným koncem té stěny a uchopeným bodem).
- **Směr se vybere tažením po příslušné pomocné čáře:** když uživatel táhne podél pomocné čáry stěny A, bod se zachytí na přímce stěny A (stěna A drží směr a mění délku; stěna B se otáčí/mění délku podle polohy bodu). Táhne-li podél čáry stěny B, platí totéž naopak.
- Mimo obě pomocné čáry (po uvolnění za poloměr uvolnění) se bod pohybuje volně a obě stěny se přepočítají.
- Hystereze a přednost přichycení platí stejně jako výše. Rohy a T se přepočítají podle `KRESLENI-STEN-NAVRH.md`.
- **Ověřit s uživatelem na tabletu**, zda se výběr směru dostatečně dobře dělá a zda jsou dvě pomocné čáry přehledné (zejména u T, kde vzniknou tři směry).

### Výchozí parametry (naladit na tabletu, konstanty v `core/`)
- zachycení: ~10 px (pero), ~16 px (prst); původní směr ×1,5,
- uvolnění: ~2× poloměr zachycení,
- minimální úhlová tolerance ~3°,
- prodleva pro uvolnění ~0,7 s.

## Návrh implementace
- Čistá funkce v `core/` bez DOM: `resolveDragPoint(fixed, cursor, state, candidates, params) → { point, lock, state }`. Pro napojené stěny `fixed` je množina pevných bodů se směry (jedna pomocná čára na napojenou stěnu); `state` nese právě zachycenou čáru (hystereze). Testy: zachycení, držení, uvolnění po vychýlení, návrat do pásma, výběr čáry tažením u rohu se dvěma stěnami, přednost přichycení bodů, délka volná, přichycení kolmice.
- Použít pro tažení konce stěny i čáry, pro kreslení nových stěn a čar, pro dvojitou čáru a pro **posun celé stěny**.
- Pomocné čáry se kreslí jen během tažení.

## Otevřené otázky
- Při tažení konce napojených stěn: zůstává druhá stěna (B) při tažení po čáře A pevně ve svém koncovém bodě (otáčí se kolem druhého konce), nebo se má držet i její původní směr? Navrhuji první (otáčí se kolem vzdáleného konce), ať se rohy neposouvají.
