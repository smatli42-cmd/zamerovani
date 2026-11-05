/**
 * Modul: input/pointer.js
 * Obsluha vstupu optimalizovaná pro:
 * 1) Samsung Galaxy Tab S9 FE se stylusem S-Pen (pointerType === 'pen')
 * 2) Dotyk prsty (pointerType === 'touch': 1 prst = posun, 2 prsty = pinch-to-zoom)
 * 3) Klasickou myš na PC (levé tl. = akce, pravé/prostřední tl. = posun, kolečko = zoom)
 */
window.App = window.App || {};

window.App.Pointer = {
    canvas: null,
    activePointers: new Map(), // pointerId -> { x, y, type }
    isPanning: false,
    panStartScreen: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
    lastPinchDist: null,
    lastPinchCenter: null,
    spacePressed: false,
    penActive: false,

    init(canvasElement) {
        this.canvas = canvasElement;

        // Zákaz kontextového menu při pravém kliknutí nebo podržení S-Pen tlačítka
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Pointer Events (sjednocují myš, stylus S-Pen a prsty)
        this.canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', e => this.onPointerMove(e));
        this.canvas.addEventListener('pointerup', e => this.onPointerUp(e));
        this.canvas.addEventListener('pointercancel', e => this.onPointerUp(e));

        // Kolečko myši pro Zoom na PC
        this.canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });

        // Klávesové zkratky na PC (Mezerník pro posun, Delete pro smazání, Ctrl+Z pro zpět)
        window.addEventListener('keydown', e => this.onKeyDown(e));
        window.addEventListener('keyup', e => this.onKeyUp(e));
    },

    /**
     * Převod události na lokální souřadnice plátna (px)
     */
    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },

    onPointerDown(e) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const screenPt = this.getCanvasCoords(e);
        const worldPt = Geo.screenToWorld(screenPt.x, screenPt.y, state.camera);

        this.canvas.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, {
            x: screenPt.x,
            y: screenPt.y,
            type: e.pointerType
        });

        // Aktualizace diagnostiky
        if (e.pointerType === 'pen') this.penActive = true;
        this.updateDiagnostics(e, worldPt);

        // Ignorovat dotyk dlaně/prstu, pokud je zároveň přiložen stylus S-Pen
        if (e.pointerType === 'touch' && this.penActive) {
            return;
        }

        // 1. Vícenásobný dotyk (2 prsty na tabletu) -> Pinch-to-Zoom + Pan
        if (this.getTouchCount() >= 2) {
            this.cancelCurrentDrawing();
            this.isPanning = false;
            this.initPinchGesture();
            return;
        }

        // 2. Rozhodnutí: Posouváme plátno (Pan), nebo provádíme akci nástroje?
        const isMiddleOrRightClick = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
        const isPenBarrelButton = e.pointerType === 'pen' && (e.button === 2 || e.button === 5 || (e.buttons & 32));
        const isTouchPan = e.pointerType === 'touch' && state.settings.fingerPanOnly;

        if (state.activeTool === 'pan' || this.spacePressed || isMiddleOrRightClick || isPenBarrelButton || isTouchPan) {
            this.startPan(screenPt);
            return;
        }

        // 2a. Pokud je otevřený NumPad nebo panel Otvoru a uživatel klikne na roh stěny,
        // přepne tím buď posouvaný roh stěny (🎯), nebo referenční roh pro odstup otvoru (od A / od B)!
        if (window.App.NumPad?.isOpen) {
            const hitCorner = Geo.findSnapNode(worldPt, state.nodes, state.camera, 24);
            if (hitCorner && window.App.NumPad.setMovingNode(hitCorner.id)) {
                return;
            }
        }
        if (window.App.OpeningsUI?.isOpen) {
            const hitCorner = Geo.findSnapNode(worldPt, state.nodes, state.camera, 24);
            if (hitCorner && window.App.OpeningsUI.setReferenceNodeById(hitCorner.id)) {
                return;
            }
        }

        // 2a-bis. Pokud jsme v režimu 'select' a uživatel vyloženě chytil modrý vrcholový úchyt ⌒ vybraného oblouku/stěny,
        // zahájíme tažení oblouku přednostně před kliknutím na štítek kóty
        if (state.activeTool === 'select' && state.selection.selectedWallId) {
            const selWall = state.getWallById(state.selection.selectedWallId);
            if (selWall) {
                const segKey = state.selection.selectedSegmentKey;
                const segments = state.getWallSegmentsSorted ? state.getWallSegmentsSorted(selWall) : [];
                const seg = segKey ? segments.find(s => s.key === segKey) : null;
                const n1 = seg ? seg.startNode : state.getNodeById(selWall.startNodeId);
                const n2 = seg ? seg.endNode : state.getNodeById(selWall.endNodeId);
                const arcH = (seg && seg.isSubSegment) ? (seg.override?.arcHeight || 0) : (selWall.arcHeight || 0);
                if (n1 && n2) {
                    const arcInfo = Geo.computeArcGeometry(n1, n2, arcH);
                    const handleWorld = arcInfo ? arcInfo.peak : { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
                    if (Geo.distance(worldPt, handleWorld) <= 12 / state.camera.zoom) {
                        this.dragSnapshotSaved = false;
                        state.selection.isDraggingArcPeak = true;
                        window.App.ShapesUI?.openForWallOrLine(selWall.id, segKey);
                        return;
                    }
                }
            }
        }

        // Zrušíme případný zbylý výběr schodiště/detailu (nově vybraný prvek si výběr nastaví sám)
        state.selection.selectedStairId = null;
        state.selection.isDraggingStair = false;
        state.selection.isDraggingRoom = false;
        if (window.App.RoomsUI?.targetRoomId) window.App.RoomsUI.close();
        this.stairDragOffset = null;

        // 2b-room. Kliknutí na existující štítek místnosti otevře panel názvu a výšek (v nástroji Vybrat jde štítek i přesouvat)
        if (state.activeTool !== 'freehand') {
            const hitRoom = window.App.RoomsUI?.findAtScreenPoint(screenPt.x, screenPt.y);
            if (hitRoom) {
                this.cancelCurrentDrawing();
                this.dragSnapshotSaved = false;
                window.App.RoomsUI.openForRoom(hitRoom.id);
                state.selection.isDraggingRoom = true;
                return;
            }
        }

        // 2b. Kliknutí přímo na štítek stavební kóty (celková stěna, ostění A/B, šířka otvoru nebo schodiště!)
        if (window.App.DrawDims && state.activeTool !== 'freehand') {
            const hitDimInfo = window.App.DrawDims.findHitDimension(screenPt.x, screenPt.y);
            if (hitDimInfo) {
                this.cancelCurrentDrawing();
                window.App.OpeningsUI?.close();
                window.App.NumPad?.openForHitDimension(hitDimInfo);
                return;
            }
        }

        // 2b-detail. Kliknutí na existující značku konstrukčního detailu (🔍 D1) otevře náhled a editor detailu!
        if (state.activeTool !== 'freehand') {
            const hitDet = this.findDetailAtScreenPoint(screenPt.x, screenPt.y);
            if (hitDet) {
                this.cancelCurrentDrawing();
                this.dragSnapshotSaved = false;
                this.detailDragMoved = false;
                state.selection.selectedDetailId = hitDet.id;
                if (this.detailHitPart === 'circle') {
                    // Kolečko (D1) = přesouvání značky tažením, editor se neotevírá
                    this.detailDragOffset = { dx: worldPt.x - hitDet.x, dy: worldPt.y - hitDet.y };
                    state.selection.isDraggingDetail = true;
                    window.App.NumPad?.close();
                    window.App.OpeningsUI?.close();
                    window.App.ShapesUI?.close();
                    state.notifyUI();
                } else {
                    // Název detailu = otevření editoru detailu
                    state.selection.isDraggingDetail = false;
                    window.App.DetailsUI?.openForDetail(hitDet.id);
                }
                return;
            }
        }

        // 2c. Kliknutí na existující dveře nebo okno (otevře panel úprav otvoru a umožní tažení otvoru po stěně!)
        if (window.App.DrawOpenings && state.activeTool !== 'draw' && state.activeTool !== 'freehand') {
            const hitOpeningId = window.App.DrawOpenings.findHitOpening(screenPt.x, screenPt.y);
            if (hitOpeningId) {
                this.cancelCurrentDrawing();
                this.isDraggingOpening = true;
                this.dragOpeningSnapshotSaved = false;
                window.App.ShapesUI?.close();
                window.App.OpeningsUI?.openForOpening(hitOpeningId);
                return;
            }
        }

        // 3. Aktivní nástroj: VKLÁDÁNÍ PRVKU DO STĚNY ('door' | 'window' | 'opening' | 'niche')
        if (['door', 'window', 'opening', 'niche'].includes(state.activeTool)) {
            this.handleInsertOpeningDown(worldPt, state.activeTool);
            return;
        }

        // 3b-room. Aktivní nástroj: VLOŽENÍ ŠTÍTKU MÍSTNOSTI ('room')
        if (state.activeTool === 'room') {
            window.App.RoomsUI?.createAt(worldPt.x, worldPt.y);
            return;
        }

        // 3b. Aktivní nástroj: VLOŽENÍ KONSTRUKČNÍHO DETAILU ('detail')
        if (state.activeTool === 'detail') {
            state.saveSnapshot();
            const createdDet = state.addDetailMarker(worldPt.x, worldPt.y);
            if (createdDet) {
                window.App.DetailsUI?.openForDetail(createdDet.id);
            }
            return;
        }

        // 3c. Aktivní nástroj: KRESLENÍ OD RUKY ('freehand')
        if (state.activeTool === 'freehand') {
            window.App.NumPad?.close();
            window.App.OpeningsUI?.close();
            window.App.ShapesUI?.close();
            this.startFreehandDown(worldPt);
            return;
        }

        // 4. Aktivní nástroj: KRESLENÍ STĚN ('draw'), ČAR / PŘEKLADŮ / OBLOUKŮ / OBDÉLNÍKŮ ('line'), SCHODIŠTĚ ('stairs') nebo ÚHLOPŘÍČKA ('diagonal')
        if (state.activeTool === 'draw' || state.activeTool === 'line' || state.activeTool === 'stairs' || state.activeTool === 'diagonal') {
            window.App.NumPad?.close();
            window.App.OpeningsUI?.close();
            window.App.ShapesUI?.close();
            this.startDrawingWall(worldPt);
            return;
        }

        // 5. Aktivní nástroj: VÝBĚR A ÚPRAVA ('select')
        if (state.activeTool === 'select') {
            this.handleSelectDown(worldPt);
        }
    },

    onPointerMove(e) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const screenPt = this.getCanvasCoords(e);
        const worldPt = Geo.screenToWorld(screenPt.x, screenPt.y, state.camera);

        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, {
                x: screenPt.x,
                y: screenPt.y,
                type: e.pointerType
            });
        }

        this.updateDiagnostics(e, worldPt);

        // Ignorovat dotyk prstu, pokud je aktivní stylus
        if (e.pointerType === 'touch' && this.penActive) return;

        // 1b. Hover nad kolečkem značky detailu: zvýrazní se šipkami ✥ a kurzor se změní na „přesun“
        if (!this.isPanning && !state.drawing.isDrawing && !state.selection.isDraggingDetail && state.activeTool !== 'freehand') {
            const hov = this.findDetailAtScreenPoint(screenPt.x, screenPt.y);
            const overCircle = hov && this.detailHitPart === 'circle';
            state.selection.hoveredDetailId = overCircle ? hov.id : null;
            this.canvas.style.cursor = overCircle ? 'move' : '';
        } else if (state.selection.isDraggingDetail) {
            this.canvas.style.cursor = 'grabbing';
        }

        // 1. Pinch-to-Zoom dvěma prsty
        if (this.getTouchCount() >= 2) {
            this.updatePinchGesture();
            return;
        }

        // 2. Posun plátna (Pan)
        if (this.isPanning) {
            const dx = screenPt.x - this.panStartScreen.x;
            const dy = screenPt.y - this.panStartScreen.y;
            state.camera.offsetX = this.panStartOffset.x + dx;
            state.camera.offsetY = this.panStartOffset.y + dy;
            return;
        }

        // 2b. Právě kreslíme nebo gumujeme ve vrstvě od ruky ('freehand')
        if (this.isFreehandDrawing) {
            this.updateFreehandMove(worldPt);
            return;
        }

        // 3. Právě táhneme novou stěnu nebo úhlopříčku
        if (state.drawing.isDrawing) {
            state.drawing.rawPt = worldPt;
            if (state.activeTool === 'diagonal') {
                // Úhlopříčka se chytá pouze na existující rohy místnosti (bez 90° Ortho)
                const snapNode = Geo.findSnapNode(worldPt, state.nodes, state.camera, 28, state.drawing.startNodeId);
                state.drawing.currentPt = snapNode ? { x: snapNode.x, y: snapNode.y } : { x: worldPt.x, y: worldPt.y };
                state.drawing.constraints = { snappedNode: snapNode || null };
            } else {
                const constraints = Geo.applyDrawingConstraints(state.drawing.startPt, worldPt, state);
                state.drawing.currentPt = { x: constraints.x, y: constraints.y };
                state.drawing.constraints = constraints;
            }
            return;
        }

        // 4. Náhled přichycení při přiblížení hrotu S-Pen nebo myši (před stisknutím)
        if ((state.activeTool === 'draw' || state.activeTool === 'line' || state.activeTool === 'diagonal') && state.settings.snapToNodes) {
            const snapNode = Geo.findSnapNode(worldPt, state.nodes, state.camera, 24);
            if (snapNode) {
                state.drawing.constraints = { snappedNode: snapNode };
            } else if (state.activeTool !== 'diagonal') {
                const wallHit = Geo.findSnapWallEdge(worldPt, state, 20);
                state.drawing.constraints = wallHit ? { snappedWall: wallHit.wall, snappedWallPt: { x: wallHit.x, y: wallHit.y } } : null;
            } else {
                state.drawing.constraints = null;
            }
        }

        // 4b. Tažení okna nebo dveří podél stěny (beze změny délky stěny!)
        if (this.isDraggingOpening && state.selection.selectedOpeningId) {
            const op = state.getOpeningById(state.selection.selectedOpeningId);
            if (op) {
                const wall = state.getWallById(op.wallId);
                const nA = wall ? state.getNodeById(wall.startNodeId) : null;
                const nB = wall ? state.getNodeById(wall.endNodeId) : null;
                if (nA && nB) {
                    const wallLen = Geo.distance(nA, nB);
                    const proj = Geo.pointToSegmentDistance(worldPt, nA, nB);
                    const clickDistFromA = proj.t * wallLen;

                    const desiredStartFromA = Math.round((clickDistFromA - op.width / 2) / 10) * 10;
                    const curStartFromA = op.fromEnd === 'end'
                        ? wallLen - op.offset - op.width
                        : op.offset;

                    if (Math.abs(desiredStartFromA - curStartFromA) >= 10) {
                        if (!this.dragOpeningSnapshotSaved) {
                            state.saveSnapshot();
                            this.dragOpeningSnapshotSaved = true;
                        }
                        state.moveOpeningPreservingChain(op.id, desiredStartFromA);
                        const offInput = document.getElementById('op-offset');
                        if (offInput) offInput.value = op.offset;
                        state.notifyUI();
                    }
                }
            }
            return;
        }

        // 4c. Přesun značky detailu (kolečko D1) nebo štítku místnosti – funguje v každém nástroji
        if (state.selection.isDraggingDetail && state.selection.selectedDetailId) {
            const det = state.getDetailById(state.selection.selectedDetailId);
            const off = this.detailDragOffset || { dx: 0, dy: 0 };
            const tx = worldPt.x - off.dx;
            const ty = worldPt.y - off.dy;
            if (det && (this.detailDragMoved || Geo.distance({ x: tx, y: ty }, det) * state.camera.zoom > 4)) {
                this.detailDragMoved = true;
                if (!this.dragSnapshotSaved) {
                    state.saveSnapshot();
                    this.dragSnapshotSaved = true;
                }
                det.x = Math.round(tx / 10) * 10;
                det.y = Math.round(ty / 10) * 10;
                state.notifyUI();
            }
            return;
        }
        if (state.selection.isDraggingRoom && state.selection.selectedRoomId) {
            const room = state.getRoomById(state.selection.selectedRoomId);
            if (room && Geo.distance(worldPt, room) * state.camera.zoom > 4) {
                if (!this.dragSnapshotSaved) {
                    state.saveSnapshot();
                    this.dragSnapshotSaved = true;
                }
                room.x = Math.round(worldPt.x / 10) * 10;
                room.y = Math.round(worldPt.y / 10) * 10;
                state.notifyUI();
            }
            return;
        }

        // 5. Tažení v režimu 'select' (prohnutí oblouku ⌒, přesun kružnice ◯, nebo tažení rohu/bodu "Gumičky")
        if (state.activeTool === 'select') {
            if (state.selection.isDraggingArcPeak && state.selection.selectedWallId) {
                const wall = state.getWallById(state.selection.selectedWallId);
                if (wall) {
                    const segKey = state.selection.selectedSegmentKey;
                    const segments = state.getWallSegmentsSorted ? state.getWallSegmentsSorted(wall) : [];
                    const seg = segKey ? segments.find(s => s.key === segKey) : null;
                    const n1 = seg ? seg.startNode : state.getNodeById(wall.startNodeId);
                    const n2 = seg ? seg.endNode : state.getNodeById(wall.endNodeId);

                    if (n1 && n2) {
                        const dx = n2.x - n1.x;
                        const dy = n2.y - n1.y;
                        const len = Math.hypot(dx, dy);
                        if (len > 20) {
                            if (!this.dragSnapshotSaved) {
                                state.saveSnapshot();
                                this.dragSnapshotSaved = true;
                            }
                            const ux = dx / len;
                            const uy = dy / len;
                            const nx = -uy;
                            const ny = ux;
                            const midX = (n1.x + n2.x) / 2;
                            const midY = (n1.y + n2.y) / 2;
                            const signedDist = (worldPt.x - midX) * nx + (worldPt.y - midY) * ny;
                            const newArcH = Math.abs(signedDist) < 25 ? 0 : Math.round(signedDist / 10) * 10;

                            if (seg && seg.isSubSegment) {
                                state.setWallSegmentOverride(wall.id, seg.key, { arcHeight: newArcH });
                            } else {
                                wall.arcHeight = newArcH;
                            }
                            const arcIn = document.getElementById('sh-arc');
                            if (arcIn) arcIn.value = Math.abs(newArcH);
                            state.notifyUI();
                        }
                    }
                }
            } else if (state.selection.isDraggingCircle && state.selection.selectedCircleId) {
                const cir = state.getCircleById(state.selection.selectedCircleId);
                if (cir && Geo.distance(worldPt, cir) > 10) {
                    if (!this.dragSnapshotSaved) {
                        state.saveSnapshot();
                        this.dragSnapshotSaved = true;
                    }
                    cir.x = Math.round(worldPt.x / 10) * 10;
                    cir.y = Math.round(worldPt.y / 10) * 10;
                    state.notifyUI();
                }
            } else if (state.selection.isDraggingStair && state.selection.selectedStairId && this.stairDragOffset) {
                const st = state.getStairById(state.selection.selectedStairId);
                if (st) {
                    const newX1 = Math.round((worldPt.x - this.stairDragOffset.dx1) / 10) * 10;
                    const newY1 = Math.round((worldPt.y - this.stairDragOffset.dy1) / 10) * 10;
                    const shiftX = newX1 - st.x1;
                    const shiftY = newY1 - st.y1;
                    if (Math.hypot(shiftX, shiftY) >= 10) {
                        if (!this.dragSnapshotSaved) {
                            state.saveSnapshot();
                            this.dragSnapshotSaved = true;
                        }
                        st.x1 += shiftX;
                        st.y1 += shiftY;
                        st.x2 += shiftX;
                        st.y2 += shiftY;
                        state.notifyUI();
                    }
                }
            } else if (state.selection.isDraggingRoom && state.selection.selectedRoomId) {
                const room = state.getRoomById(state.selection.selectedRoomId);
                if (room && Geo.distance(worldPt, room) > 15) {
                    if (!this.dragSnapshotSaved) {
                        state.saveSnapshot();
                        this.dragSnapshotSaved = true;
                    }
                    room.x = Math.round(worldPt.x / 10) * 10;
                    room.y = Math.round(worldPt.y / 10) * 10;
                    state.notifyUI();
                }
            } else if (state.selection.isDraggingDetail && state.selection.selectedDetailId) {
                const det = state.getDetailById(state.selection.selectedDetailId);
                const off = this.detailDragOffset || { dx: 0, dy: 0 };
                const tx = worldPt.x - off.dx;
                const ty = worldPt.y - off.dy;
                if (det && (this.detailDragMoved || Geo.distance({ x: tx, y: ty }, det) * state.camera.zoom > 4)) {
                    this.detailDragMoved = true;
                    if (!this.dragSnapshotSaved) {
                        state.saveSnapshot();
                        this.dragSnapshotSaved = true;
                    }
                    det.x = Math.round(tx / 10) * 10;
                    det.y = Math.round(ty / 10) * 10;
                    state.notifyUI();
                }
            } else if (state.selection.isDraggingNode && state.selection.selectedNodeId) {
                const draggedNode = state.getNodeById(state.selection.selectedNodeId);
                if (draggedNode && Geo.distance(worldPt, draggedNode) > 15) {
                    if (!this.dragSnapshotSaved) {
                        state.saveSnapshot();
                        this.dragSnapshotSaved = true;
                    }
                    const snapOther = Geo.findSnapNode(worldPt, state.nodes, state.camera, 16, draggedNode.id);
                    if (snapOther) {
                        draggedNode.x = snapOther.x;
                        draggedNode.y = snapOther.y;
                    } else {
                        const wallSnap = Geo.findSnapWallEdge(worldPt, state, 18);
                        if (wallSnap) {
                            draggedNode.x = Math.round(wallSnap.x);
                            draggedNode.y = Math.round(wallSnap.y);
                        } else {
                            draggedNode.x = Math.round(worldPt.x / 10) * 10;
                            draggedNode.y = Math.round(worldPt.y / 10) * 10;
                        }
                    }
                }
            } else {
                this.updateHoverState(worldPt);
            }
        } else if (['door', 'window', 'opening', 'niche'].includes(state.activeTool)) {
            this.updateHoverState(worldPt);
        }
    },

    onPointerUp(e) {
        const state = window.App.State;
        this.activePointers.delete(e.pointerId);
        if (e.pointerType === 'pen') this.penActive = false;

        if (this.getTouchCount() < 2) {
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        }

        if (this.isPanning && this.activePointers.size === 0) {
            this.isPanning = false;
        }

        // Dokončení kreslení od ruky
        if (this.isFreehandDrawing) {
            this.finishFreehandUp();
        }

        // Dokončení kreslení stěny
        if (state.drawing.isDrawing && (e.pointerType !== 'touch' || !state.settings.fingerPanOnly)) {
            this.finishDrawingWall();
        }

        // Dokončení přesunu rohu, oblouku, kružnice, schodiště, značky detailu nebo otvoru
        if (this.isDraggingOpening) {
            this.isDraggingOpening = false;
        }
        if (state.selection.isDraggingArcPeak) {
            state.selection.isDraggingArcPeak = false;
        }
        if (state.selection.isDraggingCircle) {
            state.selection.isDraggingCircle = false;
        }
        if (state.selection.isDraggingStair) {
            state.selection.isDraggingStair = false;
            this.stairDragOffset = null;
        }
        if (state.selection.isDraggingDetail) {
            state.selection.isDraggingDetail = false;
            this.canvas.style.cursor = '';
        }
        if (state.selection.isDraggingRoom) {
            state.selection.isDraggingRoom = false;
        }
        if (state.selection.isDraggingNode) {
            this.mergeCoincidentNodes(state.selection.selectedNodeId);
            state.selection.isDraggingNode = false;
            state.notifyUI();
        }

        state.pointerInfo.activeTouches = this.activePointers.size;
        state.notifyUI();
    },

    /**
     * Zahájí kreslení nové stěny, čáry, překladu, oblouku nebo kružnice
     */
    startDrawingWall(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;

        let startX = Math.round(worldPt.x / 10) * 10;
        let startY = Math.round(worldPt.y / 10) * 10;
        let startNode = null;
        let startWallHit = null;

        // 1. Přichycení počátku na existující roh nebo na hranu stěny
        if (state.settings.snapToNodes) {
            startNode = Geo.findSnapNode(worldPt, state.nodes, state.camera, 20);
            if (startNode) {
                startX = startNode.x;
                startY = startNode.y;
            } else if (state.activeTool !== 'diagonal') {
                startWallHit = Geo.findSnapWallEdge(worldPt, state, 20);
                if (startWallHit) {
                    startX = Math.round(startWallHit.x);
                    startY = Math.round(startWallHit.y);
                }
            }
        }

        state.drawing.isDrawing = true;
        state.drawing.startNodeId = startNode ? startNode.id : null;
        state.drawing.startWallId = startWallHit ? startWallHit.wall.id : null;
        state.drawing.startPt = { x: startX, y: startY };
        state.drawing.currentPt = { x: startX, y: startY };
        state.drawing.rawPt = worldPt;
        state.drawing.constraints = startNode
            ? { snappedNode: startNode }
            : (startWallHit ? { snappedWall: startWallHit.wall, snappedWallPt: { x: startX, y: startY } } : null);
    },

    /**
     * Dokončí kreslení stěny, čáry, dvojitého překladu, oblouku nebo kružnice
     */
    finishDrawingWall() {
        const state = window.App.State;
        const Geo = window.App.Geometry;

        if (!state.drawing.isDrawing || !state.drawing.startPt || !state.drawing.currentPt) {
            this.cancelCurrentDrawing();
            return;
        }

        const len = Geo.distance(state.drawing.startPt, state.drawing.currentPt);
        const isLineTool = state.activeTool === 'line';
        const subMode = isLineTool ? state.lineDefaults.subMode : 'single';

        // Speciální případ: KRUŽNICE ('circle')
        if (isLineTool && subMode === 'circle') {
            state.saveSnapshot();
            const diam = len >= 30 ? Math.round((len * 2) / 10) * 10 : 500;
            const createdCir = state.addCircle(state.drawing.startPt.x, state.drawing.startPt.y, diam, {
                lineStyle: state.lineDefaults.lineStyle,
                lineThickness: state.lineDefaults.lineThickness
            });
            this.cancelCurrentDrawing();
            if (createdCir) {
                window.App.ShapesUI?.openForCircle(createdCir.id);
            }
            return;
        }

        // Speciální případ: OBDÉLNÍK / ČTVEREC ('rect')
        if (isLineTool && subMode === 'rect') {
            const rw = Math.abs(state.drawing.currentPt.x - state.drawing.startPt.x);
            const rh = Math.abs(state.drawing.currentPt.y - state.drawing.startPt.y);
            if (rw >= 50 && rh >= 50) {
                state.saveSnapshot();
                const isAux = !state.lineDefaults.rectAsWalls;
                const firstSide = state.addRectangle(state.drawing.startPt, state.drawing.currentPt, {
                    isAuxLine: isAux,
                    lineStyle: isAux ? state.lineDefaults.lineStyle : 'solid',
                    lineThickness: isAux ? state.lineDefaults.lineThickness : 4
                });
                this.cancelCurrentDrawing();
                if (firstSide) {
                    state.selection.selectedWallId = firstSide.id;
                    state.notifyUI();
                }
                return;
            }
            this.cancelCurrentDrawing();
            return;
        }

        // Speciální případ: SCHODIŠTĚ ('stairs')
        if (state.activeTool === 'stairs') {
            if (len >= 150) {
                state.saveSnapshot();
                const createdStair = state.addStaircase(state.drawing.startPt, state.drawing.currentPt);
                this.cancelCurrentDrawing();
                if (createdStair) {
                    window.App.ShapesUI?.openForStair(createdStair.id);
                }
                return;
            }
            this.cancelCurrentDrawing();
            return;
        }

        // Minimální délka stěny/čáry 50 mm (5 cm)
        if (len >= 50) {
            const existingStart = state.drawing.startNodeId
                ? state.getNodeById(state.drawing.startNodeId)
                : null;
            const existingEnd = state.drawing.constraints?.snappedNode || null;

            if (state.activeTool === 'diagonal') {
                // Úhlopříčku lze vytvořit pouze mezi dvěma existujícími rohy místnosti
                if (existingStart && existingEnd && existingStart.id !== existingEnd.id) {
                    state.saveSnapshot();
                    const createdDiag = state.addDiagonal(existingStart, existingEnd);
                    if (createdDiag) {
                        this.cancelCurrentDrawing();
                        window.App.NumPad?.openForWall(createdDiag.id, null, existingEnd.id);
                        return;
                    }
                }
            } else if (isLineTool) {
                state.saveSnapshot();
                const n1 = state.getOrCreateNode(state.drawing.startPt.x, state.drawing.startPt.y, existingStart);
                const n2 = state.getOrCreateNode(state.drawing.currentPt.x, state.drawing.currentPt.y, existingEnd);

                const defaultArcH = Math.max(80, Math.min(350, Math.round((len * 0.35) / 10) * 10));
                const lineOpts = {
                    isAuxLine: true,
                    lineStyle: state.lineDefaults.lineStyle,
                    lineThickness: state.lineDefaults.lineThickness,
                    arcHeight: subMode === 'arc' ? defaultArcH : 0,
                    showOwnDim: state.lineDefaults.showOwnDim
                };
                const createdLine = state.addWall(n1, n2, lineOpts);

                // Pokud kreslíme DVOJITOU ČÁRU (PŘEKLAD 'double'), vytvoříme rovnou i druhou rovnoběžnou čáru!
                if (subMode === 'double') {
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const segLen = Math.hypot(dx, dy);
                    if (segLen > 10) {
                        const nx = -dy / segLen;
                        const ny = dx / segLen;
                        const spacing = state.lineDefaults.doubleSpacing || 250;
                        let p3 = { x: n1.x + nx * spacing, y: n1.y + ny * spacing };
                        let p4 = { x: n2.x + nx * spacing, y: n2.y + ny * spacing };

                        // Pokud první čára začínala/končila na stěně, přichytíme i druhou čáru přesně na tutéž stěnu
                        const snapStartW = Geo.findSnapWallEdge(p3, state, 40);
                        if (snapStartW) {
                            const sA = state.getNodeById(snapStartW.wall.startNodeId);
                            const sB = state.getNodeById(snapStartW.wall.endNodeId);
                            if (sA && sB) {
                                const pr = Geo.pointToSegmentDistance(p3, sA, sB);
                                p3 = pr.projection;
                            }
                        }
                        const snapEndW = Geo.findSnapWallEdge(p4, state, 40);
                        if (snapEndW) {
                            const eA = state.getNodeById(snapEndW.wall.startNodeId);
                            const eB = state.getNodeById(snapEndW.wall.endNodeId);
                            if (eA && eB) {
                                const pr = Geo.pointToSegmentDistance(p4, eA, eB);
                                p4 = pr.projection;
                            }
                        }

                        const n3 = state.getOrCreateNode(p3.x, p3.y);
                        const n4 = state.getOrCreateNode(p4.x, p4.y);
                        state.addWall(n3, n4, lineOpts);
                    }
                }

                if (createdLine) {
                    state.selection.selectedWallId = createdLine.id;
                    state.selection.selectedNodeId = null;
                    state.selection.movingNodeId = n2.id;
                }
            } else {
                state.saveSnapshot();
                const n1 = state.getOrCreateNode(state.drawing.startPt.x, state.drawing.startPt.y, existingStart);
                const n2 = state.getOrCreateNode(state.drawing.currentPt.x, state.drawing.currentPt.y, existingEnd);

                const createdWall = state.addWall(n1, n2);
                if (createdWall) {
                    state.selection.selectedWallId = createdWall.id;
                    state.selection.selectedNodeId = null;
                    state.selection.movingNodeId = n2.id; // Nově nakreslená stěna má posouvaný koncový bod B
                }
            }
        } else if (state.drawing.startNodeId) {
            // Uživatel jen klepnul na existující roh bez tažení -> označíme tento roh jako "Posouvaný roh 🎯"
            state.selection.selectedNodeId = state.drawing.startNodeId;
            state.selection.movingNodeId = state.drawing.startNodeId;
            state.selection.selectedWallId = null;
            state.notifyUI();
        }

        this.cancelCurrentDrawing();
    },

    cancelCurrentDrawing() {
        const state = window.App.State;
        state.drawing.isDrawing = false;
        state.drawing.startNodeId = null;
        state.drawing.startPt = null;
        state.drawing.currentPt = null;
        state.drawing.constraints = null;
    },

    /**
     * Vloží dveře nebo okno do stěny v místě kliknutí a otevře panel nastavení otvoru
     */
    handleInsertOpeningDown(worldPt, type) {
        const state = window.App.State;
        const Geo = window.App.Geometry;

        const hitResult = this.findWallAtPoint(worldPt);
        if (!hitResult) return;

        const { wall, t } = hitResult;
        const nA = state.getNodeById(wall.startNodeId);
        const nB = state.getNodeById(wall.endNodeId);
        if (!nA || !nB) return;

        const wallLen = Geo.distance(nA, nB);
        const defaultWidths = { door: 800, window: 1200, opening: 900, niche: 600 };
        const defaultWidth = defaultWidths[type] || 800;
        const width = Math.min(defaultWidth, Math.max(200, Math.round(wallLen - 100)));

        // Zjistíme, ke kterému rohu (A nebo B) uživatel kliknul blíž -> od něj budeme měřit odstup (ostění)!
        const fromEnd = t < 0.5 ? 'start' : 'end';
        const clickDistFromA = t * wallLen;
        let rawOffset = fromEnd === 'start'
            ? clickDistFromA - width / 2
            : (wallLen - clickDistFromA) - width / 2;

        // Zaokrouhlíme odstup na 10 mm a omezíme do délky stěny
        rawOffset = Math.max(0, Math.min(wallLen - width, Math.round(rawOffset / 10) * 10));

        state.saveSnapshot();
        const createdOp = state.addOpening(wall.id, type, {
            width: width,
            offset: rawOffset,
            fromEnd: fromEnd,
            hinge: fromEnd
        });

        if (createdOp) {
            window.App.OpeningsUI?.openForOpening(createdOp.id);
        }
    },

    /**
     * Obsluha kliknutí v nástroji 'select' (výběr rohu, obloukového úchytu ⌒, kružnice ◯, čáry nebo stěny)
     */
    handleSelectDown(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;

        // 0. Pokud je vybraná stěna/čára (nebo její dílčí úsek), zkontrolujeme, zda uživatel nechytil středový úchyt ⌒ pro prohnutí do oblouku!
        if (state.selection.selectedWallId) {
            const selWall = state.getWallById(state.selection.selectedWallId);
            if (selWall) {
                const segKey = state.selection.selectedSegmentKey;
                const segments = state.getWallSegmentsSorted ? state.getWallSegmentsSorted(selWall) : [];
                const seg = segKey ? segments.find(s => s.key === segKey) : null;
                const n1 = seg ? seg.startNode : state.getNodeById(selWall.startNodeId);
                const n2 = seg ? seg.endNode : state.getNodeById(selWall.endNodeId);
                const arcH = (seg && seg.isSubSegment) ? (seg.override?.arcHeight || 0) : (selWall.arcHeight || 0);

                if (n1 && n2) {
                    const arcInfo = Geo.computeArcGeometry(n1, n2, arcH);
                    const handleWorld = arcInfo ? arcInfo.peak : { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
                    if (Geo.distance(worldPt, handleWorld) <= 18 / state.camera.zoom) {
                        this.dragSnapshotSaved = false;
                        state.selection.isDraggingArcPeak = true;
                        window.App.ShapesUI?.openForWallOrLine(selWall.id, segKey);
                        return;
                    }
                }
            }
        }

        // 1. Zkusíme najít uzel (roh nebo koncový bod překladu) pod kurzorem -> označíme ho jako "Posouvaný roh 🎯"
        const hitNode = Geo.findSnapNode(worldPt, state.nodes, state.camera, 18);
        if (hitNode) {
            window.App.NumPad?.close();
            window.App.OpeningsUI?.close();
            window.App.ShapesUI?.close();
            this.dragSnapshotSaved = false;
            state.selection.selectedNodeId = hitNode.id;
            state.selection.movingNodeId = hitNode.id;
            state.selection.selectedWallId = null;
            state.selection.selectedSegmentKey = null;
            state.selection.selectedOpeningId = null;
            state.selection.selectedCircleId = null;
            state.selection.isDraggingNode = true;
            state.notifyUI();
            return;
        }

        // 1b. Zkusíme najít kružnici pod kurzorem
        const hitCircle = this.findCircleAtPoint(worldPt);
        if (hitCircle) {
            window.App.NumPad?.close();
            window.App.OpeningsUI?.close();
            this.dragSnapshotSaved = false;
            state.selection.selectedCircleId = hitCircle.id;
            state.selection.selectedStairId = null;
            state.selection.selectedWallId = null;
            state.selection.selectedSegmentKey = null;
            state.selection.selectedNodeId = null;
            state.selection.selectedOpeningId = null;
            state.selection.isDraggingCircle = true;
            window.App.ShapesUI?.openForCircle(hitCircle.id);
            state.notifyUI();
            return;
        }

        // 2. Zkusíme najít stěnu, její dílčí segment (mezi body překladu/oblouku) nebo pomocnou čáru pod kurzorem
        const hitResult = this.findWallAtPoint(worldPt);
        if (hitResult) {
            window.App.OpeningsUI?.close();
            const { wall: hitWall, t, segmentKey, isSubSegment } = hitResult;
            let preferredNodeId = state.selection.selectedNodeId;
            if (preferredNodeId !== hitWall.startNodeId && preferredNodeId !== hitWall.endNodeId) {
                preferredNodeId = t < 0.5 ? hitWall.startNodeId : hitWall.endNodeId;
            }

            state.selection.selectedWallId = hitWall.id;
            state.selection.selectedSegmentKey = isSubSegment ? segmentKey : null;
            state.selection.selectedNodeId = null;
            state.selection.selectedOpeningId = null;
            state.selection.selectedCircleId = null;
            state.selection.isDraggingNode = false;

            // Pokud je stěna rozdělena vloženými body na dílčí segmenty nebo jde o pomocnou čáru,
            // otevřeme panel úprav čáry/segmentu (umožní smazat jen tento dílčí segment stěny nebo ho nahradit jinou čarou/obloukem!)
            if (hitWall.isAuxLine || isSubSegment) {
                window.App.NumPad?.close();
                window.App.ShapesUI?.openForWallOrLine(hitWall.id, isSubSegment ? segmentKey : null);
            } else {
                window.App.ShapesUI?.close();
                window.App.NumPad?.openForWall(hitWall.id, null, preferredNodeId);
            }
            state.notifyUI();
            return;
        }

        // 2d. Schodiště (plocha) má nejnižší prioritu – stěny, otvory, kružnice a čáry uvnitř schodiště se vybírají přednostně
        const hitStair = this.findStairAtPoint(worldPt);
        if (hitStair) {
            window.App.NumPad?.close();
            window.App.OpeningsUI?.close();
            this.dragSnapshotSaved = false;
            state.selection.selectedStairId = hitStair.id;
            state.selection.selectedCircleId = null;
            state.selection.selectedWallId = null;
            state.selection.selectedSegmentKey = null;
            state.selection.selectedNodeId = null;
            state.selection.selectedOpeningId = null;
            state.selection.isDraggingStair = true;
            this.stairDragOffset = {
                dx1: worldPt.x - hitStair.x1,
                dy1: worldPt.y - hitStair.y1
            };
            window.App.ShapesUI?.openForStair(hitStair.id);
            state.notifyUI();
            return;
        }

        // 3. Kliknutí do prázdna zruší výběr a zavře panely
        window.App.NumPad?.close();
        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();
        state.clearSelection();
    },

    /**
     * Kreslení a gumování v samostatné vrstvě od ruky ('freehand')
     */
    startFreehandDown(worldPt) {
        const state = window.App.State;
        state.settings.showFreehand = true;
        this.isFreehandDrawing = true;
        this.freehandEraseSnapshotSaved = false;

        if (state.freehandDefaults.mode === 'eraser') {
            this.eraseFreehandAt(worldPt);
            return;
        }

        state.freehandDefaults.activeStroke = {
            id: state.nextId('fh'),
            color: state.freehandDefaults.color || '#dc2626',
            width: state.freehandDefaults.width || 3,
            points: [{ x: Math.round(worldPt.x), y: Math.round(worldPt.y) }]
        };
    },

    updateFreehandMove(worldPt) {
        const state = window.App.State;
        if (state.freehandDefaults.mode === 'eraser') {
            this.eraseFreehandAt(worldPt);
            return;
        }
        const stroke = state.freehandDefaults.activeStroke;
        if (!stroke || !stroke.points) return;
        const last = stroke.points[stroke.points.length - 1];
        const minDist = 3 / state.camera.zoom;
        if (Math.hypot(worldPt.x - last.x, worldPt.y - last.y) >= minDist) {
            stroke.points.push({ x: Math.round(worldPt.x), y: Math.round(worldPt.y) });
        }
    },

    finishFreehandUp() {
        const state = window.App.State;
        this.isFreehandDrawing = false;
        const stroke = state.freehandDefaults.activeStroke;
        if (stroke && stroke.points && stroke.points.length >= 2) {
            state.saveSnapshot();
            state.freehandStrokes.push(stroke);
        }
        state.freehandDefaults.activeStroke = null;
        state.notifyUI();
    },

    eraseFreehandAt(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        if (!state.freehandStrokes || state.freehandStrokes.length === 0) return;
        const tol = 18 / state.camera.zoom;

        const remaining = state.freehandStrokes.filter(st => {
            const pts = st.points;
            if (!pts || pts.length === 0) return false;
            for (let i = 0; i < pts.length - 1; i++) {
                const res = Geo.pointToSegmentDistance(worldPt, pts[i], pts[i + 1]);
                if (res.distance <= tol) return false;
            }
            return Geo.distance(worldPt, pts[0]) > tol;
        });

        if (remaining.length !== state.freehandStrokes.length) {
            if (!this.freehandEraseSnapshotSaved) {
                state.saveSnapshot();
                this.freehandEraseSnapshotSaved = true;
            }
            state.freehandStrokes = remaining;
            state.notifyUI();
        }
    },

    /**
     * Najde značku konstrukčního detailu (🔍 D1) pod kurzorem na obrazovce
     */
    findDetailAtScreenPoint(screenX, screenY) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        if (!state.details || state.details.length === 0) return null;
        const cam = state.camera;

        for (let i = state.details.length - 1; i >= 0; i--) {
            const det = state.details[i];
            const p = Geo.worldToScreen(det.x, det.y, cam);
            // Kroužek značky (poloměr 16 px) nebo štítek napravo od ní (cca 120 x 24 px)
            if (Math.hypot(screenX - p.x, screenY - p.y) <= 18) {
                this.detailHitPart = 'circle';
                return det;
            }
            if (screenX >= p.x + 12 && screenX <= p.x + 6 + 13 + (window.App.DrawWalls.detailLabelW?.[det.id] || 120) && Math.abs(screenY - p.y) <= 14) {
                this.detailHitPart = 'label';
                return det;
            }
        }
        return null;
    },

    /**
     * Najde schodiště obsahující bod worldPt
     */
    findStairAtPoint(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        if (!state.stairs || state.stairs.length === 0) return null;

        for (let i = state.stairs.length - 1; i >= 0; i--) {
            const st = state.stairs[i];
            const geom = Geo.computeStaircaseGeometry(st);
            const relX = worldPt.x - st.x1;
            const relY = worldPt.y - st.y1;
            const along = relX * geom.ux + relY * geom.uy;
            const across = relX * geom.nx + relY * geom.ny;
            const tol = 8 / state.camera.zoom;
            if (along >= -tol && along <= geom.length + tol &&
                across >= geom.offsetLeft - tol && across <= geom.offsetRight + tol) {
                return st;
            }
        }
        return null;
    },

    /**
     * Najde kružnici v dosahu kliknutí (na obvodu nebo ve středu)
     */
    findCircleAtPoint(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        if (!state.circles || state.circles.length === 0) return null;
        const tol = 16 / state.camera.zoom;

        for (const cir of state.circles) {
            const dCenter = Geo.distance(worldPt, cir);
            const r = cir.diameter / 2;
            if (dCenter <= tol || Math.abs(dCenter - r) <= tol) {
                return cir;
            }
        }
        return null;
    },

    /**
     * Najde nejbližší stěnu, dílčí segment stěny nebo oblouk v dosahu kliknutí (14 px)
     */
    findWallAtPoint(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const maxDistWorld = 14 / state.camera.zoom;

        let bestResult = null;
        let bestScore = maxDistWorld;

        for (const wall of state.walls) {
            const n1 = state.getNodeById(wall.startNodeId);
            const n2 = state.getNodeById(wall.endNodeId);
            if (!n1 || !n2) continue;

            const segments = state.getWallSegmentsSorted
                ? state.getWallSegmentsSorted(wall)
                : [{ key: `${n1.id}:${n2.id}`, startNode: n1, endNode: n2, isSubSegment: false, override: null }];

            for (const seg of segments) {
                const ov = seg.override || {};
                const segArcH = ov.arcHeight !== undefined ? ov.arcHeight : (!seg.isSubSegment ? (wall.arcHeight || 0) : 0);
                const res = Geo.pointToWallOrArcDistance(worldPt, seg.startNode, seg.endNode, segArcH);
                if (res.distance >= maxDistWorld) continue;

                // Pokud je dílčí úsek skrytý (vyříznutý), má o trochu nižší prioritu než viditelný oblouk nad ním,
                // ale stále na něj lze kliknout v místě původní přímky pro případné obnovení!
                const effectiveScore = ov.hidden ? res.distance + (4 / state.camera.zoom) : res.distance;
                if (effectiveScore < bestScore) {
                    bestScore = effectiveScore;
                    const fullRes = Geo.pointToSegmentDistance(worldPt, n1, n2);
                    bestResult = {
                        wall,
                        t: fullRes.t,
                        segmentKey: seg.key,
                        isSubSegment: seg.isSubSegment,
                        isHiddenSegment: Boolean(ov.hidden)
                    };
                }
            }
        }
        return bestResult;
    },

    /**
     * Aktualizuje zvýraznění (hover) při pohybu myší/stylusem v režimu výběru
     */
    updateHoverState(worldPt) {
        const state = window.App.State;
        const Geo = window.App.Geometry;

        const hoverNode = Geo.findSnapNode(worldPt, state.nodes, state.camera, 18);
        if (hoverNode) {
            state.selection.hoveredNodeId = hoverNode.id;
            state.selection.hoveredWallId = null;
            state.selection.hoveredSegmentKey = null;
            state.selection.hoveredCircleId = null;
            return;
        }

        state.selection.hoveredNodeId = null;
        const hoverCir = this.findCircleAtPoint(worldPt);
        if (hoverCir) {
            state.selection.hoveredCircleId = hoverCir.id;
            state.selection.hoveredWallId = null;
            state.selection.hoveredSegmentKey = null;
            return;
        }

        state.selection.hoveredCircleId = null;
        const hoverHit = this.findWallAtPoint(worldPt);
        state.selection.hoveredWallId = hoverHit ? hoverHit.wall.id : null;
        state.selection.hoveredSegmentKey = hoverHit && hoverHit.isSubSegment ? hoverHit.segmentKey : null;
    },

    /**
     * Pokud uživatel přetáhl jeden uzel na druhý, sloučí je do jednoho rohu
     */
    mergeCoincidentNodes(movedNodeId) {
        const state = window.App.State;
        const movedNode = state.getNodeById(movedNodeId);
        if (!movedNode) return;

        for (const other of state.nodes) {
            if (other.id === movedNode.id) continue;
            if (Math.hypot(other.x - movedNode.x, other.y - movedNode.y) < 5) {
                // Přepojíme všechny stěny z movedNode na other
                for (const w of state.walls) {
                    if (w.startNodeId === movedNode.id) w.startNodeId = other.id;
                    if (w.endNodeId === movedNode.id) w.endNodeId = other.id;
                }
                // Odstraníme případné nulové nebo duplicitní stěny
                state.walls = state.walls.filter(w => w.startNodeId !== w.endNodeId);
                state.cleanupOrphanNodes();
                state.selection.selectedNodeId = other.id;
                break;
            }
        }
    },

    startPan(screenPt) {
        const state = window.App.State;
        this.isPanning = true;
        this.panStartScreen = { x: screenPt.x, y: screenPt.y };
        this.panStartOffset = {
            x: state.camera.offsetX,
            y: state.camera.offsetY
        };
    },

    getTouchCount() {
        let count = 0;
        for (const p of this.activePointers.values()) {
            if (p.type === 'touch') count++;
        }
        return count;
    },

    initPinchGesture() {
        const touches = Array.from(this.activePointers.values()).filter(p => p.type === 'touch');
        if (touches.length < 2) return;
        const [p1, p2] = touches;
        this.lastPinchDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        this.lastPinchCenter = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
    },

    updatePinchGesture() {
        const touches = Array.from(this.activePointers.values()).filter(p => p.type === 'touch');
        if (touches.length < 2) return;
        const [p1, p2] = touches;

        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const center = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };

        if (this.lastPinchDist && this.lastPinchDist > 10) {
            const scale = dist / this.lastPinchDist;
            this.zoomAtScreenPoint(center.x, center.y, scale);

            // Posun spolu se středem prstů
            const state = window.App.State;
            state.camera.offsetX += center.x - this.lastPinchCenter.x;
            state.camera.offsetY += center.y - this.lastPinchCenter.y;
        }

        this.lastPinchDist = dist;
        this.lastPinchCenter = center;
    },

    onWheel(e) {
        e.preventDefault();
        const screenPt = this.getCanvasCoords(e);
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.zoomAtScreenPoint(screenPt.x, screenPt.y, factor);
    },

    zoomAtScreenPoint(screenX, screenY, factor) {
        const state = window.App.State;
        const oldZoom = state.camera.zoom;
        const newZoom = Math.max(0.015, Math.min(2.5, oldZoom * factor));

        // Zachování bodu pod kurzorem na stejném místě obrazovky
        const worldX = (screenX - state.camera.offsetX) / oldZoom;
        const worldY = (screenY - state.camera.offsetY) / oldZoom;

        state.camera.zoom = newZoom;
        state.camera.offsetX = screenX - worldX * newZoom;
        state.camera.offsetY = screenY - worldY * newZoom;
        state.notifyUI();
    },

    onKeyDown(e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            return;
        }
        const state = window.App.State;
        const numpad = window.App.NumPad;

        // 1. Pokud je otevřený NumPad, směrujeme čísla, Enter, Tab a Backspace přímo do něj
        if (numpad && numpad.isOpen) {
            if (/^[0-9+-]$/.test(e.key)) {
                e.preventDefault();
                numpad.handleKey(e.key);
                return;
            }
            if (e.key === 'Backspace') {
                e.preventDefault();
                numpad.handleKey('BACKSPACE');
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                numpad.handleKey('ENTER');
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                numpad.handleKey('TAB');
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                numpad.handleKey('ESCAPE');
                return;
            }
        }

        // 2. Pokud je vybraná stěna a uživatel začne psát číslo (nebo pípne Bluetooth laser!), rovnou otevřeme NumPad
        if (state.selection.selectedWallId && /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            numpad?.openForWall(state.selection.selectedWallId, e.key);
            return;
        }

        if (e.code === 'Space') {
            this.spacePressed = true;
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            numpad?.close();
            state.deleteSelected();
        } else if (e.key === 'Escape') {
            numpad?.close();
            this.cancelCurrentDrawing();
            state.clearSelection();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) state.redo();
            else state.undo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            state.redo();
        }
    },

    onKeyUp(e) {
        if (e.code === 'Space') {
            this.spacePressed = false;
        }
    },

    updateDiagnostics(e, worldPt) {
        const state = window.App.State;
        state.pointerInfo.type = e.pointerType || 'mouse';
        state.pointerInfo.pressure = typeof e.pressure === 'number' ? e.pressure : 0;
        state.pointerInfo.worldX = Math.round(worldPt.x);
        state.pointerInfo.worldY = Math.round(worldPt.y);
        state.pointerInfo.activeTouches = this.activePointers.size;
        state.notifyUI();
    }
};
