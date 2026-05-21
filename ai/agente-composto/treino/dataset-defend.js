/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploClassificacao } from './dataset-utils.js'
import { DEFEND_ACTIONS } from '../constants.js'

export const datasetDefend = [
    exemploClassificacao(DEFEND_ACTIONS, 'build-per', { perUnlocked: 1, visibleEnemyStructures: 0.2, perSlotRatio: 0.2 }),
    exemploClassificacao(DEFEND_ACTIONS, 'build-hef', { hefUnlocked: 1, visibleEnemyUnits: 0.8, hefSlotRatio: 0.2 }),
    exemploClassificacao(DEFEND_ACTIONS, 'upgrade-defensive', { coal: 1, perCount: 0.5, perSlotRatio: 1, hefSlotRatio: 1 }),
]
