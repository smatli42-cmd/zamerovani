/**
 * Modul: canvas/drawDims.js
 * Vykreslování normových stavebních kót (ČSN):
 * - Pokud je ve stěně okno/dveře, automaticky vytvoří 2 kótovací řady:
 *   1. Vnitřní řada (blíž ke stěně): Dílčí řetězová kóta [Ostění A] – [Šířka otvoru + výška/parapet] – [Ostění B]
 *   2. Vnější řada (dál od stěny): Celková délka stěny [A ─── B]
 * - Kliknutím na libovolné číslo (ostění, šířku otvoru nebo celkovou stěnu) se otevře NumPad!
 */
window.App = window.App || {};

window.App.DrawDims = {
    // Seznam klikacích štítků kót v aktuálním snímku:
    // [{ kind: 'wall'|'jamb-start'|'jamb-end'|'opening-width', wallId, openingId, x, y, angle, halfW, halfH, radius }]
    dimHitBoxes: [],
    // Překážky na obrazovce (např. štítky "🔒 A (pevný)" / "🎯 B (posun)" u vybrané stěny), kterým se kóty také vyhýbají
    obstacleBoxes: [],

    getScale() {
        return (window.App.State && window.App.State.settings && window.App.State.settings.dimScale) || 1.15;
    },

    /**
     * Zjistí, zda se dva obdélníkové štítky na obrazovce překrývají (s bezpečnostním odstupem padPx)
     */
    boxesOverlap(a, b, padPx = 5) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        // Rychlý AABB obal zohledňující případné natočení štítku
        const cosA = Math.abs(Math.cos(a.angle || 0));
        const sinA = Math.abs(Math.sin(a.angle || 0));
        const aHalfX = (a.halfW || 20) * cosA + (a.halfH || 12) * sinA;
        const aHalfY = (a.halfW || 20) * sinA + (a.halfH || 12) * cosA;

        const cosB = Math.abs(Math.cos(b.angle || 0));
        const sinB = Math.abs(Math.sin(b.angle || 0));
        const bHalfX = (b.halfW || 20) * cosB + (b.halfH || 12) * sinB;
        const bHalfY = (b.halfW || 20) * sinB + (b.halfH || 12) * cosB;

        return dx < (aHalfX + bHalfX + padPx) && dy < (aHalfY + bHalfY + padPx);
    },

    /**
     * Zkontroluje, zda by navrhovaný štítek (x, y, boxW, boxH, angle) kolidoval s některou již vykreslenou kótou nebo překážkou
     */
    doesBadgeCollide(x, y, boxW, boxH, angle = 0, padPx = 5) {
        const cand = { x, y, angle, halfW: boxW / 2, halfH: boxH / 2 };
        for (const box of this.dimHitBoxes) {
            if (this.boxesOverlap(cand, box, padPx)) return true;
        }
        for (const obs of this.obstacleBoxes) {
            if (this.boxesOverlap(cand, obs, padPx)) return true;
        }
        return false;
    },

    /**
     * Zjistí, zda pomocná čára/oblouk (wall.isAuxLine) leží svými koncovými body přímo na některé nosné stěně.
     * V takovém případě nosná stěna už tuto vzdálenost kótuje ve své řetězové kótě a nemá smysl kreslit duplicitní kótu přes ni!
     */
    findHostWallForAuxSpan(auxWall, state) {
        if (!auxWall || !auxWall.isAuxLine) return null;
        const Geo = window.App.Geometry;
        const n1 = state.getNodeById(auxWall.startNodeId);
        const n2 = state.getNodeById(auxWall.endNodeId);
        if (!n1 || !n2) return null;

        for (const w of state.walls) {
            if (w.isAuxLine || w.id === auxWall.id) continue;
            const wA = state.getNodeById(w.startNodeId);
            const wB = state.getNodeById(w.endNodeId);
            if (!wA || !wB) continue;

            const d1 = Geo.pointToSegmentDistance(n1, wA, wB);
            const d2 = Geo.pointToSegmentDistance(n2, wA, wB);
            if (d1.distance <= 3.0 && d2.distance <= 3.0 && d1.t >= -0.01 && d1.t <= 1.01 && d2.t >= -0.01 && d2.t <= 1.01) {
                return w;
            }
        }
        return null;
    },

    /**
     * Zjistí, zda mezi dvěma body na nosné stěně (segP1 -> segP2) existuje oblouk (buď jako segmentOverride, nebo jako připojená oblouková čára),
     * a vrátí jeho vychýlení směrem do kótovací strany stěny (nx, ny) v pixelech + informaci, zda je oblouk právě vybraný.
     */
    getSpanArcInfoOnWall(wall, segWorldStart, segWorldEnd, segP1, segP2, nx, ny, state) {
        const Geo = window.App.Geometry;
        const cam = state.camera;
        let maxOutwardBulgePx = 0;
        let maxInwardBulgePx = 0;
        let isSpanArcSelected = false;

        const checkArc = (pStartScreen, pEndScreen, arcH, isSel) => {
            if (isSel) isSpanArcSelected = true;
            if (!arcH || Math.abs(arcH) < 5) return;
            const arcGeom = Geo.computeArcGeometry(pStartScreen, pEndScreen, arcH * cam.zoom);
            if (!arcGeom) return;
            const midX = (pStartScreen.x + pEndScreen.x) / 2;
            const midY = (pStartScreen.y + pEndScreen.y) / 2;
            const projOut = (arcGeom.peak.x - midX) * nx + (arcGeom.peak.y - midY) * ny;
            if (projOut > maxOutwardBulgePx) maxOutwardBulgePx = projOut;
            if (-projOut > maxInwardBulgePx) maxInwardBulgePx = -projOut;
        };

        // 1. Zkontrolujeme případný oblouk přímo na dílčím segmentu nosné stěny
        if (wall.segmentOverrides) {
            const segments = state.getWallSegmentsSorted ? state.getWallSegmentsSorted(wall) : [];
            for (const seg of segments) {
                const dA = Geo.distance(seg.startNode, segWorldStart);
                const dB = Geo.distance(seg.endNode, segWorldEnd);
                if (dA < 5 && dB < 5) {
                    const ov = seg.override || {};
                    const isSel = state.selection.selectedWallId === wall.id && state.selection.selectedSegmentKey === seg.key;
                    if (ov.arcHeight) {
                        checkArc(segP1, segP2, ov.arcHeight, isSel);
                    }
                }
            }
        }

        // 2. Zkontrolujeme připojenou obloukovou nebo pomocnou čáru (isAuxLine) mezi těmito dvěma body na stěně
        for (const w of state.walls) {
            if (!w.isAuxLine) continue;
            const wn1 = state.getNodeById(w.startNodeId);
            const wn2 = state.getNodeById(w.endNodeId);
            if (!wn1 || !wn2) continue;

            const matchForward = Geo.distance(wn1, segWorldStart) < 5 && Geo.distance(wn2, segWorldEnd) < 5;
            const matchBackward = Geo.distance(wn2, segWorldStart) < 5 && Geo.distance(wn1, segWorldEnd) < 5;
            if (matchForward || matchBackward) {
                const isSel = state.selection.selectedWallId === w.id;
                const wp1 = Geo.worldToScreen(wn1.x, wn1.y, cam);
                const wp2 = Geo.worldToScreen(wn2.x, wn2.y, cam);
                checkArc(wp1, wp2, w.arcHeight || 0, isSel);
            }
        }

        return { maxOutwardBulgePx, maxInwardBulgePx, isSpanArcSelected };
    },

    render(ctx, state) {
        this.dimHitBoxes = [];
        this.obstacleBoxes = [];
        if (!state.settings.showDims) return;

        const Geo = window.App.Geometry;
        const cam = state.camera;
        const s = this.getScale();

        // 0. Zaregistrujeme štítky "🔒 A (pevný)" a "🎯 B (posun)" u vybrané stěny jako překážky, aby přes ně nešly kóty
        if (state.selection.selectedWallId && !state.selection.selectedOpeningId) {
            const selW = state.getWallById(state.selection.selectedWallId);
            if (selW) {
                const sn1 = state.getNodeById(selW.startNodeId);
                const sn2 = state.getNodeById(selW.endNodeId);
                if (sn1 && sn2) {
                    const sp1 = Geo.worldToScreen(sn1.x, sn1.y, cam);
                    const sp2 = Geo.worldToScreen(sn2.x, sn2.y, cam);
                    this.obstacleBoxes.push({ x: sp1.x, y: sp1.y + 22, angle: 0, halfW: 44, halfH: 12 });
                    this.obstacleBoxes.push({ x: sp2.x, y: sp2.y + 22, angle: 0, halfW: 44, halfH: 12 });
                }
            }
        }

        // 1. Spočítáme těžiště všech uzlů, abychom kóty stěn automaticky vynášeli směrem VEN z místnosti
        const centroid = this.computeCentroid(state.nodes);

        // Sbírka oblouků pro vykreslení kót vzepětí (⌒ v.XXX) až PO hlavních délkových kótách stěn (aby se jim mohly čistě vyhnout!)
        const pendingArcDims = [];

        // 2A. PRVNÍ PRŮCHOD: Hlavní nosné stěny (!wall.isAuxLine) – řetězové kóty a celkové délky stěn
        for (const wall of state.walls) {
            if (wall.isAuxLine) continue;
            const n1 = state.getNodeById(wall.startNodeId);
            const n2 = state.getNodeById(wall.endNodeId);
            if (!n1 || !n2) continue;

            const p1 = Geo.worldToScreen(n1.x, n1.y, cam);
            const p2 = Geo.worldToScreen(n2.x, n2.y, cam);

            const screenLen = Geo.distance(p1, p2);
            if (screenLen < 38) continue;

            const isSelected = state.selection.selectedWallId === wall.id;
            const isMeasured = wall.measuredLength !== null;
            const isConnectedToSelectedNode = Boolean(
                state.selection.selectedNodeId &&
                !state.selection.selectedWallId &&
                (wall.startNodeId === state.selection.selectedNodeId || wall.endNodeId === state.selection.selectedNodeId)
            );

            const geomLen = Math.round(Geo.distance(n1, n2));
            const hasDiscrepancy = isMeasured && Math.abs(geomLen - wall.measuredLength) > 5;
            const { ux, uy, nx, ny } = this.getWallScreenVectors(p1, p2, centroid, cam);

            // Uložíme si případné oblouky na stěně do fronty pendingArcDims
            const segments = state.getWallSegmentsSorted ? state.getWallSegmentsSorted(wall) : [];
            if (segments.length > 1) {
                for (const seg of segments) {
                    const ov = seg.override || {};
                    if (ov.hidden) continue;
                    const effArc = ov.arcHeight !== undefined ? ov.arcHeight : 0;
                    if (effArc && Math.abs(effArc) >= 5) {
                        const sp1 = Geo.worldToScreen(seg.startNode.x, seg.startNode.y, cam);
                        const sp2 = Geo.worldToScreen(seg.endNode.x, seg.endNode.y, cam);
                        const isSegSel = isSelected && state.selection.selectedSegmentKey === seg.key;
                        pendingArcDims.push({ sp1, sp2, wall, isSel: isSegSel, effArc, segKey: seg.key });
                    }
                }
            } else if (wall.arcHeight && Math.abs(wall.arcHeight) >= 5) {
                pendingArcDims.push({ sp1: p1, sp2: p2, wall, isSel: isSelected, effArc: wall.arcHeight, segKey: null });
            }

            const chainItems = state.getWallChainItemsSorted ? state.getWallChainItemsSorted(wall) : [];

            if (chainItems.length > 0) {
                // 1. řada (blíž ke stěně): Řetězová kóta (Ostění A – Otvor / Bod překladu / Oblouk – Meziostění – Ostění B)
                const chainMetrics = this.drawOpeningChainDims(ctx, n1, n2, p1, p2, wall, geomLen, chainItems, {
                    ux, uy, nx, ny, baseOffsetPx: Math.round(38 * s), state
                });

                // 2. řada (dál od stěny): Celková délka stěny (automaticky odsunutá nad všechny poznámky, oblouky a kóty!)
                this.drawSingleDimSegment(ctx, p1, p2, {
                    ux, uy, nx, ny,
                    extStartPx: chainMetrics.outerExtStartPx,
                    dimOffsetPx: chainMetrics.outerOffsetPx,
                    labelText: this.getWallLabelText(wall, geomLen, hasDiscrepancy, isConnectedToSelectedNode),
                    subText: null,
                    noteText: wall.note ? wall.note.trim() : null,
                    styleMode: hasDiscrepancy ? 'error' : (isSelected && !state.selection.selectedOpeningId && !state.selection.selectedSegmentKey ? 'selected' : (isConnectedToSelectedNode ? 'orange' : (isMeasured ? 'measured' : 'sketch'))),
                    hitInfo: { kind: 'wall', wallId: wall.id, openingId: null }
                });
            } else {
                // Stěna bez vložených prvků: pokud je sama prohnutá do oblouku na stranu kót, posuneme kótu nad oblouk
                const arcBulgeOutPx = (wall.arcHeight && Math.abs(wall.arcHeight) >= 5)
                    ? this.getSpanArcInfoOnWall(wall, n1, n2, p1, p2, nx, ny, state).maxOutwardBulgePx
                    : 0;
                const baseDimOff = Math.max(Math.round(36 * s), Math.round(arcBulgeOutPx + 24 * s));
                this.drawSingleDimSegment(ctx, p1, p2, {
                    ux, uy, nx, ny,
                    extStartPx: Math.round(6 * s),
                    dimOffsetPx: baseDimOff,
                    labelText: this.getWallLabelText(wall, geomLen, hasDiscrepancy, isConnectedToSelectedNode),
                    subText: null,
                    noteText: wall.note ? wall.note.trim() : null,
                    styleMode: hasDiscrepancy ? 'error' : (isSelected ? 'selected' : (isConnectedToSelectedNode ? 'orange' : (isMeasured ? 'measured' : 'sketch'))),
                    hitInfo: { kind: 'wall', wallId: wall.id, openingId: null }
                });
            }
        }

        // 2B. DRUHÝ PRŮCHOD: Pomocné čáry, překlady a samostatné oblouky (wall.isAuxLine)
        for (const wall of state.walls) {
            if (!wall.isAuxLine) continue;
            const n1 = state.getNodeById(wall.startNodeId);
            const n2 = state.getNodeById(wall.endNodeId);
            if (!n1 || !n2) continue;

            const p1 = Geo.worldToScreen(n1.x, n1.y, cam);
            const p2 = Geo.worldToScreen(n2.x, n2.y, cam);
            const screenLen = Geo.distance(p1, p2);
            if (screenLen < 32) continue;

            const isSelected = state.selection.selectedWallId === wall.id;
            const isMeasured = wall.measuredLength !== null;
            const geomLen = Math.round(Geo.distance(n1, n2));
            const hasDiscrepancy = isMeasured && Math.abs(geomLen - wall.measuredLength) > 5;
            const { ux, uy, nx, ny } = this.getWallScreenVectors(p1, p2, centroid, cam);

            if (wall.arcHeight && Math.abs(wall.arcHeight) >= 5) {
                pendingArcDims.push({ sp1: p1, sp2: p2, wall, isSel: isSelected, effArc: wall.arcHeight, segKey: null });
            }

            const hasNote = Boolean(wall.note && wall.note.trim());
            if (!wall.showOwnDim && !isSelected && !hasNote) {
                continue;
            }

            // Pokud tato pomocná čára/oblouk leží přímo na nosné stěně, nosná stěna už její rozpětí kótuje ve své řetězové kótě!
            // Vykreslíme tedy štítek pouze tehdy, pokud má uživatel napsanou textovou poznámku (např. "překlad").
            const hostWall = this.findHostWallForAuxSpan(wall, state);
            if (hostWall && !hasNote) {
                continue;
            }

            const showOnlyNote = Boolean(hostWall && hasNote) || (!wall.showOwnDim && !isSelected && hasNote);
            const labelText = showOnlyNote ? wall.note.trim() : this.getWallLabelText(wall, geomLen, hasDiscrepancy, false);
            const noteText = showOnlyNote ? null : (hasNote ? wall.note.trim() : null);

            // Najdeme volný odstup dimOffsetPx, aby se štítek pomocné čáry nepřekrýval s jinou kótou
            const metrics = this.measureDimBadge(ctx, screenLen, labelText, null, noteText);
            let textAngle = Math.atan2(uy, ux);
            if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) textAngle += Math.PI;

            const baseOff = Math.round(24 * s);
            const candidateOffsets = [baseOff, -baseOff, Math.round(48 * s), -Math.round(48 * s), Math.round(72 * s)];
            let chosenOffset = baseOff;
            const midLineX = (p1.x + p2.x) / 2;
            const midLineY = (p1.y + p2.y) / 2;
            for (const candOff of candidateOffsets) {
                const cx = midLineX + nx * candOff;
                const cy = midLineY + ny * candOff;
                if (!this.doesBadgeCollide(cx, cy, metrics.boxW, metrics.boxH, textAngle, 5)) {
                    chosenOffset = candOff;
                    break;
                }
            }

            const sign = chosenOffset >= 0 ? 1 : -1;
            this.drawSingleDimSegment(ctx, p1, p2, {
                ux, uy,
                nx: nx * sign,
                ny: ny * sign,
                extStartPx: Math.round(6 * s),
                dimOffsetPx: Math.abs(chosenOffset),
                labelText,
                subText: null,
                noteText,
                precomputedMetrics: metrics,
                styleMode: hasDiscrepancy ? 'error' : (isSelected ? 'selected' : (isMeasured ? 'measured' : 'sketch')),
                hitInfo: { kind: 'wall', wallId: wall.id, openingId: null }
            });
        }

        // 3. Vykreslíme všechny kóty vzepětí oblouků (⌒ v.XXX) – automaticky uhýbají kótám stěny!
        for (const arcItem of pendingArcDims) {
            this.drawArcSagittaDim(ctx, arcItem.sp1, arcItem.sp2, arcItem.wall, cam, arcItem.isSel, arcItem.effArc, arcItem.segKey);
        }

        // 4. Vykreslíme měřené úhlopříčky (diagonály), kóty kružnic / sloupů a kóty schodišť
        this.drawDiagonals(ctx, state);
        this.drawCircleDims(ctx, state);
        this.drawStairDims(ctx, state);
    },

    getWallLabelText(wall, geomLen, hasDiscrepancy, isConnectedToSelectedNode) {
        const isMeasured = wall.measuredLength !== null;
        if (hasDiscrepancy) return `${wall.measuredLength} ⚠️ (${geomLen})`;
        if (isConnectedToSelectedNode) return `🎯 ${isMeasured ? wall.measuredLength : '~' + geomLen}`;
        if (isMeasured) return `${wall.measuredLength}`;
        return `~${geomLen}`;
    },

    getWallScreenVectors(p1, p2, centroid, camera) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len;
        const uy = dy / len;
        let nx = uy;
        let ny = -ux;

        if (centroid) {
            const cScreen = window.App.Geometry.worldToScreen(centroid.x, centroid.y, camera);
            const midWallX = (p1.x + p2.x) / 2;
            const midWallY = (p1.y + p2.y) / 2;
            const toOutX = midWallX - cScreen.x;
            const toOutY = midWallY - cScreen.y;
            if (nx * toOutX + ny * toOutY < 0) {
                nx = -nx;
                ny = -ny;
            }
        }
        return { ux, uy, nx, ny };
    },

    /**
     * Zalomení poznámky na více řádků tak, aby šířka textu nepřesáhla šířku daného prvku na obrazovce (maxWidth v px)
     */
    wrapTextLines(ctx, text, maxWidth) {
        if (!text) return [];
        const words = text.trim().split(/\s+/);
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            if (ctx.measureText(word).width > maxWidth && word.length > 4) {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = '';
                }
                let chunk = '';
                for (const ch of word) {
                    const testChunk = chunk + ch;
                    if (ctx.measureText(testChunk).width > maxWidth && chunk.length > 0) {
                        lines.push(chunk);
                        chunk = ch;
                    } else {
                        chunk = testChunk;
                    }
                }
                currentLine = chunk;
                continue;
            }

            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width <= maxWidth || !currentLine) {
                currentLine = testLine;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        return lines;
    },

    /**
     * Spočítá rozměry a zalomené řádky štítku pro daný úsek kóty (respektuje nastavené měřítko písma dimScale)
     */
    measureDimBadge(ctx, segLenPx, labelText, subText, noteText) {
        const s = this.getScale();
        const mainPx = Math.round(12.5 * s * 10) / 10;
        const subPx = Math.round(10.5 * s * 10) / 10;
        const notePx = Math.round(10 * s * 10) / 10;

        ctx.save();
        ctx.font = `700 ${mainPx}px system-ui, sans-serif`;
        const mainW = ctx.measureText(labelText).width;

        let subW = 0;
        if (subText) {
            ctx.font = `600 ${subPx}px system-ui, sans-serif`;
            subW = ctx.measureText(subText).width;
        }

        const padX = Math.round(7 * s);
        let noteLines = [];
        let maxNoteLineW = 0;

        if (noteText) {
            ctx.font = `700 ${notePx}px system-ui, sans-serif`;
            // Maximální šířka řádku poznámky odpovídá šířce prvku na plátně (minimálně však šířce čísla kóty)
            const maxWrapWidth = Math.max(mainW, subW, segLenPx - padX * 2 - 4, 46 * s);
            noteLines = this.wrapTextLines(ctx, noteText, maxWrapWidth);
            for (const ln of noteLines) {
                maxNoteLineW = Math.max(maxNoteLineW, ctx.measureText(ln).width);
            }
        }
        ctx.restore();

        const boxW = Math.max(mainW, subW, maxNoteLineW) + padX * 2;
        const noteLineH = Math.round(12 * s);
        let boxH = Math.round(21 * s);
        if (subText && noteLines.length > 0) {
            boxH = Math.round(34 * s) + noteLines.length * noteLineH;
        } else if (noteLines.length > 0) {
            boxH = Math.round(22 * s) + noteLines.length * noteLineH;
        } else if (subText) {
            boxH = Math.round(32 * s);
        }

        return { boxW, boxH, noteLines, noteLineH, s, mainPx, subPx, notePx };
    },

    /**
     * Vykreslí 1. kótovací řadu rozdělenou na: [Ostění od A] – [Otvor / Bod překladu / Oblouk] – [Meziostění] – [Ostění od B]
     * Kliknutím na ostění nebo rozestup lze v NumPadu přímo posouvat okno, dveře i koncové body překladů a oblouků!
     */
    drawOpeningChainDims(ctx, n1, n2, p1, p2, wall, wallLen, chainItems, opts) {
        const { ux, uy, nx, ny, baseOffsetPx = 38, state } = opts;
        const screenWallLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (screenWallLen < 60 || wallLen < 100) {
            return { outerOffsetPx: 78, outerExtStartPx: 42 };
        }

        // Pomocná funkce pro převod vzdálenosti od rohu A (v mm) na bod na obrazovce a ve světě
        const ptAtDist = (distMm) => {
            const ratio = Math.max(0, Math.min(1, distMm / wallLen));
            return {
                x: p1.x + (p2.x - p1.x) * ratio,
                y: p1.y + (p2.y - p1.y) * ratio
            };
        };
        const worldAtDist = (distMm) => {
            const ratio = Math.max(0, Math.min(1, distMm / wallLen));
            return {
                x: n1.x + (n2.x - n1.x) * ratio,
                y: n1.y + (n2.y - n1.y) * ratio
            };
        };

        // 1. Nejprve přeměříme výšky všech štítků otvorů (včetně zalomených poznámek podle šířky prvku)
        const iconMap = { door: '🚪', window: '🪟', opening: '⬜', niche: '凹' };
        let maxOpeningBoxH = 24;
        const itemPrepared = [];

        for (let i = 0; i < chainItems.length; i++) {
            const item = chainItems[i];
            if (item.kind === 'opening') {
                const op = item.op;
                const opP1 = ptAtDist(item.distStart);
                const opP2 = ptAtDist(item.distEnd);
                const segLenPx = Math.hypot(opP2.x - opP1.x, opP2.y - opP1.y);

                const icon = iconMap[op.type] || '⬜';
                const labelText = `${icon} ${item.width}`;
                let subInfo = `v.${op.height}`;
                if (op.type === 'window') {
                    subInfo = `v.${op.height} p.${op.sillHeight}`;
                } else if (op.type === 'opening') {
                    subInfo = op.sillHeight > 0 ? `v.${op.height} p.${op.sillHeight}` : `v.${op.height}`;
                } else if (op.type === 'niche') {
                    subInfo = `hl.${op.depth || 200} v.${op.height} p.${op.sillHeight}`;
                }
                const noteText = op.note ? op.note.trim() : null;
                const metrics = this.measureDimBadge(ctx, segLenPx, labelText, subInfo, noteText);
                maxOpeningBoxH = Math.max(maxOpeningBoxH, metrics.boxH);

                itemPrepared.push({ opP1, opP2, labelText, subInfo, noteText, metrics });
            } else {
                itemPrepared.push(null);
            }
        }

        const s = this.getScale();
        // Posuneme vnitřní kótovací čáru od stěny tak, aby ani víceřádková poznámka nebo větší písmo nezasahovalo do stěny
        const innerOffsetPx = baseOffsetPx + Math.max(0, Math.ceil((maxOpeningBoxH - 32 * s) / 2));
        // Základní odskok pro úzké úseky (ať už u okna, překladu nebo oblouku)
        const staggeredJambOffsetPx = innerOffsetPx + Math.ceil(maxOpeningBoxH / 2) + Math.round(16 * s);
        const tierStepPx = Math.round(25 * s);

        // Sestavíme seznam všech dílčích kótovacích úseků podél stěny, abychom vyřešili jejich vzájemné kolize i kolize s oblouky
        const segmentsToDraw = [];
        let prevDist = 0;

        for (let i = 0; i < chainItems.length; i++) {
            const item = chainItems[i];
            const isItemSelected = item.kind === 'opening'
                ? state.selection.selectedOpeningId === item.id
                : state.selection.selectedNodeId === item.id;

            // 1. Úsek PŘED prvkem (Ostění od rohu A, nebo rozestup mezi dvěma prvky na stěně)
            const jambStartLen = Math.max(0, item.distStart - prevDist);
            const isFirstJamb = (i === 0);

            if (isFirstJamb && jambStartLen >= 5) {
                const segP1 = ptAtDist(prevDist);
                const segP2 = ptAtDist(item.distStart);
                const segPx = Math.hypot(segP2.x - segP1.x, segP2.y - segP1.y);
                const jambLabel = `${jambStartLen}`;
                const jambMetrics = this.measureDimBadge(ctx, segPx, jambLabel, null, null);
                const arcInfo = this.getSpanArcInfoOnWall(wall, worldAtDist(prevDist), worldAtDist(item.distStart), segP1, segP2, nx, ny, state);
                const isNarrow = segPx < jambMetrics.boxW + Math.round(10 * s);
                const isActiveRef = (item.kind === 'opening' ? item.op.fromEnd === 'start' : isItemSelected) || arcInfo.isSpanArcSelected;

                let minOff = isNarrow ? staggeredJambOffsetPx : innerOffsetPx;
                if (arcInfo.maxOutwardBulgePx > 2) {
                    minOff = Math.max(minOff, Math.round(arcInfo.maxOutwardBulgePx + jambMetrics.boxH / 2 + 12 * s));
                }

                segmentsToDraw.push({
                    segP1, segP2, segPx,
                    minOffsetPx: minOff,
                    labelText: jambLabel,
                    subText: null,
                    noteText: null,
                    allowZeroLength: false,
                    metrics: jambMetrics,
                    styleMode: ((isItemSelected && isActiveRef) || arcInfo.isSpanArcSelected) ? 'jamb-active' : 'jamb',
                    hitInfo: {
                        kind: 'jamb-start',
                        wallId: wall.id,
                        openingId: item.id,
                        itemKind: item.kind
                    }
                });
            } else if (!isFirstJamb) {
                // MEZIOSTĚNÍ / ROZESTUP (mezi okny, čarami překladu nebo koncovými body oblouku!)
                const prevItem = chainItems[i - 1];
                if (prevItem.kind === 'node' && item.kind === 'node' && jambStartLen < 5) {
                    prevDist = item.distEnd;
                    continue;
                }
                const segP1 = ptAtDist(prevDist);
                const segP2 = ptAtDist(item.distStart);
                const segPx = Math.hypot(segP2.x - segP1.x, segP2.y - segP1.y);
                const jambLabel = jambStartLen === 0 ? '🔗 0' : `${jambStartLen}`;
                const jambMetrics = this.measureDimBadge(ctx, segPx, jambLabel, null, null);
                const arcInfo = this.getSpanArcInfoOnWall(wall, worldAtDist(prevDist), worldAtDist(item.distStart), segP1, segP2, nx, ny, state);

                // Odskočíme vždy, když je úsek užší než štítek (bez ohledu na to, zda jde o okno nebo přidaný prvek!)
                const isNarrow = jambStartLen === 0 || segPx < jambMetrics.boxW + Math.round(10 * s);
                let minOff = isNarrow ? staggeredJambOffsetPx : innerOffsetPx;
                if (arcInfo.maxOutwardBulgePx > 2) {
                    // Pokud je v tomto úseku oblouk vyboulený ven ke kótám, vyneseme kótu rozpětí čistě NAD vrchol oblouku!
                    minOff = Math.max(minOff, Math.round(arcInfo.maxOutwardBulgePx + jambMetrics.boxH / 2 + 12 * s));
                }

                const isPrevSelected = prevItem.kind === 'opening'
                    ? state.selection.selectedOpeningId === prevItem.id
                    : state.selection.selectedNodeId === prevItem.id;
                const isBetweenSelected = isItemSelected || isPrevSelected || arcInfo.isSpanArcSelected;

                segmentsToDraw.push({
                    segP1, segP2, segPx,
                    minOffsetPx: minOff,
                    labelText: jambLabel,
                    subText: null,
                    noteText: null,
                    allowZeroLength: true,
                    metrics: jambMetrics,
                    styleMode: isBetweenSelected ? 'jamb-active' : 'jamb',
                    hitInfo: {
                        kind: 'jamb-between',
                        wallId: wall.id,
                        prevOpeningId: prevItem.id,
                        openingId: item.id,
                        itemKind: item.kind
                    }
                });
            }

            // 2. Úsek SAMOTNÉHO OTVORU (pokud jde o otvor; koncový bod čáry má šířku 0)
            if (item.kind === 'opening') {
                const prep = itemPrepared[i];
                const op = item.op;
                segmentsToDraw.push({
                    segP1: prep.opP1,
                    segP2: prep.opP2,
                    segPx: Math.hypot(prep.opP2.x - prep.opP1.x, prep.opP2.y - prep.opP1.y),
                    minOffsetPx: innerOffsetPx,
                    labelText: prep.labelText,
                    subText: prep.subInfo,
                    noteText: prep.noteText,
                    allowZeroLength: false,
                    metrics: prep.metrics,
                    styleMode: isItemSelected ? 'selected' : (op.type || 'opening'),
                    hitInfo: {
                        kind: 'opening-width',
                        wallId: wall.id,
                        openingId: op.id
                    }
                });
            }

            prevDist = item.distEnd;
        }

        // 3. Úsek ZA posledním prvkem (Ostění k rohu B)
        const lastItem = chainItems[chainItems.length - 1];
        const jambEndLen = Math.round(wallLen - prevDist);
        if (jambEndLen >= 10) {
            const segP1 = ptAtDist(prevDist);
            const segP2 = p2;
            const segPx = Math.hypot(segP2.x - segP1.x, segP2.y - segP1.y);
            const jambLabel = `${jambEndLen}`;
            const jambMetrics = this.measureDimBadge(ctx, segPx, jambLabel, null, null);
            const arcInfo = this.getSpanArcInfoOnWall(wall, worldAtDist(prevDist), n2, segP1, segP2, nx, ny, state);
            const isNarrow = segPx < jambMetrics.boxW + Math.round(10 * s);

            let minOff = isNarrow ? staggeredJambOffsetPx : innerOffsetPx;
            if (arcInfo.maxOutwardBulgePx > 2) {
                minOff = Math.max(minOff, Math.round(arcInfo.maxOutwardBulgePx + jambMetrics.boxH / 2 + 12 * s));
            }

            const isLastSelected = lastItem.kind === 'opening'
                ? state.selection.selectedOpeningId === lastItem.id
                : state.selection.selectedNodeId === lastItem.id;
            const isActiveRef = (lastItem.kind === 'opening' ? lastItem.op.fromEnd === 'end' : isLastSelected) || arcInfo.isSpanArcSelected;

            segmentsToDraw.push({
                segP1, segP2, segPx,
                minOffsetPx: minOff,
                labelText: jambLabel,
                subText: null,
                noteText: null,
                allowZeroLength: false,
                metrics: jambMetrics,
                styleMode: ((isLastSelected && isActiveRef) || arcInfo.isSpanArcSelected) ? 'jamb-active' : 'jamb',
                hitInfo: {
                    kind: 'jamb-end',
                    wallId: wall.id,
                    openingId: lastItem.id,
                    itemKind: lastItem.kind
                }
            });
        }

        // 4. Vykreslíme jednotlivé úseky řetězové kóty a zajistíme, že se žádné dva sousední štítky nepřekryjí!
        // Nejprve položíme širší prvky (otvory a široká ostění) na základní hladinu a poté úzké prvky, které v případě kolize samy povyskočí výš.
        const order = segmentsToDraw.map((_, idx) => idx).sort((a, b) => {
            const sa = segmentsToDraw[a];
            const sb = segmentsToDraw[b];
            if (sa.minOffsetPx !== sb.minOffsetPx) return sa.minOffsetPx - sb.minOffsetPx;
            return sb.segPx - sa.segPx;
        });

        let maxChainTopEdgePx = innerOffsetPx + Math.ceil(maxOpeningBoxH / 2);
        let textAngle = Math.atan2(uy, ux);
        if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) textAngle += Math.PI;

        for (const idx of order) {
            const seg = segmentsToDraw[idx];
            if (!seg.allowZeroLength && seg.segPx < 16) continue;

            const midSegX = (seg.segP1.x + seg.segP2.x) / 2;
            const midSegY = (seg.segP1.y + seg.segP2.y) / 2;
            let chosenOffsetPx = seg.minOffsetPx;

            // Pokud by se štítek na chosenOffsetPx srazil se sousedním štítkem (např. "250" u oblouku a "70" vedle něj),
            // automaticky ho posuneme o kótovací patro výš!
            for (let attempt = 0; attempt < 4; attempt++) {
                const cx = midSegX + nx * chosenOffsetPx;
                const cy = midSegY + ny * chosenOffsetPx;
                if (!this.doesBadgeCollide(cx, cy, seg.metrics.boxW, seg.metrics.boxH, textAngle, Math.round(5 * s))) {
                    break;
                }
                chosenOffsetPx += tierStepPx;
            }

            maxChainTopEdgePx = Math.max(maxChainTopEdgePx, chosenOffsetPx + Math.ceil(seg.metrics.boxH / 2));

            this.drawSingleDimSegment(ctx, seg.segP1, seg.segP2, {
                ux, uy, nx, ny,
                extStartPx: Math.round(6 * s),
                dimOffsetPx: chosenOffsetPx,
                labelText: seg.labelText,
                subText: seg.subText,
                noteText: seg.noteText,
                allowZeroLength: seg.allowZeroLength,
                precomputedMetrics: seg.metrics,
                styleMode: seg.styleMode,
                hitInfo: seg.hitInfo
            });
        }

        return {
            outerOffsetPx: Math.max(Math.round(74 * s), maxChainTopEdgePx + Math.round(26 * s)),
            outerExtStartPx: innerOffsetPx + Math.round(6 * s)
        };
    },

    /**
     * Vykreslí klikací kótu vzepětí oblouku (⌒ v.XXX) uprostřed prohnuté čáry/stěny nebo jejího úseku.
     * Automaticky testuje volné pozice (uvnitř oblouku, nad vrcholem oblouku nebo na vnitřní straně tětivy),
     * aby se štítek ⌒ v.XXX nikdy nepřekryl s kótou šířky (např. 250) ani se štítky rohů!
     */
    drawArcSagittaDim(ctx, p1, p2, wall, cam, isSelected, arcHeightVal = null, segmentKey = null) {
        const Geo = window.App.Geometry;
        const s = this.getScale();
        const effArc = arcHeightVal !== null ? arcHeightVal : (wall.arcHeight || 0);
        const arcPx = effArc * cam.zoom;
        const arc = Geo.computeArcGeometry(p1, p2, arcPx);
        if (!arc) return;

        const label = `⌒ v.${Math.abs(Math.round(effArc))}`;
        ctx.save();
        ctx.font = `700 ${Math.round(11.5 * s * 10) / 10}px system-ui, sans-serif`;
        const tw = ctx.measureText(label).width;
        const boxW = tw + Math.round(12 * s);
        const boxH = Math.round(20 * s);

        // Směrový vektor osy vzepětí (od středu tětivy arc.mid k vrcholu oblouku arc.peak)
        const sdx = arc.peak.x - arc.mid.x;
        const sdy = arc.peak.y - arc.mid.y;
        const sLen = Math.max(1, Math.hypot(sdx, sdy));
        const snx = sdx / sLen;
        const sny = sdy / sLen;
        // Tečný vektor podél tětivy
        const stx = -sny;
        const sty = snx;

        const midSagX = (arc.mid.x + arc.peak.x) / 2;
        const midSagY = (arc.mid.y + arc.peak.y) / 2;

        // Kandidátní pozice pro štítek "⌒ v.XXX":
        // 1. Uprostřed pod obloukem (jen pokud je oblouk na obrazovce dostatečně vysoký, aby se tam štítek vešel bez přečnívání přes tětivu a vrchol)
        // 2. Na opačné (vnitřní) straně tětivy (směrem od kót stěny!) – v různých vzdálenostech
        // 3. Nad vrcholem oblouku (v prodloužení osy vzepětí)
        // 4. Mírně do strany od osy vzepětí
        const candidates = [];
        if (sLen >= boxH + Math.round(18 * s)) {
            candidates.push({ x: midSagX, y: midSagY, anchor: arc.mid });
        }
        // Opačná strana tětivy (kde většinou nejsou kóty stěny)
        candidates.push({ x: arc.mid.x - snx * (boxH / 2 + Math.round(16 * s)), y: arc.mid.y - sny * (boxH / 2 + Math.round(16 * s)), anchor: arc.mid });
        // Nad vrcholem oblouku
        candidates.push({ x: arc.peak.x + snx * (boxH / 2 + Math.round(16 * s)), y: arc.peak.y + sny * (boxH / 2 + Math.round(16 * s)), anchor: arc.peak });
        candidates.push({ x: arc.mid.x - snx * (boxH / 2 + Math.round(40 * s)), y: arc.mid.y - sny * (boxH / 2 + Math.round(40 * s)), anchor: arc.mid });
        candidates.push({ x: arc.peak.x + snx * (boxH / 2 + Math.round(44 * s)), y: arc.peak.y + sny * (boxH / 2 + Math.round(44 * s)), anchor: arc.peak });
        candidates.push({ x: arc.peak.x + snx * (boxH / 2 + Math.round(70 * s)), y: arc.peak.y + sny * (boxH / 2 + Math.round(70 * s)), anchor: arc.peak });
        // Boční odskoky pro velmi stísněná místa
        candidates.push({ x: arc.mid.x - snx * (boxH / 2 + Math.round(28 * s)) + stx * (boxW * 0.65), y: arc.mid.y - sny * (boxH / 2 + Math.round(28 * s)) + sty * (boxW * 0.65), anchor: arc.mid });
        candidates.push({ x: arc.mid.x - snx * (boxH / 2 + Math.round(28 * s)) - stx * (boxW * 0.65), y: arc.mid.y - sny * (boxH / 2 + Math.round(28 * s)) - sty * (boxW * 0.65), anchor: arc.mid });

        let chosen = candidates[0];
        for (const cand of candidates) {
            if (!this.doesBadgeCollide(cand.x, cand.y, boxW, boxH, 0, Math.round(4 * s))) {
                chosen = cand;
                break;
            }
        }

        // Vykreslíme čárkovanou osu vzepětí oblouku (od tětivy k vrcholu oblouku + případnou odkazovou čárku k posunutému štítku)
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = isSelected ? '#2563eb' : '#0284c7';
        ctx.lineWidth = 1.3;
        ctx.moveTo(arc.mid.x, arc.mid.y);
        ctx.lineTo(arc.peak.x, arc.peak.y);
        if (Math.hypot(chosen.x - midSagX, chosen.y - midSagY) > 6) {
            ctx.moveTo(chosen.anchor.x, chosen.anchor.y);
            ctx.lineTo(chosen.x, chosen.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = isSelected ? '#2563eb' : '#f0f9ff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(chosen.x - boxW / 2, chosen.y - boxH / 2, boxW, boxH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#ffffff' : '#0369a1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, chosen.x, chosen.y + 0.5);
        ctx.restore();

        this.dimHitBoxes.push({
            kind: 'arc-height',
            wallId: wall.id,
            segmentKey: segmentKey || null,
            x: chosen.x,
            y: chosen.y,
            angle: 0,
            halfW: boxW / 2 + 3,
            halfH: boxH / 2 + 3,
            radius: Math.max(boxW / 2 + 3, 16)
        });
    },

    /**
     * Vykreslí klikací kótu průměru kružnice (⌀ XXX) a u vybrané kružnice i kolmé kóty k nejbližším stěnám
     */
    drawCircleDims(ctx, state) {
        if (!state.circles || state.circles.length === 0) return;
        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const cir of state.circles) {
            const cScreen = Geo.worldToScreen(cir.x, cir.y, cam);
            const rScreen = (cir.diameter / 2) * cam.zoom;
            const isSelected = state.selection.selectedCircleId === cir.id;

            const label = `⌀ ${Math.round(cir.diameter)}`;
            const noteText = cir.note ? cir.note.trim() : null;
            const metrics = this.measureDimBadge(ctx, Math.max(60, rScreen * 1.8), label, null, noteText);
            const { boxW, boxH, noteLines, noteLineH } = metrics;

            const candPositions = [
                { x: cScreen.x, y: cScreen.y - rScreen - boxH / 2 - 8 },
                { x: cScreen.x, y: cScreen.y + rScreen + boxH / 2 + 8 },
                { x: cScreen.x + rScreen + boxW / 2 + 8, y: cScreen.y },
                { x: cScreen.x - rScreen - boxW / 2 - 8, y: cScreen.y }
            ];
            let badgePos = candPositions[0];
            for (const cp of candPositions) {
                if (!this.doesBadgeCollide(cp.x, cp.y, boxW, boxH, 0, 4)) {
                    badgePos = cp;
                    break;
                }
            }
            const badgeX = badgePos.x;
            const badgeY = badgePos.y;

            ctx.save();
            ctx.fillStyle = isSelected ? '#2563eb' : '#ffffff';
            ctx.strokeStyle = isSelected ? '#1d4ed8' : '#0f172a';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(badgeX - boxW / 2, badgeY - boxH / 2, boxW, boxH, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isSelected ? '#ffffff' : '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (noteLines.length > 0) {
                const topY = badgeY - boxH / 2 + 10 * metrics.s;
                ctx.font = `700 ${metrics.mainPx}px system-ui, sans-serif`;
                ctx.fillText(label, badgeX, topY);
                ctx.font = `700 ${metrics.notePx}px system-ui, sans-serif`;
                for (let i = 0; i < noteLines.length; i++) {
                    ctx.fillText(noteLines[i], badgeX, topY + 13 * metrics.s + i * noteLineH);
                }
            } else {
                ctx.font = `700 ${metrics.mainPx}px system-ui, sans-serif`;
                ctx.fillText(label, badgeX, badgeY + 0.5);
            }
            ctx.restore();

            this.dimHitBoxes.push({
                kind: 'circle-diameter',
                circleId: cir.id,
                x: badgeX,
                y: badgeY,
                angle: 0,
                halfW: boxW / 2 + 3,
                halfH: boxH / 2 + 3,
                radius: Math.max(boxW / 2 + 3, 16)
            });

            // Pokud je kružnice vybraná, ukážeme klikací pomocné kóty od středu kružnice k nejbližším stěnám!
            if (isSelected) {
                this.drawCircleWallOffsets(ctx, cir, state);
            }
        }
    },

    /**
     * Vykreslí pomocné kolmé kóty od středu vybrané kružnice k nejbližším stěnám (pro přesné umístění sloupu)
     */
    drawCircleWallOffsets(ctx, cir, state) {
        const Geo = window.App.Geometry;
        const cam = state.camera;
        const candidates = [];

        for (const w of state.walls) {
            if (w.isAuxLine) continue;
            const nA = state.getNodeById(w.startNodeId);
            const nB = state.getNodeById(w.endNodeId);
            if (!nA || !nB) continue;
            const proj = Geo.pointToSegmentDistance(cir, nA, nB);
            if (proj.t >= 0.02 && proj.t <= 0.98 && proj.distance >= 20) {
                candidates.push({ wall: w, dist: Math.round(proj.distance), projPt: proj.projection });
            }
        }

        candidates.sort((a, b) => a.dist - b.dist);
        const topTwo = candidates.slice(0, 2);
        const cScreen = Geo.worldToScreen(cir.x, cir.y, cam);

        for (const cand of topTwo) {
            const pWall = Geo.worldToScreen(cand.projPt.x, cand.projPt.y, cam);
            let midX = (cScreen.x + pWall.x) / 2;
            let midY = (cScreen.y + pWall.y) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 1.3;
            ctx.moveTo(cScreen.x, cScreen.y);
            ctx.lineTo(pWall.x, pWall.y);
            ctx.stroke();
            ctx.setLineDash([]);

            const s = this.getScale();
            const label = `🎯 ${cand.dist}`;
            ctx.font = `700 ${Math.round(11.5 * s * 10) / 10}px system-ui, sans-serif`;
            const tw = ctx.measureText(label).width;
            const boxW = tw + Math.round(12 * s);
            const boxH = Math.round(20 * s);

            // Pokud střed čáry koliduje s jiným štítkem, posuneme štítek podél čáry
            for (const tRatio of [0.5, 0.35, 0.65, 0.25, 0.75]) {
                const tx = cScreen.x + (pWall.x - cScreen.x) * tRatio;
                const ty = cScreen.y + (pWall.y - cScreen.y) * tRatio;
                if (!this.doesBadgeCollide(tx, ty, boxW, boxH, 0, 4)) {
                    midX = tx;
                    midY = ty;
                    break;
                }
            }

            ctx.fillStyle = '#ecfdf5';
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#047857';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY + 0.5);
            ctx.restore();

            this.dimHitBoxes.push({
                kind: 'circle-wall-dist',
                circleId: cir.id,
                wallId: cand.wall.id,
                x: midX,
                y: midY,
                angle: 0,
                halfW: boxW / 2 + 3,
                halfH: boxH / 2 + 3,
                radius: Math.max(boxW / 2 + 3, 16)
            });
        }
    },

    /**
     * Vykreslí klikací kóty schodiště:
     * 1) Délka schodiště + počet a rozměr stupňů (např. "🪜 2800" | "10× 280 v.175")
     * 2) Šířka ramene schodiště (např. "↔ 1000")
     */
    drawStairDims(ctx, state) {
        if (!state.stairs || state.stairs.length === 0) return;
        const Geo = window.App.Geometry;
        const cam = state.camera;
        const s = this.getScale();

        for (const st of state.stairs) {
            const geom = Geo.computeStaircaseGeometry(st);
            const isSelected = state.selection.selectedStairId === st.id;

            // 1. Kóta DÉLKY schodiště a stupňů (podél vnější hrany pStartB -> pEndB)
            const sB1 = Geo.worldToScreen(geom.pStartB.x, geom.pStartB.y, cam);
            const sB2 = Geo.worldToScreen(geom.pEndB.x, geom.pEndB.y, cam);
            const lenPx = Math.hypot(sB2.x - sB1.x, sB2.y - sB1.y);
            if (lenPx >= 36) {
                const ux = (sB2.x - sB1.x) / lenPx;
                const uy = (sB2.y - sB1.y) / lenPx;
                const sideSign = (st.expandSide === -1) ? -1 : 1;
                const nx = -uy * sideSign;
                const ny = ux * sideSign;

                const steps = Math.max(2, st.stepCount || 10);
                const stepDepth = Math.round(geom.length / steps);
                const labelText = `🪜 ${Math.round(geom.length)}`;
                const subText = `${steps}× ${stepDepth} (v.${st.stepHeight || 175})`;
                const noteText = st.note ? st.note.trim() : null;

                this.drawSingleDimSegment(ctx, sB1, sB2, {
                    ux, uy, nx, ny,
                    extStartPx: Math.round(5 * s),
                    dimOffsetPx: Math.round(30 * s),
                    labelText,
                    subText,
                    noteText,
                    styleMode: isSelected ? 'selected' : 'measured',
                    hitInfo: {
                        kind: 'stair-length',
                        stairId: st.id
                    }
                });
            }

            // 2. Kóta ŠÍŘKY schodiště (na nástupní hraně pStartA -> pStartB)
            const sA1 = Geo.worldToScreen(geom.pStartA.x, geom.pStartA.y, cam);
            const widthPx = Math.hypot(sB1.x - sA1.x, sB1.y - sA1.y);
            if (widthPx >= 28) {
                const wux = (sB1.x - sA1.x) / widthPx;
                const wuy = (sB1.y - sA1.y) / widthPx;
                // Vynášíme před nástupní hranu (proti směru výstupu)
                const ax1 = Geo.worldToScreen(geom.axisStart.x, geom.axisStart.y, cam);
                const ax2 = Geo.worldToScreen(geom.axisEnd.x, geom.axisEnd.y, cam);
                const alen = Math.max(1, Math.hypot(ax2.x - ax1.x, ax2.y - ax1.y));
                const wnx = -(ax2.x - ax1.x) / alen;
                const wny = -(ax2.y - ax1.y) / alen;

                this.drawSingleDimSegment(ctx, sA1, sB1, {
                    ux: wux, uy: wuy,
                    nx: wnx, ny: wny,
                    extStartPx: Math.round(5 * s),
                    dimOffsetPx: Math.round(24 * s),
                    labelText: `↔ ${Math.round(geom.width)}`,
                    subText: null,
                    noteText: null,
                    styleMode: isSelected ? 'selected' : 'jamb',
                    hitInfo: {
                        kind: 'stair-width',
                        stairId: st.id
                    }
                });
            }
        }
    },

    /**
     * Vykreslí jeden kótovací úsek (vynášecí čáry, kótovací čáru, 45° hraniční čárky a klikací štítek)
     */
    drawSingleDimSegment(ctx, s1, s2, opts) {
        const { ux, uy, nx, ny, extStartPx, dimOffsetPx, labelText, subText, noteText, allowZeroLength, styleMode, hitInfo } = opts;

        const segLenPx = Math.hypot(s2.x - s1.x, s2.y - s1.y);
        if (!allowZeroLength && segLenPx < 16) return;

        const d1x = s1.x + nx * dimOffsetPx;
        const d1y = s1.y + ny * dimOffsetPx;
        const d2x = s2.x + nx * dimOffsetPx;
        const d2y = s2.y + ny * dimOffsetPx;
        const extOvershootPx = 5;

        // Barevná paleta podle typu kóty
        const styles = {
            sketch:      { line: '#94a3b8', fill: 'rgba(248,250,252,0.94)', stroke: '#cbd5e1', text: '#475569', dash: true },
            measured:    { line: '#0f172a', fill: '#ffffff', stroke: '#0f172a', text: '#0f172a', dash: false },
            selected:    { line: '#2563eb', fill: '#2563eb', stroke: '#1d4ed8', text: '#ffffff', dash: false },
            orange:      { line: '#ea580c', fill: '#fff7ed', stroke: '#ea580c', text: '#c2410c', dash: false },
            error:       { line: '#dc2626', fill: '#fef2f2', stroke: '#dc2626', text: '#b91c1c', dash: false },
            jamb:        { line: '#475569', fill: '#f8fafc', stroke: '#94a3b8', text: '#1e293b', dash: false },
            'jamb-active': { line: '#059669', fill: '#ecfdf5', stroke: '#059669', text: '#047857', dash: false },
            window:      { line: '#0284c7', fill: '#f0f9ff', stroke: '#0284c7', text: '#0369a1', dash: false },
            door:        { line: '#b45309', fill: '#fffbeb', stroke: '#d97706', text: '#92400e', dash: false },
            opening:     { line: '#475569', fill: '#f1f5f9', stroke: '#64748b', text: '#1e293b', dash: false },
            niche:       { line: '#0f766e', fill: '#f0fdfa', stroke: '#0d9488', text: '#115e59', dash: false }
        };
        const st = styles[styleMode] || styles.measured;

        ctx.save();

        // 1. Vynášecí čáry a kótovací čára (pokud nejde o nulové meziostění 0 mm)
        if (segLenPx >= 4) {
            ctx.beginPath();
            ctx.strokeStyle = st.line;
            ctx.lineWidth = 1.1;
            ctx.globalAlpha = styleMode === 'sketch' ? 0.55 : 0.85;
            ctx.moveTo(s1.x + nx * extStartPx, s1.y + ny * extStartPx);
            ctx.lineTo(s1.x + nx * (dimOffsetPx + extOvershootPx), s1.y + ny * (dimOffsetPx + extOvershootPx));
            ctx.moveTo(s2.x + nx * extStartPx, s2.y + ny * extStartPx);
            ctx.lineTo(s2.x + nx * (dimOffsetPx + extOvershootPx), s2.y + ny * (dimOffsetPx + extOvershootPx));
            ctx.stroke();

            ctx.beginPath();
            if (st.dash) ctx.setLineDash([4, 4]);
            ctx.lineWidth = styleMode === 'selected' ? 1.6 : 1.2;
            ctx.moveTo(d1x - ux * 3, d1y - uy * 3);
            ctx.lineTo(d2x + ux * 3, d2y + uy * 3);
            ctx.stroke();
            ctx.setLineDash([]);

            const tickSize = 4.5;
            const tx = (ux + nx) * tickSize;
            const ty = (uy + ny) * tickSize;
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.95;
            ctx.moveTo(d1x - tx, d1y - ty);
            ctx.lineTo(d1x + tx, d1y + ty);
            ctx.moveTo(d2x - tx, d2y - ty);
            ctx.lineTo(d2x + tx, d2y + ty);
            ctx.stroke();
        } else if (allowZeroLength) {
            // Pro nulové meziostění (🔗 0) vykreslíme jemnou vynášecí čárku přímo ze spoje obou oken
            ctx.beginPath();
            ctx.strokeStyle = st.line;
            ctx.lineWidth = 1.1;
            ctx.globalAlpha = 0.7;
            ctx.setLineDash([3, 3]);
            ctx.moveTo(s1.x + nx * extStartPx, s1.y + ny * extStartPx);
            ctx.lineTo(d1x, d1y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 4. Štítek s kótovacím číslem (a volitelně podtextem výšky/parapetu + uživatelskou poznámkou)
        const midX = (d1x + d2x) / 2;
        const midY = (d1y + d2y) / 2;

        let textAngle = Math.atan2(uy, ux);
        if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) {
            textAngle += Math.PI;
        }

        ctx.translate(midX, midY);
        ctx.rotate(textAngle);
        ctx.globalAlpha = 1.0;

        const metrics = opts.precomputedMetrics || this.measureDimBadge(ctx, segLenPx, labelText, subText, noteText);
        const { boxW, boxH, noteLines, noteLineH, s = 1.15, mainPx = 12.5, subPx = 10.5, notePx = 10 } = metrics;

        ctx.fillStyle = st.fill;
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = st.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (subText && noteLines.length > 0) {
            const topY = -boxH / 2 + 10 * s;
            ctx.font = `700 ${mainPx}px system-ui, sans-serif`;
            ctx.fillText(labelText, 0, topY);

            ctx.font = `600 ${subPx}px system-ui, sans-serif`;
            ctx.globalAlpha = 0.88;
            ctx.fillText(subText, 0, topY + 13 * s);

            ctx.font = `700 ${notePx}px system-ui, sans-serif`;
            ctx.globalAlpha = 0.96;
            for (let i = 0; i < noteLines.length; i++) {
                ctx.fillText(noteLines[i], 0, topY + 25.5 * s + i * noteLineH);
            }
        } else if (noteLines.length > 0) {
            const topY = -boxH / 2 + 10 * s;
            ctx.font = `700 ${mainPx}px system-ui, sans-serif`;
            ctx.fillText(labelText, 0, topY);

            ctx.font = `700 ${notePx}px system-ui, sans-serif`;
            ctx.globalAlpha = 0.96;
            for (let i = 0; i < noteLines.length; i++) {
                ctx.fillText(noteLines[i], 0, topY + 13.5 * s + i * noteLineH);
            }
        } else if (subText) {
            ctx.font = `700 ${mainPx}px system-ui, sans-serif`;
            ctx.fillText(labelText, 0, -6.5 * s);
            ctx.font = `600 ${subPx}px system-ui, sans-serif`;
            ctx.globalAlpha = 0.88;
            ctx.fillText(subText, 0, 7.5 * s);
        } else {
            ctx.font = `700 ${mainPx}px system-ui, sans-serif`;
            ctx.fillText(labelText, 0, 0.5);
        }

        ctx.restore();

        // Uložíme přesnou obdélníkovou klikací oblast štítku (včetně natočení)
        if (hitInfo) {
            this.dimHitBoxes.push({
                ...hitInfo,
                x: midX,
                y: midY,
                angle: textAngle,
                halfW: boxW / 2 + 4,
                halfH: boxH / 2 + 4,
                radius: Math.max(boxW / 2 + 4, 18)
            });
        }
    },

    computeCentroid(nodes) {
        if (!nodes || nodes.length < 3) return null;
        let sx = 0, sy = 0;
        for (const n of nodes) {
            sx += n.x;
            sy += n.y;
        }
        return { x: sx / nodes.length, y: sy / nodes.length };
    },

    /**
     * Vykreslí měřené úhlopříčky (diagonály) uvnitř půdorysu včetně klikacího štítku
     */
    drawDiagonals(ctx, state) {
        if (!state.diagonals || state.diagonals.length === 0) return;
        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const diag of state.diagonals) {
            const n1 = state.getNodeById(diag.startNodeId);
            const n2 = state.getNodeById(diag.endNodeId);
            if (!n1 || !n2) continue;

            const p1 = Geo.worldToScreen(n1.x, n1.y, cam);
            const p2 = Geo.worldToScreen(n2.x, n2.y, cam);
            const geomLen = Math.round(Geo.distance(n1, n2));

            const isSelected = state.selection.selectedWallId === diag.id;
            const isMeasured = diag.measuredLength !== null;
            const hasDiscrepancy = isMeasured && Math.abs(geomLen - diag.measuredLength) > 5;
            const isConnectedToSelectedNode = Boolean(
                state.selection.selectedNodeId &&
                !state.selection.selectedWallId &&
                (diag.startNodeId === state.selection.selectedNodeId || diag.endNodeId === state.selection.selectedNodeId)
            );

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            if (hasDiscrepancy) {
                ctx.strokeStyle = '#dc2626';
            } else if (isSelected) {
                ctx.strokeStyle = '#7c3aed';
            } else if (isConnectedToSelectedNode) {
                ctx.strokeStyle = '#ea580c';
            } else {
                ctx.strokeStyle = '#8b5cf6';
            }

            ctx.lineWidth = isSelected ? 2.5 : 1.8;
            ctx.setLineDash([7, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            let textAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) {
                textAngle += Math.PI;
            }

            let labelText = '';
            if (hasDiscrepancy) {
                labelText = `⟋ ${diag.measuredLength} ⚠️ (${geomLen})`;
            } else if (isConnectedToSelectedNode) {
                labelText = `🎯 ⟋ ${isMeasured ? diag.measuredLength : '~' + geomLen}`;
            } else if (isMeasured) {
                labelText = `⟋ ${diag.measuredLength}`;
            } else {
                labelText = `⟋ ~${geomLen}`;
            }

            const s = this.getScale();
            ctx.translate(midX, midY);
            ctx.rotate(textAngle);
            ctx.font = `700 ${Math.round(12 * s * 10) / 10}px system-ui, sans-serif`;
            const tw = ctx.measureText(labelText).width;
            const boxW = tw + Math.round(14 * s);
            const boxH = Math.round(20 * s);

            if (hasDiscrepancy) {
                ctx.fillStyle = '#fef2f2';
                ctx.strokeStyle = '#dc2626';
            } else if (isSelected) {
                ctx.fillStyle = '#7c3aed';
                ctx.strokeStyle = '#6d28d9';
            } else if (isConnectedToSelectedNode) {
                ctx.fillStyle = '#fff7ed';
                ctx.strokeStyle = '#ea580c';
            } else {
                ctx.fillStyle = '#f5f3ff';
                ctx.strokeStyle = '#8b5cf6';
            }

            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isSelected ? '#ffffff' : (hasDiscrepancy ? '#b91c1c' : (isConnectedToSelectedNode ? '#c2410c' : '#5b21b6'));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, 0, 0.5);

            ctx.restore();

            this.dimHitBoxes.push({
                kind: 'wall',
                wallId: diag.id,
                openingId: null,
                x: midX,
                y: midY,
                angle: textAngle,
                halfW: boxW / 2 + 3,
                halfH: boxH / 2 + 3,
                radius: Math.max(boxW / 2 + 3, 16)
            });
        }
    },

    /**
     * Zjistí, zda uživatel kliknul přímo na štítek některé kóty (vrátí objekt hitInfo nebo null)
     */
    findHitDimension(screenX, screenY) {
        for (let i = this.dimHitBoxes.length - 1; i >= 0; i--) {
            const box = this.dimHitBoxes[i];
            if (box.halfW && box.halfH && box.angle !== undefined) {
                const dx = screenX - box.x;
                const dy = screenY - box.y;
                const cosA = Math.cos(-box.angle);
                const sinA = Math.sin(-box.angle);
                const localX = dx * cosA - dy * sinA;
                const localY = dx * sinA + dy * cosA;
                if (Math.abs(localX) <= box.halfW && Math.abs(localY) <= box.halfH) {
                    return box;
                }
            } else {
                const dist = Math.hypot(screenX - box.x, screenY - box.y);
                if (dist <= box.radius) {
                    return box;
                }
            }
        }
        return null;
    }
};
