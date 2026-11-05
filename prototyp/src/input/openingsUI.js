/**
 * Modul: input/openingsUI.js
 * Plovoucí panel pro vkládání a úpravu stavebních prvků ve stěně:
 * - Dveře (door), Okno (window), Volný stavební otvor (opening), Nika / výklenek (niche)
 * - Šířka, Odstup od rohu A nebo B, Výška, Parapet, Hloubka niky, Směr otevírání / Strana niky
 * - Libovolný textový popisek (např. "trojdílné okno", "francouzské") + rychlé štítky
 * - Tlačítko "Připojit vedle (0 mm)" pro balkonové sestavy (okno + francouzské okno těsně u sebe)
 */
window.App = window.App || {};

window.App.OpeningsUI = {
    isOpen: false,
    targetOpeningId: null,

    init() {
        document.getElementById('op-close')?.addEventListener('click', () => this.close());
        document.getElementById('op-apply')?.addEventListener('click', () => this.applyChanges(true));
        document.getElementById('op-delete')?.addEventListener('click', () => this.deleteCurrent());

        // Přepínač měření odstupu od rohu A vs. od rohu B
        document.getElementById('op-from-a')?.addEventListener('click', () => this.setReferenceEnd('start'));
        document.getElementById('op-from-b')?.addEventListener('click', () => this.setReferenceEnd('end'));

        // Ovládání směru otevírání dveří a strany niky
        document.getElementById('op-flip-hinge')?.addEventListener('click', () => this.flipDoorHinge());
        document.getElementById('op-flip-side')?.addEventListener('click', () => this.flipDoorSide());

        // Tlačítko: Připojit další okno/francouzské okno těsně vedle (meziostění 0 mm)
        document.getElementById('op-attach-next')?.addEventListener('click', () => this.attachAdjacentOpening());

        // Okamžitý živý náhled při psaní do políček (včetně textového popisku op-note)
        ['op-width', 'op-offset', 'op-height', 'op-sill', 'op-depth', 'op-note'].forEach(id => {
            const inputEl = document.getElementById(id);
            if (!inputEl) return;
            inputEl.addEventListener('input', () => this.applyChanges(false));
            inputEl.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.applyChanges(true);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                }
            });
        });

        // Rychlé normové předvolby šířky
        document.querySelectorAll('[data-op-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const w = parseInt(btn.getAttribute('data-op-preset'), 10);
                const wInput = document.getElementById('op-width');
                if (wInput && w > 0) {
                    wInput.value = w;
                    this.applyChanges(false);
                }
            });
        });

        // Rychlé štítky popisků (např. "2-dílné", "3-dílné", "francouzské (p.0)", "posuvné")
        document.querySelectorAll('[data-op-tag]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.getAttribute('data-op-tag');
                const noteInput = document.getElementById('op-note');
                if (noteInput && tag) {
                    noteInput.value = tag;
                    // Pokud uživatel zvolil "francouzské", rovnou nastavíme parapet 0 mm a výšku 2100 mm
                    if (tag.toLowerCase().includes('franc')) {
                        const sillInput = document.getElementById('op-sill');
                        const hInput = document.getElementById('op-height');
                        if (sillInput) sillInput.value = 0;
                        if (hInput && parseInt(hInput.value, 10) < 2000) hInput.value = 2100;
                    }
                    this.applyChanges(false);
                }
            });
        });
    },

    /**
     * Otevře panel úprav pro konkrétní dveře, okno, otvor nebo niku
     */
    openForOpening(openingId) {
        const state = window.App.State;
        const op = state.getOpeningById(openingId);
        if (!op) return;

        window.App.NumPad?.close();

        this.isOpen = true;
        this.targetOpeningId = openingId;
        state.selection.selectedOpeningId = openingId;
        state.selection.selectedWallId = op.wallId;
        state.selection.selectedNodeId = null;

        const titleMap = {
            door: '🚪 Nastavení dveří',
            window: '🪟 Nastavení okna',
            opening: '⬜ Nastavení otvoru ve stěně',
            niche: '凹 Nastavení niky (výklenku)'
        };
        const titleEl = document.getElementById('op-title');
        if (titleEl) {
            titleEl.textContent = titleMap[op.type] || 'Nastavení prvku';
        }

        const isDoor = op.type === 'door';
        const isNiche = op.type === 'niche';

        const doorControls = document.getElementById('op-door-controls');
        const hingeBtn = document.getElementById('op-flip-hinge');
        const sideBtn = document.getElementById('op-flip-side');
        const sillRow = document.getElementById('op-sill-row');
        const depthRow = document.getElementById('op-depth-row');

        if (doorControls) doorControls.style.display = (isDoor || isNiche) ? 'grid' : 'none';
        if (hingeBtn) hingeBtn.style.display = isDoor ? 'inline-flex' : 'none';
        if (sideBtn) {
            sideBtn.textContent = isNiche ? '🔄 Strana niky (Dovnitř / Ven)' : '🔄 Dovnitř / Ven';
            sideBtn.style.gridColumn = isNiche ? '1 / -1' : '';
        }
        if (sillRow) sillRow.style.display = isDoor ? 'none' : 'flex';
        if (depthRow) depthRow.style.display = isNiche ? 'flex' : 'none';

        // Naplnit hodnoty políček
        const wInput = document.getElementById('op-width');
        const offInput = document.getElementById('op-offset');
        const hInput = document.getElementById('op-height');
        const sillInput = document.getElementById('op-sill');
        const depthInput = document.getElementById('op-depth');
        const noteInput = document.getElementById('op-note');

        if (wInput) wInput.value = op.width;
        if (offInput) offInput.value = op.offset;
        if (hInput) hInput.value = op.height;
        if (sillInput) sillInput.value = op.sillHeight || 0;
        if (depthInput) depthInput.value = op.depth || 200;
        if (noteInput) noteInput.value = op.note || '';

        this.updateReferenceButtons(op.fromEnd);

        const panel = document.getElementById('opening-panel');
        if (panel) panel.classList.remove('hidden');

        state.notifyUI();
    },

    /**
     * Vloží další otvor (např. francouzské okno) těsně vedle aktuálního otvoru (meziostění = 0 mm)
     */
    attachAdjacentOpening() {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const currentOp = state.getOpeningById(this.targetOpeningId);
        if (!currentOp) return;

        const wall = state.getWallById(currentOp.wallId);
        if (!wall) return;
        const nA = state.getNodeById(wall.startNodeId);
        const nB = state.getNodeById(wall.endNodeId);
        if (!nA || !nB) return;

        const wallLen = Geo.distance(nA, nB);
        const sortedOps = window.App.DrawOpenings
            ? window.App.DrawOpenings.getWallOpeningsSorted(wall, state)
            : [];
        const curItem = sortedOps.find(it => it.op.id === currentOp.id);
        if (!curItem) return;

        // Zkusíme vložit hned za konec aktuálního otvoru (směrem k B), případně před něj (směrem k A)
        const newWidth = Math.min(900, Math.max(200, Math.round(wallLen - curItem.distEnd)));
        let newStartFromA = curItem.distEnd; // 0 mm mezera za aktuálním otvorem
        const curIdx = sortedOps.findIndex(it => it.op.id === currentOp.id);

        state.saveSnapshot();

        // Pokud za aktuálním otvorem jsou další otvory, posuneme je o šířku nově vkládaného prvku, aby si zachovaly rozestupy
        for (let i = curIdx + 1; i < sortedOps.length; i++) {
            const afterItem = sortedOps[i];
            state.setOpeningStartFromA(afterItem.op, afterItem.distStart + newWidth, wallLen);
        }

        if (newStartFromA + newWidth > wallLen && curItem.distStart >= 900) {
            newStartFromA = curItem.distStart - 900;
        } else {
            newStartFromA = Math.min(wallLen - 200, newStartFromA);
        }

        const newOp = state.addOpening(wall.id, currentOp.type === 'door' ? 'door' : 'window', {
            width: newWidth,
            height: 2100,
            sillHeight: 0,
            note: currentOp.type === 'window' ? 'franc. okno' : '',
            offset: Math.max(0, Math.round(newStartFromA)),
            fromEnd: 'start'
        });

        if (newOp) {
            this.openForOpening(newOp.id);
        }
    },

    close() {
        this.isOpen = false;
        this.targetOpeningId = null;
        const state = window.App.State;
        state.selection.selectedOpeningId = null;
        const panel = document.getElementById('opening-panel');
        if (panel) panel.classList.add('hidden');
        state.notifyUI();
    },

    setReferenceEnd(newEnd) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const op = state.getOpeningById(this.targetOpeningId);
        if (!op) return;

        if (op.fromEnd !== newEnd) {
            const wall = state.getWallById(op.wallId);
            const nA = wall ? state.getNodeById(wall.startNodeId) : null;
            const nB = wall ? state.getNodeById(wall.endNodeId) : null;
            const wallLen = (nA && nB) ? Geo.distance(nA, nB) : 2000;
            // Přepočítáme offset na nový roh tak, aby otvor zůstal na svém místě, dokud uživatel nezadá novou hodnotu
            op.offset = Math.max(0, Math.round(wallLen - op.offset - op.width));
            op.fromEnd = newEnd;
        }

        this.updateReferenceButtons(newEnd);

        const offInput = document.getElementById('op-offset');
        if (offInput) {
            offInput.value = op.offset;
            offInput.focus();
            offInput.select();
        }
        state.notifyUI();
    },

    setReferenceNodeById(nodeId) {
        const state = window.App.State;
        const op = state.getOpeningById(this.targetOpeningId);
        if (!op) return false;

        const wall = state.getWallById(op.wallId);
        if (!wall) return false;

        if (wall.startNodeId === nodeId) {
            this.setReferenceEnd('start');
            return true;
        }
        if (wall.endNodeId === nodeId) {
            this.setReferenceEnd('end');
            return true;
        }
        return false;
    },

    updateReferenceButtons(fromEnd) {
        document.getElementById('op-from-a')?.classList.toggle('active', fromEnd === 'start');
        document.getElementById('op-from-b')?.classList.toggle('active', fromEnd === 'end');
    },

    flipDoorHinge() {
        const state = window.App.State;
        const op = state.getOpeningById(this.targetOpeningId);
        if (!op || op.type !== 'door') return;

        state.saveSnapshot();
        op.hinge = op.hinge === 'start' ? 'end' : 'start';
        state.notifyUI();
    },

    flipDoorSide() {
        const state = window.App.State;
        const op = state.getOpeningById(this.targetOpeningId);
        if (!op) return;

        state.saveSnapshot();
        op.swingSide = op.swingSide === 1 ? -1 : 1;
        state.notifyUI();
    },

    applyChanges(closeAfter = false) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const op = state.getOpeningById(this.targetOpeningId);
        if (!op) return;

        const wall = state.getWallById(op.wallId);
        const nA = wall ? state.getNodeById(wall.startNodeId) : null;
        const nB = wall ? state.getNodeById(wall.endNodeId) : null;
        const wallLen = (nA && nB) ? Geo.distance(nA, nB) : 2000;

        const wVal = parseInt(document.getElementById('op-width')?.value, 10);
        const offVal = parseInt(document.getElementById('op-offset')?.value, 10);
        const hVal = parseInt(document.getElementById('op-height')?.value, 10);
        const sillVal = parseInt(document.getElementById('op-sill')?.value, 10);
        const depthVal = parseInt(document.getElementById('op-depth')?.value, 10);
        const noteVal = document.getElementById('op-note')?.value || '';

        if (Number.isFinite(wVal) && wVal >= 100 && wVal !== op.width) {
            state.setOpeningWidthPreservingChain(op.id, wVal);
        }
        if (Number.isFinite(offVal) && offVal >= 0 && offVal !== op.offset) {
            const desiredStartFromA = op.fromEnd === 'end'
                ? wallLen - offVal - op.width
                : offVal;
            state.moveOpeningPreservingChain(op.id, desiredStartFromA);
            const offInput = document.getElementById('op-offset');
            if (offInput && document.activeElement !== offInput) {
                offInput.value = op.offset;
            }
        }
        if (Number.isFinite(hVal) && hVal >= 100) op.height = hVal;
        if (Number.isFinite(sillVal) && sillVal >= 0) op.sillHeight = sillVal;
        if (Number.isFinite(depthVal) && depthVal >= 20) op.depth = depthVal;
        op.note = noteVal;

        state.notifyUI();
        if (closeAfter) {
            this.close();
        }
    },

    deleteCurrent() {
        const state = window.App.State;
        if (!this.targetOpeningId) return;
        state.selection.selectedOpeningId = this.targetOpeningId;
        state.deleteSelected();
        this.close();
    }
};
