# Kreslení stěn s tloušťkou – schválený návrh (2026-11-10)

Navazuje na `kresleni-sten-podklad.md` (v projektu na claude.ai). Rozhodnutí uživatele jsou označena **[rozhodnuto]**, ostatní je návrh implementace.

## Rozhodnuto uživatelem
1. **[rozhodnuto]** Stěna se kreslí **vždy s tloušťkou** (tělo s oběma líci). Žádná „tenká čára bez tloušťky“. Kdo zakresluje, tloušťku minimálně odhadne, aby se správně zakreslily otvory.
2. **[rozhodnuto]** Tělo stěny roste **ven od místnosti**. Přehození strany = **grafický prvek (dvojitá šipka)** na stěně, jedno klepnutí.
3. **[rozhodnuto]** Tloušťka se **nepřebírá z ostění**; stěna se kreslí rovnou v zadané šířce.
4. **[rozhodnuto]** **Samostatné menu „Stěny“** s předvolbami tloušťky (100, 150, 200, 300 mm) a možností přidat vlastní. Výběr = dvě klepnutí.
5. **[rozhodnuto]** Nová stěna dostane **naposledy vybranou tloušťku**. Po klepnutí na nástroj Stěna se rozbalí seznam a **aktuální tloušťka je v něm označená** (rychlá kontrola, pak se rovnou kreslí bez nového výběru).
6. **[rozhodnuto]** Stěna má **uzavřené konce**; funguje **přichytávání na konec stěny** pro napojení další stěny (jiná tloušťka nebo směr). Vzor: Revit a podobné programy.
7. **[rozhodnuto]** **Příčka (dvojčára, spárovaná příčka) se ruší.** Zůstávají jen stěny s tloušťkou. Příčka je prostě stěna s malou tloušťkou (např. 100 mm). **Otvory (dveře, okna, průchody) a niky se do nových stěn musí vkládat stejně snadno jako u příčky:** jedno klepnutí, otvor se uloží jednou a vykreslí se skrz celé tělo stěny (na obou lících).
8. **[rozhodnuto]** **T-napojení** zatím jen základní chování (viz níže), upřesní se po vyzkoušení v praxi.
9. **[rozhodnuto]** **Změna tloušťky po nakreslení:** čára líce zůstane na místě a tělo se rozšíří nebo zúží (jako v Revitu). Kóty místností se nemění.
10. **[rozhodnuto]** Kótování zatím **beze změny**.

## Jak to řeší Revit, Archicad a další
- **Referenční čára stěny.** Revit i Archicad kreslí stěnu podél referenční čáry; zvolit lze střed nebo líc. Při změně tloušťky zůstane čára na místě a tělo se přizpůsobí. Pro nás: **referenční čára = vnitřní líc**, což odpovídá dnešnímu modelu a kótám místností.
- **Přehození strany.** Revit stěnu převrací kolem referenční čáry; Archicad má příznak „flip“; Vertex zobrazuje šipky a klepnutím se stěna překlopí. Naše dvojitá šipka je stejný princip.
- **Napojení (Wall Joins).** Revit po napojení vytvoří „butt“ spoj a v půdorysu vyčistí hrany mezi stěnami; typ lze změnit na Miter nebo Square off. Napojení do vnitřku jiné stěny (T) má jen jednu možnou konfiguraci.
- **Archicad** čistí spoje, jen když se referenční čáry stěn protínají.
- **magicplan** umí tloušťku jen globálně pro vnitřní a vnější stěny, ne po jednotlivých stěnách.

## Navržený model
- `Wall.thickness` (mm, povinné). Nová stěna = naposledy vybraná tloušťka z menu Stěny (stav „aktivní tloušťka“, ukládá se s projektem; předvolby + vlastní tloušťky v nastavení projektu).
- `Wall.side` (`'left' | 'right'`): na kterou stranu od čáry líce roste tělo. Výchozí = ven od místnosti, u neuzavřených místností ruční volba dvojitou šipkou.
- **Otvory** zůstávají `Opening` na stěně (`wallId`, `offset`, `width`, volitelné `reveal`, `frame`). Vykreslují se **skrz celé tělo stěny**: rozevře se vnitřní i vnější líc, okno/dveře/značka se kreslí do osy těla. Dveře: strana pantů a směr otevírání jako dnes.
- **Nika** je vlastnost líce, ze kterého je přístupná: potřebuje `side` (z které strany stěny se do těla zahlubuje).
- **Migrace** (`SCHEMA_VERSION` +1, `persistence/migrate.ts`):
  - `WallLabel.thickness` → `Wall.thickness`; stěny bez údaje dostanou výchozí hodnotu (navrhuji 300 mm, k ověření).
  - Stávající **spárované příčky (`Wall.part`) a dvojčáry** → jedna stěna s tloušťkou = vzdálenost čar a se sloučenými otvory. Pokud nejde převod poznat jednoznačně, ponechat jako dvě samostatné stěny a nahlásit uživateli.
  - Pole `Wall.part` a nástroj Příčka se po převodu odstraní.

## Navržená geometrie napojení
Počítá se z čáry líce a tloušťky; v `core/` bez DOM, s testy.
- **Volný konec** = rovný uzavřený konec kolmo ke stěně.
- **Roh (L)**: dvě stěny sdílejí koncový bod čáry líce; vnější líc je průsečík obou vnějších odsazených čar (funguje pro různé tloušťky i jiné úhly než 90°). Bez překryvu těl.
- **T-napojení (základní chování, bude se ladit)**: konec stěny, který leží na jiné stěně, se zastaví na líci té stěny; průchozí stěna se nepřerušuje a těla se vyplní jedním tvarem bez čar uvnitř. Pravidlo pro různé tloušťky (která prochází) a přepínání dopřesníme po vyzkoušení.
- **Přichytávání při kreslení**: konec čáry líce, vnější roh konce stěny, střed čela, libovolný bod na čáře líce nebo na vnějším líci; zvolený bod se zvýrazní a určí typ spoje.
- Oblouky a kruhy až později.

## Rozhodnuté drobnosti (2026-11-10, noc)
- **[rozhodnuto]** Výchozí tloušťka u migrovaných stěn bez údaje: **300 mm**.
- **[rozhodnuto]** Dvojčáry a spárované příčky se při migraci **slučují do jedné stěny automaticky** (bez dotazu); co nejde převést jednoznačně, zůstane jako dvě stěny a nahlásí se.
- **[rozhodnuto]** Nika se ve výchozím stavu vkládá na **vnitřní líc** (stranu místnosti = čáru líce, opačně než roste tělo stěny).
