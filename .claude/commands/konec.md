---
description: Konec sezení – dokonči, otestuj, aktualizuj POSTUP.md, commitni a pushni
---

1. Rozpracovanou práci dokonči. Když to nejde rychle, rozděl ji bezpečně: hotovou a otestovanou část nech, zbytek vrať nebo dej za neaktivní větev kódu tak, aby aplikace fungovala, a popiš, co zbývá.
2. Spusť `npm test` a `npm run typecheck` (případně `npm run build`). Selhávající test neopravuj změnou očekávání – buď oprav kód, nebo ho označ `it.fails`/`it.todo` s důvodem a zapiš do POSTUP.md.
3. Aktualizuj `POSTUP.md`: nahoře nový „Poslední stav“ s datem – **hotové**, **rozpracované**, **fronta kroků** (pořadí), nová položka v „Rozhodnuto samostatně“, pokud nějaká vznikla. Starší stav posuň níž.
4. Commitni (výstižná česká zpráva) a pushni do `main`.
5. Ověř: `git status` je čistý a `git log origin/main..HEAD` je prázdný (nic nepushnutého). Výsledek napiš uživateli jednou větou.
