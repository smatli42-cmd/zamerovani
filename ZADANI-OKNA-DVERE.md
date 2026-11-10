# Zadání: ostění, spárovaná příčka, značky detailů (2026-11-10)

Určeno pro implementaci v Claude Code. Zadání schválil uživatel; geometrie ostění potvrzena, varianta příčky zvolena (spárovaná příčka).

## Postup pro Claude Code (začni tady)
1. Přečti `CLAUDE.md`, `POSTUP.md` a tento soubor. Nejdřív zkontroluj `git status`, `git pull` a že `npm test` a `npm run typecheck` procházejí.
2. Začni sekcí 1 (ostění) a pokračuj sekcí 2 (spárovaná příčka). Sekci 3 (detaily) a úpravy modelu pro 3D neděl, dokud o to uživatel nepožádá (viz pořadí níže).
3. Před implementací každé sekce krátce navrhni řešení a **zeptej se na body označené „ověřit s uživatelem“** (odstup otvoru od rohu u ostění, nika v příčce). Nic nerozhoduj sám.
4. Dodržuj pravidla z `CLAUDE.md`: změny dat jen přes `store.edit()` / `actions.ts`, při změně struktury zvýšit `SCHEMA_VERSION` a doplnit migraci, texty česky, `core/` bez DOM a s testy.
5. Ke každé novinky přidej testy (hlavně geometrii a sdílené otvory příčky) a spusť `npm test`, `npm run typecheck`.
6. Zkus změny vizuálně v prohlížeči a řekni uživateli, co má ověřit na tabletu (pero, velikost úchytů, klikací kóty).
7. Po větším kroku aktualizuj `POSTUP.md` (poslední stav, rozpracované, další kroky), commitni a pushni.

## Pořadí práce (rozhodnuto uživatelem)
1. **Okna a dveře**: ostění (sekce 1) a spárovaná příčka s otvory a nikami (sekce 2).
2. Úpravy modelu pro 3D (výška a úroveň podlaží, pravidlo výšky stěn, tloušťka jako číslo, vazba stěn na místnost).
3. Značky detailů (sekce 3), schodiště.
4. Zařizovací předměty a symboly, fotky, výstupy (PDF, DXF, JSON).

## 1. Ostění u otvoru (okno, dveře)

### Princip
- Ostění je **volitelná vlastnost otvoru** (`Opening`), ne samostatný prvek. Posouvá se, kopíruje (i při vkládání skupin otvorů) a čísluje společně s oknem/dveřmi.
- V panelu otvoru je přepínač **„Ostění“**. Po zapnutí se zobrazí pole:
  - **hloubka** (jak hluboko od vnitřního líce stěny je okno zasazené),
  - **šířka vlevo**, **šířka vpravo** (samostatná čísla, často nesymetrická),
  - **nahoře** (jen údaj pro export a pohledy, v půdorysu se nekreslí).
- Navrhovaný zápis v modelu: nepovinné pole `Opening.reveal?: { depth, left, right, top }` (v mm). Bez pole = žádné ostění, chování jako dnes. Přidání nepovinného pole nevyžaduje změnu `SCHEMA_VERSION` (stejně jako dříve u `leader`); případné nové povinné pole ano.

### Rozměry
- **Šířka okna** (`width`) zůstává šířkou okna/dveří samotných, stejně jako u běžného otvoru.
- **Celková šířka otvoru ve stěně = vlevo + šířka okna + vpravo.** Šířky ostění se přičítají k otvoru.
- Odstup od rohu (`offset`, `ref`) se vztahuje buď k okraji celého otvoru (s ostěním), nebo k oknu samotnému. **Ověřit s uživatelem**: navrhnout a ukázat, nechat vybrat; v UI jasně popsat.
- Kóty jsou **klikací** (NumPad), včetně šířek ostění a hloubky. Řetězové kóty: ostění vlevo – okno – ostění vpravo – meziostění…, plus celková délka. Pozor na návaznost na stávající řetěz „ostění – otvor – meziostění – ostění“, ať kóty nejsou zmatené.

