/**
 * Migrace 17 → 18 (rozhodnutí uživatele 2026-11-17): obdélníky, kruhy a oblouky nakreslené dřív jako stěny
 * s tloušťkou 0 se převedou na kresbu (`Floor.drawings`, core/drawing.ts) – od teď nikdy nejsou stěnou ani výstupkem.
 *
 * Převádí se jen to, co je jednoznačně samostatný tvar a nic na něm nezávisí:
 * - kruh: stěna s poloměrem, tloušťka 0;
 * - obdélník: uzavřený okruh čtyř rovných stěn tloušťky 0 (pravé úhly), každý roh jen se dvěma stěnami okruhu;
 * - oblouk: jedna oblouková stěna tloušťky 0 s oběma konci volnými.
 * Zůstane stěnou (čára ve stěnách, jako dnes), když: na stěně je otvor nebo výstupek, něco je na ni nebo na její
 * roh napojené, roh je napojený doprostřed jiné stěny, uvnitř tvaru je štítek místnosti, stěna má vyplněný popisek
 * (typ / materiál / poznámka), nebo strany obdélníku mají různý styl. Rovné čáry zůstávají stěnami vždy.
 */
import { pruneLocks } from '../core/dimLock';
import { drawingOutline, rectSize } from '../core/drawing';
import { pointInPolygon } from '../core/wallBody';
import { newId } from '../model/factory';
import type { Drawing, Floor, Id, Wall } from '../model/types';

export function shapesToDrawings(src: Floor): Floor {
  const f: Floor = JSON.parse(JSON.stringify(src)) as Floor;
  const walls = Object.values(f.walls);
  const degree = new Map<Id, number>();
  for (const w of walls) for (const n of w.radius !== undefined ? [w.a] : [w.a, w.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
  const hostedOn = new Set(Object.values(f.nodes).flatMap(n => (n.host ? [n.host] : [])));
  const used = new Set<Id>([
    ...Object.values(f.openings).map(o => o.wallId),
    ...Object.values(f.protrusions ?? {}).map(p => p.wallId),
    ...Object.values(f.cornerProtrusions ?? {}).flatMap(c => c.walls),
    ...Object.values(f.endProtrusions ?? {}).map(e => e.wallId)
  ]);
  const labelled = (w: Wall) => !!(w.label?.type || w.label?.material?.trim() || w.label?.note?.trim());
  /** Stěna, kterou jde převést (tloušťka 0, nic na ní nezávisí, roh není napojený doprostřed jiné stěny). */
  const free = (w: Wall) =>
    w.thickness === 0 && !used.has(w.id) && !hostedOn.has(w.id) && !labelled(w) && !f.nodes[w.a]?.host && !f.nodes[w.b]?.host;
  const roomInside = (d: Drawing) => {
    const o = drawingOutline(d);
    return !!o && Object.values(f.rooms).some(r => pointInPolygon(r, o));
  };
  const out: Drawing[] = [];
  const remove = new Set<Id>();
  const take = (d: Omit<Drawing, 'id'>, ids: Id[]) => {
    const dr = { ...d, id: newId('dr') } as Drawing;
    if (roomInside(dr)) return;
    out.push(dr);
    for (const id of ids) remove.add(id);
  };

  for (const w of walls) {
    if (remove.has(w.id) || !free(w)) continue;
    const a = f.nodes[w.a];
    const b = f.nodes[w.b];
    if (!a || !b) continue;
    const style = w.style && w.style !== 'solid' ? { style: w.style } : {};
    if (w.radius !== undefined) {
      if (degree.get(w.a) === 1) take({ shape: 'circle', pts: [{ x: a.x, y: a.y }], r: w.radius, ...style }, [w.id]);
      continue;
    }
    if (Math.abs(w.sagitta ?? 0) >= 0.5) {
      if (degree.get(w.a) === 1 && degree.get(w.b) === 1) take({ shape: 'arc', pts: [{ x: a.x, y: a.y, s: w.sagitta! }, { x: b.x, y: b.y }], ...style }, [w.id]);
      continue;
    }
    // obdélník: okruh čtyř rovných stěn přes rohy se dvěma stěnami
    const loop = [w];
    const pts = [w.a];
    let node = w.b;
    while (loop.length < 5 && node !== w.a) {
      if (degree.get(node) !== 2) break;
      const next = walls.find(o => o.id !== loop[loop.length - 1]!.id && o.radius === undefined && (o.a === node || o.b === node));
      if (!next || loop.includes(next)) break;
      pts.push(node);
      loop.push(next);
      node = next.a === node ? next.b : next.a;
    }
    if (node !== w.a || loop.length !== 4 || degree.get(w.a) !== 2) continue;
    if (loop.some(o => !free(o) || Math.abs(o.sagitta ?? 0) >= 0.5 || (o.style ?? 'solid') !== (w.style ?? 'solid'))) continue;
    const rect: Omit<Drawing, 'id'> = { shape: 'rect', pts: pts.map(id => ({ x: f.nodes[id]!.x, y: f.nodes[id]!.y })), ...style };
    if (!rectSize(rect as Drawing)) continue;
    take(rect, loop.map(o => o.id));
  }

  if (!remove.size) return src;
  const freed = new Set([...remove].flatMap(id => [f.walls[id]!.a, f.walls[id]!.b]));
  for (const id of remove) delete f.walls[id];
  const stillUsed = new Set(Object.values(f.walls).flatMap(w => [w.a, w.b]));
  for (const id of freed) if (!stillUsed.has(id)) delete f.nodes[id];
  f.drawings = { ...(f.drawings ?? {}) };
  for (const d of out) f.drawings[d.id] = d;
  pruneLocks(f);
  return f;
}
