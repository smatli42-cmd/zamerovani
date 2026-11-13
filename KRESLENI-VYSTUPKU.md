# Výstupek / vybrání stěny (přizdívka, pilastr, podpěra, výklenek) – návrh (2026-11-12)

Stav: **návrh schválený uživatelem v chatu, nenaprogramováno. Pravidla a příklady v `KATALOG-STEN.md`, sekce I (2026-11-13, čeká na schválení).** Kopie dokumentu z projektu v Claude (`kresleni-vystupku-navrh.md`). Po prvním kroku (návrh v repu) doplnit do `KATALOG-STEN.md` jako sekci „I. Výstupek a vybrání“.

## Problém (od uživatele)
V Revitu se musí dlouhá stěna s několika výstupky (podpěry, přizdívky) dělit na úseky a kreslit po kouscích (300 mm, 500 mm, …). Má to jít rychle a intuitivně perem: nakreslit stěnu, vzít nástroj Čára a nakreslit výstupek libovolného tvaru. Ve výkresu se výstupek přidá ke stěně.

## Rozhodnuto uživatelem
1. **Libovolný tvar** výstupku kreslený nástrojem Čára (rovné čáry i oblouky).
2. **Automatické připojení ke stěně z kterékoli strany** (zevnitř i zvenku místnosti). Strana se pozná podle toho, na které straně líce obrys leží: ven od těla = **výstupek (přidat)**, do těla = **vybrání (ubrat)**. Stejný nástroj umí obojí.
3. **Přichytávání ke stěně při kreslení** (začátek i konec obrysu na líci stěny, jako u nástroje Stěna, s náhledem uzavření).
4. **Vlastní kóty** výstupku (viz níže).
5. **Výška** výstupku se přidá hned.
6. **Materiál/typ** jen pokud je to levné (je: jedno textové pole jako u stěny, bez vlivu na kreslení).
7. Myslet na budoucí export (viz níže).

## Princip
- Stěna zůstává **jedna celistvá** (žádné dělení, jedna celková kóta, jedno nastavení tloušťky).
- Výstupek je **samostatný prvek** s odkazem na stěnu. Ve výkresu se vykreslí **sloučeně**: výplň stejná jako tělo stěny a čára líce stěny v místě výstupku se nekreslí (u vybrání se naopak z těla ubere a kreslí se nový obrys).
- Smazání nebo posun výstupku vrátí stěnu do původního stavu. Posun, prodloužení nebo zkrácení stěny nese výstupky s sebou.

## Kreslení
- Nástroj Čára: otevřená lomená čára (rovné i oblouky), jejíž **oba konce** leží na líci téže stěny → po dokončení se sama uzavře po líci a vznikne výstupek / vybrání. Bez dalšího potvrzování.
- Pokud konce na stěně neleží, je to obyčejná čára jako dnes.
- Přichycení konců: líc stěny (u osy uprostřed vždy líc těla, ne osa), rohy a zvláštní body existujících prvků jako dosud.
- Náhled uzavření při kreslení (tenká čárkovaná čára po líci).

## Kóty (vlastní, klikací, NumPad)
- Šířka (po líci stěny) a hloubka (kolmo na líc) – u neobdélníkového tvaru obalový obdélník.
- Odstup od rohu stěny a od sousedního výstupku na téže straně.
- Změna kóty posune / změní jen výstupek, **ne stěnu**.
- Kóty jen u vybraného výstupku (jako kóty tloušťky u stěny).

## Model dat (export-ready)
Nepovinné pole `Floor.protrusions?: Protrusion[]` (bez změny `SCHEMA_VERSION`, chybí = žádné):
- `id`
- `wallId` + `side` (1/−1, strana líce, ke které patří)
- `mode`: `'add' | 'subtract'`
- `profile`: uzavřený obrys (body a oblouky v souřadnicích výkresu; jednotky jako ostatní model)
- `height?` (mm; výchozí = výška stěny, pole zakládáme hned, 3D později)
- `label?` { name, material, note } – jako u stěny

Při dělení stěny se výstupek přiřadí úseku, na kterém leží (leží-li přes dělicí bod, zůstane u úseku s větším překrytím, upozornit).

## Export (později, rozhodnutí teď jen v datech)
- **DXF/PDF:** jeden sloučený obrys stěny s výstupky (čistá kontura, připravená k šrafě), případně výstupky na samostatné hladině (názvy hladin snadno změnitelné).
- **BIM/JSON:** stěna + „úprava profilu“ (add/subtract, výška) – v Revitu/IFC odpovídá přizdívce, pilastru nebo úpravě profilu stěny. Původní čáry se neztrácejí.

## Zatím ne / otevřené
- Výstupek přes roh nebo přes konec stěny (obrys musí začínat i končit na téže stěně; jinak zůstane čára).
- Výstupek na obloukové stěně (jako otvory).
- Kopírování v řadě („5× po 3 m“) – samostatný navazující krok, ne součást prvního.

## Testy (metoda katalog → příklady → testy)
Příklady vstup → výstup (C2-styl): obdélníkový výstupek 300×200 uprostřed stěny; dva výstupky vedle sebe se společným odstupem; vybrání do těla; výstupek zevnitř × zvenku; posun stěny nese výstupek; smazání výstupku vrací původní tělo; stěna s osou uprostřed (přichycení k líci).

## Postup (pro Code)
a) Návrh a příklady do repa a do `KATALOG-STEN.md` (sekce I) → zastavit, nechat uživatele schválit.
b) Audit dopadu na kód, testy z příkladů (`it.fails` u nálezů), pak implementace po malých krocích.
c) Pokud něco koliduje s kódem nebo katalogem, nejdřív napsat uživateli.
