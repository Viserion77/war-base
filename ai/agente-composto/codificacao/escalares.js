/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
import { BOARD_SIZE, ESTIMATED_GAME_LENGTH_TICKS, SCALAR_INPUTS } from '../constants.js'

const BUILD_LIMIT_TYPES = ['mine', 'library', 'archer', 'catapult', 'barracks']

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
    const castle = structures[player.castleId] || ownStructures.find(structure => structure.type === 'castle')
    const visibleCapturableTargets = getVisibleCapturableTargets(state, playerId)
    const visibleEnemyStructures = Object.values(structures)
        .filter(structure => structure.ownerId && structure.ownerId !== playerId)
    const visibleEnemyUnits = Object.values(units)
        .filter(unit => unit.ownerId && unit.ownerId !== playerId)
    const rememberedEnemyStructures = Object.values(state.memory?.structures || {})
        .filter(structure => structure.ownerId !== playerId)
    const nearestKnownEnemyCastle = getNearestKnownEnemyCastle(state, playerId, castle || player)
    const enemyDistance = nearestKnownEnemyCastle
        ? distance(castle || player, nearestKnownEnemyCastle)
        : getMapDistance(state)
    const aliveEnemyCount = Object.values(players)
        .filter(candidate => candidate.playerId !== playerId && candidate.alive)
        .length
    const buildLimits = state.catalog?.limits || {}

    return [
        ratio(player.gold, 1500),
        ratio(player.wisdom, 120),
        ratio(castle ? castle.level : 0, 4),
        ratio((castle ? castle.integrity : 0) + (castle ? castle.barrier : 0), (castle ? castle.maxIntegrity : 1) + (castle ? castle.maxBarrier : 0)),
        ratio(countStructures(ownStructures, 'mine'), 6),
        ratio(countStructures(ownStructures, 'library'), 3),
        ratio(countStructures(ownStructures, 'archer'), 6),
        ratio(countStructures(ownStructures, 'catapult'), 4),
        ratio(countStructures(ownStructures, 'barracks'), 3),
        ratio(ownUnits.filter(unit => unit.type === 'soldier').length, 10),
        ratio(ownUnits.filter(unit => unit.type === 'herald').length, 1),
        player.unlocked?.library ? 1 : 0,
        player.unlocked?.archer ? 1 : 0,
        player.unlocked?.catapult ? 1 : 0,
        player.unlocked?.barracks ? 1 : 0,
        ratio(visibleCapturableTargets.length, 6),
        ratio(visibleEnemyStructures.length, 8),
        ratio(visibleEnemyUnits.length, 8),
        ratio(rememberedEnemyStructures.length, 8),
        clamp01(1 - ratio(enemyDistance, getMapDistance(state))),
        player.order && player.order.type === 'capture' ? 1 : 0,
        player.order && player.order.type === 'move' ? 1 : 0,
        ratio(aliveEnemyCount, 7),
        ratio(countVisibleTiles(state), BOARD_SIZE),
        ratio(state.tick || 0, ESTIMATED_GAME_LENGTH_TICKS),
        getSlotRatio(buildLimits, 'mine'),
        getSlotRatio(buildLimits, 'library'),
        getSlotRatio(buildLimits, 'archer'),
        getSlotRatio(buildLimits, 'catapult'),
        getSlotRatio(buildLimits, 'barracks'),
        getCappedTypesFraction(buildLimits),
        getCastleUpgradeRatio(buildLimits),
        getCastleUpgradeReady(buildLimits),
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

export function getNearestKnownEnemyCastle(state, playerId, origin) {
    const visibleBases = Object.values(state.structures || {})
        .filter(structure => structure.type === 'castle' && structure.ownerId !== playerId && !structure.disabled)
    const rememberedBases = Object.values(state.memory?.structures || {})
        .filter(structure => structure.type === 'castle' && structure.ownerId !== playerId && !structure.disabled)
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

export function getCastleUpgradeRatio(limits) {
    const gate = limits.castleUpgrade

    if (!gate) {
        return 0
    }

    return ratio(gate.averageLevel, Math.max(gate.required, 0.0001))
}

export function getCastleUpgradeReady(limits) {
    return limits.castleUpgrade?.ready ? 1 : 0
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
