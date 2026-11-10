/**
 * Všechny změny výkresu na jednom místě. Rozhraní i nástroje volají tyto funkce,
 * nikdy nemění data přímo. Vlastní kód je rozdělený podle oblastí do souborů v této složce;
 * tady se znovu exportuje jen veřejné rozhraní (pomocné funkce mezi soubory ven nejdou).
 */
export { addWall, addRectWalls, addCircleWalls, setCircleRadius, setWallSagitta, updateWall, applyWallLength, unlockWall, updateWallLabel, setWallThickness, flipWallSide, type GroupOrigin, groupOrigin, moveGroup, moveNode, mergeNodeIfCoincident } from './walls';
export { rotateSelection, duplicateSelection, pasteOpenings, endPaste } from './copy';
export { deleteSelection } from './delete';
export { addOpening, updateOpening, moveOpeningTo, setOpeningRef, setRevealEnabled } from './openings';
export { addRoom, updateRoom, moveRoom } from './rooms';
export { takeFreshTextId, addText, updateText, moveText } from './texts';
export { addFloor, renameFloor, deleteFloor } from './floors';
export { numpadInitialValue, applyNumpadValue } from './numpad';
export { setActiveWallThickness, addWallPreset, removeWallPreset } from './project';
