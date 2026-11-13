# Kde co leží

| Soubor / složka | Obsah |
|---|---|
| `CLAUDE.md` | Cíl projektu, struktura kódu, závazná pravidla a pracovní postup |
| `POSTUP.md` | Předávací deník: poslední stav, fronta kroků, rozhodnuto samostatně, historie |
| `KATALOG-STEN.md` | **Závazný** katalog chování stěn (ID A…F, příklady C2/1–16) |
| `AUDIT-STEN.md` | Audit kódu proti katalogu (hotovo / částečně / chybí) |
| `ZADANI-AUDIT-STEN.md` | Zadání auditu stěn |
| `KRESLENI-STEN-NAVRH.md` | Návrh stěn s tloušťkou a rozhodnutí uživatele |
| `KRESLENI-EDITACE-KONCU.md` | Návrh editace konců stěn (tažení, posun, `resolveDragPoint`) |
| `KRESLENI-VYSTUPKU.md` | Návrh výstupku / vybrání stěny (přizdívka, pilastr), kreslí se nástrojem Čára |
| `ZADANI-OKNA-DVERE.md` | Zadání oken, dveří, ostění a dalších fází |
| `POZADAVKY.md` | Celkové požadavky a plán po fázích |
| `PREPNUTI-POCITACE.md` | Postup přepnutí mezi počítači pro uživatele |
| `src/` | Zdrojový kód (struktura v `CLAUDE.md`) |
| `src/core/wallJoins.catalog.test.ts` | Testy z příkladů katalogu C2 |
| `src/core/protrusion.ts`, `src/store/actions/protrusions.ts`, `src/store/protrusion.test.ts` | Výstupek / vybrání stěny a nástroj Čára (katalog I, testy z příkladů I2) |
| `prototyp/` | Starý první prototyp (jen inspirace) |
| `.claude/agents/reviewer.md` | Agent pro nezávislou kontrolu kroku |
| `.claude/commands/` | `/pokracuji` (začátek sezení), `/konec` (konec sezení) |
| `.claude/settings.json` | Povolené příkazy bez ptaní |
| `.github/workflows/deploy.yml` | Nasazení z `main` na GitHub Pages |
