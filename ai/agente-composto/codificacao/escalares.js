/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
import { BOARD_SIZE, ESTIMATED_GAME_LENGTH_TICKS, SCALAR_INPUTS } from '../constants.js'

const BUILD_LIMIT_TYPES = ['cover', 'taraque', 'per', 'hef', 'tujai']

export function encodeScalars(state, playerId) {
    const players = state.players || {}
    const structures = state.structures || {}
    const units = state.units || {}
    const player = players[playerId]

    if (!player) {
        return SCALAR_INPUTS.map(() => 0)
    }

    const ownStructures = Object.values(structures)
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
    const ownUnits = Object.values(units)
        .filter(unit => unit.ownerId === playerId)
    const base = structures[player.baseId] || ownStructures.find(structure => structure.type === 'base')
    const visibleCapturableTargets = getVisibleCapturableTargets(state, playerId)
    const visibleEnemyStructures = Object.values(structures)
        .filter(structure => structure.ownerId && structure.ownerId !== playerId)
    const visibleEnemyUnits = Object.values(units)
        .filter(unit => unit.ownerId && unit.ownerId !== playerId)
    const rememberedEnemyStructures = Object.values(state.memory?.structures || {})
        .filter(structure => structure.ownerId !== playerId)
    const nearestKnownEnemyBase = getNearestKnownEnemyBase(state, playerId, base || player)
    const enemyDistance = nearestKnownEnemyBase
        ? distance(base || player, nearestKnownEnemyBase)
        : getMapDistance(state)
    const aliveEnemyCount = Object.values(players)
        .filter(candidate => candidate.playerId !== playerId && candidate.alive)
        .length
    const buildLimits = state.catalog?.limits || {}

    return [
        ratio(player.coal, 1500),
        ratio(player.knowledge, 120),
        ratio(base ? base.level : 0, 4),
        ratio((base ? base.integrity : 0) + (base ? base.barrier : 0), (base ? base.maxIntegrity : 1) + (base ? base.maxBarrier : 0)),
        ratio(countStructures(ownStructures, 'cover'), 6),
        ratio(countStructures(ownStructures, 'taraque'), 3),
        ratio(countStructures(ownStructures, 'per'), 6),
        ratio(countStructures(ownStructures, 'hef'), 4),
        ratio(countStructures(ownStructures, 'tujai'), 3),
        ratio(ownUnits.filter(unit => unit.type === 'zunim').length, 10),
        ratio(ownUnits.filter(unit => unit.type === 'capturer').length, 1),
        player.unlocked?.taraque ? 1 : 0,
        player.unlocked?.per ? 1 : 0,
        player.unlocked?.hef ? 1 : 0,
        player.unlocked?.tujai ? 1 : 0,
        ratio(visibleCapturableTargets.length, 6),
        ratio(visibleEnemyStructures.length, 8),
        ratio(visibleEnemyUnits.length, 8),
        ratio(rememberedEnemyStructures.length, 8),
        clamp01(1 - ratio(enemyDistance, getMapDistance(state))),
        player.order && player.order.type === 'capture' ? 1 : 0,
        ratio(aliveEnemyCount, 7),
        ratio(countVisibleTiles(state), BOARD_SIZE),
        ratio(state.tick || 0, ESTIMATED_GAME_LENGTH_TICKS),
        getSlotRatio(buildLimits, 'cover'),
        getSlotRatio(buildLimits, 'taraque'),
        getSlotRatio(buildLimits, 'per'),
        getSlotRatio(buildLimits, 'hef'),
        getSlotRatio(buildLimits, 'tujai'),
        getCappedTypesFraction(buildLimits),
        getBaseUpgradeRatio(buildLimits),
        getBaseUpgradeReady(buildLimits),
    ]
}

export function getVisibleCapturableTargets(state, playerId) {
    return Object.values(state.structures || {})
        .filter(structure => {
            const catalog = state.catalog?.structures?.[structure.type]
            return catalog
                && catalog.captureable
                && structure.ownerId !== playerId
                && (structure.disabled || structure.ownerId)
        })
}

export function getNearestKnownEnemyBase(state, playerId, origin) {
    const visibleBases = Object.values(state.structures || {})
        .filter(structure => structure.type === 'base' && structure.ownerId !== playerId && !structure.disabled)
    const rememberedBases = Object.values(state.memory?.structures || {})
        .filter(structure => structure.type === 'base' && structure.ownerId !== playerId && !structure.disabled)
    const bases = [...visibleBases, ...rememberedBases]

    bases.sort((first, second) => distance(origin, first) - distance(origin, second))

    return bases[0] || null
}

export function countVisibleTiles(state) {
    if (!Array.isArray(state.fogMask)) {
        return BOARD_SIZE
    }

    return state.fogMask.reduce((total, row) => total + row.filter(Boolean).length, 0)
}

export function countStructures(structures, type) {
    return structures.filter(structure => structure.type === type).length
}

export function getSlotRatio(limits, type) {
    const limit = limits[type]
    return limit ? ratio(limit.current, Math.max(1, limit.max)) : 0
}

export function getCappedTypesFraction(limits) {
    const cappedTypes = BUILD_LIMIT_TYPES
        .filter(type => limits[type] && limits[type].current >= limits[type].max)
        .length

    return ratio(cappedTypes, BUILD_LIMIT_TYPES.length)
}

export function getBaseUpgradeRatio(limits) {
    const gate = limits.baseUpgrade

    if (!gate) {
        return 0
    }

    return ratio(gate.averageLevel, Math.max(gate.required, 0.0001))
}

export function getBaseUpgradeReady(limits) {
    return limits.baseUpgrade?.ready ? 1 : 0
}

export function getMapDistance(state) {
    const width = state.screen?.width || 48
    const height = state.screen?.height || 30
    return width + height
}

export function distance(first, second) {
    const dx = first.x - second.x
    const dy = first.y - second.y

    return Math.sqrt(dx * dx + dy * dy)
}

export function ratio(value, max) {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
        return 0
    }

    return clamp01(value / max)
}

export function clamp01(value) {
    return Math.max(0, Math.min(1, value))
}
