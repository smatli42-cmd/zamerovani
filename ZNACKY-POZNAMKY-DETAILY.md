# Značky v půdorysu: poznámka + detail + fotka (jedna sloučená funkce)

Vznik: 2026-11-20. **Rozhodnutí v sekci „Rozhodnuto uživatelem“ jsou závazná.** Při rozporu s jiným dokumentem platí repo; rozpor vypiš a nerozhoduj sám.

Nahrazuje tři dřívější samostatné body v `POZADAVKY.md`: značka detailu D1 (sekce 7), značka fotky F1 se směrem (sekce 8) a poznámkový špendlík (sekce 9). Zapiš tam i do katalogu funkcí, že je nahrazuje jedna značka. Skica a značky detailů jsou zatím jen v `prototyp/`, v `src/` nejsou; převzít odtud.

## Rozhodnuto uživatelem (2026-11-20)
1. **Sloučit** špendlík, detail a fotku do jedné značky.
2. **Každá značka má číslo** (kvůli práci s nimi při exportu, aby se daly odlišit) **a název** (pro orientaci ve výkrese).
3. **Směr pohledu u značky: kužel nebo šipka** (volitelně, ne povinně).

## Rozhodnuto jako návrh (lze změnit)
- **Číslo:** automaticky přidělené, pořadové, unikátní v celém projektu (ne jen v podlaží), tvar `Z1, Z2…`, předpona nastavitelná na jednom místě. Při smazání jiné značky se **nepřečísluje**. Ruční změna čísla s kontrolou duplicity.
- **Název:** volný text, může být prázdný (pak se ukáže jen číslo). ~~Předvolby názvů jako u detailů.~~ *Změněno požadavkem uživatele 2026-11-20: předvolby názvů ne.*
- **Vzhled v půdorysu:** ~~kroužek/špendlík s číslem, vedle název~~ *změněno požadavkem uživatele 2026-11-20: jeden štítek s číslem i názvem (směr pohledu ho nezakrývá)*. Ikona podle obsahu (jen text / skica / fotka), typ se při zakládání nevybírá. Barva volitelná.
- **Velikost značky** je na obrazovce stálá (nezávisí na zoomu), v PDF stálá v mm.
- **Směr pohledu:** volitelná vlastnost značky. Styl **kužel** (výchozí) nebo **šipka**, přepíná se v panelu značky, nastavuje se tažením úchytu (*2026-11-20: úchyt na konci mění úhel i délku*). Bez zapnutí se nekreslí nic.
- **Obsah značky:** text (poznámka ke skladbě, materiálům), skica (pero, přímka, text, kóta, guma, zoom/posun, barvy, zpět; *2026-11-20: navíc Vybrat s posunem a stejné tvary jako kresba ve výkresu – čára, obdélník, kruh, oblouk, dvojitá čára*), volitelně fotka jako podklad. Datový model připravit na **seznam stran `pages[]`**, aby šlo později přidat víc fotek bez migrace; první verze UI nabízí jednu fotku.
- **Fotka:** z fotoaparátu tabletu nebo z galerie. Při vložení se zmenší (delší strana cca 2000 px), ukládá se **zvlášť od dat projektu** (blob), původní fotka se nemění. Kresba je **ve vlastní vrstvě nad fotkou** (jde smazat bez ztráty fotky).
- **Kóty na fotce jsou jen orientační** (perspektiva, ne měřítko): odlišit vzhledem (barva nebo ikona).
- **Mazání značky** s potvrzením (obsahuje skicu a fotky). **Posun** tažením za značku. Zpět/vpřed platí pro založení, posun, přejmenování, smazání; kreslení v okně značky má vlastní zpět.
- **Export:** PDF = příloha, jedna strana na značku (hlavička číslo + název, pak skica/fotka/text); značky s číslem a názvem i v půdorysu v PDF/PNG. DXF = vlastní hladina značek (číslo + název textem, název hladiny snadno změnitelný). **Do strukturovaného exportu (JSON/IFC) se detaily nedávají** (dřívější rozhodnutí: jen dokumentace). Export celého projektu zahrnuje fotky.
- **Mimo rozsah:** hlasová poznámka, automatické galerie, detail jako řez stěnou s vrstvami skladby (pozdější nepovinné).