### Kreslení v půdorysu
- Stěna (čára vnitřního líce) se v místě otvoru **rozevře o celkovou šířku** (vlevo + okno + vpravo).
- Okno/dveře se vloží **o hloubku ostění dál do stěny** (na stranu od místnosti); po stranách se dokreslí boční plochy ostění. Podobné jako stávající **nika** (ta se už kreslí do stěny se správným odsunutím kót) – zvážit znovupoužití logiky.
- Dveře: stávající strana pantů a směr otevírání zůstávají.
- Hloubka ostění se **NEPROPISUJE do tloušťky stěny** v popisku (okno není zarovnané s fasádou, hloubky se liší).
- Otvory zatím jen na rovných stěnách (beze změny).

### Export (později)
- Do strukturovaného exportu patří `reveal.depth/left/right/top` jako data u otvoru.

## 2. Spárovaná příčka (stěna mezi místnostmi)

### Cíl
Při kreslení celého podlaží najednou se stěna mezi dvěma místnostmi kreslí jako **příčka se dvěma lícemi** a dveře/niky/okna se do ní vkládají jednoduše, jednou. Dnešní dvojčára to řeší špatně (otvor jde jen do jedné čáry, druhou je nutné doplnit ručně).

### Pravidla (rozhodnuto uživatelem)
- Příčka se **VŽDY kreslí dvěma čarami** (žádná varianta s jednou čárou).
- **Tloušťka příčky se zadává/měří ve špaletě** (v otvoru dveří), výchozí hodnota 100 mm, jde změnit; tloušťka je klikací kóta.
- Obě čáry jsou **spojené** (spárované): navrhovaný zápis `Wall.pair?: Id` (odkaz na partnerskou stěnu) nebo společná skupina příčky. Stávající dvojčáru lze na spárovanou příčku převést (migrace).
- **Obě strany se chovají jako normální stěna**: vkládání otvorů (dveře, okno, průchod) **i niky**; styl čáry, oblouk se řeší stejně jako u stěny, kde to jde.
- **Otvor se ukládá jen jednou** (např. na primární čáře) a **vykreslí se na obou lícech**. Ťuknutí na kteroukoli čáru příčky vloží otvor do obou. Posun, šířka, ostění, směr otevírání a smazání se promítnou na obě strany. Dveře se kreslí jednou (směr otevírání = do které místnosti).
- **Nika** v příčce patří k lícu, ze kterého je přístupná; proto musí jít vložit na kteroukoli čáru a nemusí se zrcadlit. **Ověřit s uživatelem**: nika jen na jedné čáře (výchozí), dveře/okno/průchod na obou.
- Výběr ťuknutím na příčku vybere celou příčku (obě čáry); jedna kóta tloušťky.
- Konce příčky se napojují na stěny (dělení stěn jako dnes u dvojčáry).
- Zaměřování zůstává po místnostech: kóty místností jsou vnitřní míry (líc–líc), příčka mezi nimi má danou tloušťku.

### Poznámky pro implementaci
- Použít stávající dvojčáru jako základ, doplnit propojení čar a sdílené otvory.
- Postup „kreslit místnosti zvlášť a pak je spojit“ (jak se měří na papíře) uživatel v aplikaci **nechce**; po vyzkoušení může požádat o úpravy.
- Export: příčka = jedna stěna s tloušťkou a jedněmi dveřmi.
- Změna dat → zvýšit `SCHEMA_VERSION` a doplnit migraci v `persistence/migrate.ts`.

## 3. Značky detailů (zachovat, převzít z prototypu)

V novém kódu (`src/`) zatím nejsou, jsou jen v původním prototypu (`prototyp/`). Uživatel je chce mít i v nové aplikaci.

- **Značka detailu v půdorysu** s číslem (D1, D2…) a názvem (popiskem).
- **Po klepnutí se otevře samostatné okno** se skicou detailu: pero, přímka, text, kóta, guma, zoom/posun, barvy, zpět.
- **Poznámky k detailu** (skladba, materiály) a předvolby názvů.
- Detaily jsou **jen k dokumentaci, nejdou do strukturovaného exportu** (jde vždy o složitější část stavby). Mohou jít do PDF jako příloha.
- Později (nepovinné): fotka jako podklad skici, detail jako řez stěnou s vrstvami.
- Změna dat → nová položka v modelu podlaží/projektu (`details`), zvýšit `SCHEMA_VERSION` a doplnit migraci.
