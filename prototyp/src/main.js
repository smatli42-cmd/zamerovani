/**
 * Modul: main.js
 * Propojení uživatelského rozhraní (tlačítka, lišty, stavový řádek) s jádrem aplikace.
 */
window.App = window.App || {};

window.App.UI = {
    init() {
        const state = window.App.State;
        const renderer = window.App.Renderer;

        // Přepínání hlavních nástrojů (Kreslit, Vybrat, Posun)
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.getAttribute('data-tool');
                state.activeTool = tool;
                if (tool !== 'select') {
                    state.selection.hoveredNodeId = null;
                    state.selection.hoveredWallId = null;
                }
                this.updateStatus();
            });
        });

        // Přepínače nastavení (Ortho, Snap, Kóty, Prst=Posun, Mřížka)
        this.bindToggle('btn-ortho', 'orthoMode');
        this.bindToggle('btn-snap', 'snapToNodes');
        this.bindToggle('btn-dims', 'showDims');
        this.bindToggle('btn-finger-pan', 'fingerPanOnly');
        this.bindToggle('btn-grid', 'showGrid');
        this.bindToggle('btn-freehand-layer', 'showFreehand');

        // Změna velikosti písma kót (+ automatické odsazení kótovacích řad)
        document.getElementById('btn-font-dec')?.addEventListener('click', () => state.adjustDimScale(-0.15));
        document.getElementById('btn-font-inc')?.addEventListener('click', () => state.adjustDimScale(0.15));

        // Akční tlačítka
        document.getElementById('btn-undo')?.addEventListener('click', () => state.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => state.redo());
        document.getElementById('btn-delete')?.addEventListener('click', () => state.deleteSelected());
        document.getElementById('btn-center')?.addEventListener('click', () => renderer.centerView());
        document.getElementById('btn-demo')?.addEventListener('click', () => this.loadDemoRoom());
        document.getElementById('btn-clear')?.addEventListener('click', () => {
            if (state.walls.length === 0 || confirm('Opravdu vymazat celý výkres?')) {
                state.clearAll();
            }
        });

        this.updateStatus();
    },

    bindToggle(elementId, settingKey) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.addEventListener('click', () => {
            const state = window.App.State;
            state.settings[settingKey] = !state.settings[settingKey];
            this.updateStatus();
        });
    },

    /**
     * Vloží ukázkovou místnost (např. 4500 x 3200 mm s výklenkem) pro okamžité vyzkoušení
     */
    loadDemoRoom() {
        const state = window.App.State;
        state.saveSnapshot();
        state.nodes = [];
        state.walls = [];
        state.diagonals = [];
        state.openings = [];

        // Místnost tvaru L (v milimetrech)
        const coords = [
            { x: -2000, y: -1500 },
            { x: 2500,  y: -1500 },
            { x: 2500,  y: 1700 },
            { x: 500,   y: 1700 },
            { x: 500,   y: 700 },
            { x: -2000, y: 700 }
        ];

        const createdNodes = coords.map(c => state.getOrCreateNode(c.x, c.y));
        const createdWalls = [];
        for (let i = 0; i < createdNodes.length; i++) {
            const n1 = createdNodes[i];
            const n2 = createdNodes[(i + 1) % createdNodes.length];
            createdWalls.push(state.addWall(n1, n2));
        }

        // Přidáme do ukázkové místnosti jedno okno a jedny dveře
        if (createdWalls[0]) {
            state.addOpening(createdWalls[0].id, 'window', { width: 1500, height: 1500, sillHeight: 900, offset: 800, fromEnd: 'start' });
        }
        if (createdWalls[1]) {
            state.addOpening(createdWalls[1].id, 'door', { width: 800, height: 1970, offset: 400, fromEnd: 'start', hinge: 'start', swingSide: 1 });
        }

        window.App.Renderer.centerView();
        this.updateStatus();
    },

    /**
     * Aktualizuje vzhled tlačítek a stavového řádku
     */
    updateStatus() {
        const state = window.App.State;

        // Aktivní nástroj
        document.querySelectorAll('[data-tool]').forEach(btn => {
            const isAct = btn.getAttribute('data-tool') === state.activeTool;
            btn.classList.toggle('active', isAct);
        });

        // Přepínače
        window.App.ShapesUI?.updateToolbarVisibility(state.activeTool);
        document.getElementById('btn-ortho')?.classList.toggle('active', state.settings.orthoMode);
        document.getElementById('btn-snap')?.classList.toggle('active', state.settings.snapToNodes);
        document.getElementById('btn-dims')?.classList.toggle('active', state.settings.showDims);
        document.getElementById('btn-finger-pan')?.classList.toggle('active', state.settings.fingerPanOnly);
        document.getElementById('btn-grid')?.classList.toggle('active', state.settings.showGrid);
        document.getElementById('btn-freehand-layer')?.classList.toggle('active', !!state.settings.showFreehand);

        const dimScaleEl = document.getElementById('dim-scale-label');
        if (dimScaleEl) {
            dimScaleEl.textContent = `${Math.round((state.settings.dimScale || 1.15) * 100)}%`;
        }

        // Undo / Redo / Delete dostupnost
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        const btnDelete = document.getElementById('btn-delete');
        if (btnUndo) btnUndo.disabled = state.history.undoStack.length === 0;
        if (btnRedo) btnRedo.disabled = state.history.redoStack.length === 0;
        if (btnDelete) {
            btnDelete.disabled = !state.selection.selectedWallId && !state.selection.selectedNodeId && !state.selection.selectedOpeningId && !state.selection.selectedCircleId && !state.selection.selectedStairId && !state.selection.selectedDetailId && !state.selection.selectedRoomId;
        }

        // Stavový řádek dole (diagnostika pro S-Pen / Myš / Prst + souřadnice)
        const ptrEl = document.getElementById('status-pointer');
        const coordEl = document.getElementById('status-coords');
        const statsEl = document.getElementById('status-stats');
        const zoomEl = document.getElementById('status-zoom');

        if (ptrEl) {
            const typeMap = {
                pen: '🖊️ Stylus (S-Pen)',
                touch: '👆 Dotyk (Prst)',
                mouse: '🖱️ Myš (PC)',
                'žádný': '⏳ Čekám na vstup'
            };
            const label = typeMap[state.pointerInfo.type] || state.pointerInfo.type;
            const press = state.pointerInfo.type === 'pen'
                ? ` | přítlak: ${Math.round(state.pointerInfo.pressure * 100)}%`
                : '';
            ptrEl.textContent = `${label}${press}`;
            ptrEl.className = `status-badge pointer-${state.pointerInfo.type}`;
        }

        if (coordEl) {
            coordEl.textContent = `X: ${state.pointerInfo.worldX} mm, Y: ${state.pointerInfo.worldY} mm`;
        }

        if (statsEl) {
            const measuredCount = state.walls.filter(w => w.measuredLength !== null).length;
            statsEl.textContent = `Stěny: ${state.walls.length} (změřeno: ${measuredCount}) | Otvory: ${state.openings.length}`;
        }

        if (zoomEl) {
            const pct = Math.round((state.camera.zoom / 0.15) * 100);
            zoomEl.textContent = `Zoom: ${pct}%`;
        }
    }
};

// Spuštění aplikace po načtení DOMu
window.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('cad-canvas');
    window.App.Renderer.init(canvasEl);
    window.App.Pointer.init(canvasEl);
    window.App.NumPad?.init();
    window.App.OpeningsUI?.init();
    window.App.ShapesUI?.init();
    window.App.DetailsUI?.init();
    window.App.RoomsUI?.init();
    window.App.UI.init();
});
