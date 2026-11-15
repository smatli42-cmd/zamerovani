/**
 * Hlídání velikosti zdrojových souborů (CLAUDE.md, pravidlo o velkých souborech): soubor nad 700 řádků
 * test shodí; nad 500 řádků jen upozorní (soubor se má při další úpravě nejdřív rozdělit).
 */
import { describe, expect, it } from 'vitest';

const LIMIT = 700;
const WARN = 500;

// všechny zdrojové soubory v src jako text (bez testů)
const sources = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Počet řádků jako `wc -l` (poslední řádek s koncem řádku se nepočítá dvakrát). */
const lineCount = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

const sizes = Object.entries(sources)
  .map(([path, text]) => ({ file: `src/${path.replace(/^\.\//, '')}`, lines: lineCount(text) }))
  .sort((a, b) => b.lines - a.lines);

describe('velikost zdrojových souborů', () => {
  it('našel zdrojové soubory', () => {
    expect(sizes.length).toBeGreaterThan(20);
  });

  it(`žádný soubor nemá víc než ${LIMIT} řádků (nad ${WARN} jen upozornění)`, () => {
    const warn = sizes.filter(s => s.lines > WARN && s.lines <= LIMIT);
    if (warn.length) console.warn(`Upozornění – soubory nad ${WARN} řádků (rozdělit při další úpravě):\n${warn.map(s => `  ${s.file}: ${s.lines}`).join('\n')}`);
    const over = sizes.filter(s => s.lines > LIMIT).map(s => `${s.file}: ${s.lines} řádků`);
    expect(over, `Soubory nad ${LIMIT} řádků – nejdřív rozdělit podle odpovědností`).toEqual([]);
  });
});
