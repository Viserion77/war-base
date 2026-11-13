import { MACRO_ACTIONS } from '../agente-composto/constants.js'

export function captureRouterSnapshot(router, input, options = {}) {
    if (!router || typeof router.predictWithHidden !== 'function') {
        return null
    }

    const { hidden, output } = router.predictWithHidden(input)
    const chosenIndex = highestIndex(output)
    const chosenMacro = MACRO_ACTIONS[chosenIndex] || null

    return {
        hiddenActivations: hidden,
        macroScores: output,
        chosenMacro,
        subnetworkActivated: options.subnetworkActivated || null,
        boardSummary: options.boardSummary || null,
        generation: options.generation ?? null,
        championId: options.championId || null,
    }
}

export function highestIndex(values) {
    if (!Array.isArray(values) || !values.length) {
        return -1
    }

    let bestIndex = 0
    let bestValue = values[0]

    for (let index = 1; index < values.length; index += 1) {
        if (values[index] > bestValue) {
            bestValue = values[index]
            bestIndex = index
        }
    }

    return bestIndex
}

export function summarizeBoardFrame(boardFloats, width = 48, height = 30) {
    if (!Array.isArray(boardFloats) || boardFloats.length < width * height) {
        return null
    }

    const tiles = []

    for (let y = 0; y < height; y += 1) {
        const row = []

        for (let x = 0; x < width; x += 1) {
            row.push(Number(boardFloats[y * width + x].toFixed(3)))
        }

        tiles.push(row)
    }

    return tiles
}
