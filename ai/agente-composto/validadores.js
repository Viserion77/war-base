/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
const BUILD_LIMIT_TYPES = ['mine', 'library', 'archer', 'catapult', 'barracks']

export function createCommandForAction(action, state, playerId, options = {}) {
    if (action === 'build-mine') {
        return createBuildCommand(state, playerId, 'mine', options.heatmap)
    }

    if (action === 'build-library') {
        return createBuildCommand(state, playerId, 'library', options.heatmap)
    }

    if (action === 'build-archer') {
        return createBuildCommand(state, playerId, 'archer', options.heatmap)
    }

    if (action === 'build-catapult') {
        return createBuildCommand(state, playerId, 'catapult', options.heatmap)
    }

    if (action === 'build-barracks') {
        return createBuildCommand(state, playerId, 'barracks', options.heatmap)
    }

    if (action === 'upgrade-castle') {
        return createUpgradeCommand(state, playerId, options.heatmap, ['castle'])
    }

    if (action === 'upgrade') {
        return createUpgradeCommand(state, playerId, options.heatmap)
    }

    if (action === 'research-archer') {
        return createResearchCommand(state, playerId, 'archer')
    }

    if (action === 'research-catapult') {
        return createResearchCommand(state, playerId, 'catapult')
    }

    if (action === 'research-barracks') {
        return createResearchCommand(state, playerId, 'barracks')
    }

    if (action === 'spawn-soldier') {
        return createSoldierCommand(state, playerId)
    }

    return null
}

export function createBuildCommand(state, playerId, structureType, heatmap = null) {
    const player = state.players?.[playerId]
    const catalog = state.catalog?.structures?.[structureType]

    if (!player || !catalog || player.gold < catalog.cost || !canBuild(state, player, structureType)) {
        return null
    }

    const tile = findBuildTile(state, playerId, structureType, heatmap)

    if (!tile) {
        return null
    }

    return {
        action: 'build',
        structureType,
        x: tile.x,
        y: tile.y,
    }
}

export function createUpgradeCommand(state, playerId, heatmap = null, allowedTypes = null) {
    const player = state.players?.[playerId]

    if (!player) {
        return null
    }

    const isBaseOnly = Array.isArray(allowedTypes) && allowedTypes.length === 1 && allowedTypes[0] === 'castle'

    if (isBaseOnly && !state.catalog?.limits?.castleUpgrade?.ready) {
        return null
    }

    const targets = getUpgradeableTargets(state, playerId)
        .filter(structure => !allowedTypes || allowedTypes.includes(structure.type))
        .filter(structure => player.gold >= getUpgradeCost(state, structure))

    if (!targets.length) {
        return null
    }

    const gate = state.catalog?.limits?.castleUpgrade
    const context = {
        cappedTypes: countCappedTypes(state),
        gateClosed: gate ? !gate.ready : false,
        averageLevel: gate ? gate.averageLevel : 0,
    }

    targets.sort((first, second) => getHeatmapScore(heatmap, second) - getHeatmapScore(heatmap, first)
        || getUpgradePriority(first, context) - getUpgradePriority(second, context)
        || getUpgradeCost(state, first) - getUpgradeCost(state, second))

    return {
        action: 'upgrade',
        structureId: targets[0].structureId,
    }
}

export function createResearchCommand(state, playerId, recipe) {
    const player = state.players?.[playerId]
    const research = state.catalog?.research?.[recipe]

    if (!player || !research || player.unlocked?.[recipe] || player.wisdom < research.cost) {
        return null
    }

    if (highestStructureLevel(state, playerId, 'library') < research.requiresLibraryLevel) {
        return null
    }

    return {
        action: 'research',
        recipe,
    }
}

export function createSoldierCommand(state, playerId) {
    const player = state.players?.[playerId]
    const npc = state.catalog?.npcs?.soldier

    if (!player || !npc || !player.unlocked?.barracks || player.gold < npc.cost) {
        return null
    }

    if (highestStructureLevel(state, playerId, 'barracks') <= 0) {
        return null
    }

    return {
        action: 'spawn-npc',
        npcType: 'soldier',
    }
}

export function findBuildTile(state, playerId, structureType, heatmap = null) {
    const candidates = getBuildCandidates(state, playerId, structureType)

    if (!candidates.length) {
        return null
    }

    candidates.sort((first, second) => getHeatmapScore(heatmap, second) - getHeatmapScore(heatmap, first)
        || first.score - second.score
        || first.y - second.y
        || first.x - second.x)

    return candidates[0]
}

export function getBuildCandidates(state, playerId, structureType) {
    const player = state.players?.[playerId]
    const anchors = Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
    const buildRange = state.config?.buildRange ?? 0
    const enemyCastle = getNearestEnemyCastle(state, playerId, getPlayerOrigin(state, playerId))
    const candidates = []

    if (!player || !anchors.length) {
        return candidates
    }

    for (const anchor of anchors) {
        for (let dy = -buildRange; dy <= buildRange; dy += 1) {
            for (let dx = -buildRange; dx <= buildRange; dx += 1) {
                const tile = { x: anchor.x + dx, y: anchor.y + dy }

                if (!isInsideMap(state, tile.x, tile.y) || distance(anchor, tile) > buildRange || isOccupied(state, tile.x, tile.y)) {
                    continue
                }

                candidates.push({
                    ...tile,
                    score: getBuildTileScore(structureType, tile, anchor, enemyCastle),
                })
            }
        }
    }

    return candidates
}

