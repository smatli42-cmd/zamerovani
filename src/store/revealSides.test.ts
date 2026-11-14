import { describe, expect, it } from 'vitest';
import { doorLayout, jambOutline } from '../core/doorLayout';
import { openingSpan, openingStartFromA, wallLength } from '../core/floorQueries';
import { createProject } from '../model/factory';
import { migrateProject } from '../persistence/migrate';
import { addOpening, addWall, setRevealSides } from './actions';
import { store } from './store';

function windowInWall(): string {
  store.openProject(createProject({ name: 't' }));
  const wId = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 300 })!;
  return addOpening(wId, 'window', 0.5)!;
}
const op = (id: string) => store.floor()!.openings[id]!;
const frameStart = (id: string) => {
  const o = op(id);
  const f = store.floor()!;
  return openingStartFromA(o, wallLength(f, f.walls[o.wallId]!)) + (o.reveal?.left ?? 0);
};

describe('ostění vnitřní / vnější zvlášť', () => {
  it('nevybráno nic = bez ostění; zapnout jde jedno, druhé i obě; rám zůstane na místě', () => {
    const id = windowInWall();
    expect(op(id).reveal).toBeUndefined();
    const x0 = frameStart(id);
    const fo0 = doorLayout(op(id), 300).fo;

    setRevealSides(id, true, false);
    expect(op(id).reveal).toMatchObject({ inner: true, outer: false });
    expect(frameStart(id)).toBe(x0);
    expect(doorLayout(op(id), 300).fo).toBe(fo0);

    setRevealSides(id, true, true);
    expect(op(id).reveal).toMatchObject({ inner: true, outer: true });
    setRevealSides(id, false, true);
    expect(op(id).reveal).toMatchObject({ inner: false, outer: true });
    expect(frameStart(id)).toBe(x0);

    setRevealSides(id, false, false);
    expect(op(id).reveal).toBeUndefined();
    expect(frameStart(id)).toBe(x0);
    expect(doorLayout(op(id), 300).fo).toBe(fo0);
  });

  it('vypnutí ostění nechá zárubeň dveří ve stejné hloubce', () => {
    store.openProject(createProject({ name: 't' }));
    const wId = addWall({ x: 0, y: 0 }, null, { x: 4000, y: 0 }, null, false, { thickness: 400 })!;
    const id = addOpening(wId, 'door', 0.5)!;
    setRevealSides(id, true, true);
    store.edit(f => {
      f.openings[id]!.reveal!.depth = 60;
    });
    setRevealSides(id, false, false);
    expect(doorLayout(op(id), 400).fo).toBe(60);
  });

  it('obrys okraje: líc bez ostění jde rovně až k rámu, s ostěním schod', () => {
    const id = windowInWall();
    setRevealSides(id, true, false);
    store.edit(f => {
      Object.assign(f.openings[id]!.reveal!, { depth: 100, left: 80, right: 120 });
    });
    const o = op(id);
    const lay = doorLayout(o, 300);
    const span = openingSpan(o);
    // jen vnitřní: schod u líce A, k líci B rovně v šířce ostění
    expect(jambOutline(lay, span, 'a')).toEqual([[0, 0], [0, 100], [80, 100], [80, 300], [0, 300]]);
    expect(jambOutline(lay, span, 'b')).toEqual([[span, 0], [span, 100], [span - 120, 100], [span - 120, 300], [span, 300]]);
    // jen vnější: od líce A rovně až za rám, pak schod k líci B
    store.edit(f => {
      f.openings[id]!.reveal!.inner = false;
      f.openings[id]!.reveal!.outer = true;
    });
    const lay2 = doorLayout(op(id), 300);
    expect(jambOutline(lay2, span, 'a')).toEqual([[0, 0], [80, 0], [80, 150], [0, 150], [0, 300]]);
  });

  it('migrace 11 → 12: dřívější „s ostěním“ = vnitřní i vnější ostění (stejná kresba)', () => {
    const p = migrateProject({
      schema: 11,
      id: 'p',
      floors: [
        {
          id: 'f', name: '1.NP', nodes: {}, walls: {}, rooms: {}, texts: {}, protrusions: {},
          openings: {
            o1: { id: 'o1', wallId: 'w', kind: 'window', number: 'O1', width: 900, height: 1200, sill: 900, depth: 0, offset: 0, ref: 'a', hinge: 'a', swing: 1, note: '', reveal: { depth: 150, left: 100, right: 100, top: 0 } },
            o2: { id: 'o2', wallId: 'w', kind: 'door', number: 'D1', width: 800, height: 2000, sill: 0, depth: 0, offset: 0, ref: 'a', hinge: 'a', swing: 1, note: '' }
          }
        }
      ]
    });
    expect(p.floors[0]!.openings.o1!.reveal).toEqual({ depth: 150, left: 100, right: 100, top: 0, inner: true, outer: true });
    expect(p.floors[0]!.openings.o2!.reveal).toBeUndefined();
  });
});
