/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploClassificacao } from './dataset-utils.js'
import { RESEARCH_ACTIONS } from '../constants.js'

export const datasetResearch = [
    exemploClassificacao(RESEARCH_ACTIONS, 'per', { knowledge: 0.2, perUnlocked: 0 }),
    exemploClassificacao(RESEARCH_ACTIONS, 'hef', { knowledge: 0.3, perUnlocked: 1, hefUnlocked: 0 }),
    exemploClassificacao(RESEARCH_ACTIONS, 'tujai', { knowledge: 0.6, perUnlocked: 1, hefUnlocked: 1, tujaiUnlocked: 0 }),
]
