/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { classificationExample } from './dataset-utils.js'
import { RESEARCH_ACTIONS } from '../constants.js'

export const datasetResearch = [
    classificationExample(RESEARCH_ACTIONS, 'archer', { wisdom: 0.2, archerUnlocked: 0 }),
    classificationExample(RESEARCH_ACTIONS, 'catapult', { wisdom: 0.3, archerUnlocked: 1, catapultUnlocked: 0 }),
    classificationExample(RESEARCH_ACTIONS, 'barracks', { wisdom: 0.6, archerUnlocked: 1, catapultUnlocked: 1, barracksUnlocked: 0 }),
]
