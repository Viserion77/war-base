/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { heatmapExample } from './dataset-utils.js'

export const datasetCapture = [
    heatmapExample(24, 15, { visibleCapturableTargets: 1 }),
    heatmapExample(16, 15, { visibleCapturableTargets: 0.8 }),
]
