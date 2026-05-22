/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { placementExample } from './dataset-utils.js'

export const datasetPlacement = [
    placementExample('mine', 6, 4, { gold: 0.8, mineSlotRatio: 0.2 }),
    placementExample('library', 7, 4, { libraryUnlocked: 1, gold: 0.5, librarySlotRatio: 0 }),
    placementExample('archer', 8, 4, { archerUnlocked: 1, visibleEnemyStructures: 0.5, archerSlotRatio: 0.25 }),
    placementExample('catapult', 8, 5, { catapultUnlocked: 1, visibleEnemyUnits: 0.5, catapultSlotRatio: 0.25 }),
    placementExample('barracks', 9, 4, { barracksUnlocked: 1, gold: 0.8, barracksSlotRatio: 0.25 }),
]