## Pořadí práce
- **A:** datový model, značka v půdorysu s číslem a názvem, posun, mazání, okno s textem a skicou (převzít z prototypu), volitelný směr (kužel/šipka).
- **B:** fotka jako podklad (pořízení/výběr, zmenšení, uložení zvlášť, export/import projektu).
- **C:** kreslení do fotky ve vlastní vrstvě, orientační kóty, PDF příloha, DXF hladina.

## Průřezovost
Značka je nový druh prvku, takže se dotýká pravidel, která už platí pro ostatní prvky: výběr, posun, mazání, zpět/vpřed, kopírování, zamykání, vrstvy/skrytí, export. Postupovat podle `metoda-pruchozi-funkce.md`: pravidlo na jednom centrálním místě, tabulka „pravidlo × typ prvku“ včetně značky jako kritérium hotovo.

## Zadání kroku A (bez fotky)
1. Datový model: nová položka (značky) v modelu podlaží/projektu, zvýšit `SCHEMA_VERSION` + migrace. Pole: id, číslo, název, poloha, barva, text, skica, volitelný směr (zapnuto/vypnuto, úhel, styl `'kužel' | 'šipka'`), `pages[]` (zatím jedna strana bez fotky).
2. V půdorysu: značka s číslem a názvem, stálá velikost na obrazovce, ikona podle obsahu (jen text / skica).
3. Založení klepnutím, posun tažením, přejmenování, změna čísla a barvy, smazání s potvrzením. Zpět/vpřed pro založení, posun, přejmenování, smazání.
4. Klepnutí na značku otevře samostatné okno: textová poznámka + skica (převzít z prototypu). Kreslení v okně má vlastní zpět. Obsah se po zavření a otevření zachová.
5. Volitelný směr pohledu: zapnutí v panelu značky, kužel (výchozí) nebo šipka, úhel tažením úchytu.
6. Značky se neexportují do JSON/IFC. PDF/DXF/export s fotkami řešíme v krocích B a C; teď jen nezlomit stávající export.
7. Staré samostatné body (detail D1, fotka F1, špendlík) se v aplikaci nesmí objevit jako druhá cesta.

Pravidla práce:
- Pravidlo implementuj JEDNOU na jednom centrálním místě, prvky ho jen využívají. Pokud je chování dnes rozeseté po prvcích, nejdřív ho zmapuj a sjednoť.
- Před koncem sestav tabulku „pravidlo × typ prvku“ (značka jako nový prvek), každou buňku ověř, nic nevynechej.
- Nic nerozhoduj sám. Pokud pravidlo u prvku nejde dodržet nebo je ve sporu s katalogem, prvek neměň, zastav se a vypiš otázku.
- „Všude / všechny prvky“ platí opravdu pro všechny; výjimku vypiš s důvodem.
- Testy: číslování, nepřečíslování po smazání, migrace, zpět/vpřed, zachování obsahu skici.
- Do závěrečné zprávy: tabulka ✔/✗ pro každý prvek, seznam míst, kde pravidlo dosud platí zvlášť, otevřené otázky.

Zkoušky na tabletu (pro uživatele):
1. Založit značku, vznikne číslo, jde zadat název.
2. Posunout a přejmenovat.
3. Otevřít okno, nakreslit skicu, napsat poznámku, zavřít a znovu otevřít.
4. Zapnout směr, přepnout kužel/šipka, otočit.
5. Smazat (potvrzení), zpět vrátí i s obsahem.
6. Zavřít a znovu otevřít aplikaci, čísla se nezměnila.
