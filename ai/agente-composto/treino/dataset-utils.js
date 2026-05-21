/* istanbul ignore file -- datasets are exercised through the training command. */
import { BOARD_WIDTH, COMPOSITE_INPUT_SIZE, HEATMAP_OUTPUT_SIZE, PLACEMENT_INPUT_SIZE, PLACEMENT_STRUCTURE_TYPES, SCALAR_INPUTS } from '../constants.js'

export function entradaComEscalares(valores = {}, tamanho = COMPOSITE_INPUT_SIZE) {
    const entrada = new Array(tamanho).fill(0)
    const scalarOffset = COMPOSITE_INPUT_SIZE - SCALAR_INPUTS.length

    for (const [nome, valor] of Object.entries(valores)) {
        const index = SCALAR_INPUTS.indexOf(nome)

        if (index >= 0 && scalarOffset + index < entrada.length) {
            entrada[scalarOffset + index] = valor
        }
    }

    return entrada
}

export function oneHot(labels, label) {
    return labels.map(candidate => candidate === label ? 1 : 0)
}

export function heatmap(x, y) {
    const saida = new Array(HEATMAP_OUTPUT_SIZE).fill(0)
    saida[y * BOARD_WIDTH + x] = 1
    return saida
}

export function exemploClassificacao(labels, label, escalares = {}) {
    return { entradas: entradaComEscalares(escalares), saidas: oneHot(labels, label) }
}

export function exemploHeatmap(x, y, escalares = {}) {
    return { entradas: entradaComEscalares(escalares), saidas: heatmap(x, y) }
}

export function exemploPlacement(tipo, x, y, escalares = {}) {
    const entrada = entradaComEscalares(escalares, PLACEMENT_INPUT_SIZE)
    const oneHotTipo = PLACEMENT_STRUCTURE_TYPES.map(candidate => candidate === tipo ? 1 : 0)
    entrada.splice(COMPOSITE_INPUT_SIZE, oneHotTipo.length, ...oneHotTipo)
    return { entradas: entrada, saidas: heatmap(x, y), tipo }
}
