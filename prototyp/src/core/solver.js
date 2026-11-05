/**
 * Modul: core/solver.js
 * Geometrický řešič ("Gumičky" / Constraint Solver).
 * Přepočítává souřadnice rohů při zadání přesné délky stěny tak, aby:
 * - Nezměřené navazující kolmé stěny zachovaly pravé úhly (posunou se s rohem).
 * - Už změřené stěny zůstaly uzamčené (takže u křivých starých místností vznikne skutečný šikmý tvar).
 */
window.App = window.App || {};

window.App.Solver = {
    /**
     * Nastaví přesnou délku stěny (v mm) a přepočítá souřadnice uzlů.
     * @param {string} wallId - ID upravované stěny
     * @param {number} targetLengthMm - Nová délka v milimetrech
     * @param {string} direction - 'auto' | 'end' (A->B) | 'start' (B->A) | 'both' (od středu)
     */
    setWallLength(wallId, targetLengthMm, direction = 'auto') {
        const state = window.App.State;
        const Geo = window.App.Geometry;

        const wall = state.getWallById(wallId);
        if (!wall || !Number.isFinite(targetLengthMm) || targetLengthMm < 10) return false;

        const nA = state.getNodeById(wall.startNodeId);
        const nB = state.getNodeById(wall.endNodeId);
        if (!nA || !nB) return false;

        state.saveSnapshot();

        const currentLength = Geo.distance(nA, nB);
        wall.measuredLength = Math.round(targetLengthMm);

        // Pokud už stěna má na milimetr stejnou délku, jen ji označíme jako změřenou
        if (Math.abs(currentLength - targetLengthMm) < 0.5) {
            state.notifyUI();
            return true;
        }

        // Jednotkový směrový vektor stěny A -> B
        let ux = 1, uy = 0;
        if (currentLength > 0.001) {
            ux = (nB.x - nA.x) / currentLength;
            uy = (nB.y - nA.y) / currentLength;
        }

        const deltaLen = targetLengthMm - currentLength;

        // Rozhodnutí, který uzel je pevný a který se posouvá
        let effectiveDir = direction;
        if (effectiveDir === 'auto') {
            effectiveDir = this.chooseBestDirection(wall, nA, nB, state);
        }

        // Speciální případ: Měřená ÚHLOPŘÍČKA (Triangulace šikmých stěn pomocí průsečíku kružnic)
        if (wall.isDiagonal) {
            const fixedNode = effectiveDir === 'start' ? nB : nA;
            const movingNode = effectiveDir === 'start' ? nA : nB;
            const triangulated = this.applyDiagonalTriangulation(fixedNode, movingNode, targetLengthMm, state);
            if (triangulated) {
                state.notifyUI();
                return true;
            }
            // Pokud nelze triangulovat přes společného souseda, posuneme podél směru úhlopříčky
        }

        if (effectiveDir === 'both') {
            const dx = (deltaLen / 2) * ux;
            const dy = (deltaLen / 2) * uy;
            this.moveNodeWithRubberBand(nB, nA, dx, dy, state);
            this.moveNodeWithRubberBand(nA, nB, -dx, -dy, state);
        } else if (effectiveDir === 'start') {
            // Pevný je konec B, posouvá se začátek A opačným směrem
            const dx = -deltaLen * ux;
            const dy = -deltaLen * uy;
            this.moveNodeWithRubberBand(nA, nB, dx, dy, state);
        } else {
            // Výchozí 'end': Pevný je začátek A, posouvá se konec B
            const dx = deltaLen * ux;
            const dy = deltaLen * uy;
            this.moveNodeWithRubberBand(nB, nA, dx, dy, state);
        }

        state.notifyUI();
        return true;
    },

    /**
     * Automaticky vybere, který konec stěny je výhodnější posunout:
     * Upřednostní uzel, do kterého vede méně již změřených stěn (typicky koncový bod B).
     */
    chooseBestDirection(wall, nA, nB, state) {
        const measuredAtA = this.countMeasuredWallsAtNode(nA.id, wall.id, state);
        const measuredAtB = this.countMeasuredWallsAtNode(nB.id, wall.id, state);

        if (measuredAtB > measuredAtA && measuredAtA === 0) {
            return 'start'; // B je již fixováno jinou změřenou stěnou, posuneme A
        }
        return 'end'; // Standardně posouváme koncový bod B
    },

    countMeasuredWallsAtNode(nodeId, excludeWallId, state) {
        let count = 0;
        for (const w of state.walls) {
            if (w.id === excludeWallId) continue;
            if ((w.startNodeId === nodeId || w.endNodeId === nodeId) && w.measuredLength !== null) {
                count++;
            }
        }
        return count;
    },

    /**
     * Posune uzel `movingNode` o (dx, dy) a inteligentně s ním posune navazující uzly:
     * 1) Všechny volné větve (které nevedou zpět k pevnému uzlu `fixedNode`) se posunou celé jako tuhý celek.
     * 2) V uzavřené místnosti se posunou i sousední rohy napojené kolmou stěnou, pokud jejich protější
     *    rovnoběžná stěna ještě NENÍ změřená (zachová se obdélníkový tvar místnosti).
     */
    moveNodeWithRubberBand(movingNode, fixedNode, dx, dy, state) {
        const Geo = window.App.Geometry;

        // 0. Zaznamenáme si uzly pomocných čar (překladů), které leží na hlavních stěnách,
        // aby po posunu stěny zůstaly přichycené přesně na své hostitelské stěně!
        const mainWallNodeIds = new Set();
        for (const w of state.walls) {
            if (!w.isAuxLine) {
                mainWallNodeIds.add(w.startNodeId);
                mainWallNodeIds.add(w.endNodeId);
            }
        }

        const hostedAuxNodes = [];
        for (const n of state.nodes) {
            if (mainWallNodeIds.has(n.id)) continue;
            for (const w of state.walls) {
                if (w.isAuxLine) continue;
                const nA = state.getNodeById(w.startNodeId);
                const nB = state.getNodeById(w.endNodeId);
                if (!nA || !nB) continue;
                const wLen = Geo.distance(nA, nB);
                const proj = Geo.pointToSegmentDistance(n, nA, nB);
                if (proj.distance <= 15 && proj.t > 0.01 && proj.t < 0.99) {
                    hostedAuxNodes.push({
                        node: n,
                        hostWall: w,
                        distFromA: proj.t * wLen
                    });
                    break;
                }
            }
        }
        const hostedNodeIdSet = new Set(hostedAuxNodes.map(h => h.node.id));

        const nodesToMove = new Set([movingNode.id]);

        // 1. Najdeme uzly ve volných větvích hlavních stěn (které nemají cestu k fixedNode bez průchodu přes movingNode)
        const reachableWithoutMovingNode = this.getReachableNodes(fixedNode.id, movingNode.id, state);
        for (const n of state.nodes) {
            if (hostedNodeIdSet.has(n.id)) continue;
            if (mainWallNodeIds.has(n.id) && !reachableWithoutMovingNode.has(n.id)) {
                nodesToMove.add(n.id);
            }
        }

        // 2. V uzavřené místnosti zkontrolujeme sousedy uzlu movingNode
        const moveDist = Math.hypot(dx, dy);
        if (moveDist > 0.001) {
            const moveUx = dx / moveDist;
            const moveUy = dy / moveDist;

            const neighbors = this.getNeighborNodes(movingNode.id, state);
            for (const { node: neighbor, wall: connectingWall } of neighbors) {
                if (connectingWall.isAuxLine) continue;
                if (neighbor.id === fixedNode.id || nodesToMove.has(neighbor.id)) continue;

                // Směr navazující stěny (movingNode -> neighbor)
                const wLen = Math.hypot(neighbor.x - movingNode.x, neighbor.y - movingNode.y);
                if (wLen < 1) continue;
                const wx = (neighbor.x - movingNode.x) / wLen;
                const wy = (neighbor.y - movingNode.y) / wLen;

                // Skalární součin: 0 znamená, že navazující stěna je kolmá na směr posunu
                const dot = Math.abs(moveUx * wx + moveUy * wy);
                const isRoughlyPerpendicular = dot < 0.35; // cca do 20° od kolmice

                if (isRoughlyPerpendicular) {
                    // Zjistíme, zda tento sousední roh drží jiná UŽ ZMĚŘENÁ stěna rovnoběžná s posunem
                    const hasLockedParallelWall = this.hasMeasuredParallelWall(neighbor.id, connectingWall.id, moveUx, moveUy, state);
                    if (!hasLockedParallelWall) {
                        nodesToMove.add(neighbor.id);
                    }
                }
            }
        }

        // Aplikujeme posun na všechny vybrané uzly
        for (const nodeId of nodesToMove) {
            const node = state.getNodeById(nodeId);
            if (node) {
                node.x = Math.round((node.x + dx) * 10) / 10;
                node.y = Math.round((node.y + dy) * 10) / 10;
            }
        }

        // 3. Aktualizujeme pozici přichycených bodů překladů/čar na jejich hostitelských stěnách
        for (const item of hostedAuxNodes) {
            const nA = state.getNodeById(item.hostWall.startNodeId);
            const nB = state.getNodeById(item.hostWall.endNodeId);
            if (!nA || !nB) continue;
            const newWLen = Geo.distance(nA, nB);
            if (newWLen < 20) continue;
            const clampedDist = Math.max(10, Math.min(newWLen - 10, item.distFromA));
            const ratio = clampedDist / newWLen;
            item.node.x = Math.round(nA.x + (nB.x - nA.x) * ratio);
            item.node.y = Math.round(nA.y + (nB.y - nA.y) * ratio);
        }
    },

    /**
     * Zjistí, které uzly jsou dosažitelné ze startNodeId, aniž bychom prošli přes blockedNodeId
     */
    getReachableNodes(startNodeId, blockedNodeId, state) {
        const visited = new Set([startNodeId]);
        const queue = [startNodeId];

        while (queue.length > 0) {
            const curr = queue.shift();
            for (const w of state.walls) {
                let next = null;
                if (w.startNodeId === curr) next = w.endNodeId;
                else if (w.endNodeId === curr) next = w.startNodeId;

                if (next && next !== blockedNodeId && !visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            }
        }
        return visited;
    },

    /**
     * Vrátí sousední uzly a příslušné stěny vycházející z daného uzlu
     */
    getNeighborNodes(nodeId, state) {
        const result = [];
        for (const w of state.walls) {
            if (w.startNodeId === nodeId) {
                const n = state.getNodeById(w.endNodeId);
                if (n) result.push({ node: n, wall: w });
            } else if (w.endNodeId === nodeId) {
                const n = state.getNodeById(w.startNodeId);
                if (n) result.push({ node: n, wall: w });
            }
        }
        return result;
    },

    /**
     * Zkontroluje, zda z uzlu `nodeId` vychází stěna (jiná než `excludeWallId`),
     * která už má zadanou změřenou délku a vede přibližně ve směru (ux, uy).
     */
    hasMeasuredParallelWall(nodeId, excludeWallId, ux, uy, state) {
        const neighbors = this.getNeighborNodes(nodeId, state);
        for (const { node: other, wall } of neighbors) {
            if (wall.id === excludeWallId) continue;
            if (wall.measuredLength === null) continue;

            const nCurr = state.getNodeById(nodeId);
            const len = Math.hypot(other.x - nCurr.x, other.y - nCurr.y);
            if (len < 1) continue;

            const wx = (other.x - nCurr.x) / len;
            const wy = (other.y - nCurr.y) / len;
            const dot = Math.abs(ux * wx + uy * wy);
            if (dot > 0.5) {
                return true;
            }
        }
        return false;
    },

    /**
     * Najde další navazující stěnu v místnosti (pro tlačítko "Další stěna / Tab" v NumPadu)
     */
    getNextConnectedWall(currentWallId, state) {
        const currentWall = state.getWallById(currentWallId);
        if (!currentWall) return null;

        // Hledáme stěnu vycházející z koncového uzlu (endNodeId), případně ze startNodeId
        const candidates = state.walls.filter(w =>
            w.id !== currentWallId &&
            (w.startNodeId === currentWall.endNodeId || w.endNodeId === currentWall.endNodeId)
        );

        if (candidates.length > 0) {
            // Upřednostníme ještě nezměřenou stěnu
            const unmeasured = candidates.find(w => w.measuredLength === null);
            return unmeasured || candidates[0];
        }

        // Pokud na konci nic není, zkusíme libovolnou nezměřenou stěnu ve výkresu
        const anyUnmeasured = state.walls.find(w => w.id !== currentWallId && w.measuredLength === null);
        return anyUnmeasured || null;
    },

    /**
     * Triangulace při zadání měřené úhlopříčky mezi fixedNode (A) a movingNode (C).
     * Najde společného souseda B (tvořícího roh místnosti A-B-C) a vypočítá přesný průsečík
     * kružnice (A, délka úhlopříčky) a kružnice (B, délka stěny BC), takže délka stěny BC
     * zůstane na milimetr zachována a stěna se natočí do skutečného šikmého úhlu!
     */
    applyDiagonalTriangulation(fixedNode, movingNode, diagLengthMm, state) {
        const Geo = window.App.Geometry;
        const movingNeighbors = this.getNeighborNodes(movingNode.id, state);
        const fixedNeighbors = this.getNeighborNodes(fixedNode.id, state);
        const fixedNeighborIds = new Set(fixedNeighbors.map(fn => fn.node.id));

        if (movingNeighbors.length === 0) return false;

        // 1. Najdeme společného souseda B (který spojuje fixedNode A a movingNode C)
        const commonNeighbors = movingNeighbors.filter(mn => fixedNeighborIds.has(mn.node.id));

        // Upřednostníme souseda se změřenou stěnou
        let pivotEntry = commonNeighbors.find(mn => mn.wall.measuredLength !== null)
            || commonNeighbors[0]
            || movingNeighbors.find(mn => mn.wall.measuredLength !== null)
            || movingNeighbors[0];

        if (!pivotEntry) return false;

        const pivotNode = pivotEntry.node;
        const pivotWall = pivotEntry.wall;
        const rPivot = pivotWall.measuredLength !== null
            ? pivotWall.measuredLength
            : Geo.distance(pivotNode, movingNode);

        // Spočítáme novou polohu movingNode (C) jako průsečík kružnice (A, diagLengthMm) a (B, rPivot)
        const newPos = Geo.intersectCircles(fixedNode, diagLengthMm, pivotNode, rPivot, movingNode);
        if (!newPos) {
            // Trojúhelníková nerovnost není splněna (zadaná úhlopříčka je delší než součet stěn nebo kratší než jejich rozdíl)
            return false;
        }

        const dx = newPos.x - movingNode.x;
        const dy = newPos.y - movingNode.y;

        // Posuneme movingNode (C) na přesnou triangulovanou pozici
        movingNode.x = Math.round(newPos.x * 10) / 10;
        movingNode.y = Math.round(newPos.y * 10) / 10;

        // 2. Co s druhým sousedem D (např. čtvrtý roh místnosti A-B-C-D)?
        for (const otherEntry of movingNeighbors) {
            if (otherEntry.node.id === pivotNode.id || otherEntry.node.id === fixedNode.id) continue;
            const nodeD = otherEntry.node;
            const wallCD = otherEntry.wall;

            // Zjistíme, zda je nodeD spojený stěnou také s fixedNode (A) -> čtyřúhelníková místnost
            const wallAD = state.walls.find(w =>
                (w.startNodeId === fixedNode.id && w.endNodeId === nodeD.id) ||
                (w.startNodeId === nodeD.id && w.endNodeId === fixedNode.id)
            );

            if (wallAD && (wallCD.measuredLength !== null || wallAD.measuredLength !== null)) {
                // Druhý trojúhelník A-D-C: zachováme přesné délky stěn AD i CD!
                const rAD = wallAD.measuredLength !== null ? wallAD.measuredLength : Geo.distance(fixedNode, nodeD);
                const rCD = wallCD.measuredLength !== null ? wallCD.measuredLength : Geo.distance({ x: newPos.x - dx, y: newPos.y - dy }, nodeD);
                const newPosD = Geo.intersectCircles(fixedNode, rAD, movingNode, rCD, nodeD);
                if (newPosD) {
                    nodeD.x = Math.round(newPosD.x * 10) / 10;
                    nodeD.y = Math.round(newPosD.y * 10) / 10;
                    continue;
                }
            }

            // Pokud stěny u D ještě nejsou změřené, posuneme D plynule o stejný vektor (dx, dy)
            if (wallCD.measuredLength === null) {
                nodeD.x = Math.round((nodeD.x + dx) * 10) / 10;
                nodeD.y = Math.round((nodeD.y + dy) * 10) / 10;
            }
        }

        return true;
    }
};
