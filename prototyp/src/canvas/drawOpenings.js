/**
 * Modul: canvas/drawOpenings.js
 * Vykreslování stavebních otvorů a prvků ve stěně:
 * 1) Dveře (door): Čára v ose stěny, ostění, křídlo a PLNÝ oblouk otevírání
 * 2) Okno (window): Dvojitá čára zasklení v ostění
 * 3) Volný otvor / průchod (opening): Ostění a čárkovaná čára nadpraží v ose stěny
 * 4) Nika / výklenek (niche): U-tvar odskoku do hloubky stěny + čárkovaný líc stěny
 */
window.App = window.App || {};

window.App.DrawOpenings = {
    openingHitBoxes: [], // [{ openingId, x, y, radius }]

    /**
     * Vrátí seřazené otvory na dané stěně (od rohu A směrem k rohu B)
     * s vypočítanými vzdálenostmi distStart (začátek otvoru od A) a distEnd (konec otvoru od A).
     */
    getWallOpeningsSorted(wall, state) {
        const Geo = window.App.Geometry;
        const nA = state.getNodeById(wall.startNodeId);
        const nB = state.getNodeById(wall.endNodeId);
        if (!nA || !nB) return [];

        const wallLen = Geo.distance(nA, nB);
        if (wallLen < 100) return [];

        const ops = state.openings.filter(o => o.wallId === wall.id);
        const computed = ops.map(op => {
            let distStart = op.offset;
            if (op.fromEnd === 'end') {
                distStart = wallLen - op.offset - op.width;
            }
            distStart = Math.max(0, Math.min(wallLen - op.width, distStart));
            const distEnd = Math.min(wallLen, distStart + op.width);
            return {
                op,
                distStart: Math.round(distStart),
                distEnd: Math.round(distEnd),
                width: Math.round(distEnd - distStart)
            };
        });

        computed.sort((a, b) => a.distStart - b.distStart);
        return computed;
    },

    render(ctx, state) {
        this.openingHitBoxes = [];
        if (!state.openings || state.openings.length === 0) return;

        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const wall of state.walls) {
            const nA = state.getNodeById(wall.startNodeId);
            const nB = state.getNodeById(wall.endNodeId);
            if (!nA || !nB) continue;

            const wallLen = Geo.distance(nA, nB);
            if (wallLen < 100) continue;

            const sortedOps = this.getWallOpeningsSorted(wall, state);
            if (sortedOps.length === 0) continue;

            const ux = (nB.x - nA.x) / wallLen;
            const uy = (nB.y - nA.y) / wallLen;

            for (const item of sortedOps) {
                const { op, distStart, distEnd } = item;

                const j1World = {
                    x: nA.x + ux * distStart,
                    y: nA.y + uy * distStart
                };
                const j2World = {
                    x: nA.x + ux * distEnd,
                    y: nA.y + uy * distEnd
                };

                const p1 = Geo.worldToScreen(j1World.x, j1World.y, cam);
                const p2 = Geo.worldToScreen(j2World.x, j2World.y, cam);
                const isSelected = state.selection.selectedOpeningId === op.id;

                if (op.type === 'door') {
                    this.drawDoorSymbol(ctx, p1, p2, op, isSelected);
                } else if (op.type === 'window') {
                    this.drawWindowSymbol(ctx, p1, p2, op, isSelected);
                } else if (op.type === 'niche') {
                    this.drawNicheSymbol(ctx, p1, p2, op, isSelected, cam);
                } else {
                    this.drawPassOpeningSymbol(ctx, p1, p2, op, isSelected);
                }

                // Uložíme klikací oblast otvoru
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const screenW = Geo.distance(p1, p2);
                this.openingHitBoxes.push({
                    openingId: op.id,
                    x: midX,
                    y: midY,
                    radius: Math.max(screenW / 2, 18)
                });
            }
        }
    },

    /**
     * 1) DVEŘE: Tenká čára v ose stěny (práh/nadpraží), ostění, křídlo a PLNÁ čára oblouku otevírání
     */
    drawDoorSymbol(ctx, p1, p2, op, isSelected) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenPx = Math.hypot(dx, dy);
        if (lenPx < 6) return;

        const ux = dx / lenPx;
        const uy = dy / lenPx;
        const swingSign = op.swingSide === -1 ? -1 : 1;
        const nx = -uy * swingSign;
        const ny = ux * swingSign;

        ctx.save();

        // 1. Přerušení tlusté čáry stěny a vykreslení čisté čáry v ose stěny (viditelná vždy, i když dveře nejsou vybrané)
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 7.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#2563eb' : '#475569';
        ctx.lineWidth = isSelected ? 2.4 : 1.8;
        ctx.stroke();

        // 2. Krátké kolmé čárky ostění na koncích dveřního otvoru
        const jambHalf = 6;
        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#2563eb' : '#0f172a';
        ctx.lineWidth = 2.4;
        ctx.moveTo(p1.x - nx * jambHalf, p1.y - ny * jambHalf);
        ctx.lineTo(p1.x + nx * jambHalf, p1.y + ny * jambHalf);
        ctx.moveTo(p2.x - nx * jambHalf, p2.y - ny * jambHalf);
        ctx.lineTo(p2.x + nx * jambHalf, p2.y + ny * jambHalf);
        ctx.stroke();

        // 3. Dveřní křídlo a čtvrtkruhový oblouk otevírání (PLNOU ČAROU)
        const hingePt = op.hinge === 'end' ? p2 : p1;
        const latchPt = op.hinge === 'end' ? p1 : p2;
        const openPt = {
            x: hingePt.x + nx * lenPx,
            y: hingePt.y + ny * lenPx
        };

        // Dveřní křídlo (otevřené pod úhlem 90°)
        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#2563eb' : '#b45309';
        ctx.lineWidth = isSelected ? 3.0 : 2.4;
        ctx.moveTo(hingePt.x, hingePt.y);
        ctx.lineTo(openPt.x, openPt.y);
        ctx.stroke();

        // Oblouk otevírání (PLNÁ ČÁRA)
        const angleLatch = Math.atan2(latchPt.y - hingePt.y, latchPt.x - hingePt.x);
        const angleOpen = Math.atan2(openPt.y - hingePt.y, openPt.x - hingePt.x);

        let diff = angleOpen - angleLatch;
        while (diff <= -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const counterClockwise = diff < 0;

        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#2563eb' : '#d97706';
        ctx.lineWidth = isSelected ? 1.8 : 1.5;
        ctx.arc(hingePt.x, hingePt.y, lenPx, angleLatch, angleOpen, counterClockwise);
        ctx.stroke();

        ctx.restore();
    },

    /**
     * 2) OKNO: Dvojitá čára zasklení v ostění
     */
    drawWindowSymbol(ctx, p1, p2, op, isSelected) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenPx = Math.hypot(dx, dy);
        if (lenPx < 6) return;

        const ux = dx / lenPx;
        const uy = dy / lenPx;
        const nx = -uy;
        const ny = ux;
        const halfThick = 5.5;

        ctx.save();

        ctx.beginPath();
        ctx.moveTo(p1.x - nx * halfThick, p1.y - ny * halfThick);
        ctx.lineTo(p2.x - nx * halfThick, p2.y - ny * halfThick);
        ctx.lineTo(p2.x + nx * halfThick, p2.y + ny * halfThick);
        ctx.lineTo(p1.x + nx * halfThick, p1.y + ny * halfThick);
        ctx.closePath();

        ctx.fillStyle = isSelected ? '#bfdbfe' : '#e0f2fe';
        ctx.strokeStyle = isSelected ? '#2563eb' : '#0284c7';
        ctx.lineWidth = isSelected ? 2.2 : 1.6;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#1d4ed8' : '#0369a1';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.restore();
    },

    /**
     * 3) VOLNÝ STAVEBNÍ OTVOR / PRŮCHOD (bez dveřního křídla):
     * Přerušená plná stěna, kolmé čárky ostění a čárkovaná čára nadpraží v ose stěny
     */
    drawPassOpeningSymbol(ctx, p1, p2, op, isSelected) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenPx = Math.hypot(dx, dy);
        if (lenPx < 6) return;

        const ux = dx / lenPx;
        const uy = dy / lenPx;
        const nx = -uy;
        const ny = ux;
        const jambHalf = 6.5;

        ctx.save();

        // 1. Vymazání plné čáry stěny
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 7.5;
        ctx.stroke();

        // 2. Čárkovaná čára nadpraží v ose stěny
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#2563eb' : '#475569';
        ctx.lineWidth = isSelected ? 2.2 : 1.6;
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Kolmé čárky ostění na koncích otvoru
        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#2563eb' : '#0f172a';
        ctx.lineWidth = 2.4;
        ctx.moveTo(p1.x - nx * jambHalf, p1.y - ny * jambHalf);
        ctx.lineTo(p1.x + nx * jambHalf, p1.y + ny * jambHalf);
        ctx.moveTo(p2.x - nx * jambHalf, p2.y - ny * jambHalf);
        ctx.lineTo(p2.x + nx * jambHalf, p2.y + ny * jambHalf);
        ctx.stroke();

        ctx.restore();
    },

    /**
     * 4) NIKA (Výklenek ve stěně):
     * Vykreslí čárkovanou původní hranu stěny a plný U-tvar odskoku do hloubky zdi (podle op.depth a op.swingSide)
     */
    drawNicheSymbol(ctx, p1, p2, op, isSelected, camera) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenPx = Math.hypot(dx, dy);
        if (lenPx < 6) return;

        const ux = dx / lenPx;
        const uy = dy / lenPx;
        const sideSign = op.swingSide === -1 ? -1 : 1;
        const nx = -uy * sideSign;
        const ny = ux * sideSign;

        // Hloubka niky v pixelech na obrazovce (minimálně 10 px, aby byla jasně čitelná)
        const depthMm = op.depth || 200;
        const depthPx = Math.max(10, depthMm * camera.zoom);

        const r1 = { x: p1.x + nx * depthPx, y: p1.y + ny * depthPx };
        const r2 = { x: p2.x + nx * depthPx, y: p2.y + ny * depthPx };

        ctx.save();

        // 1. Přerušení tlusté čáry stěny v místě niky
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 7.5;
        ctx.stroke();

        // 2. Světlá výplň uvnitř niky
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.lineTo(r2.x, r2.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.15)' : 'rgba(13, 148, 136, 0.10)';
        ctx.fill();

        // 3. Čárkovaná čára v původním líci stěny (nadpraží / parapet niky)
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#2563eb' : '#0d9488';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);

        // 4. Plný U-tvar zadní stěny a boků niky
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(r1.x, r1.y);
        ctx.lineTo(r2.x, r2.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#2563eb' : '#0f766e';
        ctx.lineWidth = isSelected ? 3.0 : 2.6;
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.restore();
    },

    /**
     * Zjistí, zda uživatel kliknul na existující dveře, okno, otvor nebo niku na plátně
     */
    findHitOpening(screenX, screenY) {
        for (let i = this.openingHitBoxes.length - 1; i >= 0; i--) {
            const box = this.openingHitBoxes[i];
            if (Math.hypot(screenX - box.x, screenY - box.y) <= box.radius) {
                return box.openingId;
            }
        }
        return null;
    }
};
