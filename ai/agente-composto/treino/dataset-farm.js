/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploClassificacao } from './dataset-utils.js'
import { FARM_ACTIONS } from '../constants.js'

export const datasetFarm = [
    exemploClassificacao(FARM_ACTIONS, 'build-cover', { coal: 0.8, coverCount: 0.1 }),
    exemploClassificacao(FARM_ACTIONS, 'build-taraque', { coal: 0.5, taraqueUnlocked: 1, taraqueCount: 0 }),
    exemploClassificacao(FARM_ACTIONS, 'capture-cover-target', { visibleCapturableTargets: 0.8 }),
]
