/**
 * Modul: core/state.js
 * Centrální datový model aplikace (uzly, stěny, kamera, nástroje, historie Undo/Redo).
 * Přísně oddělený od vykreslování (Canvasu).
 */
window.App = window.App || {};

window.App.State = {
    // Geometrická data projektu
    nodes: [],     // [{ id: 'n1', x: 0, y: 0 }]
    walls: [],     // [{ id: 'w1', startNodeId: 'n1', endNodeId: 'n2', measuredLength: null, thickness: 150, isAuxLine: false, lineStyle: 'solid'|'dashdot'|'dashed', lineThickness: 2.5, arcHeight: 0, showOwnDim: true, note: '' }]
    diagonals: [], // [{ id: 'd1', startNodeId: 'n1', endNodeId: 'n3', measuredLength: null }] - měřené úhlopříčky
    openings: [],  // [{ id: 'o1', wallId: 'w1', type: 'door'|'window', width: 800, height: 1970, sillHeight: 0, offset: 400, fromEnd: 'start'|'end', hinge: 'start'|'end', swingSide: 1|-1 }]
    circles: [],   // [{ id: 'c1', x: 0, y: 0, diameter: 500, lineStyle: 'solid'|'dashdot'|'dashed', lineThickness: 2.5, note: '' }]
    stairs: [],    // [{ id: 'st1', x1, y1, x2, y2, width: 1000, stepCount: 10, stepHeight: 175, expandSide: 1, note: '' }]
    freehandStrokes: [], // Samostatná vrstva pro kreslení od ruky: [{ id: 'fh1', points: [{x, y}], color: '#0f172a', width: 3, opacity: 1 }]
    rooms: [],   // Místnosti: [{ id, x, y, name, heights: [{ value: 2700, note: '' }] }]
    details: [],   // Konstrukční detaily (značka v půdorysu + samostatná skica): [{ id: 'det1', code: 'D1', title: 'Detail', notes: '', x: 0, y: 0, strokes: [], labels: [] }]

    // Stav kamery (zoom: kolik pixelů na obrazovce je 1 mm ve světě; 0.15 = 1000 mm je 150 px)
    camera: {
        offsetX: 0,
        offsetY: 0,
        zoom: 0.15
    },

    // Aktivní nástroj: 'draw' | 'line' | 'diagonal' | 'door' | 'window' | 'opening' | 'niche' | 'select' | 'pan'
    activeTool: 'draw',

    // Výchozí nastavení pro kreslení čar, překladů, oblouků a kružnic (nástroj 'line')
    lineDefaults: {
        subMode: 'single',      // 'single' (1 čára) | 'double' (dvojitá čára / překlad) | 'arc' (oblouk) | 'circle' (kružnice)
        lineStyle: 'dashdot',   // 'dashdot' (čerchovaná) | 'dashed' (čárkovaná) | 'solid' (plná)
        lineThickness: 2.5,     // 1.5 (tenká) | 2.5 (střední) | 4 (tlustá)
        doubleSpacing: 250,     // šířka dvojité čáry (překladu) v mm
        arcHeight: 350,         // výchozí vzepětí oblouku v mm při kreslení oblouku
        rectAsWalls: false,     // false = kreslit obdélník jako pomocný tvar (sloup, šachta), true = jako 4 nosné stěny místnosti
        showOwnDim: false,      // u pomocných čar/překladů přes místnost ve výchozím stavu nezobrazujeme vlastní délku
        moveBothEnds: true      // při posunu koncového bodu překladu na stěně posunout rovnoběžně i druhý konec čáry
    },

    // Výchozí nastavení pro vrstvu kreslení od ruky ('freehand')
    freehandDefaults: {
        mode: 'pen',            // 'pen' | 'eraser'
        color: '#dc2626',       // '#0f172a' | '#dc2626' | '#2563eb' | '#059669' | '#d97706'
        width: 3,               // tloušťka stopy v px
        activeStroke: null      // právě kreslený tah od ruky
    },

    // Nastavení chování při kreslení
    settings: {
        orthoMode: true,     // Automatické rovnání do pravých úhlů (90°)
        snapToNodes: true,   // Magnetické přichytávání na existující rohy a vodítka
        showDims: true,      // Zobrazovat stavební kóty
        showGrid: true,      // Zobrazovat milimetrovou/metrovou mřížku
        showFreehand: true,  // Zobrazovat samostatnou vrstvu kreslení od ruky
        fingerPanOnly: true, // Prst pouze posouvá/zoomuje plátno (ochrana proti opřené dlani u stylusu)
        dimScale: 1.15       // Měřítko velikosti písma a odstupu kót (0.8 až 2.2)
    },

    // Právě probíhající akce kreslení
    drawing: {
        isDrawing: false,
        startNodeId: null,
        startPt: null,       // { x, y }
        currentPt: null,     // { x, y } po aplikaci snap/ortho
        rawPt: null,         // { x, y } surová pozice kurzoru
        constraints: null    // informace o aktivním přichycení (snappedNode, orthoLocked, guideX, guideY)
    },

    // Výběr a úpravy (pro nástroj 'select' a cílené kótování rohu)
    selection: {
        selectedWallId: null,
        selectedSegmentKey: null, // Klíč dílčího segmentu stěny mezi body (např. "n1:n2"), pokud je stěna rozdělena
        selectedNodeId: null,
        selectedOpeningId: null,
        selectedCircleId: null,
        selectedStairId: null,
        selectedDetailId: null,
        selectedRoomId: null,
        isDraggingRoom: false,
        movingNodeId: null,  // ID rohu, který se posune při změně kóty (🎯)
        hoveredWallId: null,
        hoveredSegmentKey: null,
        hoveredNodeId: null,
        hoveredCircleId: null,
        hoveredStairId: null,
        hoveredDetailId: null,
        isDraggingNode: false,
        isDraggingCircle: false,
        isDraggingStair: false,
        isDraggingDetail: false,
        isDraggingArcPeak: false
    },

    // Diagnostika vstupního zařízení (pro testování S-Pen vs. Prst vs. Myš)
    pointerInfo: {
        type: 'žádný',       // 'pen' | 'touch' | 'mouse'
        pressure: 0,
        worldX: 0,
        worldY: 0,
        activeTouches: 0
    },

    // Historie pro Undo / Redo
    history: {
        undoStack: [],
        redoStack: [],
        maxSteps: 50
    },

    _idCounter: 1,

    /**
     * Vygeneruje unikátní ID pro uzel nebo stěnu
     */
    nextId(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${this._idCounter++}`;
    },

    /**
     * Uloží aktuální stav uzlů, stěn, úhlopříček a otvorů do Undo historie před změnou
     */
    saveSnapshot() {
        const snapshot = JSON.stringify({
            nodes: this.nodes,
            walls: this.walls,
            diagonals: this.diagonals,
            openings: this.openings,
            circles: this.circles,
            stairs: this.stairs,
            freehandStrokes: this.freehandStrokes,
            details: this.details,
            rooms: this.rooms
        });
        this.history.undoStack.push(snapshot);
        if (this.history.undoStack.length > this.history.maxSteps) {
            this.history.undoStack.shift();
        }
        this.history.redoStack = [];
        this.notifyUI();
    },

    /**
     * Krok zpět (Undo)
     */
    undo() {
        if (this.history.undoStack.length === 0) return false;
        const current = JSON.stringify({
            nodes: this.nodes,
            walls: this.walls,
            diagonals: this.diagonals,
            openings: this.openings,
            circles: this.circles,
            stairs: this.stairs,
            freehandStrokes: this.freehandStrokes,
            details: this.details,
            rooms: this.rooms
        });
        this.history.redoStack.push(current);

        const prev = JSON.parse(this.history.undoStack.pop());
        this.nodes = prev.nodes;
        this.walls = prev.walls;
        this.diagonals = prev.diagonals || [];
        this.openings = prev.openings || [];
        this.circles = prev.circles || [];
        this.stairs = prev.stairs || [];
        this.freehandStrokes = prev.freehandStrokes || [];
        this.details = prev.details || [];
        this.rooms = prev.rooms || [];
        this.clearSelection();
        this.notifyUI();
        return true;
    },

    /**
     * Krok vpřed (Redo)
     */
    redo() {
        if (this.history.redoStack.length === 0) return false;
        const current = JSON.stringify({
            nodes: this.nodes,
            walls: this.walls,
            diagonals: this.diagonals,
            openings: this.openings,
            circles: this.circles,
            stairs: this.stairs,
            freehandStrokes: this.freehandStrokes,
            details: this.details,
            rooms: this.rooms
        });
        this.history.undoStack.push(current);

        const next = JSON.parse(this.history.redoStack.pop());
        this.nodes = next.nodes;
        this.walls = next.walls;
        this.diagonals = next.diagonals || [];
        this.openings = next.openings || [];
        this.circles = next.circles || [];
        this.stairs = next.stairs || [];
        this.freehandStrokes = next.freehandStrokes || [];
        this.details = next.details || [];
        this.rooms = next.rooms || [];
        this.clearSelection();
        this.notifyUI();
        return true;
    },

    /**
     * Najde uzel podle ID
     */
    getNodeById(id) {
        return this.nodes.find(n => n.id === id) || null;
    },

    /**
     * Najde stěnu podle ID (nebo úhlopříčku, pokud ID začíná 'd_')
     */
    getWallById(id) {
        return this.walls.find(w => w.id === id) || this.diagonals.find(d => d.id === id) || null;
    },

    /**
     * Najde úhlopříčku podle ID
     */
    getDiagonalById(id) {
        return this.diagonals.find(d => d.id === id) || null;
    },

    /**
     * Najde otvor (dveře/okno) podle ID
     */
    getOpeningById(id) {
        return this.openings.find(o => o.id === id) || null;
    },

    /**
     * Najde kružnici podle ID
     */
    getCircleById(id) {
        return this.circles.find(c => c.id === id) || null;
    },

    /**
     * Najde schodiště podle ID
     */
    getStairById(id) {
        return this.stairs.find(s => s.id === id) || null;
    },

    /**
     * Najde konstrukční detail podle ID
     */
    getRoomById(id) {
        return this.rooms.find(r => r.id === id) || null;
    },

    /**
     * Přidá štítek místnosti (název + seznam výšek) na souřadnice (x, y)
     */
    addRoom(x, y, options = {}) {
        const room = {
            id: this.nextId('room'),
            x: Math.round(x / 10) * 10,
            y: Math.round(y / 10) * 10,
            name: options.name || `Místnost ${this.rooms.length + 1}`,
            heights: options.heights || [{ value: 2700, note: '' }]
        };
        this.rooms.push(room);
        this.notifyUI();
        return room;
    },

    getDetailById(id) {
        return this.details.find(d => d.id === id) || null;
    },

    /**
     * Vytvoří nový uzel nebo vrátí existující na stejných souřadnicích
     */
    getOrCreateNode(x, y, existingNode = null) {
        if (existingNode) return existingNode;
        const rx = Math.round(x);
        const ry = Math.round(y);
        // Kontrola, zda na tomto místě už uzel neleží
        const found = this.nodes.find(n => Math.hypot(n.x - rx, n.y - ry) < 5);
        if (found) return found;

        const newNode = {
            id: this.nextId('n'),
            x: rx,
            y: ry
        };
        this.nodes.push(newNode);
        return newNode;
    },

    /**
     * Přidá novou stěnu nebo pomocnou čáru (překlad, oblouk) mezi dva uzly
     */
    addWall(startNode, endNode, options = {}) {
        if (!startNode || !endNode || startNode.id === endNode.id) return null;

        // Zabráníme duplicitní stěně mezi stejnými uzly
        const exists = this.walls.find(w =>
            (w.startNodeId === startNode.id && w.endNodeId === endNode.id) ||
            (w.startNodeId === endNode.id && w.endNodeId === startNode.id)
        );
        if (exists) return exists;

        const isAux = Boolean(options.isAuxLine);
        const newWall = {
            id: this.nextId(isAux ? 'ln' : 'w'),
            startNodeId: startNode.id,
            endNodeId: endNode.id,
            measuredLength: null, // null = pouze načrtnuto od ruky, číslo v mm = změřená stěna
            thickness: 150,
            isAuxLine: isAux,
            lineStyle: options.lineStyle || (isAux ? this.lineDefaults.lineStyle : 'solid'),
            lineThickness: options.lineThickness || (isAux ? this.lineDefaults.lineThickness : 4),
            arcHeight: options.arcHeight !== undefined ? Math.round(options.arcHeight) : 0,
            showOwnDim: options.showOwnDim !== undefined ? Boolean(options.showOwnDim) : (!isAux || Boolean(options.arcHeight)),
            note: options.note || ''
        };
        this.walls.push(newWall);
        this.notifyUI();
        return newWall;
    },

    /**
     * Přidá kružnici / sloup
     */
    addCircle(x, y, diameter = 500, options = {}) {
        const newCircle = {
            id: this.nextId('cir'),
            x: Math.round(x),
            y: Math.round(y),
            diameter: Math.max(50, Math.round(diameter)),
            lineStyle: options.lineStyle || this.lineDefaults.lineStyle || 'solid',
            lineThickness: options.lineThickness || this.lineDefaults.lineThickness || 2.5,
            note: options.note || ''
        };
        this.circles.push(newCircle);
        this.notifyUI();
        return newCircle;
    },

    /**
     * Vytvoří pravoúhlý obdélník nebo čtverec ze dvou protilehlých rohů (p1, p2)
     * - Buď jako 4 nosné stěny místnosti/šachty (isAuxLine: false), nebo jako 4 propojené čáry (sloup, komín, podhled).
     */
    addRectangle(p1, p2, options = {}) {
        const x1 = Math.round(p1.x);
        const y1 = Math.round(p1.y);
        const x2 = Math.round(p2.x);
        const y2 = Math.round(p2.y);
        if (Math.abs(x2 - x1) < 40 || Math.abs(y2 - y1) < 40) return null;

        const n1 = this.getOrCreateNode(x1, y1);
        const n2 = this.getOrCreateNode(x2, y1);
        const n3 = this.getOrCreateNode(x2, y2);
        const n4 = this.getOrCreateNode(x1, y2);

        const isAux = Boolean(options.isAuxLine);
        const baseOpts = {
            isAuxLine: isAux,
            lineStyle: options.lineStyle || (isAux ? this.lineDefaults.lineStyle : 'solid'),
            lineThickness: options.lineThickness || (isAux ? this.lineDefaults.lineThickness : 4),
            arcHeight: 0
        };

        // U pomocného obdélníku (např. sloupu/komínu) zapneme kótu na 2 sousedních stranách (šířka a výška),
        // aby byl obdélník okamžitě kótovaný a editovatelný v NumPadu, ale neměl zbytečně 4 duplicitní kóty!
        const wTop = this.addWall(n1, n2, { ...baseOpts, showOwnDim: true });
        const wRight = this.addWall(n2, n3, { ...baseOpts, showOwnDim: true });
        const wBottom = this.addWall(n3, n4, { ...baseOpts, showOwnDim: !isAux });
        const wLeft = this.addWall(n4, n1, { ...baseOpts, showOwnDim: !isAux });

        this.notifyUI();
        return wTop || wRight || wBottom || wLeft;
    },

    /**
     * Přidá schodiště (rameno) z nástupního bodu p1 do výstupního bodu p2.
     * Počet stupňů se automaticky spočítá podle běžné hloubky stupně (~280 mm).
     */
    addStaircase(p1, p2, options = {}) {
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (len < 150) return null;

        const autoSteps = Math.max(2, Math.round(len / 280));
        const newStair = {
            id: this.nextId('st'),
            x1: Math.round(p1.x),
            y1: Math.round(p1.y),
            x2: Math.round(p2.x),
            y2: Math.round(p2.y),
            width: options.width || 1000,
            stepCount: options.stepCount || autoSteps,
            stepHeight: options.stepHeight || 175,
            expandSide: options.expandSide !== undefined ? options.expandSide : 1, // 1 = vpravo, -1 = vlevo, 0 = na střed
            note: options.note || ''
        };
        this.stairs.push(newStair);
        this.notifyUI();
        return newStair;
    },

    /**
     * Změní délku schodiště (v mm) posunem výstupního bodu (x2, y2) ve směru ramene
     * (volitelně přepočítá počet stupňů, pokud keepStepDepth === true)
     */
    setStairLength(stairId, newLengthMm) {
        const st = this.getStairById(stairId);
        if (!st || newLengthMm < 150) return false;
        const dx = st.x2 - st.x1;
        const dy = st.y2 - st.y1;
        const curLen = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / curLen;
        const uy = dy / curLen;
        st.x2 = Math.round(st.x1 + ux * newLengthMm);
        st.y2 = Math.round(st.y1 + uy * newLengthMm);
        this.notifyUI();
        return true;
    },

    /**
     * Přidá značku konstrukčního detailu do půdorysu na souřadnice (x, y)
     */
    addDetailMarker(x, y, options = {}) {
        const nextNum = this.details.length + 1;
        const newDetail = {
            id: this.nextId('det'),
            code: options.code || `D${nextNum}`,
            title: options.title || `Detail ${nextNum}`,
            notes: options.notes || '',
            x: Math.round(x),
            y: Math.round(y),
            strokes: options.strokes || [], // [{ mode: 'freehand'|'line', color, width, points: [{x,y}] }]
            labels: options.labels || []    // [{ x, y, text, color }]
        };
        this.details.push(newDetail);
        this.notifyUI();
        return newDetail;
    },

    /**
     * Přidá měřenou úhlopříčku (diagonálu) mezi dva existující rohy místnosti
     */
    addDiagonal(startNode, endNode) {
        if (!startNode || !endNode || startNode.id === endNode.id) return null;

        // Pokud mezi těmito uzly už vede stěna, nevytváříme duplicitní úhlopříčku
        const wallExists = this.walls.find(w =>
            (w.startNodeId === startNode.id && w.endNodeId === endNode.id) ||
            (w.startNodeId === endNode.id && w.endNodeId === startNode.id)
        );
        if (wallExists) return wallExists;

        const diagExists = this.diagonals.find(d =>
            (d.startNodeId === startNode.id && d.endNodeId === endNode.id) ||
            (d.startNodeId === endNode.id && d.endNodeId === startNode.id)
        );
        if (diagExists) return diagExists;

        const newDiag = {
            id: this.nextId('d'),
            startNodeId: startNode.id,
            endNodeId: endNode.id,
            measuredLength: null,
            isDiagonal: true
        };
        this.diagonals.push(newDiag);
        this.notifyUI();
        return newDiag;
    },

    /**
     * Přidá otvor (dveře, okno, volný stavební otvor nebo niku) do stěny
     * @param {string} wallId
     * @param {'door'|'window'|'opening'|'niche'} type
     * @param {object} options
     */
    addOpening(wallId, type, options = {}) {
        const wall = this.walls.find(w => w.id === wallId);
        if (!wall) return null;

        const defaults = {
            door:    { prefix: 'door', width: 800,  height: 1970, sillHeight: 0,   depth: 0 },
            window:  { prefix: 'win',  width: 1200, height: 1500, sillHeight: 900, depth: 0 },
            opening: { prefix: 'open', width: 900,  height: 2100, sillHeight: 0,   depth: 0 },
            niche:   { prefix: 'nich', width: 600,  height: 1200, sillHeight: 900, depth: 200 }
        };
        const cfg = defaults[type] || defaults.opening;

        const newOpening = {
            id: this.nextId(cfg.prefix),
            wallId: wallId,
            type: type,
            width: options.width || cfg.width,
            height: options.height || cfg.height,
            sillHeight: options.sillHeight !== undefined ? options.sillHeight : cfg.sillHeight,
            depth: options.depth !== undefined ? options.depth : cfg.depth, // hloubka niky v mm
            note: options.note || '', // libovolný popisek (např. "trojdílné okno", "francouzské")
            offset: options.offset !== undefined ? Math.max(0, Math.round(options.offset)) : 300,
            fromEnd: options.fromEnd || 'start', // 'start' (od rohu A) | 'end' (od rohu B)
            hinge: options.hinge || 'start',     // 'start' | 'end' (u kterého ostění jsou panty dveří)
            swingSide: options.swingSide || 1    // 1 | -1 (na kterou stranu stěny se dveře otevírají / nika ustupuje)
        };

        this.openings.push(newOpening);
        this.notifyUI();
        return newOpening;
    },

    /**
     * Vrátí sjednocený seřazený řetězec všech prvků na stěně (od rohu A k rohu B):
     * - Stavební otvory (kind: 'opening', šířka > 0)
     * - Připojené koncové body překladů, pomocných čar a příček ležící na stěně (kind: 'node', šířka = 0)
     */
    getWallChainItemsSorted(wall) {
        const Geo = window.App.Geometry;
        if (!wall || wall.isAuxLine) return [];
        const nA = this.getNodeById(wall.startNodeId);
        const nB = this.getNodeById(wall.endNodeId);
        if (!nA || !nB) return [];

        const wallLen = Geo.distance(nA, nB);
        if (wallLen < 80) return [];

        const items = [];

        // 1. Otvory (okna, dveře, otvory, niky)
        const sortedOps = window.App.DrawOpenings
            ? window.App.DrawOpenings.getWallOpeningsSorted(wall, this)
            : [];
        for (const opItem of sortedOps) {
            items.push({
                kind: 'opening',
                id: opItem.op.id,
                op: opItem.op,
                distStart: opItem.distStart,
                distEnd: opItem.distEnd,
                width: opItem.width
            });
        }

        // 2. Koncové body překladů / pomocných čar / příček ležící na této stěně
        for (const node of this.nodes) {
            if (node.id === wall.startNodeId || node.id === wall.endNodeId) continue;

            // Uzel musí patřit alespoň jedné jiné čáře/stěně
            const connectedOther = this.walls.some(w =>
                w.id !== wall.id && (w.startNodeId === node.id || w.endNodeId === node.id)
            );
            if (!connectedOther) continue;

            const proj = Geo.pointToSegmentDistance(node, nA, nB);
            const distFromA = Math.round(proj.t * wallLen);
            if (proj.distance <= 15 && distFromA >= 10 && distFromA <= wallLen - 10) {
                items.push({
                    kind: 'node',
                    id: node.id,
                    node: node,
                    distStart: distFromA,
                    distEnd: distFromA,
                    width: 0
                });
            }
        }

        items.sort((a, b) => a.distStart - b.distStart);
        return items;
    },

    /**
     * Rozdělí stěnu podle připojených koncových bodů čar/překladů/oblouků na jednotlivé dílčí úseky (segmenty).
     * Každý segment má klíč `${node1.id}:${node2.id}` a může být samostatně smazán (vyříznut) nebo změněn na jiný styl/oblouk!
     */
    getWallSegmentsSorted(wall) {
        const Geo = window.App.Geometry;
        if (!wall) return [];
        const nA = this.getNodeById(wall.startNodeId);
        const nB = this.getNodeById(wall.endNodeId);
        if (!nA || !nB) return [];

        const wallLen = Geo.distance(nA, nB);
        if (wallLen < 10) return [];

        const splitPts = [{ node: nA, dist: 0 }];

        if (!wall.isAuxLine) {
            const chain = this.getWallChainItemsSorted(wall);
            for (const item of chain) {
                if (item.kind === 'node' && item.node) {
                    // Zabráníme duplicitním bodům v těsné blízkosti
                    if (Math.abs(item.distStart - splitPts[splitPts.length - 1].dist) >= 10 &&
                        Math.abs(wallLen - item.distStart) >= 10) {
                        splitPts.push({ node: item.node, dist: item.distStart });
                    }
                }
            }
        }

        splitPts.push({ node: nB, dist: Math.round(wallLen) });

        const isDivided = splitPts.length > 2;
        const overrides = wall.segmentOverrides || {};
        const segments = [];

        for (let i = 0; i < splitPts.length - 1; i++) {
            const p1 = splitPts[i];
            const p2 = splitPts[i + 1];
            const key = `${p1.node.id}:${p2.node.id}`;
            segments.push({
                key: key,
                index: i,
                startNode: p1.node,
                endNode: p2.node,
                distStart: p1.dist,
                distEnd: p2.dist,
                isSubSegment: isDivided,
                override: overrides[key] || null
            });
        }
        return segments;
    },

    /**
     * Nastaví nebo upraví vlastnosti dílčího segmentu stěny (např. hidden: true pro smazání části stěny pod obloukem)
     */
    setWallSegmentOverride(wallId, segmentKey, props) {
        const wall = this.getWallById(wallId);
        if (!wall || !segmentKey) return false;
        if (!wall.segmentOverrides) wall.segmentOverrides = {};
        wall.segmentOverrides[segmentKey] = {
            ...(wall.segmentOverrides[segmentKey] || {}),
            ...props
        };
        this.notifyUI();
        return true;
    },

    /**
     * Změní měřítko velikosti písma a odstupu kót (o delta, např. +0.15 nebo -0.15)
     */
    adjustDimScale(delta) {
        const cur = this.settings.dimScale || 1.15;
        this.settings.dimScale = Math.round(Math.max(0.75, Math.min(2.4, cur + delta)) * 100) / 100;
        this.notifyUI();
    },

    /**
     * Aktualizuje op.offset podle požadované pozice začátku otvoru měřené od rohu A
     */
    setOpeningStartFromA(op, startFromA, wallLen) {
        const clampedStart = Math.max(0, Math.min(Math.max(0, wallLen - op.width), Math.round(startFromA)));
        if (op.fromEnd === 'end') {
            op.offset = Math.max(0, Math.round(wallLen - clampedStart - op.width));
        } else {
            op.offset = clampedStart;
        }
    },

    /**
     * Posune koncový bod čáry/překladu po stěně na vzdálenost newDistFromA (od rohu A).
     * Pokud je zapnuto moveBothEnds, posune rovnoběžně i opačný konec připojené čáry (překladu).
     */
    setChainNodeDistFromA(node, wall, newDistFromA, wallLen, moveBothEnds = false, movedOppositeNodes = null) {
        const Geo = window.App.Geometry;
        const nA = this.getNodeById(wall.startNodeId);
        const nB = this.getNodeById(wall.endNodeId);
        if (!nA || !nB || !node) return;

        const ux = (nB.x - nA.x) / wallLen;
        const uy = (nB.y - nA.y) / wallLen;

        const oldX = node.x;
        const oldY = node.y;
        const clampedDist = Math.max(10, Math.min(wallLen - 10, Math.round(newDistFromA)));

        node.x = Math.round(nA.x + ux * clampedDist);
        node.y = Math.round(nA.y + uy * clampedDist);

        const dx = node.x - oldX;
        const dy = node.y - oldY;

        if (moveBothEnds && (Math.abs(dx) >= 1 || Math.abs(dy) >= 1)) {
            const visited = movedOppositeNodes || new Set();
            visited.add(node.id);

            // Najdeme čáry/překlady vycházející z tohoto bodu
            for (const seg of this.walls) {
                if (seg.id === wall.id) continue;
                if (seg.startNodeId !== node.id && seg.endNodeId !== node.id) continue;

                const otherId = seg.startNodeId === node.id ? seg.endNodeId : seg.startNodeId;
                if (visited.has(otherId)) continue;
                const otherNode = this.getNodeById(otherId);
                if (!otherNode) continue;

                visited.add(otherId);
                const targetPt = { x: otherNode.x + dx, y: otherNode.y + dy };
                // Pokud opačný konec ležel na protější stěně, udržíme ho přesně na ní
                const snapWall = Geo.findSnapWallEdge(targetPt, this, 30, seg.id);
                if (snapWall) {
                    const oA = this.getNodeById(snapWall.wall.startNodeId);
                    const oB = this.getNodeById(snapWall.wall.endNodeId);
                    if (oA && oB) {
                        const proj = Geo.pointToSegmentDistance(targetPt, oA, oB);
                        otherNode.x = Math.round(proj.projection.x);
                        otherNode.y = Math.round(proj.projection.y);
                        continue;
                    }
                }
                otherNode.x = Math.round(targetPt.x);
                otherNode.y = Math.round(targetPt.y);
            }
        }
    },

    /**
     * Posune vybraný prvek na stěně (otvor nebo koncový bod překladu/čáry) na novou pozici (od rohu A)
     * a spolu s ním posune všechny ostatní prvky na stejné stěně se zachováním jejich rozestupů.
     */
    moveWallChainItemPreservingChain(wallId, itemId, newDistStartFromA, moveBothEnds = false) {
        const Geo = window.App.Geometry;
        const wall = this.getWallById(wallId);
        if (!wall) return false;
        const nA = this.getNodeById(wall.startNodeId);
        const nB = this.getNodeById(wall.endNodeId);
        if (!nA || !nB) return false;

        const wallLen = Geo.distance(nA, nB);
        const chain = this.getWallChainItemsSorted(wall);
        const targetIdx = chain.findIndex(it => it.id === itemId);
        if (targetIdx === -1) return false;

        const gaps = [];
        for (let i = 0; i < chain.length - 1; i++) {
            gaps.push(Math.max(0, chain[i + 1].distStart - chain[i].distEnd));
        }

        const relOffsets = [0];
        for (let i = 1; i < chain.length; i++) {
            relOffsets.push(relOffsets[i - 1] + chain[i - 1].width + gaps[i - 1]);
        }
        const lastIdx = chain.length - 1;
        const totalChainSpan = relOffsets[lastIdx] + chain[lastIdx].width;

        let chainStart = newDistStartFromA - relOffsets[targetIdx];
        if (totalChainSpan <= wallLen) {
            chainStart = Math.max(0, Math.min(wallLen - totalChainSpan, chainStart));
        } else {
            chainStart = Math.max(0, chainStart);
        }

        const movedOppositeNodes = new Set();
        for (let i = 0; i < chain.length; i++) {
            const item = chain[i];
            const startI = chainStart + relOffsets[i];
            if (item.kind === 'opening') {
                this.setOpeningStartFromA(item.op, startI, wallLen);
            } else if (item.kind === 'node') {
                this.setChainNodeDistFromA(item.node, wall, startI, wallLen, moveBothEnds, movedOppositeNodes);
            }
        }
        return true;
    },

    /**
     * Posune vybraný otvor na novou pozici (od rohu A) se zachováním rozestupů všech prvků na stěně.
     */
    moveOpeningPreservingChain(openingId, newDistStartFromA) {
        const targetOp = this.getOpeningById(openingId);
        if (!targetOp) return false;
        return this.moveWallChainItemPreservingChain(targetOp.wallId, openingId, newDistStartFromA, this.lineDefaults.moveBothEnds);
    },

    /**
     * Změní rozestup mezi dvěma sousedními prvky na stěně (otvory nebo koncovými body překladu/čáry)
     * a posune druhý prvek i všechny další prvky za ním se zachováním jejich rozestupů.
     */
    setGapBetweenChainItems(wallId, firstItemId, secondItemId, newGap, moveBothEnds = false) {
        const Geo = window.App.Geometry;
        const wall = this.getWallById(wallId);
        if (!wall) return false;
        const nA = this.getNodeById(wall.startNodeId);
        const nB = this.getNodeById(wall.endNodeId);
        if (!nA || !nB) return false;

        const wallLen = Geo.distance(nA, nB);
        const chain = this.getWallChainItemsSorted(wall);

        const idx = chain.findIndex(it => it.id === firstItemId);
        if (idx === -1 || idx + 1 >= chain.length) return false;

        const gaps = [];
        for (let i = 0; i < chain.length - 1; i++) {
            gaps.push(Math.max(0, chain[i + 1].distStart - chain[i].distEnd));
        }
        gaps[idx] = Math.max(0, Math.round(newGap));

        const movedOppositeNodes = new Set();
        let prevEnd = chain[idx].distEnd;
        for (let i = idx + 1; i < chain.length; i++) {
            const item = chain[i];
            const startI = prevEnd + gaps[i - 1];
            if (item.kind === 'opening') {
                this.setOpeningStartFromA(item.op, startI, wallLen);
                prevEnd = Math.min(wallLen, Math.round(startI) + item.width);
            } else if (item.kind === 'node') {
                this.setChainNodeDistFromA(item.node, wall, startI, wallLen, moveBothEnds, movedOppositeNodes);
                prevEnd = Math.min(wallLen, Math.round(startI));
            }
        }
        return true;
    },

    /**
     * Zpětně kompatibilní obálka pro změnu rozestupu mezi dvěma otvory
     */
    setGapBetweenOpenings(firstOpeningId, secondOpeningId, newGap) {
        const firstOp = this.getOpeningById(firstOpeningId);
        if (!firstOp) return false;
        return this.setGapBetweenChainItems(firstOp.wallId, firstOpeningId, secondOpeningId, newGap, this.lineDefaults.moveBothEnds);
    },

    /**
     * Změní šířku otvoru a automaticky posune navazující otvory na stěně tak,
     * aby zůstaly zachovány rozestupy (meziostění) mezi všemi prvky.
     */
    setOpeningWidthPreservingChain(openingId, newWidth) {
        const Geo = window.App.Geometry;
        const targetOp = this.getOpeningById(openingId);
        if (!targetOp) return false;

        const wall = this.getWallById(targetOp.wallId);
        if (!wall) return false;
        const nA = this.getNodeById(wall.startNodeId);
        const nB = this.getNodeById(wall.endNodeId);
        if (!nA || !nB) return false;

        const wallLen = Geo.distance(nA, nB);
        const sortedOps = window.App.DrawOpenings
            ? window.App.DrawOpenings.getWallOpeningsSorted(wall, this)
            : [];

        const targetIdx = sortedOps.findIndex(it => it.op.id === openingId);
        if (targetIdx === -1) return false;

        const gaps = [];
        for (let i = 0; i < sortedOps.length - 1; i++) {
            gaps.push(Math.max(0, sortedOps[i + 1].distStart - sortedOps[i].distEnd));
        }

        const clampedWidth = Math.max(100, Math.min(Math.round(wallLen), Math.round(newWidth)));
        targetOp.width = clampedWidth;

        // Přepočítáme pozice všech otvorů při zachování mezer (od prvního otvoru směrem k B)
        const relOffsets = [0];
        for (let i = 1; i < sortedOps.length; i++) {
            relOffsets.push(relOffsets[i - 1] + sortedOps[i - 1].op.width + gaps[i - 1]);
        }
        const lastIdx = sortedOps.length - 1;
        const totalChainSpan = relOffsets[lastIdx] + sortedOps[lastIdx].op.width;

        // Pokud je měněný otvor kotvený od B, držíme jeho pravý konec; jinak držíme začátek řetězce od A
        let chainStart = sortedOps[0].distStart;
        if (targetOp.fromEnd === 'end') {
            const desiredTargetStart = sortedOps[targetIdx].distEnd - clampedWidth;
            chainStart = desiredTargetStart - relOffsets[targetIdx];
        }
        if (totalChainSpan <= wallLen) {
            chainStart = Math.max(0, Math.min(wallLen - totalChainSpan, chainStart));
        } else {
            chainStart = Math.max(0, chainStart);
        }

        for (let i = 0; i < sortedOps.length; i++) {
            const op = sortedOps[i].op;
            this.setOpeningStartFromA(op, chainStart + relOffsets[i], wallLen);
        }
        return true;
    },

    /**
     * Smaže vybraný otvor, stěnu, úhlopříčku nebo uzel (včetně osiřelých uzlů)
     */
    deleteSelected() {
        const { selectedOpeningId, selectedCircleId, selectedStairId, selectedDetailId, selectedRoomId, selectedWallId, selectedNodeId } = this.selection;
        if (!selectedOpeningId && !selectedCircleId && !selectedStairId && !selectedDetailId && !selectedRoomId && !selectedWallId && !selectedNodeId) return false;

        this.saveSnapshot();

        if (selectedOpeningId) {
            this.openings = this.openings.filter(o => o.id !== selectedOpeningId);
        } else if (selectedCircleId) {
            this.circles = this.circles.filter(c => c.id !== selectedCircleId);
        } else if (selectedStairId) {
            this.stairs = this.stairs.filter(s => s.id !== selectedStairId);
        } else if (selectedRoomId) {
            this.rooms = this.rooms.filter(r => r.id !== selectedRoomId);
        } else if (selectedDetailId) {
            this.details = this.details.filter(d => d.id !== selectedDetailId);
        } else if (selectedWallId) {
            const wall = this.getWallById(selectedWallId);
            const segKey = this.selection.selectedSegmentKey;
            const segments = wall ? this.getWallSegmentsSorted(wall) : [];

            // Pokud je stěna rozdělena vloženými body na více úseků a uživatel vybral konkrétní dílčí úsek,
            // smažeme (vyřízneme) pouze tento dílčí úsek stěny (např. pod obloukem nebo překladem)!
            if (wall && segKey && segments.length > 1) {
                if (!wall.segmentOverrides) wall.segmentOverrides = {};
                const curOv = wall.segmentOverrides[segKey];
                if (!curOv || !curOv.hidden) {
                    wall.segmentOverrides[segKey] = { ...(curOv || {}), hidden: true };
                    // Zkontrolujeme, zda už nejsou skryté úplně všechny úseky stěny
                    const allHidden = segments.every(s => wall.segmentOverrides[s.key]?.hidden);
                    if (!allHidden) {
                        this.clearSelection();
                        this.notifyUI();
                        return true;
                    }
                }
            }

            this.walls = this.walls.filter(w => w.id !== selectedWallId);
            this.diagonals = this.diagonals.filter(d => d.id !== selectedWallId);
            this.openings = this.openings.filter(o => o.wallId !== selectedWallId);
        } else if (selectedNodeId) {
            this.walls = this.walls.filter(w => w.startNodeId !== selectedNodeId && w.endNodeId !== selectedNodeId);
            this.diagonals = this.diagonals.filter(d => d.startNodeId !== selectedNodeId && d.endNodeId !== selectedNodeId);
            this.nodes = this.nodes.filter(n => n.id !== selectedNodeId);
        }

        // Odstraníme osiřelé uzly, ze kterých nevede žádná stěna
        this.cleanupOrphanNodes();
        this.clearSelection();
        this.notifyUI();
        return true;
    },

    /**
     * Odstraní uzly, které nejsou napojené na žádnou stěnu (a vyčistí neplatné úhlopříčky a otvory)
     */
    cleanupOrphanNodes() {
        const usedNodeIds = new Set();
        const validWallIds = new Set();
        for (const w of this.walls) {
            usedNodeIds.add(w.startNodeId);
            usedNodeIds.add(w.endNodeId);
            validWallIds.add(w.id);
        }
        this.nodes = this.nodes.filter(n => usedNodeIds.has(n.id));
        const validIds = new Set(this.nodes.map(n => n.id));
        this.diagonals = this.diagonals.filter(d => validIds.has(d.startNodeId) && validIds.has(d.endNodeId));
        this.openings = this.openings.filter(o => validWallIds.has(o.wallId));
    },

    /**
     * Vymaže výběr
     */
    clearSelection() {
        this.selection.selectedWallId = null;
        this.selection.selectedSegmentKey = null;
        this.selection.selectedNodeId = null;
        this.selection.selectedOpeningId = null;
        this.selection.selectedCircleId = null;
        this.selection.selectedStairId = null;
        this.selection.selectedDetailId = null;
        this.selection.selectedRoomId = null;
        this.selection.isDraggingRoom = false;
        this.selection.movingNodeId = null;
        this.selection.isDraggingNode = false;
        this.selection.isDraggingCircle = false;
        this.selection.isDraggingStair = false;
        this.selection.isDraggingDetail = false;
        this.selection.isDraggingArcPeak = false;
        this.notifyUI();
    },

    /**
     * Vymaže celé plátno
     */
    clearAll() {
        if (this.nodes.length === 0 && this.walls.length === 0 && this.diagonals.length === 0 &&
            this.circles.length === 0 && this.stairs.length === 0 &&
            this.freehandStrokes.length === 0 && this.details.length === 0 && this.rooms.length === 0) return;
        this.saveSnapshot();
        this.nodes = [];
        this.walls = [];
        this.diagonals = [];
        this.openings = [];
        this.circles = [];
        this.stairs = [];
        this.freehandStrokes = [];
        this.details = [];
        this.rooms = [];
        this.clearSelection();
        this.notifyUI();
    },

    /**
     * Aktualizuje tlačítka v UI (voláno při změně stavu)
     */
    notifyUI() {
        if (window.App.UI && typeof window.App.UI.updateStatus === 'function') {
            window.App.UI.updateStatus();
        }
    }
};
