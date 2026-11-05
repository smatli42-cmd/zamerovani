/**
 * Modul: input/detailsUI.js
 * Správa a kreslicí okno pro "🔍 Konstrukční detaily" (značka v půdorysu + samostatný náhled a skicák detailu).
 * Skicák umí: pero, přímku, TEXT (popisek), KÓTU (samostatná oranžová kóta s libovolným textem),
 * gumu, posun a zoom (kolečko myši / tlačítka +, −, 100 %).
 */
window.App = window.App || {};

window.App.DetailsUI = {
    isOpen: false,
    targetDetailId: null,
    tool: 'pen', // 'pen' | 'line' | 'text' | 'dim' | 'eraser' | 'pan'
    color: '#0f172a',
    strokeWidth: 2.5,
    dimColor: '#ea580c', // kóty mají vlastní (oranžovou) barvu, aby se odlišily od výkresu
    isDrawing: false,
    currentStroke: null,
    currentDim: null,
    panning: null,
    spacePressed: false,
    view: { s: 1, ox: 0, oy: 0 },
    canvas: null,
    ctx: null,

    init() {
        this.canvas = document.getElementById('det-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.bindCanvasEvents();
        }

        document.getElementById('det-close')?.addEventListener('click', () => this.close());
        document.getElementById('det-save')?.addEventListener('click', () => this.close());
        document.getElementById('det-delete')?.addEventListener('click', () => this.deleteCurrentDetail());
        document.getElementById('det-undo')?.addEventListener('click', () => this.undoDetailStroke());
        document.getElementById('det-clear')?.addEventListener('click', () => this.clearDetailSketch());

        // Zoom tlačítka
        document.getElementById('det-zoom-in')?.addEventListener('click', () => this.zoomAt(1.25));
        document.getElementById('det-zoom-out')?.addEventListener('click', () => this.zoomAt(1 / 1.25));
        document.getElementById('det-zoom-reset')?.addEventListener('click', () => this.resetView());

        // Nástroje skicáku detailu
        document.querySelectorAll('[data-det-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tool = btn.getAttribute('data-det-tool') || 'pen';
                this.syncUI();
            });
        });

        // Barvy skicáku detailu
        document.querySelectorAll('[data-det-color]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.color = btn.getAttribute('data-det-color') || '#0f172a';
                this.syncUI();
            });
        });

        // Rychlé štítky pro název detailu
        document.querySelectorAll('[data-det-tag]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.getAttribute('data-det-tag');
                const titleIn = document.getElementById('det-title');
                if (titleIn && tag) {
                    titleIn.value = tag;
                    this.applyMetadata();
                }
            });
        });

        ['det-code', 'det-title', 'det-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => this.applyMetadata());
            el.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                }
            });
        });

        // Mezerník = dočasný posun skici
        window.addEventListener('keydown', e => {
            if (this.isOpen && e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
                this.spacePressed = true;
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', e => {
            if (e.code === 'Space') this.spacePressed = false;
        });
    },

    /** Souřadnice události na plátně skicáku (px plátna) */
    getPx(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    },

    /** Převod px plátna → souřadnice skici (zohledňuje zoom a posun) */
    toWorld(px) {
        const v = this.view;
        return { x: Math.round((px.x - v.ox) / v.s), y: Math.round((px.y - v.oy) / v.s) };
    },

    zoomAt(factor, px = null) {
        const c = this.canvas;
        if (!c) return;
        const v = this.view;
        const p = px || { x: c.width / 2, y: c.height / 2 };
        const ns = Math.max(0.3, Math.min(8, v.s * factor));
        const k = ns / v.s;
        v.ox = p.x - (p.x - v.ox) * k;
        v.oy = p.y - (p.y - v.oy) * k;
        v.s = ns;
        this.updateZoomLabel();
        this.renderSketch();
    },

    resetView() {
        this.view = { s: 1, ox: 0, oy: 0 };
        this.updateZoomLabel();
        this.renderSketch();
    },

    updateZoomLabel() {
        const el = document.getElementById('det-zoom-reset');
        if (el) el.textContent = `${Math.round(this.view.s * 100)} %`;
    },

    /** Jemné přichytávání k vodorovné / svislé čáře (do 6°) */
    orthoSnap(start, pt) {
        let endX = pt.x;
        let endY = pt.y;
        const dx = endX - start.x;
        const dy = endY - start.y;
        if (Math.hypot(dx, dy) > 15) {
            const ang = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
            if (ang < 6 || Math.abs(ang - 180) < 6) endY = start.y;
            else if (Math.abs(ang - 90) < 6) endX = start.x;
        }
        return { x: endX, y: endY };
    },

    /** Obdélník textového štítku ve světových souřadnicích skici */
    textBox(text, cx, cy) {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = '700 13px system-ui, sans-serif';
        const w = ctx.measureText(text || ' ').width + 12;
        ctx.restore();
        return { x: cx - w / 2, y: cy - 11, w, h: 22 };
    },

    findLabelAt(pt) {
        const det = window.App.State.getDetailById(this.targetDetailId);
        if (!det) return null;
        for (let i = (det.labels || []).length - 1; i >= 0; i--) {
            const lb = det.labels[i];
            const b = this.textBox(lb.text, lb.x, lb.y);
            if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return { kind: 'label', item: lb };
        }
        for (let i = (det.dims || []).length - 1; i >= 0; i--) {
            const d = det.dims[i];
            const b = this.textBox(d.text, (d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2);
            if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return { kind: 'dim', item: d };
        }
        return null;
    },

    bindCanvasEvents() {
        const c = this.canvas;
        if (!c) return;

        c.addEventListener('contextmenu', e => e.preventDefault());

        c.addEventListener('wheel', e => {
            e.preventDefault();
            this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, this.getPx(e));
        }, { passive: false });

        c.addEventListener('pointerdown', e => {
            e.preventDefault();
            e.stopPropagation();
            c.setPointerCapture(e.pointerId);
            const px = this.getPx(e);
            const pt = this.toWorld(px);
            const det = window.App.State.getDetailById(this.targetDetailId);
            if (!det) return;

            // Posun skici: prostřední / pravé tlačítko, mezerník nebo nástroj ✋
            if (this.tool === 'pan' || this.spacePressed || e.button === 1 || e.button === 2) {
                this.panning = { sx: px.x, sy: px.y, ox: this.view.ox, oy: this.view.oy };
                c.style.cursor = 'grabbing';
                return;
            }

            if (this.tool === 'text') {
                const hit = this.findLabelAt(pt);
                if (hit && hit.kind === 'label') {
                    const txt = prompt('Upravit text (prázdný = smazat):', hit.item.text);
                    if (txt !== null) {
                        if (txt.trim()) hit.item.text = txt.trim();
                        else det.labels = det.labels.filter(l => l !== hit.item);
                        this.renderSketch();
                        window.App.State.notifyUI();
                    }
                    return;
                }
                const txt = prompt('Zadej text / popisek do detailu (např. "SDK", "izolace", "hydroizolace"):', '');
                if (txt && txt.trim()) {
                    if (!det.labels) det.labels = [];
                    det.labels.push({ x: pt.x, y: pt.y, text: txt.trim(), color: this.color, t: Date.now() });
                    this.renderSketch();
                    window.App.State.notifyUI();
                }
                return;
            }

            if (this.tool === 'dim') {
                const hit = this.findLabelAt(pt);
                if (hit && hit.kind === 'dim') {
                    const txt = prompt('Upravit text kóty (libovolné číslo nebo text, prázdný = smazat kótu):', hit.item.text);
                    if (txt !== null) {
                        if (txt.trim()) hit.item.text = txt.trim();
                        else det.dims = det.dims.filter(d => d !== hit.item);
                        this.renderSketch();
                        window.App.State.notifyUI();
                    }
                    return;
                }
                this.isDrawing = true;
                this.currentDim = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, text: '' };
                this.renderSketch();
                return;
            }

            if (this.tool === 'eraser') {
                this.isDrawing = true;
                this.eraseAt(pt);
                return;
            }

            this.isDrawing = true;
            this.currentStroke = {
                mode: this.tool === 'line' ? 'line' : 'freehand',
                color: this.color,
                width: this.strokeWidth,
                points: [pt, { ...pt }],
                t: Date.now()
            };
            this.renderSketch();
        });

        c.addEventListener('pointermove', e => {
            const px = this.getPx(e);

            if (this.panning) {
                this.view.ox = this.panning.ox + (px.x - this.panning.sx);
                this.view.oy = this.panning.oy + (px.y - this.panning.sy);
                this.renderSketch();
                return;
            }

            c.style.cursor = (this.tool === 'pan' || this.spacePressed) ? 'grab' : 'crosshair';
            if (!this.isDrawing) return;
            const pt = this.toWorld(px);

            if (this.tool === 'eraser') {
                this.eraseAt(pt);
                return;
            }

            if (this.currentDim) {
                const e2 = this.orthoSnap({ x: this.currentDim.x1, y: this.currentDim.y1 }, pt);
                this.currentDim.x2 = e2.x;
                this.currentDim.y2 = e2.y;
                this.renderSketch();
                return;
            }

            if (!this.currentStroke) return;
            if (this.currentStroke.mode === 'line') {
                this.currentStroke.points[1] = this.orthoSnap(this.currentStroke.points[0], pt);
            } else {
                const pts = this.currentStroke.points;
                const last = pts[pts.length - 1];
                if (Math.hypot(pt.x - last.x, pt.y - last.y) * this.view.s >= 2) {
                    pts.push(pt);
                }
            }
            this.renderSketch();
        });

        const finish = () => {
            if (this.panning) {
                this.panning = null;
                c.style.cursor = (this.tool === 'pan') ? 'grab' : 'crosshair';
                return;
            }
            if (!this.isDrawing) return;
            this.isDrawing = false;
            const det = window.App.State.getDetailById(this.targetDetailId);

            if (this.currentDim) {
                const d = this.currentDim;
                this.currentDim = null;
                if (det && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= 8) {
                    const txt = prompt('Text kóty (libovolné číslo nebo text, např. "45", "120 mm", "min. 150"):', '');
                    if (txt !== null) {
                        if (!det.dims) det.dims = [];
                        det.dims.push({ ...d, text: txt.trim(), t: Date.now() });
                    }
                }
                this.renderSketch();
                window.App.State.notifyUI();
                return;
            }

            if (det && this.currentStroke) {
                const pts = this.currentStroke.points;
                if (pts.length >= 2 && Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) >= 3) {
                    if (!det.strokes) det.strokes = [];
                    det.strokes.push(this.currentStroke);
                }
            }
            this.currentStroke = null;
            this.renderSketch();
            window.App.State.notifyUI();
        };

        c.addEventListener('pointerup', finish);
        c.addEventListener('pointercancel', finish);
    },

    eraseAt(pt) {
        const det = window.App.State.getDetailById(this.targetDetailId);
        if (!det) return;
        const Geo = window.App.Geometry;
        const tol = 14 / this.view.s;
        let changed = false;

        if (det.strokes && det.strokes.length > 0) {
            const before = det.strokes.length;
            det.strokes = det.strokes.filter(st => {
                if (!st.points || st.points.length === 0) return false;
                for (let i = 0; i < st.points.length - 1; i++) {
                    const res = Geo.pointToSegmentDistance(pt, st.points[i], st.points[i + 1]);
                    if (res.distance <= tol) return false;
                }
                return Math.hypot(pt.x - st.points[0].x, pt.y - st.points[0].y) > tol;
            });
            if (det.strokes.length !== before) changed = true;
        }

        if (det.dims && det.dims.length > 0) {
            const beforeD = det.dims.length;
            det.dims = det.dims.filter(d => Geo.pointToSegmentDistance(pt, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }).distance > tol);
            if (det.dims.length !== beforeD) changed = true;
        }

        if (det.labels && det.labels.length > 0) {
            const beforeL = det.labels.length;
            det.labels = det.labels.filter(lb => Math.hypot(pt.x - lb.x, pt.y - lb.y) > 24 / this.view.s);
            if (det.labels.length !== beforeL) changed = true;
        }

        if (changed) {
            this.renderSketch();
            window.App.State.notifyUI();
        }
    },

    openForDetail(detailId) {
        const state = window.App.State;
        const det = state.getDetailById(detailId);
        if (!det) return;

        window.App.NumPad?.close();
        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.isOpen = true;
        this.targetDetailId = det.id;
        this.view = { s: 1, ox: 0, oy: 0 };
        this.updateZoomLabel();
        state.selection.selectedDetailId = det.id;

        const codeIn = document.getElementById('det-code');
        const titleIn = document.getElementById('det-title');
        const notesIn = document.getElementById('det-notes');

        if (codeIn) codeIn.value = det.code || 'D1';
        if (titleIn) titleIn.value = det.title || '';
        if (notesIn) notesIn.value = det.notes || '';

        document.getElementById('detail-modal')?.classList.remove('hidden');
        this.syncUI();
        this.renderSketch();
        state.notifyUI();
    },

    syncUI() {
        document.querySelectorAll('[data-det-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-det-tool') === this.tool);
        });
        document.querySelectorAll('[data-det-color]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-det-color') === this.color);
        });
        if (this.canvas) this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair';
    },

    applyMetadata() {
        const state = window.App.State;
        const det = state.getDetailById(this.targetDetailId);
        if (!det) return;

        det.code = (document.getElementById('det-code')?.value || 'D1').trim();
        det.title = (document.getElementById('det-title')?.value || '').trim();
        det.notes = document.getElementById('det-notes')?.value || '';
        state.notifyUI();
    },

    /** Zpět o jeden prvek skici (tah, text nebo kóta – podle toho, co bylo přidáno naposledy) */
    undoDetailStroke() {
        const det = window.App.State.getDetailById(this.targetDetailId);
        if (!det) return;
        const lists = ['strokes', 'labels', 'dims'];
        let best = null;
        for (const key of lists) {
            const arr = det[key];
            if (arr && arr.length > 0) {
                const t = arr[arr.length - 1].t || 0;
                if (!best || t >= best.t) best = { key, t };
            }
        }
        if (best) {
            det[best.key].pop();
            this.renderSketch();
            window.App.State.notifyUI();
        }
    },

    clearDetailSketch() {
        const det = window.App.State.getDetailById(this.targetDetailId);
        if (!det) return;
        det.strokes = [];
        det.labels = [];
        det.dims = [];
        this.renderSketch();
        window.App.State.notifyUI();
    },

    deleteCurrentDetail() {
        const state = window.App.State;
        if (this.targetDetailId) {
            state.selection.selectedDetailId = this.targetDetailId;
            state.deleteSelected();
        }
        this.close();
    },

    /** Vykreslí jednu kótu: čára se šikmými zarážkami na koncích a textem uprostřed */
    drawDim(ctx, d) {
        const col = this.dimColor;
        const dx = d.x2 - d.x1;
        const dy = d.y2 - d.y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const tick = 7;

        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x2, d.y2);
        // šikmé zarážky (architektonická kóta)
        for (const [px, py] of [[d.x1, d.y1], [d.x2, d.y2]]) {
            ctx.moveTo(px - (ux + nx) * tick, py - (uy + ny) * tick);
            ctx.lineTo(px + (ux + nx) * tick, py + (uy + ny) * tick);
            // krátká pomocná čárka kolmo k měřené čáře
            ctx.moveTo(px - nx * tick, py - ny * tick);
            ctx.lineTo(px + nx * tick, py + ny * tick);
        }
        ctx.stroke();

        if (d.text) {
            const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
            const b = this.textBox(d.text, mx, my);
            ctx.fillStyle = '#fff7ed';
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 5);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = col;
            ctx.font = '700 13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(d.text, mx, my + 0.5);
        }
        ctx.restore();
    },

    renderSketch() {
        const c = this.canvas;
        const ctx = this.ctx;
        if (!c || !ctx) return;

        const det = window.App.State.getDetailById(this.targetDetailId);
        const v = this.view;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);

        // Všechno ostatní se kreslí ve světových souřadnicích skici (zoom + posun)
        ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);

        // Jemná čtverečková mřížka skicáku (20 jednotek) přes viditelnou oblast
        const x0 = -v.ox / v.s, y0 = -v.oy / v.s;
        const x1 = (c.width - v.ox) / v.s, y1 = (c.height - v.oy) / v.s;
        ctx.save();
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1 / v.s;
        ctx.beginPath();
        for (let x = Math.floor(x0 / 20) * 20; x <= x1; x += 20) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
        }
        for (let y = Math.floor(y0 / 20) * 20; y <= y1; y += 20) {
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
        }
        ctx.stroke();
        ctx.restore();

        if (!det) return;

        const allStrokes = [...(det.strokes || [])];
        if (this.currentStroke) allStrokes.push(this.currentStroke);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const st of allStrokes) {
            const pts = st.points;
            if (!pts || pts.length < 2) continue;
            ctx.strokeStyle = st.color || '#0f172a';
            ctx.lineWidth = st.width || 2.5;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            if (st.mode === 'line') {
                ctx.lineTo(pts[1].x, pts[1].y);
            } else {
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i].x, pts[i].y);
                }
            }
            ctx.stroke();
        }
        ctx.restore();

        // Samostatné kóty (oranžové)
        for (const d of (det.dims || [])) this.drawDim(ctx, d);
        if (this.currentDim) this.drawDim(ctx, this.currentDim);

        // Textové popisky
        ctx.save();
        for (const lb of (det.labels || [])) {
            const b = this.textBox(lb.text, lb.x, lb.y);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.strokeStyle = lb.color || '#0f172a';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 5);
            ctx.fill();
            ctx.stroke();

            ctx.font = '700 13px system-ui, sans-serif';
            ctx.fillStyle = lb.color || '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lb.text, lb.x, lb.y + 0.5);
        }
        ctx.restore();
    },

    close() {
        this.isOpen = false;
        this.targetDetailId = null;
        this.isDrawing = false;
        this.currentStroke = null;
        this.currentDim = null;
        this.panning = null;
        document.getElementById('detail-modal')?.classList.add('hidden');
        window.App.State.notifyUI();
    }
};
