/**
 * Modul: canvas/renderer.js
 * Hlavní vykreslovací engine plátna (HiDPI podpora, dynamická mřížka v mm/m, měřítko).
 */
window.App = window.App || {};

window.App.Renderer = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,

    /**
     * Inicializace plátna a sledování změny velikosti okna
     */
    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Vycentrování kamery na střed obrazovky při startu
        const state = window.App.State;
        state.camera.offsetX = Math.round(this.width / 2);
        state.camera.offsetY = Math.round(this.height / 2);

        this.startLoop();
    },

    /**
     * Přizpůsobení rozlišení plátna displeji tabletu / monitoru (Retina / HiDPI)
     */
    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.width = rect.width;
        this.height = rect.height;

        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    /**
     * Vycentruje pohled na nakreslený objekt (nebo na počátek 0,0)
     */
    centerView() {
        const state = window.App.State;
        if (state.nodes.length === 0) {
            state.camera.zoom = 0.15;
            state.camera.offsetX = Math.round(this.width / 2);
            state.camera.offsetY = Math.round(this.height / 2);
            state.notifyUI();
            return;
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of state.nodes) {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }

        const objW = Math.max(1000, maxX - minX);
        const objH = Math.max(1000, maxY - minY);
        const pad = 140;

        const zoomX = (this.width - pad * 2) / objW;
        const zoomY = (this.height - pad * 2) / objH;
        state.camera.zoom = Math.max(0.02, Math.min(1.5, Math.min(zoomX, zoomY)));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        state.camera.offsetX = this.width / 2 - centerX * state.camera.zoom;
        state.camera.offsetY = this.height / 2 - centerY * state.camera.zoom;
        state.notifyUI();
    },

    /**
     * Spustí plynulou vykreslovací smyčku (requestAnimationFrame)
     */
    startLoop() {
        const loop = () => {
            this.renderFrame();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },

    /**
     * Vykreslí jeden snímek plátna
     */
    renderFrame() {
        const ctx = this.ctx;
        const state = window.App.State;
        if (!ctx) return;

        // 1. Pozadí výkresu
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, this.width, this.height);

        // 2. Architektonická mřížka (v milimetrech / metrech)
        if (state.settings.showGrid) {
            this.drawGrid(ctx, state.camera);
        }

        // 3. Stěny, uzly, vodítka a náhled kreslení
        if (window.App.DrawWalls) {
            window.App.DrawWalls.render(ctx, state);
        }

        // 3b. Stavební otvory (Dveře a Okna ve stěnách)
        if (window.App.DrawOpenings) {
            window.App.DrawOpenings.render(ctx, state);
        }

        // 4. Normové stavební kóty
        if (window.App.DrawDims) {
            window.App.DrawDims.render(ctx, state);
        }

        // 5. Grafické měřítko v levém dolním rohu plátna
        this.drawScaleBar(ctx, state.camera);
    },

    /**
     * Vykreslí adaptivní mřížku podle úrovně přiblížení (100 mm, 500 mm, 1000 mm, 5000 mm)
     */
    drawGrid(ctx, camera) {
        const Geo = window.App.Geometry;
        const topLeft = Geo.screenToWorld(0, 0, camera);
        const bottomRight = Geo.screenToWorld(this.width, this.height, camera);

        // Zvolíme krok jemné a hlavní mřížky podle zoomu
        let minorStep = 100;  // 100 mm (10 cm)
        let majorStep = 1000; // 1000 mm (1 m)

        if (camera.zoom < 0.05) {
            minorStep = 1000;
            majorStep = 5000;
        } else if (camera.zoom < 0.12) {
            minorStep = 200;
            majorStep = 1000;
        }

        ctx.save();

        // Jemná mřížka
        if (minorStep * camera.zoom >= 12) {
            ctx.beginPath();
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;

            const startX = Math.floor(topLeft.x / minorStep) * minorStep;
            const endX = Math.ceil(bottomRight.x / minorStep) * minorStep;
            for (let x = startX; x <= endX; x += minorStep) {
                if (x % majorStep === 0) continue;
                const sx = Math.round(x * camera.zoom + camera.offsetX) + 0.5;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, this.height);
            }

            const startY = Math.floor(topLeft.y / minorStep) * minorStep;
            const endY = Math.ceil(bottomRight.y / minorStep) * minorStep;
            for (let y = startY; y <= endY; y += minorStep) {
                if (y % majorStep === 0) continue;
                const sy = Math.round(y * camera.zoom + camera.offsetY) + 0.5;
                ctx.moveTo(0, sy);
                ctx.lineTo(this.width, sy);
            }
            ctx.stroke();
        }

        // Hlavní (metrová) mřížka
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.2;

        const startMajorX = Math.floor(topLeft.x / majorStep) * majorStep;
        const endMajorX = Math.ceil(bottomRight.x / majorStep) * majorStep;
        for (let x = startMajorX; x <= endMajorX; x += majorStep) {
            const sx = Math.round(x * camera.zoom + camera.offsetX) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, this.height);
        }

        const startMajorY = Math.floor(topLeft.y / majorStep) * majorStep;
        const endMajorY = Math.ceil(bottomRight.y / majorStep) * majorStep;
        for (let y = startMajorY; y <= endMajorY; y += majorStep) {
            const sy = Math.round(y * camera.zoom + camera.offsetY) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(this.width, sy);
        }
        ctx.stroke();

        // Kříž počátku souřadnic [0, 0]
        const origin = Geo.worldToScreen(0, 0, camera);
        ctx.beginPath();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.8;
        ctx.moveTo(origin.x - 12, origin.y);
        ctx.lineTo(origin.x + 12, origin.y);
        ctx.moveTo(origin.x, origin.y - 12);
        ctx.lineTo(origin.x, origin.y + 12);
        ctx.stroke();

        ctx.restore();
    },

    /**
     * Vykreslí grafické měřítko (např. 1000 mm = 1 m) v levém dolním rohu
     */
    drawScaleBar(ctx, camera) {
        // Zvolíme vhodnou délku měřítka v mm
        const candidates = [100, 200, 500, 1000, 2000, 5000, 10000];
        let barMm = 1000;
        for (const c of candidates) {
            const px = c * camera.zoom;
            if (px >= 70 && px <= 220) {
                barMm = c;
                break;
            }
        }

        const barPx = barMm * camera.zoom;
        const x = 20;
        const y = this.height - 22;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - 10, y - 24, barPx + 20, 34, 6);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y);
        ctx.lineTo(x + barPx, y);
        ctx.lineTo(x + barPx, y - 6);
        ctx.stroke();

        const label = barMm >= 1000 ? `${barMm / 1000} m (${barMm} mm)` : `${barMm} mm`;
        ctx.fillStyle = '#334155';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + barPx / 2, y - 11);
        ctx.restore();
    }
};
