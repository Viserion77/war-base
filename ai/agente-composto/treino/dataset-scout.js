/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { heatmapExample } from './dataset-utils.js'

export const datasetScout = [
    heatmapExample(40, 24, { visibleTilesFraction: 0.1 }),
    heatmapExample(24, 15, { visibleTilesFraction: 0.2 }),
]
