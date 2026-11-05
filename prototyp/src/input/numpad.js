/**
 * Modul: input/numpad.js
 * Plovoucí numerická klávesnice (kalkulačka) pro rychlé zadávání v mm:
 * - Celkové délky stěn a úhlopříček (mode: 'wall')
 * - Ostění od rohu A nebo B – posouvá okno/dveře ve stěně bez změny délky stěny! (mode: 'jamb-start' | 'jamb-end')
 * - Šířky okna nebo dveří (mode: 'opening-width')
 */
window.App = window.App || {};

window.App.NumPad = {
    isOpen: false,
    mode: 'wall',          // 'wall' | 'jamb-start' | 'jamb-end' | 'opening-width'
    targetWallId: null,
    targetOpeningId: null,
    inputBuffer: '',
    replaceOnNextDigit: true,
    direction: 'auto',     // 'auto' | 'end' | 'start' | 'both'

    init() {
        document.querySelectorAll('[data-numpad-key]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const key = btn.getAttribute('data-numpad-key');
                this.handleKey(key);
            });
        });

        document.querySelectorAll('[data-numpad-dir]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.setDirection(btn.getAttribute('data-numpad-dir'));
            });
        });

        document.getElementById('numpad-apply')?.addEventListener('click', () => this.applyAndClose());
        document.getElementById('numpad-next')?.addEventListener('click', () => this.applyAndNextWall());
        document.getElementById('numpad-unlock')?.addEventListener('click', () => this.unlockWallMeasurement());
        document.getElementById('numpad-open-props')?.addEventListener('click', () => {
            const opId = this.targetOpeningId;
            const wallId = this.targetWallId;
            const cirId = this.targetCircleId;
            const stId = this.targetStairId;
            this.close();
            if (opId && window.App.State.getOpeningById(opId)) {
                window.App.OpeningsUI?.openForOpening(opId);
            } else if (stId) {
                window.App.ShapesUI?.openForStair(stId);
            } else if (cirId) {
                window.App.ShapesUI?.openForCircle(cirId);
            } else if (wallId) {
                window.App.ShapesUI?.openForWallOrLine(wallId);
            }
        });
        document.getElementById('numpad-move-both')?.addEventListener('click', () => {
            const state = window.App.State;
            state.lineDefaults.moveBothEnds = !state.lineDefaults.moveBothEnds;
            this.updateMoveBothButton();
        });
        document.getElementById('numpad-close')?.addEventListener('click', () => this.close());
    },

    updateMoveBothButton() {
        const btn = document.getElementById('numpad-move-both');
        if (!btn) return;
        const both = window.App.State.lineDefaults.moveBothEnds;
        btn.textContent = both
            ? '🔗 Posun: Celá čára (oba konce)'
            : '📍 Posun: Jen tento koncový bod';
        btn.classList.toggle('active', both);
    },

    /**
     * Otevře NumPad podle toho, na jakou kótu uživatel kliknul
     */
    openForHitDimension(hitInfo, initialDigit = null) {
        if (!hitInfo) return;
        // Okna vlastností (čára/stěna/schodiště/kružnice, otvor) se zavřou – kóta se edituje jen v kalkulačce
        window.App.ShapesUI?.close();
        window.App.OpeningsUI?.close();
        if (hitInfo.kind === 'jamb-between' && hitInfo.prevOpeningId && hitInfo.openingId) {
            this.openForBetweenOpenings(hitInfo.prevOpeningId, hitInfo.openingId, initialDigit, hitInfo.wallId);
        } else if (hitInfo.kind === 'jamb-start') {
            this.openForOpeningSubDim(hitInfo.openingId, 'jamb-start', initialDigit, hitInfo.wallId);
        } else if (hitInfo.kind === 'jamb-end') {
            this.openForOpeningSubDim(hitInfo.openingId, 'jamb-end', initialDigit, hitInfo.wallId);
        } else if (hitInfo.kind === 'opening-width') {
            this.openForOpeningSubDim(hitInfo.openingId, 'opening-width', initialDigit, hitInfo.wallId);
        } else if (hitInfo.kind === 'arc-height') {
            this.openForArcHeight(hitInfo.wallId, initialDigit, hitInfo.segmentKey || null);
        } else if (hitInfo.kind === 'circle-diameter') {
            this.openForCircleDiameter(hitInfo.circleId, initialDigit);
        } else if (hitInfo.kind === 'circle-wall-dist') {
            this.openForCircleWallDist(hitInfo.circleId, hitInfo.wallId, initialDigit);
        } else if (hitInfo.kind === 'stair-length' || hitInfo.kind === 'stair-width') {
            this.openForStairDim(hitInfo.stairId, hitInfo.kind, initialDigit);
        } else {
            this.openForWall(hitInfo.wallId, initialDigit);
        }
    },

    /**
     * Otevře NumPad pro úpravu MEZIOSTĚNÍ / ROZESTUPU (mezi dvěma okny, dveřmi nebo čarami překladu na stěně).
     */
    openForBetweenOpenings(prevItemId, secondItemId, initialDigit = null, explicitWallId = null) {
        const state = window.App.State;
        const secondOp = state.getOpeningById(secondItemId);
        const wallId = explicitWallId || secondOp?.wallId;
        const wall = state.getWallById(wallId);
        if (!wall) return;

        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.isOpen = true;
        this.mode = 'jamb-between';
        this.targetWallId = wall.id;
        this.targetPrevOpeningId = prevItemId;
        this.targetOpeningId = secondItemId;
        this.targetCircleId = null;

        if (secondOp) {
            state.selection.selectedOpeningId = secondOp.id;
            state.selection.selectedNodeId = null;
        } else {
            state.selection.selectedOpeningId = null;
            state.selection.selectedNodeId = secondItemId;
        }
        state.selection.selectedWallId = wall.id;
        state.selection.movingNodeId = null;

        const chain = state.getWallChainItemsSorted(wall);
        const item1 = chain.find(it => it.id === prevItemId);
        const item2 = chain.find(it => it.id === secondItemId);
        const currentGap = (item1 && item2) ? Math.max(0, item2.distStart - item1.distEnd) : 0;

        if (initialDigit !== null) {
            this.inputBuffer = String(initialDigit);
            this.replaceOnNextDigit = false;
        } else {
            this.inputBuffer = String(Math.round(currentGap));
            this.replaceOnNextDigit = true;
        }

        this.showPanelUI();
        this.updateDisplay();
        state.notifyUI();
    },

    /**
     * Otevře NumPad pro posun okna/dveří nebo koncového bodu překladu (od rohu A nebo B) nebo změnu šířky otvoru
     */
    openForOpeningSubDim(itemId, subMode, initialDigit = null, explicitWallId = null) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const op = state.getOpeningById(itemId);
        const node = !op ? state.getNodeById(itemId) : null;
        if (!op && !node) return;

        const wallId = explicitWallId || op?.wallId;
        const wall = state.getWallById(wallId);
        if (!wall) return;
        const nA = state.getNodeById(wall.startNodeId);
        const nB = state.getNodeById(wall.endNodeId);
        const wallLen = (nA && nB) ? Math.round(Geo.distance(nA, nB)) : 1000;

        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.isOpen = true;
        this.mode = subMode; // 'jamb-start' | 'jamb-end' | 'opening-width'
        this.targetWallId = wall.id;
        this.targetOpeningId = itemId;
        this.targetCircleId = null;

        state.selection.selectedOpeningId = op ? op.id : null;
        state.selection.selectedNodeId = node ? node.id : null;
        state.selection.selectedWallId = wall.id;

        const chain = state.getWallChainItemsSorted(wall);
        const chainItem = chain.find(it => it.id === itemId);

        let currentVal = op ? op.width : 0;
        if (subMode === 'jamb-start') {
            currentVal = chainItem ? chainItem.distStart : (op ? op.offset : 0);
            state.selection.movingNodeId = wall.startNodeId;
        } else if (subMode === 'jamb-end') {
            currentVal = chainItem ? Math.max(0, wallLen - chainItem.distEnd) : 0;
            state.selection.movingNodeId = wall.endNodeId;
        } else {
            state.selection.movingNodeId = null;
        }

        if (initialDigit !== null) {
            this.inputBuffer = String(initialDigit);
            this.replaceOnNextDigit = false;
        } else {
            this.inputBuffer = String(Math.round(currentVal));
            this.replaceOnNextDigit = true;
        }

        this.showPanelUI();
        this.updateDisplay();
        state.notifyUI();
    },

    /**
     * Otevře NumPad pro změnu výšky oblouku (vzepětí v mm)
     */
    openForArcHeight(wallId, initialDigit = null, segmentKey = null) {
        const state = window.App.State;
        const wall = state.getWallById(wallId);
        if (!wall) return;

        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.isOpen = true;
        this.mode = 'arc-height';
        this.targetWallId = wall.id;
        this.targetSegmentKey = segmentKey || null;
        this.targetOpeningId = null;
        this.targetCircleId = null;

        state.selection.selectedWallId = wall.id;
        state.selection.selectedSegmentKey = this.targetSegmentKey;
        state.selection.selectedOpeningId = null;

        const ov = (this.targetSegmentKey && wall.segmentOverrides)
            ? (wall.segmentOverrides[this.targetSegmentKey] || {})
            : {};
        const effArc = this.targetSegmentKey ? (ov.arcHeight || 300) : (wall.arcHeight || 300);
        const currentVal = Math.abs(Math.round(effArc));
        this.inputBuffer = initialDigit !== null ? String(initialDigit) : String(currentVal);
        this.replaceOnNextDigit = initialDigit === null;

        this.showPanelUI();
        this.updateDisplay();
        state.notifyUI();
    },

    /**
     * Otevře NumPad pro změnu průměru kružnice (⌀ v mm)
     */
    openForCircleDiameter(circleId, initialDigit = null) {
        const state = window.App.State;
        const cir = state.getCircleById(circleId);
        if (!cir) return;

        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.isOpen = true;
        this.mode = 'circle-diameter';
        this.targetCircleId = cir.id;
        this.targetWallId = null;
        this.targetOpeningId = null;

        state.selection.selectedCircleId = cir.id;
        state.selection.selectedWallId = null;

        this.inputBuffer = initialDigit !== null ? String(initialDigit) : String(Math.round(cir.diameter));
        this.replaceOnNextDigit = initialDigit === null;

        this.showPanelUI();
        this.updateDisplay();
        state.notifyUI();
    },

    /**
     * Otevře NumPad pro změnu délky nebo šířky schodiště
     */
    openForStairDim(stairId, subMode, initialDigit = null) {
        const state = window.App.State;
        const st = state.getStairById(stairId);
        if (!st) return;

        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        this.isOpen = true;
        this.mode = subMode; // 'stair-length' | 'stair-width'
        this.targetStairId = st.id;
        this.targetCircleId = null;
        this.targetWallId = null;
        this.targetOpeningId = null;

        state.selection.selectedStairId = st.id;
        state.selection.selectedWallId = null;

        const curLen = Math.round(Math.hypot(st.x2 - st.x1, st.y2 - st.y1));
        const curVal = subMode === 'stair-width' ? Math.round(st.width) : curLen;

        this.inputBuffer = initialDigit !== null ? String(initialDigit) : String(curVal);
        this.replaceOnNextDigit = initialDigit === null;

        this.showPanelUI();
        this.updateDisplay();
        state.notifyUI();
    },

    /**
     * Otevře NumPad pro změnu kolmého odstupu středu kružnice od stěny
     */
    openForCircleWallDist(circleId, wallId, initialDigit = null) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const cir = state.getCircleById(circleId);
        const wall = state.getWallById(wallId);
        if (!cir || !wall) return;

        const nA = state.getNodeById(wall.startNodeId);
        const nB = state.getNodeById(wall.endNodeId);
        if (!nA || !nB) return;

        window.App.OpeningsUI?.close();
        window.App.ShapesUI?.close();

        const proj = Geo.pointToSegmentDistance(cir, nA, nB);

        this.isOpen = true;
        this.mode = 'circle-wall-dist';
        this.targetCircleId = cir.id;
        this.targetWallId = wall.id;
        this.targetOpeningId = null;

        state.selection.selectedCircleId = cir.id;
        this.inputBuffer = initialDigit !== null ? String(initialDigit) : String(Math.round(proj.distance));
        this.replaceOnNextDigit = initialDigit === null;

        this.showPanelUI();
        this.updateDisplay();
        state.notifyUI();
    },

    /**
     * Otevře plovoucí NumPad pro celkovou délku stěny nebo úhlopříčky
     */
    openForWall(wallId, initialDigit = null, preferredMovingNodeId = null) {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const wall = state.getWallById(wallId);
        if (!wall) return;

        window.App.OpeningsUI?.close();

        const targetNodeId = preferredMovingNodeId || state.selection.selectedNodeId || state.selection.movingNodeId;

        this.isOpen = true;
        this.mode = 'wall';
        this.targetWallId = wallId;
        this.targetOpeningId = null;
        state.selection.selectedWallId = wallId;
        state.selection.selectedOpeningId = null;

        if (targetNodeId === wall.startNodeId) {
            this.setDirection('start');
        } else if (targetNodeId === wall.endNodeId) {
            this.setDirection('end');
        } else {
            this.setDirection('auto');
        }

        const n1 = state.getNodeById(wall.startNodeId);
        const n2 = state.getNodeById(wall.endNodeId);
        const currentGeomLen = (n1 && n2) ? Math.round(Geo.distance(n1, n2)) : 0;
        const defaultVal = wall.measuredLength !== null ? wall.measuredLength : currentGeomLen;

        if (initialDigit !== null) {
            this.inputBuffer = String(initialDigit);
            this.replaceOnNextDigit = false;
        } else {
            this.inputBuffer = String(defaultVal);
            this.replaceOnNextDigit = true;
        }

        this.showPanelUI();
        this.updateDirectionButtons();
        this.updateDisplay();
        state.notifyUI();
    },

    showPanelUI() {
        const panel = document.getElementById('numpad-panel');
        if (panel) panel.classList.remove('hidden');

        // Přepínač směru rohu (A -> B) zobrazujeme pouze při úpravě celkové stěny
        const dirGroup = document.getElementById('numpad-dir-group');
        if (dirGroup) {
            dirGroup.style.display = this.mode === 'wall' ? 'grid' : 'none';
        }

        // Přepínač rovnoběžného posunu obou konců čáry (překladu) zobrazujeme při posunu bodu na stěně
        const moveBothBtn = document.getElementById('numpad-move-both');
        if (moveBothBtn) {
            const isChainShift = this.mode === 'jamb-start' || this.mode === 'jamb-end' || this.mode === 'jamb-between';
            moveBothBtn.style.display = isChainShift ? 'inline-flex' : 'none';
            this.updateMoveBothButton();
        }

        // Tlačítko pro detailní parametry (okna, dveří, čáry nebo kružnice)
        const propsBtn = document.getElementById('numpad-open-props');
        if (propsBtn) {
            propsBtn.style.display = 'inline-flex';
        }
    },

    setDirection(dir) {
        this.direction = dir;
        const state = window.App.State;
        const wall = state.getWallById(this.targetWallId);
        if (wall) {
            if (dir === 'start') {
                state.selection.movingNodeId = wall.startNodeId;
            } else if (dir === 'end') {
                state.selection.movingNodeId = wall.endNodeId;
            } else if (dir === 'both') {
                state.selection.movingNodeId = 'BOTH';
            } else {
                const nA = state.getNodeById(wall.startNodeId);
                const nB = state.getNodeById(wall.endNodeId);
                const best = (nA && nB && window.App.Solver)
                    ? window.App.Solver.chooseBestDirection(wall, nA, nB, state)
                    : 'end';
                state.selection.movingNodeId = best === 'start' ? wall.startNodeId : wall.endNodeId;
            }
        }
        this.updateDirectionButtons();
        state.notifyUI();
    },

    setMovingNode(nodeId) {
        const state = window.App.State;
        const wall = state.getWallById(this.targetWallId);
        if (!wall) return false;

        // Pokud jsme v režimu ostění otvoru, kliknutí na roh A nebo B přepne, od kterého rohu měříme ostění!
        if (this.mode === 'jamb-start' || this.mode === 'jamb-end') {
            if (wall.startNodeId === nodeId) {
                this.openForOpeningSubDim(this.targetOpeningId, 'jamb-start');
                return true;
            }
            if (wall.endNodeId === nodeId) {
                this.openForOpeningSubDim(this.targetOpeningId, 'jamb-end');
                return true;
            }
        }

        if (wall.startNodeId === nodeId) {
            this.setDirection('start');
            return true;
        }
        if (wall.endNodeId === nodeId) {
            this.setDirection('end');
            return true;
        }
        return false;
    },

    close() {
        this.isOpen = false;
        this.targetWallId = null;
        this.targetOpeningId = null;
        const panel = document.getElementById('numpad-panel');
        if (panel) panel.classList.add('hidden');
        window.App.State.notifyUI();
    },

    handleKey(key) {
        if (!this.isOpen) return;

        if (/^[0-9]$/.test(key) || key === '00') {
            if (this.replaceOnNextDigit) {
                this.inputBuffer = key === '00' ? '0' : key;
                this.replaceOnNextDigit = false;
            } else if (this.inputBuffer.length < 14) {
                if (this.inputBuffer === '0') {
                    this.inputBuffer = key === '00' ? '0' : key;
                } else {
                    this.inputBuffer += key;
                }
            }
        } else if (key === '+' || key === '-') {
            this.replaceOnNextDigit = false;
            if (this.inputBuffer.length > 0 && !/[+-]$/.test(this.inputBuffer)) {
                this.inputBuffer += key;
            }
        } else if (key === 'BACKSPACE') {
            if (this.replaceOnNextDigit) {
                this.inputBuffer = '';
                this.replaceOnNextDigit = false;
            } else {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
            }
        } else if (key === 'CLEAR') {
            this.inputBuffer = '';
            this.replaceOnNextDigit = false;
        } else if (key === 'ENTER') {
            this.applyAndClose();
            return;
        } else if (key === 'TAB') {
            this.applyAndNextWall();
            return;
        } else if (key === 'ESCAPE') {
            this.close();
            return;
        }

        this.updateDisplay();
    },

    evaluateBuffer() {
        const cleaned = (this.inputBuffer || '').replace(/[^0-9+-]/g, '');
        if (!cleaned) return null;

        const tokens = cleaned.match(/[+-]?[0-9]+/g);
        if (!tokens) return null;

        let sum = 0;
        for (const t of tokens) {
            sum += parseInt(t, 10);
        }
        return sum >= 0 ? sum : null;
    },

    updateDisplay() {
        const titleEl = document.getElementById('numpad-title');
        const exprEl = document.getElementById('numpad-expr');
        const valEl = document.getElementById('numpad-value');
        const unlockBtn = document.getElementById('numpad-unlock');
        const state = window.App.State;
        const wall = state.getWallById(this.targetWallId);
        const op = state.getOpeningById(this.targetOpeningId);

        if (titleEl) {
            if (this.mode === 'jamb-start') {
                titleEl.textContent = op ? '📏 Ostění od rohu A (posun otvoru)' : '📏 Odstup bodu od rohu A';
            } else if (this.mode === 'jamb-end') {
                titleEl.textContent = op ? '📏 Ostění od rohu B (posun otvoru)' : '📏 Odstup bodu od rohu B';
            } else if (this.mode === 'jamb-between') {
                titleEl.textContent = op ? '📏 Meziostění (rozestup prvků)' : '📏 Rozestup čar / šířka překladu';
            } else if (this.mode === 'opening-width') {
                const titles = {
                    door: '🚪 Šířka dveří',
                    window: '🪟 Šířka okna',
                    opening: '⬜ Šířka otvoru',
                    niche: '凹 Šířka niky'
                };
                titleEl.textContent = titles[op?.type] || '📏 Šířka otvoru';
            } else if (this.mode === 'arc-height') {
                titleEl.textContent = '⌒ Výška oblouku (vzepětí v mm)';
            } else if (this.mode === 'circle-diameter') {
                titleEl.textContent = '◯ Průměr kružnice / sloupu (⌀)';
            } else if (this.mode === 'circle-wall-dist') {
                titleEl.textContent = '🎯 Odstup středu kružnice od stěny';
            } else if (this.mode === 'stair-length') {
                titleEl.textContent = '🪜 Délka schodiště (ramene)';
            } else if (this.mode === 'stair-width') {
                titleEl.textContent = '🪜 Šířka schodiště (ramene)';
            } else {
                titleEl.textContent = wall?.isDiagonal ? '⟋ Délka úhlopříčky' : (wall?.isAuxLine ? '➖ Délka čáry / překladu' : '📏 Celková délka stěny');
            }
        }

        const evaluated = this.evaluateBuffer();
        const hasOperator = /[+-]/.test(this.inputBuffer);

        if (exprEl) {
            if (hasOperator) {
                exprEl.textContent = `${this.inputBuffer} =`;
            } else if (this.mode === 'jamb-between') {
                exprEl.textContent = 'Zadej rozestup v mm (0 mm = těsně u sebe):';
            } else if (this.mode === 'jamb-start' || this.mode === 'jamb-end') {
                exprEl.textContent = 'Posune prvek po stěně (délka stěny se nezmění):';
            } else if (this.mode === 'opening-width') {
                exprEl.textContent = 'Změní šířku otvoru (délka stěny se nezmění):';
            } else if (this.mode === 'arc-height') {
                exprEl.textContent = 'Zadej vzepětí oblouku v mm (0 = narovnat čáru):';
            } else if (this.mode === 'circle-diameter') {
                exprEl.textContent = 'Zadej průměr kružnice v mm:';
            } else if (this.mode === 'circle-wall-dist') {
                exprEl.textContent = 'Posune kružnici kolmo ke stěně (v mm):';
            } else {
                exprEl.textContent = 'Zadej délku (v mm):';
            }
        }

        if (valEl) {
            if (this.inputBuffer === '') {
                valEl.textContent = '0';
                valEl.classList.add('placeholder');
            } else {
                valEl.textContent = hasOperator && evaluated !== null
                    ? `${this.inputBuffer} (${evaluated})`
                    : this.inputBuffer;
                valEl.classList.remove('placeholder');
                valEl.classList.toggle('replace-mode', this.replaceOnNextDigit);
            }
        }

        if (unlockBtn) {
            unlockBtn.style.display = (this.mode === 'wall' && wall && wall.measuredLength !== null)
                ? 'inline-flex'
                : 'none';
        }
    },

    updateDirectionButtons() {
        document.querySelectorAll('[data-numpad-dir]').forEach(btn => {
            const isAct = btn.getAttribute('data-numpad-dir') === this.direction;
            btn.classList.toggle('active', isAct);
        });
    },

    /**
     * Uloží zadanou hodnotu podle aktivního režimu (posun ostění, šířka otvoru, nebo délka stěny)
     */
    commitCurrentValue() {
        const state = window.App.State;
        const Geo = window.App.Geometry;
        const val = this.evaluateBuffer();
        if (val === null) return false;

        if (this.mode === 'jamb-between') {
            if (!this.targetWallId || !this.targetPrevOpeningId || !this.targetOpeningId) return false;
            state.saveSnapshot();
            state.setGapBetweenChainItems(
                this.targetWallId,
                this.targetPrevOpeningId,
                this.targetOpeningId,
                val,
                state.lineDefaults.moveBothEnds
            );
            state.notifyUI();
            return true;
        }

        if (this.mode === 'jamb-start' || this.mode === 'jamb-end') {
            const wall = state.getWallById(this.targetWallId);
            if (!wall || !this.targetOpeningId) return false;

            const nA = state.getNodeById(wall.startNodeId);
            const nB = state.getNodeById(wall.endNodeId);
            const wallLen = (nA && nB) ? Geo.distance(nA, nB) : 2000;

            const op = state.getOpeningById(this.targetOpeningId);
            const itemWidth = op ? op.width : 0;

            const desiredStartFromA = this.mode === 'jamb-start'
                ? Math.round(val)
                : Math.round(wallLen - val - itemWidth);

            state.saveSnapshot();
            if (op) {
                op.fromEnd = this.mode === 'jamb-start' ? 'start' : 'end';
            }
            state.moveWallChainItemPreservingChain(
                wall.id,
                this.targetOpeningId,
                desiredStartFromA,
                state.lineDefaults.moveBothEnds
            );
            state.notifyUI();
            return true;
        }

        if (this.mode === 'opening-width') {
            const op = state.getOpeningById(this.targetOpeningId);
            const wall = state.getWallById(this.targetWallId);
            if (!op || !wall || val < 100) return false;

            state.saveSnapshot();
            state.setOpeningWidthPreservingChain(op.id, val);
            state.notifyUI();
            return true;
        }

        if (this.mode === 'arc-height') {
            const wall = state.getWallById(this.targetWallId);
            if (!wall) return false;
            state.saveSnapshot();
            if (this.targetSegmentKey) {
                const ov = (wall.segmentOverrides && wall.segmentOverrides[this.targetSegmentKey]) || {};
                const sign = (ov.arcHeight && ov.arcHeight < 0) ? -1 : 1;
                state.setWallSegmentOverride(wall.id, this.targetSegmentKey, {
                    arcHeight: val === 0 ? 0 : sign * Math.round(val)
                });
            } else {
                const sign = (wall.arcHeight && wall.arcHeight < 0) ? -1 : 1;
                wall.arcHeight = val === 0 ? 0 : sign * Math.round(val);
            }
            state.notifyUI();
            return true;
        }

        if (this.mode === 'circle-diameter') {
            const cir = state.getCircleById(this.targetCircleId);
            if (!cir || val < 50) return false;
            state.saveSnapshot();
            cir.diameter = Math.round(val);
            state.notifyUI();
            return true;
        }

        if (this.mode === 'stair-length') {
            if (!this.targetStairId || val < 150) return false;
            state.saveSnapshot();
            return state.setStairLength(this.targetStairId, Math.round(val));
        }

        if (this.mode === 'stair-width') {
            const st = state.getStairById(this.targetStairId);
            if (!st || val < 200) return false;
            state.saveSnapshot();
            st.width = Math.round(val);
            state.notifyUI();
            return true;
        }

        if (this.mode === 'circle-wall-dist') {
            const cir = state.getCircleById(this.targetCircleId);
            const wall = state.getWallById(this.targetWallId);
            if (!cir || !wall || val < 10) return false;
            const nA = state.getNodeById(wall.startNodeId);
            const nB = state.getNodeById(wall.endNodeId);
            if (!nA || !nB) return false;

            const proj = Geo.pointToSegmentDistance(cir, nA, nB);
            if (proj.distance < 1) return false;
            const nx = (cir.x - proj.projection.x) / proj.distance;
            const ny = (cir.y - proj.projection.y) / proj.distance;

            state.saveSnapshot();
            cir.x = Math.round(proj.projection.x + nx * val);
            cir.y = Math.round(proj.projection.y + ny * val);
            state.notifyUI();
            return true;
        }

        // Výchozí mode === 'wall'
        if (val >= 10 && this.targetWallId) {
            return window.App.Solver.setWallLength(this.targetWallId, val, this.direction);
        }
        return false;
    },

    applyAndClose() {
        this.commitCurrentValue();
        this.close();
    },

    applyAndNextWall() {
        const state = window.App.State;
        const currentWallId = this.targetWallId;
        const currentOpId = this.targetOpeningId;
        const currentMode = this.mode;

        this.commitCurrentValue();

        // Pokud jsme v ostění A, přepneme na šířku otvoru -> pak na celkovou stěnu -> pak na další stěnu!
        if (currentMode === 'jamb-start' && currentOpId) {
            this.openForOpeningSubDim(currentOpId, 'opening-width');
            return;
        }
        if (currentMode === 'opening-width' && currentWallId) {
            this.openForWall(currentWallId);
            return;
        }

        const nextWall = window.App.Solver.getNextConnectedWall(currentWallId, state);
        if (nextWall) {
            this.openForWall(nextWall.id);
        } else {
            this.close();
        }
    },

    unlockWallMeasurement() {
        const state = window.App.State;
        const wall = state.getWallById(this.targetWallId);
        if (wall && wall.measuredLength !== null) {
            state.saveSnapshot();
            wall.measuredLength = null;
            state.notifyUI();
        }
        this.close();
    }
};
