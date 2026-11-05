/**
 * Modul: input/shapesUI.js
 * Ovládání nástroje "➖ Čára / Překlad / Oblouk / Kružnice":
 * 1) Rychlá horní lišta (#line-style-bar) při aktivním nástroji 'line' (výběr tvaru, stylu čáry a tloušťky)
 * 2) Plovoucí panel vlastností (#shape-panel) pro úpravu vybrané čáry, stěny, oblouku nebo kružnice
 */
window.App = window.App || {};

window.App.ShapesUI = {
    isOpen: false,
    targetWallId: null,
    targetSegmentKey: null,
    targetCircleId: null,
    targetStairId: null,

    init() {
        // 1. Horní lišta předvoleb při kreslení čáry / tvaru
        document.querySelectorAll('[data-line-submode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-line-submode');
                window.App.State.lineDefaults.subMode = mode;
                this.syncToolbarUI();
            });
        });

        document.querySelectorAll('[data-line-style]').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.getAttribute('data-line-style');
                window.App.State.lineDefaults.lineStyle = style;
                this.syncToolbarUI();
            });
        });

        document.querySelectorAll('[data-line-thick]').forEach(btn => {
            btn.addEventListener('click', () => {
                const thick = parseFloat(btn.getAttribute('data-line-thick'));
                if (Number.isFinite(thick)) {
                    window.App.State.lineDefaults.lineThickness = thick;
                    this.syncToolbarUI();
                }
            });
        });

        const spacingInput = document.getElementById('line-double-spacing');
        if (spacingInput) {
            spacingInput.addEventListener('input', () => {
                const val = parseInt(spacingInput.value, 10);
                if (Number.isFinite(val) && val >= 20) {
                    window.App.State.lineDefaults.doubleSpacing = val;
                }
            });
            spacingInput.addEventListener('keydown', e => e.stopPropagation());
        }

        document.getElementById('line-rect-walls')?.addEventListener('click', () => {
            const defs = window.App.State.lineDefaults;
            defs.rectAsWalls = !defs.rectAsWalls;
            this.syncToolbarUI();
        });

        // 1b. Horní lišta pro kreslení od ruky (#freehand-bar)
        document.querySelectorAll('[data-fh-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.State.freehandDefaults.mode = btn.getAttribute('data-fh-mode');
                this.syncToolbarUI();
            });
        });
        document.querySelectorAll('[data-fh-color]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.State.freehandDefaults.color = btn.getAttribute('data-fh-color');
                window.App.State.freehandDefaults.mode = 'pen';
                this.syncToolbarUI();
            });
        });
        document.querySelectorAll('[data-fh-width]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.State.freehandDefaults.width = parseFloat(btn.getAttribute('data-fh-width')) || 3;
                this.syncToolbarUI();
            });
        });
        document.getElementById('fh-clear-all')?.addEventListener('click', () => {
            const state = window.App.State;
            if (state.freehandStrokes.length > 0) {
                state.saveSnapshot();
                state.freehandStrokes = [];
                state.notifyUI();
            }
        });

        // 1c. Plovoucí panel pro úpravu SCHODIŠTĚ (#stair-panel)
        document.getElementById('st-close')?.addEventListener('click', () => this.close());
        document.getElementById('st-apply')?.addEventListener('click', () => this.close());
        document.getElementById('st-delete')?.addEventListener('click', () => this.deleteCurrent());
        document.getElementById('st-flip-dir')?.addEventListener('click', () => this.flipStairDirection());
        document.getElementById('st-flip-side')?.addEventListener('click', () => this.cycleStairSide());
        document.getElementById('st-step-dec')?.addEventListener('click', () => this.adjustStairStepCount(-1));
        document.getElementById('st-step-inc')?.addEventListener('click', () => this.adjustStairStepCount(1));

        document.querySelectorAll('[data-st-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const wIn = document.getElementById('st-width');
                if (wIn) {
                    wIn.value = btn.getAttribute('data-st-preset');
                    this.applyStairChanges();
                }
            });
        });

        ['st-length', 'st-width', 'st-steps', 'st-riser', 'st-note'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => this.applyStairChanges());
            el.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                }
            });
        });

        // 2. Plovoucí panel vlastností vybrané čáry / stěny / oblouku / kružnice (#shape-panel)
        document.getElementById('sh-close')?.addEventListener('click', () => this.close());
        document.getElementById('sh-apply')?.addEventListener('click', () => this.close());
        document.getElementById('sh-delete')?.addEventListener('click', () => this.deleteCurrent());
        document.getElementById('sh-cut-segment')?.addEventListener('click', () => this.toggleCutoutSegment());
        document.getElementById('sh-open-numpad')?.addEventListener('click', () => {
            const wId = this.targetWallId;
            this.close();
            if (wId) window.App.NumPad?.openForWall(wId);
        });

        // Přepínač Stěna vs. Pomocná čára (Překlad)
        document.getElementById('sh-kind-wall')?.addEventListener('click', () => this.setWallKind(false));
        document.getElementById('sh-kind-aux')?.addEventListener('click', () => this.setWallKind(true));

        // Styl čáry na vybraném prvku
        document.querySelectorAll('[data-sh-style]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setSelectedLineStyle(btn.getAttribute('data-sh-style'));
            });
        });

        // Tloušťka čáry na vybraném prvku
        document.querySelectorAll('[data-sh-thick]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setSelectedThickness(parseFloat(btn.getAttribute('data-sh-thick')));
            });
        });

        // Oblouk: otočit stranu / narovnat
        document.getElementById('sh-arc-flip')?.addEventListener('click', () => this.flipArcSide());
        document.getElementById('sh-arc-zero')?.addEventListener('click', () => {
            const arcIn = document.getElementById('sh-arc');
            if (arcIn) {
                arcIn.value = 0;
                this.applyChanges();
            }
        });

        // Přepínač viditelnosti vlastní délkové kóty čáry
        document.getElementById('sh-show-dim')?.addEventListener('change', () => this.applyChanges());

        // Živé vstupy (výška oblouku, průměr kružnice, poznámka)
        ['sh-arc', 'sh-diameter', 'sh-note'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => this.applyChanges());
            el.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                }
            });
        });

        // Rychlé štítky poznámek pro čáry / překlady / sloupy
        document.querySelectorAll('[data-sh-tag]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.getAttribute('data-sh-tag');
                const noteIn = document.getElementById('sh-note');
                if (noteIn && tag) {
                    noteIn.value = tag;
                    this.applyChanges();
                }
            });
        });

        this.syncToolbarUI();
    },

    /**
     * Zobrazí nebo skryje horní lištu stylu čar nebo kreslení od ruky podle aktivního nástroje
     */
    updateToolbarVisibility(activeTool) {
        const lineBar = document.getElementById('line-style-bar');
        const fhBar = document.getElementById('freehand-bar');
        if (lineBar) lineBar.classList.toggle('hidden', activeTool !== 'line');
        if (fhBar) fhBar.classList.toggle('hidden', activeTool !== 'freehand');
        if (activeTool === 'line' || activeTool === 'freehand') {
            this.syncToolbarUI();
        }
    },

    syncToolbarUI() {
        const state = window.App.State;
        const defs = state.lineDefaults;
        document.querySelectorAll('[data-line-submode]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-line-submode') === defs.subMode);
        });
        document.querySelectorAll('[data-line-style]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-line-style') === defs.lineStyle);
        });
        document.querySelectorAll('[data-line-thick]').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.getAttribute('data-line-thick')) === defs.lineThickness);
        });

        const doubleWrap = document.getElementById('line-double-wrap');
        if (doubleWrap) {
            doubleWrap.style.display = defs.subMode === 'double' ? 'inline-flex' : 'none';
        }
        const rectWrap = document.getElementById('line-rect-wrap');
        if (rectWrap) {
            rectWrap.style.display = defs.subMode === 'rect' ? 'inline-flex' : 'none';
        }
        const rectWallsBtn = document.getElementById('line-rect-walls');
        if (rectWallsBtn) {
            rectWallsBtn.classList.toggle('active', Boolean(defs.rectAsWalls));
            rectWallsBtn.textContent = defs.rectAsWalls
                ? '🧱 Jako 4 nosné stěny (místnost)'
                : '➖ Jako pomocný tvar (sloup / šachta)';
        }
        const spacingInput = document.getElementById('line-double-spacing');
        if (spacingInput && document.activeElement !== spacingInput) {
            spacingInput.value = defs.doubleSpacing;
        }

        const fh = state.freehandDefaults;
        if (fh) {
            document.querySelectorAll('[data-fh-mode]').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-fh-mode') === fh.mode);
            });
            document.querySelectorAll('[data-fh-color]').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-fh-color') === fh.color);
            });
            document.querySelectorAll('[data-fh-width]').forEach(btn => {
                btn.classList.toggle('active', Math.abs(parseFloat(btn.getAttribute('data-fh-width')) - fh.width) < 0.3);
            });
        }
    },

    /**
     * Otevře panel úprav pro vybranou čáru, překlad, oblouk, stěnu nebo dílčí úsek rozdělené stěny
     */
    openForWallOrLine(wallId, segmentKey = null) {
        const state = window.App.State;
        const wall = state.getWallById(wallId);
        if (!wall || wall.isDiagonal) return;

        window.App.OpeningsUI?.close();

        const segments = state.getWallSegmentsSorted ? state.getWallSegmentsSorted(wall) : [];
        const isMultiSeg = segments.length > 1;
        const activeSeg = (isMultiSeg && segmentKey) ? segments.find(s => s.key === segmentKey) : null;

        this.isOpen = true;
        this.targetWallId = wall.id;
        this.targetSegmentKey = activeSeg ? activeSeg.key : null;
        this.targetCircleId = null;
        this.targetStairId = null;
        document.getElementById('stair-panel')?.classList.add('hidden');

        state.selection.selectedWallId = wall.id;
        state.selection.selectedSegmentKey = this.targetSegmentKey;
        state.selection.selectedCircleId = null;
        state.selection.selectedOpeningId = null;

        const override = (this.targetSegmentKey && wall.segmentOverrides)
            ? (wall.segmentOverrides[this.targetSegmentKey] || {})
            : {};

        const titleEl = document.getElementById('sh-title');
        if (titleEl) {
            if (activeSeg) {
                const segLen = Math.round(activeSeg.distEnd - activeSeg.distStart);
                titleEl.textContent = override.hidden
                    ? `✂️ Vyříznutý úsek stěny (${segLen} mm)`
                    : `🧱 Úsek stěny (${segLen} mm z celkové stěny)`;
            } else {
                titleEl.textContent = wall.isAuxLine ? '➖ Nastavení čáry / překladu' : '🧱 Nastavení stěny / oblouku';
            }
        }

        document.getElementById('sh-wall-only')?.style.setProperty('display', activeSeg ? 'none' : 'flex');
        document.getElementById('sh-arc-section')?.style.setProperty('display', 'flex');
        document.getElementById('sh-dim-row')?.style.setProperty('display', activeSeg ? 'none' : 'flex');
        document.getElementById('sh-circle-only')?.style.setProperty('display', 'none');

        const segBox = document.getElementById('sh-segment-actions');
        const cutBtn = document.getElementById('sh-cut-segment');
        const delBtn = document.getElementById('sh-delete');
        if (segBox && cutBtn) {
            if (activeSeg) {
                segBox.style.display = 'flex';
                cutBtn.textContent = override.hidden
                    ? '🧱 Obnovit vyříznutý úsek stěny'
                    : '✂️ Vyříznout (smazat) jen tento úsek stěny';
            } else {
                segBox.style.display = 'none';
            }
        }
        if (delBtn) {
            if (activeSeg && !override.hidden) {
                delBtn.textContent = '🗑️ Smazat tento úsek';
            } else if (activeSeg && override.hidden) {
                delBtn.textContent = '🗑️ Smazat celou stěnu';
            } else {
                delBtn.textContent = '🗑️ Smazat';
            }
        }

        const arcIn = document.getElementById('sh-arc');
        const noteIn = document.getElementById('sh-note');
        const showDimCheck = document.getElementById('sh-show-dim');

        const effArc = activeSeg
            ? (override.arcHeight !== undefined ? override.arcHeight : 0)
            : (wall.arcHeight || 0);
        const effStyle = activeSeg
            ? (override.lineStyle || wall.lineStyle || 'solid')
            : (wall.lineStyle || 'solid');
        const effThick = activeSeg
            ? (override.lineThickness || wall.lineThickness || (wall.isAuxLine ? 2.5 : 4))
            : (wall.lineThickness || (wall.isAuxLine ? 2.5 : 4));

        if (arcIn) arcIn.value = Math.abs(Math.round(effArc));
        if (noteIn) noteIn.value = wall.note || '';
        if (showDimCheck) showDimCheck.checked = Boolean(wall.showOwnDim);

        this.syncPanelButtons(wall.isAuxLine, effStyle, effThick);

        document.getElementById('shape-panel')?.classList.remove('hidden');
        state.notifyUI();
    },

    /**
     * Otevře panel úprav pro vybranou kružnici / sloup
     */
    openForCircle(circleId) {
        const state = window.App.State;
        const cir = state.getCircleById(circleId);
        if (!cir) return;

        window.App.OpeningsUI?.close();
        window.App.NumPad?.close();

        this.isOpen = true;
        this.targetCircleId = cir.id;
        this.targetWallId = null;
        this.targetStairId = null;
        document.getElementById('stair-panel')?.classList.add('hidden');

        state.selection.selectedCircleId = cir.id;
        state.selection.selectedWallId = null;
        state.selection.selectedOpeningId = null;

        const titleEl = document.getElementById('sh-title');
        if (titleEl) {
            titleEl.textContent = '◯ Nastavení kružnice / sloupu';
        }

        document.getElementById('sh-wall-only')?.style.setProperty('display', 'none');
        document.getElementById('sh-arc-section')?.style.setProperty('display', 'none');
        document.getElementById('sh-dim-row')?.style.setProperty('display', 'none');
        document.getElementById('sh-segment-actions')?.style.setProperty('display', 'none');
        document.getElementById('sh-circle-only')?.style.setProperty('display', 'flex');
        this.targetSegmentKey = null;

        const diamIn = document.getElementById('sh-diameter');
        const noteIn = document.getElementById('sh-note');
        if (diamIn) diamIn.value = Math.round(cir.diameter);
        if (noteIn) noteIn.value = cir.note || '';

        this.syncPanelButtons(true, cir.lineStyle || 'solid', cir.lineThickness || 2.5);

        document.getElementById('shape-panel')?.classList.remove('hidden');
        state.notifyUI();
    },

    syncPanelButtons(isAux, lineStyle, thickness) {
        document.getElementById('sh-kind-wall')?.classList.toggle('active', !isAux);
        document.getElementById('sh-kind-aux')?.classList.toggle('active', Boolean(isAux));

        document.querySelectorAll('[data-sh-style]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-sh-style') === lineStyle);
        });
        document.querySelectorAll('[data-sh-thick]').forEach(btn => {
            btn.classList.toggle('active', Math.abs(parseFloat(btn.getAttribute('data-sh-thick')) - thickness) < 0.3);
        });
    },

    setWallKind(isAuxLine) {
        const state = window.App.State;
        const wall = state.getWallById(this.targetWallId);
        if (!wall) return;

        state.saveSnapshot();
        wall.isAuxLine = Boolean(isAuxLine);
        if (isAuxLine && (!wall.lineStyle || wall.lineStyle === 'solid')) {
            wall.lineStyle = 'dashdot';
            wall.lineThickness = 2.5;
            wall.showOwnDim = false;
        } else if (!isAuxLine) {
            wall.lineStyle = 'solid';
            wall.lineThickness = 4;
            wall.showOwnDim = true;
        }
        this.openForWallOrLine(wall.id);
    },

    setSelectedLineStyle(style) {
        const state = window.App.State;
        if (this.targetWallId) {
            const wall = state.getWallById(this.targetWallId);
            if (!wall) return;
            state.saveSnapshot();
            if (this.targetSegmentKey) {
                state.setWallSegmentOverride(wall.id, this.targetSegmentKey, { lineStyle: style, hidden: false });
                const ov = wall.segmentOverrides[this.targetSegmentKey] || {};
                this.syncPanelButtons(wall.isAuxLine, ov.lineStyle || style, ov.lineThickness || wall.lineThickness || 4);
                this.openForWallOrLine(wall.id, this.targetSegmentKey);
            } else {
                wall.lineStyle = style;
                this.syncPanelButtons(wall.isAuxLine, wall.lineStyle, wall.lineThickness || 2.5);
                state.notifyUI();
            }
        } else if (this.targetCircleId) {
            const cir = state.getCircleById(this.targetCircleId);
            if (!cir) return;
            state.saveSnapshot();
            cir.lineStyle = style;
            this.syncPanelButtons(true, cir.lineStyle, cir.lineThickness || 2.5);
            state.notifyUI();
        }
    },

    setSelectedThickness(thick) {
        const state = window.App.State;
        if (!Number.isFinite(thick)) return;
        if (this.targetWallId) {
            const wall = state.getWallById(this.targetWallId);
            if (!wall) return;
            state.saveSnapshot();
            if (this.targetSegmentKey) {
                state.setWallSegmentOverride(wall.id, this.targetSegmentKey, { lineThickness: thick, hidden: false });
                const ov = wall.segmentOverrides[this.targetSegmentKey] || {};
                this.syncPanelButtons(wall.isAuxLine, ov.lineStyle || wall.lineStyle || 'solid', thick);
            } else {
                wall.lineThickness = thick;
                this.syncPanelButtons(wall.isAuxLine, wall.lineStyle || 'solid', wall.lineThickness);
            }
            state.notifyUI();
        } else if (this.targetCircleId) {
            const cir = state.getCircleById(this.targetCircleId);
            if (!cir) return;
            state.saveSnapshot();
            cir.lineThickness = thick;
            this.syncPanelButtons(true, cir.lineStyle || 'solid', cir.lineThickness);
            state.notifyUI();
        }
    },

    flipArcSide() {
        const state = window.App.State;
        const wall = state.getWallById(this.targetWallId);
        if (!wall) return;
        state.saveSnapshot();
        if (this.targetSegmentKey) {
            const ov = (wall.segmentOverrides && wall.segmentOverrides[this.targetSegmentKey]) || {};
            const cur = ov.arcHeight || 0;
            const nextArc = cur === 0 ? 350 : -cur;
            state.setWallSegmentOverride(wall.id, this.targetSegmentKey, { arcHeight: nextArc, hidden: false });
            const arcIn = document.getElementById('sh-arc');
            if (arcIn) arcIn.value = Math.abs(Math.round(nextArc));
        } else if (!wall.arcHeight || wall.arcHeight === 0) {
            wall.arcHeight = 350;
            const arcIn = document.getElementById('sh-arc');
            if (arcIn) arcIn.value = 350;
        } else {
            wall.arcHeight = -wall.arcHeight;
        }
        state.notifyUI();
    },

    toggleCutoutSegment() {
        const state = window.App.State;
        if (!this.targetWallId || !this.targetSegmentKey) return;
        const wall = state.getWallById(this.targetWallId);
        if (!wall) return;
        const ov = (wall.segmentOverrides && wall.segmentOverrides[this.targetSegmentKey]) || {};
        state.saveSnapshot();
        state.setWallSegmentOverride(wall.id, this.targetSegmentKey, { hidden: !ov.hidden });
        this.openForWallOrLine(wall.id, this.targetSegmentKey);
    },

    applyChanges() {
        const state = window.App.State;
        const noteVal = document.getElementById('sh-note')?.value || '';

        if (this.targetWallId) {
            const wall = state.getWallById(this.targetWallId);
            if (!wall) return;
            const arcVal = parseInt(document.getElementById('sh-arc')?.value, 10);
            const showDim = document.getElementById('sh-show-dim')?.checked;

            if (this.targetSegmentKey) {
                if (Number.isFinite(arcVal) && arcVal >= 0) {
                    const ov = (wall.segmentOverrides && wall.segmentOverrides[this.targetSegmentKey]) || {};
                    const sign = (ov.arcHeight && ov.arcHeight < 0) ? -1 : 1;
                    state.setWallSegmentOverride(wall.id, this.targetSegmentKey, {
                        arcHeight: arcVal === 0 ? 0 : sign * arcVal
                    });
                }
            } else {
                if (Number.isFinite(arcVal) && arcVal >= 0) {
                    const sign = (wall.arcHeight && wall.arcHeight < 0) ? -1 : 1;
                    wall.arcHeight = arcVal === 0 ? 0 : sign * arcVal;
                }
                if (showDim !== undefined) {
                    wall.showOwnDim = Boolean(showDim);
                }
            }
            wall.note = noteVal;
            state.notifyUI();
        } else if (this.targetCircleId) {
            const cir = state.getCircleById(this.targetCircleId);
            if (!cir) return;
            const diamVal = parseInt(document.getElementById('sh-diameter')?.value, 10);
            if (Number.isFinite(diamVal) && diamVal >= 50) {
                cir.diameter = diamVal;
            }
            cir.note = noteVal;
            state.notifyUI();
        }
    },

    deleteCurrent() {
        const state = window.App.State;
        if (this.targetStairId) {
            state.selection.selectedStairId = this.targetStairId;
            state.deleteSelected();
        } else if (this.targetCircleId) {
            state.selection.selectedCircleId = this.targetCircleId;
            state.deleteSelected();
        } else if (this.targetWallId) {
            const wall = state.getWallById(this.targetWallId);
            const ov = (wall && this.targetSegmentKey && wall.segmentOverrides)
                ? wall.segmentOverrides[this.targetSegmentKey]
                : null;
            state.selection.selectedWallId = this.targetWallId;
            // Pokud už je vybraný úsek vyříznutý a uživatel klikne na "Smazat celou stěnu", smažeme celou stěnu
            state.selection.selectedSegmentKey = (ov && ov.hidden) ? null : this.targetSegmentKey;
            state.deleteSelected();
        }
        this.close();
    },

    /**
     * Otevře plovoucí panel pro nastavení schodiště (#stair-panel)
     */
    openForStair(stairId) {
        const state = window.App.State;
        const st = state.getStairById(stairId);
        if (!st) return;

        window.App.OpeningsUI?.close();
        window.App.NumPad?.close();
        document.getElementById('shape-panel')?.classList.add('hidden');

        this.isOpen = true;
        this.targetStairId = st.id;
        this.targetWallId = null;
        this.targetSegmentKey = null;
        this.targetCircleId = null;

        state.selection.selectedStairId = st.id;
        state.selection.selectedWallId = null;
        state.selection.selectedCircleId = null;
        state.selection.selectedOpeningId = null;

        const len = Math.round(Math.hypot(st.x2 - st.x1, st.y2 - st.y1));
        const lenIn = document.getElementById('st-length');
        const wIn = document.getElementById('st-width');
        const stepsIn = document.getElementById('st-steps');
        const riserIn = document.getElementById('st-riser');
        const noteIn = document.getElementById('st-note');

        if (lenIn) lenIn.value = len;
        if (wIn) wIn.value = Math.round(st.width || 1000);
        if (stepsIn) stepsIn.value = st.stepCount || 10;
        if (riserIn) riserIn.value = st.stepHeight || 175;
        if (noteIn) noteIn.value = st.note || '';

        this.updateStairDepthInfo(len, st.stepCount || 10);
        document.getElementById('stair-panel')?.classList.remove('hidden');
        state.notifyUI();
    },

    updateStairDepthInfo(len, steps) {
        const infoEl = document.getElementById('st-depth-info');
        if (infoEl) {
            const b = Math.round(len / Math.max(1, steps));
            infoEl.textContent = `Hloubka stupně b = ${b} mm`;
        }
    },

    adjustStairStepCount(delta) {
        const stepsIn = document.getElementById('st-steps');
        if (!stepsIn) return;
        const cur = parseInt(stepsIn.value, 10) || 10;
        stepsIn.value = Math.max(2, Math.min(40, cur + delta));
        this.applyStairChanges();
    },

    flipStairDirection() {
        const state = window.App.State;
        const st = state.getStairById(this.targetStairId);
        if (!st) return;
        state.saveSnapshot();
        const tx = st.x1, ty = st.y1;
        st.x1 = st.x2;
        st.y1 = st.y2;
        st.x2 = tx;
        st.y2 = ty;
        st.expandSide = -(st.expandSide || 1);
        state.notifyUI();
    },

    cycleStairSide() {
        const state = window.App.State;
        const st = state.getStairById(this.targetStairId);
        if (!st) return;
        state.saveSnapshot();
        if (st.expandSide === 1) st.expandSide = -1;
        else if (st.expandSide === -1) st.expandSide = 0;
        else st.expandSide = 1;
        state.notifyUI();
    },

    applyStairChanges() {
        const state = window.App.State;
        const st = state.getStairById(this.targetStairId);
        if (!st) return;

        const lenVal = parseInt(document.getElementById('st-length')?.value, 10);
        const wVal = parseInt(document.getElementById('st-width')?.value, 10);
        const stepsVal = parseInt(document.getElementById('st-steps')?.value, 10);
        const riserVal = parseInt(document.getElementById('st-riser')?.value, 10);
        const noteVal = document.getElementById('st-note')?.value || '';

        if (Number.isFinite(lenVal) && lenVal >= 150) {
            state.setStairLength(st.id, lenVal);
        }
        if (Number.isFinite(wVal) && wVal >= 200) {
            st.width = wVal;
        }
        if (Number.isFinite(stepsVal) && stepsVal >= 2) {
            st.stepCount = stepsVal;
        }
        if (Number.isFinite(riserVal) && riserVal >= 50) {
            st.stepHeight = riserVal;
        }
        st.note = noteVal;

        const curLen = Math.round(Math.hypot(st.x2 - st.x1, st.y2 - st.y1));
        this.updateStairDepthInfo(curLen, st.stepCount);
        state.notifyUI();
    },

    close() {
        this.isOpen = false;
        this.targetWallId = null;
        this.targetSegmentKey = null;
        this.targetCircleId = null;
        this.targetStairId = null;
        document.getElementById('shape-panel')?.classList.add('hidden');
        document.getElementById('stair-panel')?.classList.add('hidden');
        window.App.State.notifyUI();
    }
};