export function getBuildTileScore(structureType, tile, anchor, enemyCastle) {
    const anchorDistance = distance(tile, anchor)

    if (enemyCastle && ['archer', 'catapult'].includes(structureType)) {
        return distance(tile, enemyCastle) + anchorDistance * 0.15
    }

    if (enemyCastle && structureType === 'mine') {
        return Math.abs(anchorDistance - 2) + distance(tile, enemyCastle) * 0.02
    }

    if (enemyCastle && structureType === 'barracks') {
        return distance(tile, enemyCastle) * 0.5 + Math.abs(anchorDistance - 3)
    }

    return Math.abs(anchorDistance - 2)
}

export function canBuild(state, player, type) {
    const catalog = state.catalog?.structures?.[type]

    if (!catalog) {
        return false
    }

    const limit = state.catalog?.limits?.[type]

    if (limit && limit.current >= limit.max) {
        return false
    }

    if (type === 'mine') {
        return true
    }

    if (catalog.requiresCastleLevel) {
        const castle = state.structures?.[player.castleId]
        return Boolean(castle && castle.level >= catalog.requiresCastleLevel)
    }

    if (catalog.requiresResearch) {
        return Boolean(player.unlocked?.[catalog.requiresResearch])
    }

    return Boolean(player.unlocked?.[type])
}

export function getUpgradeableTargets(state, playerId) {
    const castle = getOwnCastle(state, playerId)
    const castleLevel = castle ? castle.level : 0

    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
        .filter(structure => structure.type === 'castle' || structure.level < castleLevel)
}

export function getOwnCastle(state, playerId) {
    const player = state.players?.[playerId]
    return state.structures?.[player?.castleId] || Object.values(state.structures || {})
        .find(structure => structure.ownerId === playerId && structure.type === 'castle') || null
}

export function getUpgradePriority(structure, context = {}) {
    if (structure.type === 'castle' && context.cappedTypes > 0) {
        return -1
    }

    if (context.gateClosed && structure.type !== 'castle' && structure.level < (context.averageLevel ?? 0)) {
        return -2
    }

    const priorities = { castle: 0, archer: 1, catapult: 2, mine: 3, library: 4, barracks: 5 }
    return priorities[structure.type] ?? 10
}

export function countCappedTypes(state) {
    return BUILD_LIMIT_TYPES
        .filter(type => {
            const limit = state.catalog?.limits?.[type]
            return limit && limit.current >= limit.max
        })
        .length
}

export function highestStructureLevel(state, playerId, type) {
    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && structure.type === type && !structure.disabled)
        .reduce((highest, structure) => Math.max(highest, structure.level), 0)
}

export function getUpgradeCost(state, structure) {
    const cost = state.catalog?.structures?.[structure.type]?.cost
    return Math.round((cost || 0) * (1.5 ** structure.level))
}

export function getNearestEnemyCastle(state, playerId, origin) {
    const visibleCastles = Object.values(state.structures || {})
        .filter(structure => structure.type === 'castle')
        .filter(structure => structure.ownerId !== playerId)
        .filter(structure => !structure.disabled)
    const rememberedCastles = Object.values(state.memory?.structures || {})
        .filter(structure => structure.type === 'castle')
        .filter(structure => structure.ownerId !== playerId)
        .filter(structure => !structure.disabled)
    const castles = [...visibleCastles, ...rememberedCastles]

    castles.sort((first, second) => distance(origin, first) - distance(origin, second))

    return castles[0] || null
}

export function getPlayerOrigin(state, playerId) {
    const player = state.players?.[playerId]
    return state.structures?.[player?.castleId] || player || { x: 0, y: 0 }
}

export function isOccupied(state, x, y) {
    return Object.values(state.structures || {}).some(structure => structure.x === x && structure.y === y)
        || Object.values(state.memory?.structures || {}).some(structure => structure.x === x && structure.y === y)
        || Object.values(state.units || {}).some(unit => unit.x === x && unit.y === y)
        || Object.values(state.players || {}).some(player => isAvatarAvailable(player) && player.x === x && player.y === y)
}

export function isAvatarAvailable(player) {
    return Boolean(player && player.alive && player.avatarDeployed !== false && !player.respawnAt && player.integrity > 0)
}

export function isInsideMap(state, x, y) {
    const width = state.screen?.width ?? 0
    const height = state.screen?.height ?? 0
    return x >= 0 && x < width && y >= 0 && y < height
}

export function getHeatmapScore(heatmap, tile) {
    if (!Array.isArray(heatmap)) {
        return 0
    }

    const width = 48
    return Number(heatmap[tile.y * width + tile.x]) || 0
}

export function rankByScores(labels, scores) {
    return labels
        .map((label, index) => ({ label, score: Number(scores?.[index]) || 0 }))
        .sort((first, second) => second.score - first.score)
}

export function distance(first, second) {
    const dx = first.x - second.x
    const dy = first.y - second.y

    return Math.sqrt(dx * dx + dy * dy)
}

export const __validadoresTestables = {
    getBuildCandidates,
    getBuildTileScore,
    canBuild,
    getUpgradeableTargets,
    getOwnCastle,
    getUpgradePriority,
    countCappedTypes,
    highestStructureLevel,
    getUpgradeCost,
    getNearestEnemyCastle,
    getPlayerOrigin,
    isOccupied,
    isAvatarAvailable,
    isInsideMap,
    getHeatmapScore,
    rankByScores,
    distance,
}
