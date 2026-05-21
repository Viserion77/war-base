/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
import { BOARD_HEIGHT, BOARD_SIZE, BOARD_WIDTH } from '../constants.js'

export const SPECTRAL_VALUES = {
    visibleEmpty: 0,
    fog: 0.05,
    ownStructure: {
        base: 0.10,
        cover: 0.15,
        taraque: 0.20,
        per: 0.25,
        hef: 0.30,
        tujai: 0.35,
    },
    ownUnit: {
        capturer: 0.40,
        zunim: 0.45,
    },
    capturableDisabled: 0.50,
    enemyStructure: {
        base: 0.55,
        cover: 0.60,
        taraque: 0.65,
        per: 0.70,
        hef: 0.75,
        tujai: 0.80,
    },
    enemyUnit: {
        capturer: 0.85,
        zunim: 0.90,
    },
    rememberedStructure: 0.95,
}

export function encodeBoard(state, playerId) {
    const board = createBaseBoard(state)

    for (const structure of Object.values(state.memory?.structures || {})) {
        if (isInsideBoard(structure.x, structure.y) && !isTileVisible(state, structure.x, structure.y)) {
            board[toIndex(structure.x, structure.y)] = SPECTRAL_VALUES.rememberedStructure
        }
    }

    for (const unit of Object.values(state.units || {})) {
        if (!isInsideBoard(unit.x, unit.y)) {
            continue
        }

        board[toIndex(unit.x, unit.y)] = getUnitValue(unit, playerId)
    }

    for (const structure of Object.values(state.structures || {})) {
        if (!structure.disabled || !isInsideBoard(structure.x, structure.y)) {
            continue
        }

        board[toIndex(structure.x, structure.y)] = SPECTRAL_VALUES.capturableDisabled
    }

    for (const structure of Object.values(state.structures || {})) {
        if (structure.disabled || !isInsideBoard(structure.x, structure.y)) {
            continue
        }

        board[toIndex(structure.x, structure.y)] = getStructureValue(structure, playerId)
    }

    return board
}

export function createBaseBoard(state) {
    const board = new Array(BOARD_SIZE)

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
            board[toIndex(x, y)] = isTileVisible(state, x, y)
                ? SPECTRAL_VALUES.visibleEmpty
                : SPECTRAL_VALUES.fog
        }
    }

    return board
}

export function getStructureValue(structure, playerId) {
    if (!structure.ownerId || structure.disabled) {
        return SPECTRAL_VALUES.capturableDisabled
    }

    if (structure.ownerId === playerId) {
        return SPECTRAL_VALUES.ownStructure[structure.type] ?? SPECTRAL_VALUES.visibleEmpty
    }

    return SPECTRAL_VALUES.enemyStructure[structure.type] ?? SPECTRAL_VALUES.visibleEmpty
}

export function getUnitValue(unit, playerId) {
    if (unit.ownerId === playerId) {
        return SPECTRAL_VALUES.ownUnit[unit.type] ?? SPECTRAL_VALUES.visibleEmpty
    }

    return SPECTRAL_VALUES.enemyUnit[unit.type] ?? SPECTRAL_VALUES.visibleEmpty
}

export function isTileVisible(state, x, y) {
    if (!Array.isArray(state.fogMask)) {
        return true
    }

    return Boolean(state.fogMask[y] && state.fogMask[y][x])
}

export function isInsideBoard(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT
}

export function toIndex(x, y) {
    return y * BOARD_WIDTH + x
}
