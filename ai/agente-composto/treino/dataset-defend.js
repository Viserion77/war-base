/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { classificationExample } from './dataset-utils.js'
import { DEFEND_ACTIONS } from '../constants.js'

export const datasetDefend = [
    classificationExample(DEFEND_ACTIONS, 'build-archer', { archerUnlocked: 1, visibleEnemyStructures: 0.2, archerSlotRatio: 0.2 }),
    classificationExample(DEFEND_ACTIONS, 'build-catapult', { catapultUnlocked: 1, visibleEnemyUnits: 0.8, catapultSlotRatio: 0.2 }),
    classificationExample(DEFEND_ACTIONS, 'upgrade-defensive', { gold: 1, archerCount: 0.5, archerSlotRatio: 1, catapultSlotRatio: 1 }),
]
