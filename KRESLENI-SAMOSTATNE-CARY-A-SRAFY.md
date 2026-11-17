# Samostatná čára a šrafy uzavřených tvarů – návrh (2026-11-16)

Stav: **návrh, nenaprogramováno.** Repo má přednost. Průřezová funkce (šrafy se týkají více druhů prvků) → postup podle `METODA-PRUCHOZI-FUNKCE.md`.

## Rozhodnuto uživatelem
1. **Dva různé nástroje čáry:**
   - **Čára ve stěnách** (dnešní Čára, vyvinula se ve stěnový nástroj): přesun do menu **Stěny** (název se doladí). Napojuje se na stěnu, dělá výstupky/přizdívky (viz `KRESLENI-VYSTUPKU.md`), výplň šedá jako stěna, v exportu stěna / úprava profilu.
   - **Samostatná čára** (nový nástroj, vedle Obdélníku, Oblouku a dalších): **čistě grafický prvek.** Nikdy se nestane stěnou ani výstupkem, nikdy se nevyplní šedou, ani když leží na stěně nebo se na ni napojí.
2. Přichytávání samostatné čáry ke stěnám a bodům je **jen pomůcka při kreslení**, nevytváří vazbu (stejně jako u dvojité čáry, viz `KRESLENI-PREKLADU.md`).
3. **Šrafy:** u **uzavřeného tvaru** je lze volitelně zapnout. K dispozici **jen několik základních šraf bez nastavování** (bez úhlu a rozteče). Konkrétní sada se doladí později.
4. Šrafa se **kreslí přes šedou výplň stěny**.
5. **Dvojitá čára zůstává** samostatným nástrojem (překlady). Řeší se v tabulce níže, ne měnit její chování.

## Co je „uzavřený tvar“ (návrh (já), k ověření v praxi)
Obdélník, kruh / uzavřený oblouk, samostatná čára s koncem v počátku, dvojitá čára s uzavřenými konci (obdélník). Čára ve stěnách vytváří výstupek, ne šrafovaný tvar.

## Export (později, rozhodnutí jen v datech)
- DXF/PDF: samostatné čáry a šrafy na vlastní hladině (název snadno změnitelný), šrafa jako vzor výplně.
- BIM/JSON: samostatná čára = 2D kresba bez významu stěny; šrafa = atribut tvaru (typ šrafy). Nikdy ne stěna.
- Viz `bim-export.md`.

## Tabulka pravidlo × typ prvku (kritérium hotovo, vyplní Code)
Sloupce: Obdélník | Kruh/oblouk | Samostatná čára | Dvojitá čára | Čára ve stěnách (výstupek) | Stěna.
Řádky (pravidla):
1. Nikdy nevzniká stěna ani výstupek (jen u samostatných tvarů).
2. Nevyplňuje se šedou.
3. Šrafa jde zapnout (jen u uzavřeného tvaru).
4. Šrafa se kreslí nad výplní stěny.
5. Přichytávání jen jako pomůcka, bez vazby.
6. Výběr, posun, tažení bodů.
7. Mazání, kopírování, zpět/vpřed.
8. Uložení + migrace (stávající čáry).
9. Export (hladina, atribut).

## Otevřené
- Sada základních šraf (kolik, jaké) – doladíme.
- Migrace: stávající čáry v projektech zůstanou jako dnes (čára ve stěnách); uživatel je případně přepne na samostatné.
