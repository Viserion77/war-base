/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploClassificacao } from './dataset-utils.js'
import { ATTACK_ACTIONS } from '../constants.js'

export const datasetAttack = [
    exemploClassificacao(ATTACK_ACTIONS, 'build-tujai', { tujaiUnlocked: 1, tujaiCount: 0 }),
    exemploClassificacao(ATTACK_ACTIONS, 'spawn-zunim', { tujaiUnlocked: 1, tujaiCount: 0.4, coal: 0.6 }),
    exemploClassificacao(ATTACK_ACTIONS, 'build-forward-tower', { perUnlocked: 1, visibleEnemyStructures: 0.7 }),
]
