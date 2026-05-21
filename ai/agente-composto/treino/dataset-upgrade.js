/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploHeatmap } from './dataset-utils.js'

export const datasetUpgrade = [
    exemploHeatmap(4, 4, { coal: 1, baseLevel: 0.5, cappedTypesFraction: 0.4 }),
    exemploHeatmap(6, 4, { coal: 0.7, perCount: 0.2, baseLevel: 0.75, perSlotRatio: 0.5 }),
]
