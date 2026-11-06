# Přepnutí mezi počítači – přesný postup

## A) Když KONČÍŠ práci na počítači
1. Napiš Claudovi: **„Končím. Aktualizuj POSTUP.md, commitni a pushni.“**
2. Počkej, až napíše, že je hotovo (a že `git status` je čistý).
3. Zastav vývojový server, pokud běží (v terminálu Ctrl+C, nebo zavři okno).
4. Zavři VS Code.
5. Zkontroluj, že OneDrive dosynchronizoval (ikona mráčku v liště: bílá/modrá s fajfkou = hotovo, kolečko se šipkami = ještě běží). Pak teprve počítač vypni.

## B) Když ZAČÍNÁŠ práci na druhém počítači
1. Zapni počítač a počkej, až OneDrive dosynchronizuje (ikona s fajfkou).
2. Otevři VS Code a složku `D:\OneDrive\Claude Code\Zamerovani`.
3. V terminálu (Terminal → New Terminal) spusť, každý řádek zvlášť, a po každém počkej na konec:
   ```
   git pull
   npm install
   ```
   (`npm install` spusť vždy, i když se nic nezměnilo – nic se nepokazí.)
4. Spusť Clauda a napiš: **„Přečti POSTUP.md a pokračujeme.“**
5. Chceš-li aplikaci vyzkoušet na počítači: `npm run dev` a otevři http://localhost:5173/

## Když něco nejde
- `git pull` hlásí chybu / konflikt → nic nemaž, napiš Claudovi přesný text chyby.
- Chybí složka `node_modules` nebo `npm run dev` nejde → spusť `npm install` znovu.
- Soubory se na druhém počítači neobjevily → OneDrive ještě nedoběhl; počkej a zkontroluj ikonu.
- Nikdy nepracuj na obou počítačích zároveň (OneDrive by vytvořil kopie souborů s koncovkou „-NÁZEV-POČÍTAČE“).
- Data zaměření (výkresy) jsou v prohlížeči každého zařízení zvlášť. Mezi zařízeními je převeď přes tlačítko zálohy (soubor `*.zamer.json`).
