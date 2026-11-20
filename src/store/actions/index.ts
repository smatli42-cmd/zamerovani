/**
 * Všechny změny výkresu na jednom místě. Rozhraní i nástroje volají tyto funkce,
 * nikdy nemění data přímo. Vlastní kód je rozdělený podle oblastí do souborů v této složce;
 * tady se znovu exportuje jen veřejné rozhraní (pomocné funkce mezi soubory ven nejdou).
 */
export { addWall, addRectWalls, addCircleWalls, setCircleRadius, setWallSagitta, updateWall, applyWallLength, updateWallLabel, setWallThickness, setWallAxis, flipWallSide, setWallNoJoin, type GroupOrigin, groupOrigin, moveGroup, moveNode, mergeNodeIfCoincident, trimToCorner, trimToEdge } from './walls';
export { rotateSelection, duplicateSelection, pasteOpenings, endPaste } from './copy';
export { deleteSelection } from './delete';
export { addOpening, updateOpening, moveOpeningTo, setOpeningRef, setRevealEnabled, setRevealSides, setWindowKind } from './openings';
export { addRoom, updateRoom, moveRoom } from './rooms';
export { takeFreshTextId, addText, updateText, moveText } from './texts';
export { addFloor, renameFloor, deleteFloor } from './floors';
export { numpadInitialValue, applyNumpadValue } from './numpad';
export { addLine, updateProtrusion, lineChain, setProtrusionArc, setCornerProtrusionDim, copyProtrusionRow } from './protrusions';
export { setActiveWallThickness, addWallPreset, removeWallPreset, setWallArcHeight } from './project';
export { splitWall, cutWallSegment, splitPoint, canSplit, type SplitResult } from './split';
export { toggleDimLock, setDimLock, setWallDimsLocked, setRoomDimsLocked, wallLockState, roomLockState } from './locks';
export { addDrawLine, addDrawRect, addDrawCircle, addDrawArc, addDrawDouble, updateDrawing, setDrawingVertex, setDrawingBulge, dragDrawingBulge, setDrawingRadius, setDrawingWidth, dragDrawingWidth, flipDrawingSide, setDrawingRect, trimDrawingAt, extendDrawingAt } from './drawings';
export { addFreeDim, setFreeDimOffset, beginDimDrag, dragDim } from './dims';
export { addStair, addSizedStair, addSpiralStair, appendDrawnFlight, updateStair, setFlightSteps, addStairFlight, addStairTeeFlights, setStairTurn, setLandingWinders, setFlightArc, mirrorStairArc, removeStairFlight, flipStairDirection, drawingToStair, drawingToLanding, turnStairAxis } from './stairs';
export { setActiveLayer, addLayer, renameLayer, setLayerColor, setLayerVisible, setLayerLocked, moveLayerTo, layerItemCount, deleteLayer, canMoveToLayer, moveSelectionToLayer, selectionElemKind } from './layers';
export { addStroke, appendStrokePoint, setStrokeWidth, eraseStrokesAt } from './strokes';
export { addMark, updateMark, setMarkNumber, setMarkDir, setMarkContent } from './marks';
