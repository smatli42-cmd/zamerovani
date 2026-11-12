---
description: Začátek sezení – stáhni změny, zjisti stav a pokračuj dalším krokem z fronty
---

1. Spusť `git pull`. Když se změnil `package.json` nebo `package-lock.json`, spusť `npm install`.
2. Přečti `CLAUDE.md` a `POSTUP.md` (poslední stav, rozpracované, fronta kroků, „Rozhodnuto samostatně“).
3. Napiš uživateli na **3 řádky**, kde jsme skončili (co je hotové, co čeká na vyzkoušení, co je další krok).
4. Pokračuj dalším krokem z fronty podle pravidel v `CLAUDE.md`:
   - stručně navrhni plán kroku (bez čekání na schválení, pokud nejde o případy, kdy se má ptát),
   - nejdřív testy podle `KATALOG-STEN.md`, pak implementace,
   - `npm test`, `npm run typecheck`, u viditelných změn ověření v prohlížeči,
   - zavolej agenta `reviewer` a nálezy oprav,
   - aktualizuj `POSTUP.md`, commitni a pushni.
5. Pokud krok změnil viditelné chování, zastav se a napiš na 3 řádky, co má uživatel vyzkoušet. Jinak pokračuj dalším krokem.
