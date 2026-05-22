/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { heatmapExample } from './dataset-utils.js'

export const datasetUpgrade = [
    heatmapExample(4, 4, { gold: 1, castleLevel: 0.5, cappedTypesFraction: 0.4, castleUpgradeReady: 1 }),
    heatmapExample(6, 4, { gold: 0.7, archerCount: 0.2, castleLevel: 0.75, archerSlotRatio: 0.5, castleUpgradeReady: 0, averageStructureLevelRatio: 0.6 }),
]
