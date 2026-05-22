/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { classificationExample } from './dataset-utils.js'
import { ATTACK_ACTIONS } from '../constants.js'

export const datasetAttack = [
    classificationExample(ATTACK_ACTIONS, 'build-barracks', { barracksUnlocked: 1, barracksCount: 0, barracksSlotRatio: 0 }),
    classificationExample(ATTACK_ACTIONS, 'spawn-soldier', { barracksUnlocked: 1, barracksCount: 0.4, gold: 0.6, barracksSlotRatio: 1 }),
    classificationExample(ATTACK_ACTIONS, 'build-forward-tower', { archerUnlocked: 1, visibleEnemyStructures: 0.7, archerSlotRatio: 0.4 }),
]
