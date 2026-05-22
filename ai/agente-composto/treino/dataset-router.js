/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { classificationExample } from './dataset-utils.js'
import { MACRO_ACTIONS } from '../constants.js'

export const datasetRouter = [
    classificationExample(MACRO_ACTIONS, 'farm', { gold: 0.8, mineSlotRatio: 0.2, cappedTypesFraction: 0, castleUpgradeReady: 0 }),
    classificationExample(MACRO_ACTIONS, 'research', { wisdom: 0.7, libraryUnlocked: 1, cappedTypesFraction: 0.2 }),
    classificationExample(MACRO_ACTIONS, 'defend', { visibleEnemyUnits: 0.8, archerSlotRatio: 0.3, catapultSlotRatio: 0.3 }),
    classificationExample(MACRO_ACTIONS, 'attack', { barracksUnlocked: 1, gold: 0.8, barracksSlotRatio: 0.2 }),
    classificationExample(MACRO_ACTIONS, 'upgrade', { gold: 1, castleLevel: 0.5, cappedTypesFraction: 0, averageStructureLevelRatio: 0.4, castleUpgradeReady: 0 }),
    classificationExample(MACRO_ACTIONS, 'upgrade', { gold: 1, mineSlotRatio: 1, librarySlotRatio: 1, cappedTypesFraction: 0.4, averageStructureLevelRatio: 0.5, castleUpgradeReady: 0 }),
    classificationExample(MACRO_ACTIONS, 'upgrade-castle', { gold: 1, castleLevel: 0.5, mineSlotRatio: 1, librarySlotRatio: 1, cappedTypesFraction: 0.4, averageStructureLevelRatio: 1, castleUpgradeReady: 1 }),
    classificationExample(MACRO_ACTIONS, 'upgrade-castle', { gold: 1, archerSlotRatio: 1, catapultSlotRatio: 1, barracksSlotRatio: 1, cappedTypesFraction: 0.6, averageStructureLevelRatio: 1, castleUpgradeReady: 1 }),
    classificationExample(MACRO_ACTIONS, 'wait', { gold: 0.02, wisdom: 0.02, cappedTypesFraction: 0 }),
    classificationExample(MACRO_ACTIONS, 'wait', { gold: 1, cappedTypesFraction: 1, averageStructureLevelRatio: 1, castleUpgradeReady: 1, hasCaptureOrder: 1 }),
]
