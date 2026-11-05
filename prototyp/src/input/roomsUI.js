/**
 * Modul: roomsUI.js
 * Štítky místností: název místnosti + jedna nebo více výšek (každá s poznámkou, např. "pod podhledem", "ve šikmině").
 * Obsahuje vykreslení štítku na plátno, hit-test, vložení a plovoucí panel úprav (#room-panel).
 */
window.App = window.App || {};

window.App.RoomsUI = {
    targetRoomId: null,
    snapSaved: false,
    boxes: {},   // cache obrazovkových obdélníků štítků (neukládá se do historie)

    init() {
        const $ = id => document.getElementById(id);
        $('room-close')?.addEventListener('click', () => this.close());
        $('room-apply')?.addEventListener('click', () => this.close());
        $('room-delete')?.addEventListener('click', () => this.deleteCurrent());
        $('room-add-height')?.addEventListener('click', () => this.addHeight());

        const nameIn = $('room-name');
        if (nameIn) {
            nameIn.addEventListener('input', () => {
                const room = this.getRoom();
                if (!room) return;
                this.beforeChange();
                room.name = nameIn.value;
                window.App.State.notifyUI();
            });
            nameIn.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.close(); }
            });
        }

        document.querySelectorAll('[data-room-tag]').forEach(btn => {
            btn.addEventListener('click', () => {
                const room = this.getRoom();
                if (!room) return;
                this.beforeChange();
                room.name = btn.getAttribute('data-room-tag');
                if (nameIn) nameIn.value = room.name;
                window.App.State.notifyUI();
            });
        });
    },

    getRoom() {
        return this.targetRoomId ? window.App.State.getRoomById(this.targetRoomId) : null;
    },

    /** Před první změnou po otevření panelu uloží krok do historie (Undo) */
    beforeChange() {
        if (!this.snapSaved) {
            window.App.State.saveSnapshot();
            this.snapSaved = true;
        }
    },

    /** Vloží novou místnost na souřadnice a otevře panel */
    createAt(x, y) {
        const state = window.App.State;
        state.saveSnapshot();
        const room = state.addRoom(x, y);
        this.openForRoom(room.id);
        return room;
    },

    openForRoom(roomId) {
        const state = window.App.State;
        const room = state.getRoomById(roomId);
        if (!room) return;

        window.App.NumPad?.close();
        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.targetRoomId = room.id;
        this.snapSaved = false;
        state.selection.selectedRoomId = room.id;

        const nameIn = document.getElementById('room-name');
        if (nameIn) nameIn.value = room.name || '';
        this.renderHeights();
        document.getElementById('room-panel')?.classList.remove('hidden');
        state.notifyUI();
    },

    /** Překreslí seznam výšek v panelu */
    renderHeights() {
        const room = this.getRoom();
        const list = document.getElementById('room-heights');
        if (!room || !list) return;
        list.innerHTML = '';

        room.heights.forEach((h, idx) => {
            const row = document.createElement('div');
            row.className = 'room-height-row';

            const val = document.createElement('input');
            val.type = 'number';
            val.className = 'op-input';
            val.style.width = '84px';
            val.step = '10';
            val.min = '0';
            val.placeholder = 'mm';
            val.value = (h.value === null || h.value === undefined) ? '' : h.value;

            const note = document.createElement('input');
            note.type = 'text';
            note.className = 'op-text-input';
            note.placeholder = 'poznámka (např. pod podhledem, ve šikmině)';
            note.value = h.note || '';

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'lsb-btn';
            del.textContent = '✖';
            del.title = 'Odebrat tuto výšku';

            val.addEventListener('input', () => {
                this.beforeChange();
                const n = parseInt(val.value, 10);
                h.value = Number.isFinite(n) ? n : null;
                window.App.State.notifyUI();
            });
            note.addEventListener('input', () => {
                this.beforeChange();
                h.note = note.value;
                window.App.State.notifyUI();
            });
            [val, note].forEach(el => el.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.close(); }
            }));
            del.addEventListener('click', () => {
                this.beforeChange();
                room.heights.splice(idx, 1);
                this.renderHeights();
                window.App.State.notifyUI();
            });

            row.appendChild(val);
            row.appendChild(note);
            row.appendChild(del);
            list.appendChild(row);
        });
    },

    addHeight() {
        const room = this.getRoom();
        if (!room) return;
        this.beforeChange();
        const last = room.heights.length ? room.heights[room.heights.length - 1].value : 2700;
        room.heights.push({ value: last, note: '' });
        this.renderHeights();
        const inputs = document.querySelectorAll('#room-heights .room-height-row');
        inputs[inputs.length - 1]?.querySelector('input[type=text]')?.focus();
        window.App.State.notifyUI();
    },

    deleteCurrent() {
        const state = window.App.State;
        if (!this.targetRoomId) return;
        state.saveSnapshot();
        state.rooms = state.rooms.filter(r => r.id !== this.targetRoomId);
        this.close();
        state.clearSelection();
    },

    close() {
        this.targetRoomId = null;
        this.snapSaved = false;
        document.getElementById('room-panel')?.classList.add('hidden');
        const state = window.App.State;
        state.selection.selectedRoomId = null;
        state.notifyUI();
    },

    /** Najde štítek místnosti pod bodem na obrazovce */
    findAtScreenPoint(sx, sy) {
        const state = window.App.State;
        for (let i = state.rooms.length - 1; i >= 0; i--) {
            const r = state.rooms[i];
            const b = this.boxes[r.id];
            if (b && sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return r;
        }
        return null;
    },

    /** Zalomí text do zadané šířky (px) */
    wrapText(ctx, text, maxW) {
        const words = String(text).split(/\s+/).filter(Boolean);
        const lines = [];
        let cur = '';
        for (const w of words) {
            const test = cur ? cur + ' ' + w : w;
            if (ctx.measureText(test).width <= maxW || !cur) cur = test;
            else { lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        return lines;
    },

    /** Vykreslení štítků místností (obrazovkové souřadnice, velikost nezávislá na zoomu) */
    draw(ctx, state) {
        if (!state.rooms || state.rooms.length === 0) return;
        const Geo = window.App.Geometry;
        this.boxes = {};
        const maxTextW = 190;

        for (const room of state.rooms) {
            const p = Geo.worldToScreen(room.x, room.y, state.camera);
            const isSel = state.selection.selectedRoomId === room.id;

            ctx.save();
            ctx.setLineDash([]);

            const nameFont = '800 14px system-ui, sans-serif';
            const lineFont = '600 12px system-ui, sans-serif';
            const lineH = 16;

            // Obsah: název + řádky výšek (poznámky se zalamují)
            const rows = [];
            ctx.font = nameFont;
            this.wrapText(ctx, room.name || 'Místnost', maxTextW).forEach(t => rows.push({ t, font: nameFont, color: '#0f172a' }));
            ctx.font = lineFont;
            for (const h of room.heights) {
                const val = (h.value === null || h.value === undefined) ? '?' : h.value;
                const txt = `v. ${val}` + (h.note ? ` – ${h.note}` : '');
                this.wrapText(ctx, txt, maxTextW).forEach((t, i) => rows.push({ t: (i ? '   ' : '') + t, font: lineFont, color: '#0369a1' }));
            }

            let w = 0;
            for (const r of rows) { ctx.font = r.font; w = Math.max(w, ctx.measureText(r.t).width); }
            w += 20;
            const h = rows.length * lineH + 12;
            const bx = p.x - w / 2;
            const by = p.y - h / 2;
            this.boxes[room.id] = { x: bx, y: by, w, h };

            ctx.fillStyle = isSel ? 'rgba(224, 242, 254, 0.97)' : 'rgba(255, 255, 255, 0.92)';
            ctx.strokeStyle = isSel ? '#0284c7' : '#94a3b8';
            ctx.lineWidth = isSel ? 2 : 1.2;
            ctx.beginPath();
            ctx.roundRect(bx, by, w, h, 8);
            ctx.fill();
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            rows.forEach((r, i) => {
                ctx.font = r.font;
                ctx.fillStyle = r.color;
                ctx.fillText(r.t, bx + 10, by + 6 + lineH * i + lineH / 2);
            });
            ctx.restore();
        }
    }
};
