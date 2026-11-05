/**
 * Modul: core/geometry.js
 * Čistá matematika a geometrické výpočty (vzdálenosti, přichytávání, úhly, převody souřadnic).
 * Všechny světové souřadnice (world) jsou v milimetrech (1 jednotka = 1 mm).
 */
window.App = window.App || {};

window.App.Geometry = {
    /**
     * Převod souřadnic z obrazovky (px) do světa (mm)
     */
    screenToWorld(screenX, screenY, camera) {
        return {
            x: (screenX - camera.offsetX) / camera.zoom,
            y: (screenY - camera.offsetY) / camera.zoom
        };
    },

    /**
     * Převod souřadnic ze světa (mm) na obrazovku (px)
     */
    worldToScreen(worldX, worldY, camera) {
        return {
            x: worldX * camera.zoom + camera.offsetX,
            y: worldY * camera.zoom + camera.offsetY
        };
    },

    /**
     * Euklidovská vzdálenost dvou bodů
     */
    distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.hypot(dx, dy);
    },

    /**
     * Průsečík dvou kružnic (Triangulace při zadání úhlopříčky).
     * Kružnice 1: střed c1, poloměr r1
     * Kružnice 2: střed c2, poloměr r2
     * Vrátí průsečík bližší k bodu referencePt, nebo null pokud trojúhelník nelze sestrojit.
     */
    intersectCircles(c1, r1, c2, r2, referencePt) {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const d = Math.hypot(dx, dy);

        // Kontrola trojúhelníkové nerovnosti
        if (d < 1e-6 || d > r1 + r2 + 0.5 || d < Math.abs(r1 - r2) - 0.5) {
            return null;
        }

        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const hSq = Math.max(0, r1 * r1 - a * a);
        const h = Math.sqrt(hSq);

        const x2 = c1.x + a * (dx / d);
        const y2 = c1.y + a * (dy / d);

        const rx = -dy * (h / d);
        const ry = dx * (h / d);

        const pA = { x: x2 + rx, y: y2 + ry };
        const pB = { x: x2 - rx, y: y2 - ry };

        if (!referencePt) return pA;
        return this.distance(pA, referencePt) <= this.distance(pB, referencePt) ? pA : pB;
    },

    /**
     * Úhel úsečky p1 -> p2 ve stupních (0° = doprava, 90° = dolů, -90° = nahoru)
     */
    angleDeg(p1, p2) {
        const rad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        let deg = rad * (180 / Math.PI);
        if (deg < 0) deg += 360;
        return deg;
    },

    /**
     * Vzdálenost bodu P od úsečky AB (pro klikání na stěny)
     */
    pointToSegmentDistance(p, a, b) {
        const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
        if (l2 === 0) return this.distance(p, a);
        let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y)
        };
        return {
            distance: this.distance(p, proj),
            projection: proj,
            t: t
        };
    },

    /**
     * Vypočítá geometrii kruhového oblouku z koncových bodů tětivy (p1, p2) a výšky oblouku (sagitta h).
     * Pracuje v libovolných souřadnicích (světových mm nebo obrazovkových px).
     */
    computeArcGeometry(p1, p2, h) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const chordLen = Math.hypot(dx, dy);
        if (chordLen < 1e-3 || !h || Math.abs(h) < 1) {
            return null;
        }

        const ux = dx / chordLen;
        const uy = dy / chordLen;
        const nx = -uy;
        const ny = ux;

        const mid = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
        const peak = {
            x: mid.x + nx * h,
            y: mid.y + ny * h
        };

        const radius = ((chordLen / 2) * (chordLen / 2) + h * h) / (2 * Math.abs(h));
        const s = (h / 2) - (chordLen * chordLen) / (8 * h);
        const center = {
            x: mid.x + nx * s,
            y: mid.y + ny * s
        };

        const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
        const endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
        const peakAngle = Math.atan2(peak.y - center.y, peak.x - center.x);

        // Ověříme, zda směr po směru hodinových ručiček (ccw = false) prochází přes vrchol oblouku peak
        const normAngle = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const cwSpan = normAngle(endAngle - startAngle);
        const cwToPeak = normAngle(peakAngle - startAngle);
        const counterClockwise = !(cwToPeak <= cwSpan + 1e-4);

        return {
            center,
            radius,
            mid,
            peak,
            chordLen,
            ux, uy, nx, ny,
            startAngle,
            endAngle,
            counterClockwise
        };
    },

    /**
     * Vzdálenost bodu P od úsečky nebo oblouku AB
     */
    pointToWallOrArcDistance(p, a, b, arcHeight = 0) {
        if (!arcHeight || Math.abs(arcHeight) < 2) {
            return this.pointToSegmentDistance(p, a, b);
        }
        const arc = this.computeArcGeometry(a, b, arcHeight);
        if (!arc) {
            return this.pointToSegmentDistance(p, a, b);
        }

        // Vzorkujeme oblouk na 24 dílků pro spolehlivou detekci kliknutí
        let bestDist = Infinity;
        let bestProj = { x: arc.peak.x, y: arc.peak.y };
        let bestT = 0.5;
        const steps = 24;
        const normAngle = (ang) => ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        let sweep = normAngle(arc.endAngle - arc.startAngle);
        if (arc.counterClockwise) {
            sweep = sweep - 2 * Math.PI;
        }

        let prevPt = a;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const ang = arc.startAngle + sweep * t;
            const curPt = {
                x: arc.center.x + Math.cos(ang) * arc.radius,
                y: arc.center.y + Math.sin(ang) * arc.radius
            };
            const seg = this.pointToSegmentDistance(p, prevPt, curPt);
            if (seg.distance < bestDist) {
                bestDist = seg.distance;
                bestProj = seg.projection;
                bestT = (i - 1 + seg.t) / steps;
            }
            prevPt = curPt;
        }

        return {
            distance: bestDist,
            projection: bestProj,
            t: bestT
        };
    },

    /**
     * Najde nejbližší existující uzel v dosahu snapRadiusPx (v pixelech na obrazovce)
     */
    findSnapNode(worldPt, nodes, camera, snapRadiusPx = 18, excludeNodeId = null) {
        const maxWorldDist = snapRadiusPx / camera.zoom;
        let bestNode = null;
        let bestDist = maxWorldDist;

        for (const node of nodes) {
            if (node.id === excludeNodeId) continue;
            const d = this.distance(worldPt, node);
            if (d < bestDist) {
                bestDist = d;
                bestNode = node;
            }
        }
        return bestNode;
    },

    /**
     * Najde nejbližší bod na hraně existující stěny (pro přichycení koncových bodů překladů, čar a příček na stěnu).
     * Vrátí { wall, x, y, distFromStart } nebo null.
     */
    findSnapWallEdge(worldPt, state, snapRadiusPx = 18, excludeWallId = null) {
        if (!state || !state.walls) return null;
        const maxWorldDist = snapRadiusPx / state.camera.zoom;
        let bestHit = null;
        let bestDist = maxWorldDist;

        for (const wall of state.walls) {
            if (wall.id === excludeWallId || wall.isAuxLine) continue;
            const nA = state.getNodeById(wall.startNodeId);
            const nB = state.getNodeById(wall.endNodeId);
            if (!nA || !nB) continue;

            const wallLen = this.distance(nA, nB);
            if (wallLen < 50) continue;

            const proj = this.pointToSegmentDistance(worldPt, nA, nB);
            const distFromA = proj.t * wallLen;
            // Vynecháme těsné okolí rohů (ty řeší findSnapNode)
            if (distFromA < 20 || distFromA > wallLen - 20) continue;

            if (proj.distance < bestDist) {
                bestDist = proj.distance;
                const roundedDist = Math.round(distFromA / 10) * 10;
                const ratio = Math.max(0, Math.min(1, roundedDist / wallLen));
                bestHit = {
                    wall: wall,
                    x: nA.x + (nB.x - nA.x) * ratio,
                    y: nA.y + (nB.y - nA.y) * ratio,
                    distFromStart: roundedDist
                };
            }
        }
        return bestHit;
    },

    /**
     * Průsečík dvou úseček AB a CD (vrátí { x, y, t, u } nebo null)
     */
    intersectSegments(a, b, c, d) {
        const rX = b.x - a.x;
        const rY = b.y - a.y;
        const sX = d.x - c.x;
        const sY = d.y - c.y;
        const denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-6) return null;

        const u = ((c.x - a.x) * rY - (c.y - a.y) * rX) / denom;
        const t = ((c.x - a.x) * sY - (c.y - a.y) * sX) / denom;
        if (u >= 0 && u <= 1) {
            return {
                x: c.x + u * sX,
                y: c.y + u * sY,
                t,
                u
            };
        }
        return null;
    },

    /**
     * Zarovnání koncového bodu podle Ortho režimu (0°, 90°, 180°, 270° a volitelně 45°)
     * a chytrých vodítek (zarovnání s existujícími uzly v ose X nebo Y).
     */
    applyDrawingConstraints(startPt, rawEndPt, state) {
        const camera = state.camera;
        const result = {
            x: rawEndPt.x,
            y: rawEndPt.y,
            snappedNode: null,
            orthoLocked: false,
            guideX: null, // souřadnice X uzlu, se kterým jsme v zákrytu
            guideY: null, // souřadnice Y uzlu, se kterým jsme v zákrytu
            snappedGrid: false
        };

        // 1. Nejvyšší priorita: Přichycení na existující uzel (uzavření rohu)
        if (state.settings.snapToNodes) {
            const snapNode = this.findSnapNode(rawEndPt, state.nodes, camera, 20, state.drawing.startNodeId);
            if (snapNode) {
                result.x = snapNode.x;
                result.y = snapNode.y;
                result.snappedNode = snapNode;
                return result;
            }
        }

        // 2. Ortho zarovnání (pravé úhly 0°, 90°, 180°, 270° + u obdélníku přiskočení ke čtverci)
        const isRectMode = state.activeTool === 'line' && state.lineDefaults.subMode === 'rect';
        if (isRectMode && startPt) {
            const dx = rawEndPt.x - startPt.x;
            const dy = rawEndPt.y - startPt.y;
            const maxSide = Math.max(Math.abs(dx), Math.abs(dy));
            if (maxSide > 100 && Math.abs(Math.abs(dx) - Math.abs(dy)) < maxSide * 0.06) {
                const side = Math.round(maxSide / 10) * 10;
                result.x = startPt.x + Math.sign(dx || 1) * side;
                result.y = startPt.y + Math.sign(dy || 1) * side;
                result.orthoLocked = true;
            }
        } else if (state.settings.orthoMode && startPt) {
            const dx = rawEndPt.x - startPt.x;
            const dy = rawEndPt.y - startPt.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 10 / camera.zoom) {
                const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 až 180
                const snapToleranceDeg = 12; // stupně tolerance pro přiskočení k 90°

                // Vodorovně (0° nebo 180°)
                if (Math.abs(angle) < snapToleranceDeg || Math.abs(Math.abs(angle) - 180) < snapToleranceDeg) {
                    result.y = startPt.y;
                    result.orthoLocked = true;
                }
                // Svisle (90° nebo -90°)
                else if (Math.abs(Math.abs(angle) - 90) < snapToleranceDeg) {
                    result.x = startPt.x;
                    result.orthoLocked = true;
                }
            }
        }

        // 3. Chytrá vodítka (Smart Guides) - zarovnání s jinými rohy v místnosti (X nebo Y)
        if (state.settings.snapToNodes) {
            const guideToleranceWorld = 12 / camera.zoom;
            for (const node of state.nodes) {
                if (startPt && node.x === startPt.x && node.y === startPt.y) continue;

                if (Math.abs(result.x - node.x) < guideToleranceWorld) {
                    result.x = node.x;
                    result.guideX = node;
                }
                if (Math.abs(result.y - node.y) < guideToleranceWorld) {
                    result.y = node.y;
                    result.guideY = node;
                }
            }
        }

        // 3b. Přichycení na hranu existující stěny (např. při kreslení překladu nebo příčky od stěny ke stěně)
        if (state.settings.snapToNodes) {
            const wallHit = this.findSnapWallEdge(result, state, 20);
            if (wallHit) {
                const nA = state.getNodeById(wallHit.wall.startNodeId);
                const nB = state.getNodeById(wallHit.wall.endNodeId);
                let snappedPt = { x: wallHit.x, y: wallHit.y };

                // Pokud držíme 90° Ortho kolmost, najdeme přesný průsečík Ortho přímky se stěnou!
                if (result.orthoLocked && startPt && nA && nB) {
                    const isect = this.intersectSegments(startPt, result, nA, nB);
                    if (isect) {
                        snappedPt = { x: isect.x, y: isect.y };
                    }
                }
                result.x = snappedPt.x;
                result.y = snappedPt.y;
                result.snappedWall = wallHit.wall;
                return result;
            }
        }

        // 4. Jemné zaokrouhlení na 10 mm při kreslení od ruky (pokud nejsme přichyceni na uzel/vodítko/stěnu)
        if (!result.snappedNode) {
            const step = 10; // 10 mm = 1 cm
            if (!result.guideX && !(result.orthoLocked && result.x === startPt?.x)) {
                result.x = Math.round(result.x / step) * step;
            }
            if (!result.guideY && !(result.orthoLocked && result.y === startPt?.y)) {
                result.y = Math.round(result.y / step) * step;
            }
        }

        return result;
    },

    /**
     * Vypočítá 4 rohy a parametry obdélníku schodiště ve světových souřadnicích (mm)
     * z nástupního bodu (x1, y1), výstupního bodu (x2, y2), šířky (width) a strany rozšíření (expandSide: 1|-1|0).
     */
    computeStaircaseGeometry(stair) {
        const dx = stair.x2 - stair.x1;
        const dy = stair.y2 - stair.y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / length;
        const uy = dy / length;
        // Normála vpravo od směru výstupu
        const nx = -uy;
        const ny = ux;

        const w = stair.width || 1000;
        const side = stair.expandSide !== undefined ? stair.expandSide : 1;

        let offsetLeft = 0;
        let offsetRight = w;
        if (side === -1) {
            offsetLeft = -w;
            offsetRight = 0;
        } else if (side === 0) {
            offsetLeft = -w / 2;
            offsetRight = w / 2;
        }

        const pStartA = { x: stair.x1 + nx * offsetLeft, y: stair.y1 + ny * offsetLeft };
        const pStartB = { x: stair.x1 + nx * offsetRight, y: stair.y1 + ny * offsetRight };
        const pEndB   = { x: stair.x2 + nx * offsetRight, y: stair.y2 + ny * offsetRight };
        const pEndA   = { x: stair.x2 + nx * offsetLeft, y: stair.y2 + ny * offsetLeft };

        const midOffset = (offsetLeft + offsetRight) / 2;
        const axisStart = { x: stair.x1 + nx * midOffset, y: stair.y1 + ny * midOffset };
        const axisEnd   = { x: stair.x2 + nx * midOffset, y: stair.y2 + ny * midOffset };
        const center    = { x: (axisStart.x + axisEnd.x) / 2, y: (axisStart.y + axisEnd.y) / 2 };

        return {
            length,
            width: w,
            ux, uy, nx, ny,
            offsetLeft, offsetRight,
            pStartA, pStartB, pEndB, pEndA,
            axisStart, axisEnd, center
        };
    }
};
