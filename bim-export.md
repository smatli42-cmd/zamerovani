# Export pro BIM (strukturovaná data) – poznámky

Stav: export zatím není; tady se sbírají zásady, které z rozhodnutí uživatele plynou pro budoucí export (JSON / IFC).

## Vrstvy (rozhodnutí uživatele 2026-11-19, KATALOG-STEN.md sekce V)
- **Vrstvy jsou součástí modelu**, ne jen zobrazení: `Project.layers` (id, název, barva, pořadí, viditelnost, zámek, systémová) a `layerId` u každého prvku s vlastní vrstvou (stěna, kresba, schodiště, štítek místnosti, text, volná kóta). Otvor, ostění a výstupek / vybrání mají vrstvu své stěny.
- Export JSON (záloha) vrstvy už nese. DXF: hladina = název vrstvy. PDF: uživatel zaškrtne vrstvy, vznikne jedno PDF – podklad je `layerContents` v `src/core/layers.ts`.
- **Symboly (později) patří do stejných vrstev** jako ostatní prvky (Elektro, Voda, Topení, Nábytek…), barvu berou z vrstvy.
- **Ruční tahy** (krok 2 zadání vrstev) nejsou strukturovaná data pro BIM – jen vizuální poznámka; do IFC nejdou.
