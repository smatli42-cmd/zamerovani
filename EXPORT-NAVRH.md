# Export: PDF, DXF (a později BIM-light) – návrh (2026-11-23)

Stav: **body 1–4 schváleny uživatelem 2026-11-23.** PDF a DXF se programují nejdřív. BIM-light je odložen, jeho podoba zatím není známa. Repo má přednost před touto kopií. Po schválení zadání doplnit do katalogu jako novou sekci.

Průřezová funkce (dotýká se všech druhů prvků): postupovat podle `metoda-pruchozi-funkce.md`.

## Rozhodnuto uživatelem
1. **DXF: všechna podlaží v jednom souboru.**
2. **Vlastní uložené sady exportu** (uživatel si je pojmenuje a uloží).
3. **Export jedné místnosti: sousední zdi se kreslí šedě.**
4. **Pořadí: nejdřív PDF a DXF.** BIM-light až po upřesnění uživatelem.
5. PDF obsahuje všechno, ale **konfigurovatelně** (co je na kterém listu).
6. DXF: jen stěny, otvory, schodiště, místnosti, kóty (později i značky). **Bez fotek a nákresů (skic).**

## Princip: tři nezávislé věci
Export = **rozsah × obsah × formát.** Rozsah (co) nezávisí na obsahu (jaké druhy prvků). Proto jedna místnost není zvláštní nastavení, jen jiný rozsah.

### Rozsah
- celý projekt / jedno či více podlaží / **jedna či více místností** / ručně nakreslený výřez (obdélník) (já).
- Zkratka: vybraná místnost ve výkrese → tlačítko Export → rozsah se předvyplní.
- U místnosti: **sousední zdi šedě** (já: tenká šedá čára včetně jejich otvorů, bez kót a popisků; v DXF samostatná hladina „Okolí“). Kóty a popisky jen vybraných prvků.
- Měřítko listu: automaticky nejbližší vhodné (1:20, 1:25, 1:50, 1:100), jde přepsat ručně.

### Obsah (viditelnost druhů prvků)
Tabulka „druh prvku × zapnuto“ pro každý list (PDF) nebo pro celý soubor (DXF). Druhy: stěny, otvory, ostění, výstupky, překlady, schodiště, kružnice/oblouky, místnosti (název, číslo, plocha), **hlavní kóty**, **pracovní kóty**, značky, kresba od ruky, pomocné čáry, fotky a skici.
Tatáž kategorizace tvoří **hladiny v DXF** i viditelnost v PDF (jedno místo, žádné dvě pravdy). Navazuje na `bim-export.md` (kategorie a zobrazení) a `kote-zamek-a-export.md` bod B.

### Sada exportu (vlastní, uložená v projektu)
Pojmenovaná uložená konfigurace: formát, seznam listů, u listu typ + formát papíru + měřítko + rozsah + obsah. Hotové výchozí sady (nejdou přepsat, jdou duplikovat): „Celý projekt (PDF)“, „Vybraná místnost (PDF)“, „DXF pro CAD“. Rozsah „aktuálně vybraná místnost“ je v sadě dynamický (já), jde zadat i konkrétní místnosti. Sady se ukládají v projektu (jdou do zálohy projektu).

## PDF
Konfigurovatelný seznam listů. Každý list: typ, formát (A4/A3, na výšku/šířku), měřítko, rozsah, obsah, razítko (projekt, podlaží, datum, kdo měřil).
Typy listů:
- Půdorys podlaží
- Půdorys místnosti (se šedými sousedními zdmi)
- Výpis místností (plochy, obvody)
- Výpis otvorů
- Značky: jedna strana na značku (číslo + název, skica, fotka, text) – až budou
- Fotodokumentace

PDF je **vektorové** (ne obrázek), s vloženým písmem (česká diakritika), čáry v mm podle měřítka.

## DXF
- Jeden soubor, jednotky mm, 1:1, otevíratelný v AutoCADu (případně Revitu).
- **Podlaží v jednom souboru (já): podlaží vedle sebe** s pevným odstupem a nadpisem podlaží (nepřekrývají se; společný počátek podlaží není potřeba). **Hladiny mají předponu podlaží** (např. `1NP_Steny`), aby šlo podlaží vypnout.
- Hladiny z kategorií obsahu; **názvy hladin se mění na jednom místě**.
- Hlavní kóty na hladině „Kóty“, pracovní na vypnuté hladině „Kóty pracovní“.
- Značky (až budou): hladina značek, číslo a název textem.
- Bez fotek, skic a kresby od ruky (já: kresba od ruky = nákres).
- Diakritika v textech a verzi DXF: Code navrhne a ověří v AutoCADu.

## BIM-light (odloženo)
Podoba zatím není známa, rozhodne uživatel později. V tomto kroku se **nedělá**. Jedině architektura: exportéry jsou samostatné moduly nad společným „výběrem prvků“ (rozsah + obsah), aby šel BIM-light přidat bez přestavby. Sloupec v tabulce níže zůstává „později“.

