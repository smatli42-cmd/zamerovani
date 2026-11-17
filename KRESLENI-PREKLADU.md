# Kreslení překladů v půdorysu (aktualizace 2026-11-10 večer)

Podklad pro kreslení překladů nad otvory. Zdrojem jsou školní a technické materiály citující ČSN 01 3420 (samotnou normu jsem nečetl, je placená).

## Rozhodnutí uživatele
- **Překlad není vlastnost otvoru ani se nezasazuje do stěny. Jsou to jen čáry**, které kreslí uživatel.
- Ke kreslení překladu slouží **dvojitá čára** (nástroj dvou rovnoběžných čar). Ta **musí zůstat jako samostatný obecný nástroj**, nezávislý na stěnách a otvorech. Rušila se mělo jen příčka (nahrazena stěnou s tloušťkou), ne dvojitá čára.
- Dřívější návrh `Opening.lintel` se **ruší**.

## Pravidlo, ze kterého vše plyne
Půdorys je vodorovný řez (cca 1,2 m nad podlahou). **Vyplněné (šedé/šrafované) je jen to, co rovina řezu skutečně protíná** – zdivo vedle otvoru. Překlad je nad rovinou řezu, takže se **nevyplňuje**, kreslí se jen čarou.

## Pravidla kreslení
- **Uložení překladu** (konce překladu zasunuté do zdiva vedle otvoru) = **tlustá čerchovaná čára se dvěma tečkami**.
- Obrys nadpraží a jeho zalomení = tlustá čerchovaná čára, pokud je nekryje jiná hrana (kryje-li hranu jiný prvek, platí ta).
- U tenčích stěn se v některých školních předpisech uvádí čárkovaná čára s odkazovým kolečkem; pro nás sjednotit na jednu variantu (výchozí: čerchovaná se dvěma tečkami).
- **Délka překladu** = světlost otvoru + uložení na obou stranách, uložení **min. 125 mm** na každou stranu; vyráběné délky bývají násobky 250 mm.
- Okno nad překladem (dva otvory nad sebou) se také kreslí čerchovanou čarou se dvěma tečkami, protože leží nad rovinou řezu.

## Co z toho plyne pro vzhled (šedé stěny)
1. **Zdivo vedle otvoru zůstane šedé**, i pod uloženými konci překladu (je v řezu). Čáry překladu se kreslí **nad** výplní.
2. **Otvor (mezera ve stěně) se nevyplňuje** – u dveří je bílý, u okna s rámem a sklem v rovině řezu. Překlad se v mezeře kreslí jen čerchovaným obrysem.
3. **Překlad samotný není šedý.** Šedá = hmota v řezu. Překlad by byl šedý jen tehdy, kdyby ho rovina řezu protínala (nízký otvor, nika).
4. Pokud čáru překladu překrývá jiná hrana (líc stěny, zárubeň), platí ta plná čára.
5. Otvory nad rovinou řezu (vysoké okno s parapetem nad řezem) se celé kreslí čárkovaně a bez výplně.

## Co musí umět dvojitá čára (pro překlady i obecně)
- Dvě rovnoběžné čáry ve zvolené vzdálenosti, **jeden objekt** (společný posun, délka, úhel); vzdálenost je klikací kóta.
- **Volitelný styl čáry** (plná, čárkovaná, čerchovaná, **čerchovaná se dvěma tečkami**), tloušťka čáry jako u obrysů.
- **Volitelné uzavřené konce** (příčné čáry na koncích → obdélník překladu).
- **Bez výplně**, vrstva nad výplní stěn.
- Přichytávání jako u ostatních čar (konce, líce stěn, rozšířené směry), aby šlo překlad rychle přiložit na otvor a vzdálenost čar přichytit na tloušťku stěny. Přichycení je pouze pomůcka při kreslení, nevytváří vazbu na stěnu ani otvor.
- Zachovat existující data dvojitých čar (nepřevádět je automaticky na stěny; viz oprava v `kresleni-sten-navrh.md`).
