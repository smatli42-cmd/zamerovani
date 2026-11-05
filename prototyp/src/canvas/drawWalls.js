/**
 * Modul: canvas/drawWalls.js
 * Vykreslování stěn, rohových uzlů, vodících linek (Smart Guides) a živého náhledu při kreslení.
 */
window.App = window.App || {};

window.App.DrawWalls = {
    /**
     * Hlavní vstup pro vykreslení celé vrstvy stěn a uzlů
     */
    render(ctx, state) {
        this.drawSmartGuides(ctx, state);
        this.drawExistingStairs(ctx, state);
        this.drawExistingWalls(ctx, state);
        this.drawExistingCircles(ctx, state);
        this.drawFreehandLayer(ctx, state);
        this.drawActivePreviewWall(ctx, state);
        this.drawNodes(ctx, state);
        this.drawDetailMarkers(ctx, state);
        window.App.RoomsUI?.draw(ctx, state);
    },

    /**
     * Nastaví čárkování (plná / čerchovaná / čárkovaná) na kontextu
     */
    applyLineStyleDash(ctx, lineStyle) {
        if (lineStyle === 'dashdot') {
            ctx.setLineDash([14, 6, 2.5, 6]);
        } else if (lineStyle === 'dashed') {
            ctx.setLineDash([9, 6]);
        } else {
            ctx.setLineDash([]);
        }
    },

    /**
     * Vykreslí čáru nebo kruhový oblouk mezi body p1 a p2 na obrazovce
     */
    traceSegmentOrArcPath(ctx, p1, p2, arcHeightScreenPx) {
        const Geo = window.App.Geometry;
        ctx.beginPath();
        if (arcHeightScreenPx && Math.abs(arcHeightScreenPx) >= 2) {
            const arc = Geo.computeArcGeometry(p1, p2, arcHeightScreenPx);
            if (arc) {
                ctx.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle, arc.counterClockwise);
                return arc;
            }
        }
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        return null;
    },

    /**
     * Vykreslí všechny nakreslené stěny, pomocné čáry (překlady), oblouky a jejich jednotlivé segmenty
     */
    drawExistingWalls(ctx, state) {
        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const wall of state.walls) {
            const n1 = state.getNodeById(wall.startNodeId);
            const n2 = state.getNodeById(wall.endNodeId);
            if (!n1 || !n2) continue;

            const isWallSelected = state.selection.selectedWallId === wall.id;
            const isWallHovered = state.selection.hoveredWallId === wall.id;
            const isMeasured = wall.measuredLength !== null;
            const isAux = Boolean(wall.isAuxLine);

            const segments = state.getWallSegmentsSorted
                ? state.getWallSegmentsSorted(wall)
                : [{ key: `${n1.id}:${n2.id}`, startNode: n1, endNode: n2, isSubSegment: false, override: null }];

            for (const seg of segments) {
                const p1 = Geo.worldToScreen(seg.startNode.x, seg.startNode.y, cam);
                const p2 = Geo.worldToScreen(seg.endNode.x, seg.endNode.y, cam);
                const ov = seg.override || {};
                const isHidden = Boolean(ov.hidden);

                const isSegSelected = isWallSelected && (!seg.isSubSegment || !state.selection.selectedSegmentKey || state.selection.selectedSegmentKey === seg.key);
                const isSegHovered = isWallHovered && (!seg.isSubSegment || !state.selection.hoveredSegmentKey || state.selection.hoveredSegmentKey === seg.key);

                // Pokud byl tento dílčí úsek stěny smazán (vyříznut např. pod obloukem),
                // nevykreslujeme ho (pouze při najetí myší nebo výběru ukážeme jemnou čárkovanou duchařskou linku pro případné obnovení)
                if (isHidden && !isSegSelected && !isSegHovered) {
                    continue;
                }

                const segArcHeight = ov.arcHeight !== undefined
                    ? ov.arcHeight
                    : (!seg.isSubSegment ? (wall.arcHeight || 0) : 0);
                const arcPx = segArcHeight * cam.zoom;
                const segStyle = ov.lineStyle || wall.lineStyle || 'solid';
                const segThick = ov.lineThickness || wall.lineThickness || (isAux ? 2.5 : (isMeasured ? 4.5 : 3.5));

                ctx.save();
                ctx.lineCap = 'round';

                if (isHidden) {
                    // Duch vyříznutého segmentu při najetí/výběru
                    this.traceSegmentOrArcPath(ctx, p1, p2, arcPx);
                    ctx.setLineDash([4, 6]);
                    ctx.strokeStyle = isSegSelected ? '#dc2626' : 'rgba(220, 38, 38, 0.45)';
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                    ctx.restore();
                    continue;
                }

                // Zvýraznění vybraného nebo najetého úseku stěny/čáry (podsvícení)
                if (isSegSelected || isSegHovered) {
                    this.traceSegmentOrArcPath(ctx, p1, p2, arcPx);
                    ctx.strokeStyle = isSegSelected ? 'rgba(37, 99, 235, 0.28)' : 'rgba(37, 99, 235, 0.14)';
                    ctx.lineWidth = 14;
                    ctx.stroke();
                }

                // Samotná čára úseku stěny nebo překladu/oblouku
                const arcInfo = this.traceSegmentOrArcPath(ctx, p1, p2, arcPx);
                this.applyLineStyleDash(ctx, segStyle);

                if (isSegSelected) {
                    ctx.strokeStyle = '#2563eb';
                    ctx.lineWidth = Math.max(3, segThick + 0.8);
                } else if (isAux || ov.lineStyle) {
                    ctx.strokeStyle = segStyle === 'dashdot' ? '#0f172a' : '#334155';
                    ctx.lineWidth = segThick;
                } else if (isMeasured) {
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = segThick;
                } else {
                    ctx.strokeStyle = '#64748b';
                    ctx.lineWidth = segThick;
                }

                ctx.stroke();
                ctx.setLineDash([]);

                // Pokud je úsek vybraný, vykreslíme uprostřed modrý úchyt ⌒ pro prohnutí do oblouku!
                if (isSegSelected) {
                    const handlePt = arcInfo ? arcInfo.peak : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                    ctx.beginPath();
                    ctx.arc(handlePt.x, handlePt.y, 7.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#0284c7';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.fill();
                    ctx.stroke();
                }

                ctx.restore();
            }
        }
    },

    /**
     * Vykreslí nakreslené kružnice / sloupy (state.circles)
     */
    drawExistingCircles(ctx, state) {
        if (!state.circles || state.circles.length === 0) return;
        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const cir of state.circles) {
            const centerScreen = Geo.worldToScreen(cir.x, cir.y, cam);
            const radiusPx = Math.max(4, (cir.diameter / 2) * cam.zoom);
            const isSelected = state.selection.selectedCircleId === cir.id;
            const isHovered = state.selection.hoveredCircleId === cir.id;

            ctx.save();
            if (isSelected || isHovered) {
                ctx.beginPath();
                ctx.arc(centerScreen.x, centerScreen.y, radiusPx, 0, Math.PI * 2);
                ctx.strokeStyle = isSelected ? 'rgba(37, 99, 235, 0.28)' : 'rgba(37, 99, 235, 0.14)';
                ctx.lineWidth = 12;
                ctx.stroke();
            }

            ctx.beginPath();
            this.applyLineStyleDash(ctx, cir.lineStyle || 'solid');
            ctx.arc(centerScreen.x, centerScreen.y, radiusPx, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? '#2563eb' : '#0f172a';
            ctx.lineWidth = isSelected ? Math.max(3, (cir.lineThickness || 2.5) + 0.8) : (cir.lineThickness || 2.5);
            ctx.stroke();
            ctx.setLineDash([]);

            // Středový křížek kružnice
            ctx.beginPath();
            ctx.strokeStyle = isSelected ? '#2563eb' : '#64748b';
            ctx.lineWidth = 1.2;
            ctx.moveTo(centerScreen.x - 5, centerScreen.y);
            ctx.lineTo(centerScreen.x + 5, centerScreen.y);
            ctx.moveTo(centerScreen.x, centerScreen.y - 5);
            ctx.lineTo(centerScreen.x, centerScreen.y + 5);
            ctx.stroke();
            ctx.restore();
        }
    },

    /**
     * Vykreslí čárkovaná vodítka (Smart Guides), když je kreslený bod v zákrytu s jiným rohem
     */
    drawSmartGuides(ctx, state) {
        if (!state.drawing.isDrawing || !state.drawing.constraints || !state.drawing.currentPt) return;

        const Geo = window.App.Geometry;
        const cam = state.camera;
        const curScreen = Geo.worldToScreen(state.drawing.currentPt.x, state.drawing.currentPt.y, cam);
        const { guideX, guideY } = state.drawing.constraints;

        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#0ea5e9'; // Světle modrá vodící linka

        if (guideX) {
            const gxScreen = Geo.worldToScreen(guideX.x, guideX.y, cam);
            ctx.beginPath();
            ctx.moveTo(gxScreen.x, gxScreen.y);
            ctx.lineTo(curScreen.x, curScreen.y);
            ctx.stroke();
        }

        if (guideY) {
            const gyScreen = Geo.worldToScreen(guideY.x, guideY.y, cam);
            ctx.beginPath();
            ctx.moveTo(gyScreen.x, gyScreen.y);
            ctx.lineTo(curScreen.x, curScreen.y);
            ctx.stroke();
        }

        ctx.restore();
    },

    /**
     * Vykreslí právě taženou (kreslenou) stěnu včetně živého rozměru a úhlu
     */
    drawActivePreviewWall(ctx, state) {
        if (!state.drawing.isDrawing || !state.drawing.startPt || !state.drawing.currentPt) return;

        const Geo = window.App.Geometry;
        const cam = state.camera;
        const p1 = Geo.worldToScreen(state.drawing.startPt.x, state.drawing.startPt.y, cam);
        const p2 = Geo.worldToScreen(state.drawing.currentPt.x, state.drawing.currentPt.y, cam);

        const worldLen = Math.round(Geo.distance(state.drawing.startPt, state.drawing.currentPt));
        if (worldLen < 5) return;

        const constraints = state.drawing.constraints || {};
        const isLineTool = state.activeTool === 'line';
        const subMode = isLineTool ? state.lineDefaults.subMode : 'single';

        ctx.save();
        ctx.strokeStyle = (constraints.snappedNode || constraints.snappedWall || constraints.orthoLocked) ? '#16a34a' : '#2563eb';
        ctx.lineWidth = isLineTool ? (state.lineDefaults.lineThickness || 2.5) : 3.5;
        if (isLineTool) {
            this.applyLineStyleDash(ctx, state.lineDefaults.lineStyle);
        } else {
            ctx.setLineDash([8, 6]);
        }
        ctx.lineCap = 'round';

        if (isLineTool && subMode === 'circle') {
            // Náhled kružnice (střed = startPt, poloměr = worldLen)
            const radiusPx = worldLen * cam.zoom;
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, radiusPx, 0, Math.PI * 2);
            ctx.stroke();
        } else if (isLineTool && subMode === 'rect') {
            // Náhled obdélníku nebo čtverce
            ctx.beginPath();
            ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            ctx.fillStyle = state.lineDefaults.rectAsWalls ? 'rgba(37, 99, 235, 0.05)' : 'rgba(15, 23, 42, 0.04)';
            ctx.fill();
            ctx.stroke();
        } else if (state.activeTool === 'stairs') {
            // Živý náhled celého schodiště se stupni a výstupní šipkou!
            const autoSteps = Math.max(2, Math.round(worldLen / 280));
            this.drawStaircaseShape(ctx, {
                x1: state.drawing.startPt.x,
                y1: state.drawing.startPt.y,
                x2: state.drawing.currentPt.x,
                y2: state.drawing.currentPt.y,
                width: 1000,
                stepCount: autoSteps,
                expandSide: 1
            }, cam, true, false);
        } else if (isLineTool && subMode === 'arc') {
            // Náhled oblouku
            const defaultArcH = Math.max(80, Math.min(350, Math.round((worldLen * 0.35) / 10) * 10));
            this.traceSegmentOrArcPath(ctx, p1, p2, defaultArcH * cam.zoom);
            ctx.stroke();
        } else {
            // Náhled jednoduché nebo dvojité čáry (překladu)
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            if (isLineTool && subMode === 'double') {
                const lenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if (lenPx > 4) {
                    const nx = -(p2.y - p1.y) / lenPx;
                    const ny = (p2.x - p1.x) / lenPx;
                    const offsetPx = (state.lineDefaults.doubleSpacing || 250) * cam.zoom;
                    ctx.beginPath();
                    ctx.moveTo(p1.x + nx * offsetPx, p1.y + ny * offsetPx);
                    ctx.lineTo(p2.x + nx * offsetPx, p2.y + ny * offsetPx);
                    ctx.stroke();
                }
            }
        }

        // Bublina s délkou a úhlem u hrotu stylusu / kurzoru
        const angle = Math.round(Geo.angleDeg(state.drawing.startPt, state.drawing.currentPt)) % 360;
        const orthoTag = constraints.orthoLocked ? (isLineTool && subMode === 'rect' ? ' (ČTVEREC)' : ' (90°)') : '';
        const snapTag = constraints.snappedNode ? ' [ROH]' : (constraints.snappedWall ? ' [NA STĚNĚ]' : '');
        const rectW = Math.round(Math.abs(state.drawing.currentPt.x - state.drawing.startPt.x));
        const rectH = Math.round(Math.abs(state.drawing.currentPt.y - state.drawing.startPt.y));

        let badgeText = `${worldLen} mm | ${angle}°${orthoTag}${snapTag}`;
        if (isLineTool && subMode === 'circle') {
            badgeText = `⌀ ${worldLen * 2} mm (R=${worldLen})`;
        } else if (isLineTool && subMode === 'rect') {
            badgeText = `▭ ${rectW} × ${rectH} mm${orthoTag}`;
        } else if (state.activeTool === 'stairs') {
            const stCount = Math.max(2, Math.round(worldLen / 280));
            const stDepth = Math.round(worldLen / stCount);
            badgeText = `🪜 ${worldLen} × 1000 mm (${stCount}× stupeň po ${stDepth} mm)`;
        }

        ctx.setLineDash([]);
        ctx.font = '600 13px system-ui, sans-serif';
        const tw = ctx.measureText(badgeText).width;
        const bx = p2.x + 18;
        const by = p2.y - 28;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 16, 26, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + 8, by + 13);

        ctx.restore();
    },

    /**
     * Vykreslí uzlové body (rohy stěn) a magnetické kroužky přichycení
     */
    drawNodes(ctx, state) {
        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const node of state.nodes) {
            const p = Geo.worldToScreen(node.x, node.y, cam);
            const isSelected = state.selection.selectedNodeId === node.id;
            const isMovingTarget = state.selection.movingNodeId === node.id;
            const isHovered = state.selection.hoveredNodeId === node.id;

            ctx.save();

            // Vnější kroužek při výběru nebo najetí
            if (isSelected || isMovingTarget || isHovered) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, isMovingTarget || isSelected ? 14 : 11, 0, Math.PI * 2);
                ctx.fillStyle = (isMovingTarget || isSelected)
                    ? 'rgba(234, 88, 12, 0.25)'
                    : 'rgba(14, 165, 233, 0.2)';
                ctx.fill();
            }

            // Samotný uzel (roh)
            ctx.beginPath();
            ctx.arc(p.x, p.y, (isSelected || isMovingTarget) ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = (isSelected || isMovingTarget) ? '#ea580c' : '#ffffff';
            ctx.strokeStyle = (isSelected || isMovingTarget) ? '#c2410c' : '#0f172a';
            ctx.lineWidth = 2.2;
            ctx.fill();
            ctx.stroke();

            // Pokud uživatel kliknul na roh (ještě nevybral stěnu), ukážeme štítek "Klikni na přilehlou kótu"
            if (isSelected && !state.selection.selectedWallId && !state.selection.isDraggingNode) {
                this.drawCornerPromptBadge(ctx, p);
            }

            ctx.restore();
        }

        // Magnetický kroužek, když se při kreslení nebo před kreslením chytáme na uzel nebo na hranu stěny
        const snapNode = state.drawing.constraints?.snappedNode;
        const snapWallPt = state.drawing.constraints?.snappedWallPt;
        if (snapNode) {
            const sp = Geo.worldToScreen(snapNode.x, snapNode.y, cam);
            ctx.save();
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 13, 0, Math.PI * 2);
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
        } else if (snapWallPt) {
            const sp = Geo.worldToScreen(snapWallPt.x, snapWallPt.y, cam);
            ctx.save();
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
        }

        // Označení PEVNÉHO (🔒) a POSOUVANÉHO (🎯) rohu + šipky směru u právě vybrané stěny
        if (state.selection.selectedWallId) {
            const selWall = state.getWallById(state.selection.selectedWallId);
            const showRoleTags = selWall && (!selWall.isAuxLine || window.App.NumPad?.isOpen);
            if (showRoleTags) {
                const nA = state.getNodeById(selWall.startNodeId);
                const nB = state.getNodeById(selWall.endNodeId);
                if (nA && nB) {
                    const pA = Geo.worldToScreen(nA.x, nA.y, cam);
                    const pB = Geo.worldToScreen(nB.x, nB.y, cam);
                    const movId = state.selection.movingNodeId;
                    const tooClose = Math.abs(pB.x - pA.x) < 95 && Math.abs(pB.y - pA.y) < 24;
                    const pBTag = tooClose ? { x: pB.x, y: pB.y + 22 } : pB;

                    if (movId === 'BOTH') {
                        this.drawDirectionArrow(ctx, pA, pB, true);
                        this.drawNodeRoleTag(ctx, pA, 'A ↔', '#ea580c');
                        this.drawNodeRoleTag(ctx, pBTag, '↔ B', '#ea580c');
                    } else if (movId === nA.id) {
                        this.drawDirectionArrow(ctx, pB, pA, false);
                        this.drawNodeRoleTag(ctx, pA, '🎯 A (posun)', '#ea580c');
                        this.drawNodeRoleTag(ctx, pBTag, '🔒 B (pevný)', '#0f172a');
                    } else {
                        // Výchozí: A je pevný, B se posouvá
                        this.drawDirectionArrow(ctx, pA, pB, false);
                        this.drawNodeRoleTag(ctx, pA, '🔒 A (pevný)', '#0f172a');
                        this.drawNodeRoleTag(ctx, pBTag, '🎯 B (posun)', '#ea580c');
                    }
                }
            }
        }
    },

    /**
     * Vykreslí nápovědný štítek u vybraného rohu ("Posouvaný roh – klikni na přilehlou kótu")
     */
    drawCornerPromptBadge(ctx, screenPt) {
        const text = '🎯 Posouvaný roh (klikni na přilehlou kótu)';
        ctx.save();
        ctx.font = '600 11.5px system-ui, sans-serif';
        const tw = ctx.measureText(text).width;
        const bx = screenPt.x - tw / 2 - 8;
        const by = screenPt.y - 36;

        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 16, 22, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, screenPt.x, by + 11);
        ctx.restore();
    },

    /**
     * Vykreslí výraznou šipku podél vybrané stěny od pevného rohu k posouvanému rohu
     */
    drawDirectionArrow(ctx, fromPt, toPt, isBoth) {
        const dx = toPt.x - fromPt.x;
        const dy = toPt.y - fromPt.y;
        const len = Math.hypot(dx, dy);
        if (len < 70) return;

        const ux = dx / len;
        const uy = dy / len;
        const arrowTargetX = toPt.x - ux * 26;
        const arrowTargetY = toPt.y - uy * 26;

        ctx.save();
        ctx.fillStyle = '#ea580c';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;

        // Hrot šipky u posouvaného konce
        const headLen = 12;
        const headWidth = 7;
        const nx = -uy;
        const ny = ux;

        ctx.beginPath();
        ctx.moveTo(arrowTargetX, arrowTargetY);
        ctx.lineTo(arrowTargetX - ux * headLen + nx * headWidth, arrowTargetY - uy * headLen + ny * headWidth);
        ctx.lineTo(arrowTargetX - ux * headLen - nx * headWidth, arrowTargetY - uy * headLen - ny * headWidth);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (isBoth) {
            const startTargetX = fromPt.x + ux * 26;
            const startTargetY = fromPt.y + uy * 26;
            ctx.beginPath();
            ctx.moveTo(startTargetX, startTargetY);
            ctx.lineTo(startTargetX + ux * headLen + nx * headWidth, startTargetY + uy * headLen + ny * headWidth);
            ctx.lineTo(startTargetX + ux * headLen - nx * headWidth, startTargetY + uy * headLen - ny * headWidth);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    },

    /**
     * Vykreslí štítek role uzlu (🔒 pevný vs. 🎯 posun) u konců vybrané stěny
     */
    drawNodeRoleTag(ctx, screenPt, label, bgColor) {
        ctx.save();
        ctx.font = '700 10.5px system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        const boxW = tw + 12;
        const boxH = 20;
        const bx = screenPt.x - boxW / 2;
        const by = screenPt.y + 12;

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, screenPt.x, by + boxH / 2 + 0.5);
        ctx.restore();
    },

    /**
     * Vykreslí všechna nakreslená schodiště (state.stairs)
     */
    drawExistingStairs(ctx, state) {
        if (!state.stairs || state.stairs.length === 0) return;
        const cam = state.camera;
        for (const st of state.stairs) {
            const isSelected = state.selection.selectedStairId === st.id;
            const isHovered = state.selection.hoveredStairId === st.id;
            this.drawStaircaseShape(ctx, st, cam, isSelected, isHovered);
        }
    },

    /**
     * Vykreslí geometrii jednoho schodiště (obrys, jednotlivé stupně a normovou výstupní čáru s kroužkem u nástupu a šipkou u výstupu)
     */
    drawStaircaseShape(ctx, stair, cam, isSelected, isHovered) {
        const Geo = window.App.Geometry;
        const geom = Geo.computeStaircaseGeometry(stair);
        const sA1 = Geo.worldToScreen(geom.pStartA.x, geom.pStartA.y, cam);
        const sB1 = Geo.worldToScreen(geom.pStartB.x, geom.pStartB.y, cam);
        const sB2 = Geo.worldToScreen(geom.pEndB.x, geom.pEndB.y, cam);
        const sA2 = Geo.worldToScreen(geom.pEndA.x, geom.pEndA.y, cam);

        ctx.save();
        ctx.setLineDash([]);

        // Výplň a případné podsvícení vybraného schodiště
        ctx.beginPath();
        ctx.moveTo(sA1.x, sA1.y);
        ctx.lineTo(sB1.x, sB1.y);
        ctx.lineTo(sB2.x, sB2.y);
        ctx.lineTo(sA2.x, sA2.y);
        ctx.closePath();

        ctx.fillStyle = isSelected
            ? 'rgba(37, 99, 235, 0.10)'
            : (isHovered ? 'rgba(37, 99, 235, 0.06)' : 'rgba(241, 245, 249, 0.72)');
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#2563eb' : '#0f172a';
        ctx.lineWidth = isSelected ? 2.6 : 2.0;
        ctx.stroke();

        // Vnitřní čáry jednotlivých stupňů
        const steps = Math.max(2, stair.stepCount || 10);
        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#475569';
        ctx.lineWidth = 1.3;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const pL = {
                x: sA1.x + (sA2.x - sA1.x) * t,
                y: sA1.y + (sA2.y - sA1.y) * t
            };
            const pR = {
                x: sB1.x + (sB2.x - sB1.x) * t,
                y: sB1.y + (sB2.y - sB1.y) * t
            };
            ctx.moveTo(pL.x, pL.y);
            ctx.lineTo(pR.x, pR.y);
        }
        ctx.stroke();

        // Výstupní čára uprostřed ramene (kroužek na nástupu -> šipka na výstupu)
        const ax1 = Geo.worldToScreen(geom.axisStart.x, geom.axisStart.y, cam);
        const ax2 = Geo.worldToScreen(geom.axisEnd.x, geom.axisEnd.y, cam);
        const screenLen = Math.hypot(ax2.x - ax1.x, ax2.y - ax1.y);

        if (screenLen > 24) {
            const ux = (ax2.x - ax1.x) / screenLen;
            const uy = (ax2.y - ax1.y) / screenLen;
            const nx = -uy;
            const ny = ux;

            ctx.strokeStyle = isSelected ? '#1d4ed8' : '#0f172a';
            ctx.fillStyle = isSelected ? '#1d4ed8' : '#0f172a';
            ctx.lineWidth = 1.6;

            // Osa
            ctx.beginPath();
            ctx.moveTo(ax1.x, ax1.y);
            ctx.lineTo(ax2.x, ax2.y);
            ctx.stroke();

            // Nástupní kroužek
            ctx.beginPath();
            ctx.arc(ax1.x, ax1.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.stroke();

            // Výstupní šipka
            const headLen = Math.min(12, screenLen * 0.35);
            const headW = 6;
            ctx.beginPath();
            ctx.fillStyle = isSelected ? '#1d4ed8' : '#0f172a';
            ctx.moveTo(ax2.x, ax2.y);
            ctx.lineTo(ax2.x - ux * headLen + nx * headW, ax2.y - uy * headLen + ny * headW);
            ctx.lineTo(ax2.x - ux * headLen - nx * headW, ax2.y - uy * headLen - ny * headW);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    },

    /**
     * Vykreslí samostatnou vrstvu kreslení od ruky (state.freehandStrokes)
     */
    drawFreehandLayer(ctx, state) {
        if (!state.settings.showFreehand) return;
        const Geo = window.App.Geometry;
        const cam = state.camera;

        const strokes = [...(state.freehandStrokes || [])];
        if (state.freehandDefaults && state.freehandDefaults.activeStroke) {
            strokes.push(state.freehandDefaults.activeStroke);
        }
        if (strokes.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        for (const st of strokes) {
            const pts = st.points;
            if (!pts || pts.length === 0) continue;

            ctx.strokeStyle = st.color || '#dc2626';
            ctx.lineWidth = st.width || 3;
            ctx.globalAlpha = st.opacity !== undefined ? st.opacity : (st.width >= 8 ? 0.45 : 0.92);

            ctx.beginPath();
            const first = Geo.worldToScreen(pts[0].x, pts[0].y, cam);
            if (pts.length === 1) {
                ctx.arc(first.x, first.y, (st.width || 3) / 2, 0, Math.PI * 2);
                ctx.fillStyle = st.color || '#dc2626';
                ctx.fill();
                continue;
            }

            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < pts.length - 1; i++) {
                const curr = Geo.worldToScreen(pts[i].x, pts[i].y, cam);
                const next = Geo.worldToScreen(pts[i + 1].x, pts[i + 1].y, cam);
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
            }
            const last = Geo.worldToScreen(pts[pts.length - 1].x, pts[pts.length - 1].y, cam);
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        }
        ctx.restore();
    },

    /**
     * Vykreslí značky konstrukčních detailů v půdorysu (🔍 D1: Popis)
     */
    drawDetailMarkers(ctx, state) {
        if (!state.details || state.details.length === 0) return;
        const Geo = window.App.Geometry;
        const cam = state.camera;

        for (const det of state.details) {
            const p = Geo.worldToScreen(det.x, det.y, cam);
            const isSelected = state.selection.selectedDetailId === det.id;
            const isHovered = state.selection.hoveredDetailId === det.id;
            const hasSketch = (det.strokes && det.strokes.length > 0) || (det.labels && det.labels.length > 0);

            ctx.save();
            ctx.setLineDash([]);

            // 1. Kroužek značky detailu v místě kliknutí + zaměřovací křížek
            const r = 13;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
            ctx.fillStyle = isSelected || isHovered ? 'rgba(124, 58, 237, 0.22)' : 'rgba(124, 58, 237, 0.10)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            const moveMode = (isSelected && state.selection.isDraggingDetail) || isHovered;
            ctx.fillStyle = moveMode ? '#f59e0b' : (isSelected ? '#6d28d9' : '#7c3aed');
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = moveMode ? '800 17px system-ui, sans-serif' : '800 10.5px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(moveMode ? '✥' : (det.code || 'D'), p.x, p.y + 0.5);

            // 2. Štítek s názvem detailu napravo od značky
            const titleText = `${hasSketch ? '📐 ' : '🔍 '}${det.title || det.code}`;
            ctx.font = '700 11.5px system-ui, sans-serif';
            const tw = ctx.measureText(titleText).width;
            const boxW = tw + 14;
            (this.detailLabelW = this.detailLabelW || {})[det.id] = boxW;
            const boxH = 22;
            const bx = p.x + r + 6;
            const by = p.y - boxH / 2;

            // Krátká spojovací čárka
            ctx.beginPath();
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 1.6;
            ctx.moveTo(p.x + r, p.y);
            ctx.lineTo(bx, p.y);
            ctx.stroke();

            ctx.fillStyle = isSelected ? '#ede9fe' : '#ffffff';
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.roundRect(bx, by, boxW, boxH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#5b21b6';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(titleText, bx + 7, p.y + 0.5);

            ctx.restore();
        }
    }
};
