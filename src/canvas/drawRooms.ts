/**
 * Štítky místností: číslo, název, světlé výšky.
 */
import type { Floor } from '../model/types';
import { isSelected, type Camera, type Selection } from '../store/store';
import { ROOM_LABEL } from '../tools/pick';
import { toScreen } from './view';

export function drawRooms(ctx: CanvasRenderingContext2D, floor: Floor, cam: Camera, selection: Selection): void {
  ctx.save();
  for (const room of Object.values(floor.rooms)) {
    const p = toScreen(room, cam);
    const selected = isSelected(selection, 'room', room.id);
    const title = [room.number, room.name || 'Místnost'].filter(Boolean).join(' ');
    const heights = room.heights.map(h => `sv.v. ${h.value}${h.note ? ` (${h.note})` : ''}`);

    ctx.font = '700 13px system-ui, sans-serif';
    let w = ctx.measureText(title).width;
    ctx.font = '500 11px system-ui, sans-serif';
    for (const h of heights) w = Math.max(w, ctx.measureText(h).width);
    w = Math.min(Math.max(w + 16, 90), ROOM_LABEL.halfW * 2 + 60);
    const h = 22 + heights.length * 14;

    ctx.fillStyle = selected ? '#dbeafe' : 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = selected ? '#2563eb' : '#94a3b8';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(title, p.x, p.y - h / 2 + 12, w - 8);
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.fillStyle = '#475569';
    heights.forEach((t, i) => ctx.fillText(t, p.x, p.y - h / 2 + 27 + i * 14, w - 8));
  }
  ctx.restore();
}
