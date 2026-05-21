/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploPlacement } from './dataset-utils.js'

export const datasetPlacement = [
    exemploPlacement('cover', 6, 4, { coal: 0.8 }),
    exemploPlacement('taraque', 7, 4, { taraqueUnlocked: 1, coal: 0.5 }),
    exemploPlacement('per', 8, 4, { perUnlocked: 1, visibleEnemyStructures: 0.5 }),
    exemploPlacement('hef', 8, 5, { hefUnlocked: 1, visibleEnemyUnits: 0.5 }),
    exemploPlacement('tujai', 9, 4, { tujaiUnlocked: 1, coal: 0.8 }),
]
