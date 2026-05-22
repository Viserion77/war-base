/* istanbul ignore file -- datasets are exercised through the training command. */
import { BOARD_WIDTH, COMPOSITE_INPUT_SIZE, HEATMAP_OUTPUT_SIZE, PLACEMENT_INPUT_SIZE, PLACEMENT_STRUCTURE_TYPES, SCALAR_INPUTS } from '../constants.js'

export function inputWithScalars(values = {}, size = COMPOSITE_INPUT_SIZE) {
    const input = new Array(size).fill(0)
    const scalarOffset = COMPOSITE_INPUT_SIZE - SCALAR_INPUTS.length

    for (const [name, value] of Object.entries(values)) {
        const index = SCALAR_INPUTS.indexOf(name)

        if (index >= 0 && scalarOffset + index < input.length) {
            input[scalarOffset + index] = value
        }
    }

    return input
}

export function oneHot(labels, label) {
    return labels.map(candidate => candidate === label ? 1 : 0)
}

export function heatmap(x, y) {
    const output = new Array(HEATMAP_OUTPUT_SIZE).fill(0)
    output[y * BOARD_WIDTH + x] = 1
    return output
}

export function classificationExample(labels, label, scalars = {}) {
    return { inputs: inputWithScalars(scalars), outputs: oneHot(labels, label) }
}

export function heatmapExample(x, y, scalars = {}) {
    return { inputs: inputWithScalars(scalars), outputs: heatmap(x, y) }
}

export function placementExample(type, x, y, scalars = {}) {
    const input = inputWithScalars(scalars, PLACEMENT_INPUT_SIZE)
    const typeOneHot = PLACEMENT_STRUCTURE_TYPES.map(candidate => candidate === type ? 1 : 0)
    input.splice(COMPOSITE_INPUT_SIZE, typeOneHot.length, ...typeOneHot)
    return { inputs: input, outputs: heatmap(x, y), type }
}
