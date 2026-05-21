/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploClassificacao } from './dataset-utils.js'
import { MACRO_ACTIONS } from '../constants.js'

export const datasetRouter = [
    exemploClassificacao(MACRO_ACTIONS, 'farm', { coal: 0.8 }),
    exemploClassificacao(MACRO_ACTIONS, 'capture', { visibleCapturableTargets: 1 }),
    exemploClassificacao(MACRO_ACTIONS, 'research', { knowledge: 0.7, taraqueUnlocked: 1 }),
    exemploClassificacao(MACRO_ACTIONS, 'defend', { visibleEnemyUnits: 0.8 }),
    exemploClassificacao(MACRO_ACTIONS, 'attack', { tujaiUnlocked: 1, coal: 0.8 }),
    exemploClassificacao(MACRO_ACTIONS, 'upgrade', { coal: 1, baseLevel: 0.5 }),
    exemploClassificacao(MACRO_ACTIONS, 'scout', { visibleTilesFraction: 0.1 }),
    exemploClassificacao(MACRO_ACTIONS, 'wait', { coal: 0.02, knowledge: 0.02 }),
]
