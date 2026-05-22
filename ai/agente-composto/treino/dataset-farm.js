/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { classificationExample } from './dataset-utils.js'
import { FARM_ACTIONS } from '../constants.js'

export const datasetFarm = [
    classificationExample(FARM_ACTIONS, 'build-mine', { gold: 0.8, mineCount: 0.1, mineSlotRatio: 0.2 }),
    classificationExample(FARM_ACTIONS, 'build-library', { gold: 0.5, libraryUnlocked: 1, libraryCount: 0, librarySlotRatio: 0 }),
]
