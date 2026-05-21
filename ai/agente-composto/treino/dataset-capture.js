/* istanbul ignore file -- dataset bootstrap for supervised training. */
import { exemploHeatmap } from './dataset-utils.js'

export const datasetCapture = [
    exemploHeatmap(24, 15, { visibleCapturableTargets: 1 }),
    exemploHeatmap(16, 15, { visibleCapturableTargets: 0.8 }),
]
