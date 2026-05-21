/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploClassificacao } from './dataset-utils.js'
import { MACRO_ACTIONS } from '../constants.js'

export const datasetRouter = [
    exemploClassificacao(MACRO_ACTIONS, 'farm', { coal: 0.8, coverSlotRatio: 0.2, cappedTypesFraction: 0 }),
    exemploClassificacao(MACRO_ACTIONS, 'capture', { visibleCapturableTargets: 1, coverSlotRatio: 1 }),
    exemploClassificacao(MACRO_ACTIONS, 'research', { knowledge: 0.7, taraqueUnlocked: 1, cappedTypesFraction: 0.2 }),
    exemploClassificacao(MACRO_ACTIONS, 'defend', { visibleEnemyUnits: 0.8, perSlotRatio: 0.3, hefSlotRatio: 0.3 }),
    exemploClassificacao(MACRO_ACTIONS, 'attack', { tujaiUnlocked: 1, coal: 0.8, tujaiSlotRatio: 0.2 }),
    exemploClassificacao(MACRO_ACTIONS, 'upgrade', { coal: 1, baseLevel: 0.5, cappedTypesFraction: 0 }),
    exemploClassificacao(MACRO_ACTIONS, 'upgrade-base', { coal: 1, baseLevel: 0.5, coverSlotRatio: 1, taraqueSlotRatio: 1, cappedTypesFraction: 0.4 }),
    exemploClassificacao(MACRO_ACTIONS, 'upgrade-base', { coal: 1, perSlotRatio: 1, hefSlotRatio: 1, tujaiSlotRatio: 1, cappedTypesFraction: 0.6 }),
    exemploClassificacao(MACRO_ACTIONS, 'scout', { visibleTilesFraction: 0.1, cappedTypesFraction: 0 }),
    exemploClassificacao(MACRO_ACTIONS, 'wait', { coal: 0.02, knowledge: 0.02, cappedTypesFraction: 0 }),
]