## Tabulka „druh prvku × výstup“ (kritérium hotovo; Code vyplní a ověří každou buňku)
Návrh (já), Code nic nemění sám a u rozporu se zastaví a zeptá se.

| druh prvku | PDF | DXF | BIM-light |
|---|---|---|---|
| stěna (tělo, líc) | ✔ | ✔ | později |
| otvor (okno, dveře) a ostění | ✔ | ✔ | později |
| výstupek, překlad | ✔ | ✔ | později |
| schodiště | ✔ | ✔ | později |
| kružnice, oblouk | ✔ | ✔ | později |
| místnost (název, číslo, plocha) | ✔ | ✔ | později |
| hlavní kóta | ✔ | ✔ | později |
| pracovní kóta | konfigurovatelně | vypnutá hladina | později |
| značka (číslo + název) | ✔ půdorys + strana na značku | ✔ text | ne |
| kresba od ruky | konfigurovatelně | ne | ne |
| pomocná čára | konfigurovatelně | konfigurovatelně | ne |
| fotka, skica | ✔ příloha | ne | ne |
| sousední zdi (u místnosti) | ✔ šedě | ✔ hladina „Okolí“ | – |
| výpisy, razítko | ✔ | ne | ne |

## Závislosti
- **Příznak „hlavní kóta“** (`kote-zamek-a-export.md` B) se dělá součástí exportu. Výchozí automaticky: celkové rozměry hlavní, dílčí pracovní; ruční přepsání jedním ťuknutím.
- Schodiště a značky v době prvního exportu mohou chybět; do tabulky se doplní řádek, až vzniknou.

## Zkoušky na tabletu
1. Export celého podlaží do PDF (A3, 1:50): všechno je vidět, razítko sedí.
2. Vybrat jednu místnost, export: místnost plně, sousední zdi šedě, kóty jen její.
3. Přidat druhý list (výpis místností), uložit jako vlastní sadu, znovu ji načíst.
4. U listu vypnout kóty, export: kóty nejsou.
5. DXF se dvěma podlažími: otevřít v AutoCADu, podlaží vedle sebe, hladiny s předponou, rozměry 1:1 v mm.
6. V DXF nejsou fotky ani skici, schodiště je.
7. Přejmenovat hladinu na jednom místě, znovu export (název se změnil).
8. Diakritika (názvy místností) v PDF i DXF správně.
9. Export bez internetu (letadlový režim) funguje.

## Rozhodnuto uživatelem 2026-11-23 (podle doporučení Code, platí přednostně před textem výše)
- **Hladiny DXF = podlaží + vrstva + kategorie** (např. `1NP_Stavba_Steny`, `1NP_Elektro_Kresba`) – zachová katalog V (hladina = název vrstvy) i kategorie obsahu.
- **Ruční tah do DXF jde** (katalog V10), na vlastní hladině kategorie „Kresba od ruky“, kterou jde vypnout (Pero kreslí i čáry a tvary jako ruční tah).
- **Sada exportu má i výběr vrstev**, předvyplněný podle aktuálně viditelných vrstev (katalog V10: skrytá vrstva se neexportuje, pokud ji sada nezapne).
- Zařazení do tabulky: kresba (čára, obdélník, kruh, oblouk) = řádek „kružnice, oblouk“ (✔ / ✔); dvojitá čára = překlad; **šrafa** PDF ✔, DXF ✔ (hladina šraf); **text (popisek)** PDF ✔, DXF ✔; „pomocná čára“ zatím jako prvek neexistuje – řádek až vznikne.
- **Hlavní kóta – výchozí:** volná kóta hlavní; kóty schodiště a výstupků pracovní; dílčí (otvory, ostění, meziostění, odstupy, tloušťky) pracovní; celkové (délka stěny, délka po líci, průměr) hlavní.
- **PDF:** knihovna pdf-lib + fontkit, písmo Noto Sans vložené do aplikace (funguje offline), načítá se až při exportu.
- **DXF:** vlastní zápis bez knihovny, verze AutoCAD 2010 (AC1024, texty UTF-8); kóty zatím rozložené na čáry a text (skutečné kóty AutoCADu později).
- **Uložení na tabletu:** tlačítka Sdílet (nabídka Androidu, pokud prohlížeč soubor dovolí) a Stáhnout (vždy, do Stažených).
- **Pořadí práce:** (1) výběr prvků + hlavní kóta, (2) PDF, (3) DXF, (4) uložené sady.
- **Po zkoušce PDF (uživatel 2026-11-23):** úvodní strana s klikacím obsahem; **v PDF všechny kóty ve výchozím stavu** (pracovní jdou vypnout); čísla kót se nepřekrývají; náhled listu v okně Export – měřítko volí uživatel, tažením určí, co je na listu vidět.
