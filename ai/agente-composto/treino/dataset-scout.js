/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploHeatmap } from './dataset-utils.js'

export const datasetScout = [
    exemploHeatmap(40, 24, { visibleTilesFraction: 0.1 }),
    exemploHeatmap(24, 15, { visibleTilesFraction: 0.2 }),
]
