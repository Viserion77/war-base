/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
const BUILD_LIMIT_TYPES = ['cover', 'taraque', 'per', 'hef', 'tujai']

export function criarComandoParaAcao(acao, state, playerId, opcoes = {}) {
    if (acao === 'capture') {
        return criarComandoCaptura(state, playerId, opcoes.heatmap)
    }

    if (acao === 'build-cover') {
        return criarComandoConstrucao(state, playerId, 'cover', opcoes.heatmap)
    }

    if (acao === 'build-taraque') {
        return criarComandoConstrucao(state, playerId, 'taraque', opcoes.heatmap)
    }

    if (acao === 'build-per') {
        return criarComandoConstrucao(state, playerId, 'per', opcoes.heatmap)
    }

    if (acao === 'build-hef') {
        return criarComandoConstrucao(state, playerId, 'hef', opcoes.heatmap)
    }

    if (acao === 'build-tujai') {
        return criarComandoConstrucao(state, playerId, 'tujai', opcoes.heatmap)
    }

    if (acao === 'upgrade-base') {
        return criarComandoUpgrade(state, playerId, opcoes.heatmap, ['base'])
    }

    if (acao === 'upgrade') {
        return criarComandoUpgrade(state, playerId, opcoes.heatmap)
    }

    if (acao === 'research-per') {
        return criarComandoPesquisa(state, playerId, 'per')
    }

    if (acao === 'research-hef') {
        return criarComandoPesquisa(state, playerId, 'hef')
    }

    if (acao === 'research-tujai') {
        return criarComandoPesquisa(state, playerId, 'tujai')
    }

    if (acao === 'spawn-zunim') {
        return criarComandoZunim(state, playerId)
    }

    if (acao === 'scout') {
        return criarComandoScout(state, playerId, opcoes.heatmap)
    }

    return null
}

export function criarComandoCaptura(state, playerId, heatmap = null, filtro = {}) {
    const player = state.players?.[playerId]

    if (!player || player.order?.type === 'capture' || player.respawnAt || !player.alive) {
        return null
    }

    const targets = getCapturableTargets(state, playerId)
        .filter(target => !filtro.type || target.type === filtro.type)

    if (!targets.length) {
        return null
    }

    targets.sort((first, second) => getHeatmapScore(heatmap, second) - getHeatmapScore(heatmap, first)
        || getCapturePriority(first) - getCapturePriority(second)
        || distance(getPlayerOrigin(state, playerId), first) - distance(getPlayerOrigin(state, playerId), second))

    return {
        action: 'capture',
        structureId: targets[0].structureId,
    }
}

export function criarComandoConstrucao(state, playerId, structureType, heatmap = null) {
    const player = state.players?.[playerId]
    const catalog = state.catalog?.structures?.[structureType]

    if (!player || !catalog || player.coal < catalog.cost || !canBuild(state, player, structureType)) {
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

export function criarComandoUpgrade(state, playerId, heatmap = null, allowedTypes = null) {
    const player = state.players?.[playerId]

    if (!player) {
        return null
    }

    const targets = getUpgradeableTargets(state, playerId)
        .filter(structure => !allowedTypes || allowedTypes.includes(structure.type))
        .filter(structure => player.coal >= getUpgradeCost(state, structure))

    if (!targets.length) {
        return null
    }

    const context = { cappedTypes: countCappedTypes(state) }

    targets.sort((first, second) => getHeatmapScore(heatmap, second) - getHeatmapScore(heatmap, first)
        || getUpgradePriority(first, context) - getUpgradePriority(second, context)
        || getUpgradeCost(state, first) - getUpgradeCost(state, second))

    return {
        action: 'upgrade',
        structureId: targets[0].structureId,
    }
}

export function criarComandoPesquisa(state, playerId, recipe) {
    const player = state.players?.[playerId]
    const research = state.catalog?.research?.[recipe]

    if (!player || !research || player.unlocked?.[recipe] || player.knowledge < research.cost) {
        return null
    }

    if (highestStructureLevel(state, playerId, 'taraque') < research.requiresTaraqueLevel) {
        return null
    }

    return {
        action: 'research',
        recipe,
    }
}

export function criarComandoZunim(state, playerId) {
    const player = state.players?.[playerId]
    const npc = state.catalog?.npcs?.zunim

    if (!player || !npc || !player.unlocked?.tujai || player.coal < npc.cost) {
        return null
    }

    if (highestStructureLevel(state, playerId, 'tujai') <= 0) {
        return null
    }

    return {
        action: 'spawn-npc',
        npcType: 'zunim',
    }
}

export function criarComandoScout(state, playerId, heatmap = null) {
    const player = state.players?.[playerId]

    if (!player || !player.alive || player.respawnAt) {
        return null
    }

    const tile = getScoutTiles(state, playerId, heatmap)[0]

    if (!tile) {
        return null
    }

    return {
        action: 'move-capturer-to',
        x: tile.x,
        y: tile.y,
    }
}

export function getCapturableTargets(state, playerId) {
    const visibleTargets = Object.values(state.structures || {})
        .filter(structure => isCapturableStructure(state, structure, playerId))
    const rememberedTargets = Object.values(state.memory?.structures || {})
        .filter(structure => !state.structures?.[structure.structureId])
        .filter(structure => isCapturableStructure(state, structure, playerId))

    return [...visibleTargets, ...rememberedTargets]
}

export function isCapturableStructure(state, structure, playerId) {
    const catalog = state.catalog?.structures?.[structure.type]
    return Boolean(catalog
        && catalog.captureable
        && structure.ownerId !== playerId
        && (structure.disabled || structure.ownerId))
}

export function getCapturePriority(structure) {
    if (!structure.ownerId && structure.disabled) {
        return 0
    }

    if (structure.disabled) {
        return 1
    }

    return 2
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
    const enemyBase = getNearestEnemyBase(state, playerId, getPlayerOrigin(state, playerId))
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
                    score: getBuildTileScore(structureType, tile, anchor, enemyBase),
                })
            }
        }
    }

    return candidates
}

export function getBuildTileScore(structureType, tile, anchor, enemyBase) {
    const anchorDistance = distance(tile, anchor)

    if (enemyBase && ['per', 'hef'].includes(structureType)) {
        return distance(tile, enemyBase) + anchorDistance * 0.15
    }

    if (enemyBase && structureType === 'cover') {
        return Math.abs(anchorDistance - 2) + distance(tile, enemyBase) * 0.02
    }

    if (enemyBase && structureType === 'tujai') {
        return distance(tile, enemyBase) * 0.5 + Math.abs(anchorDistance - 3)
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

    if (type === 'cover') {
        return true
    }

    if (catalog.requiresBaseLevel) {
        const base = state.structures?.[player.baseId]
        return Boolean(base && base.level >= catalog.requiresBaseLevel)
    }

    if (catalog.requiresResearch) {
        return Boolean(player.unlocked?.[catalog.requiresResearch])
    }

    return Boolean(player.unlocked?.[type])
}

export function getUpgradeableTargets(state, playerId) {
    const base = getOwnBase(state, playerId)
    const baseLevel = base ? base.level : 0

    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
        .filter(structure => structure.type === 'base' || structure.level < baseLevel)
}

export function getOwnBase(state, playerId) {
    const player = state.players?.[playerId]
    return state.structures?.[player?.baseId] || Object.values(state.structures || {})
        .find(structure => structure.ownerId === playerId && structure.type === 'base') || null
}

export function getUpgradePriority(structure, context = {}) {
    if (structure.type === 'base' && context.cappedTypes > 0) {
        return -1
    }

    const priorities = { base: 0, per: 1, hef: 2, cover: 3, taraque: 4, tujai: 5 }
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

export function getNearestEnemyBase(state, playerId, origin) {
    const visibleBases = Object.values(state.structures || {})
        .filter(structure => structure.type === 'base')
        .filter(structure => structure.ownerId !== playerId)
        .filter(structure => !structure.disabled)
    const rememberedBases = Object.values(state.memory?.structures || {})
        .filter(structure => structure.type === 'base')
        .filter(structure => structure.ownerId !== playerId)
        .filter(structure => !structure.disabled)
    const bases = [...visibleBases, ...rememberedBases]

    bases.sort((first, second) => distance(origin, first) - distance(origin, second))

    return bases[0] || null
}

export function getPlayerOrigin(state, playerId) {
    const player = state.players?.[playerId]
    return state.structures?.[player?.baseId] || player || { x: 0, y: 0 }
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

export function getScoutTiles(state, playerId = Object.keys(state.players || {})[0], heatmap = null) {
    const width = state.screen?.width || 48
    const height = state.screen?.height || 30
    const tiles = []

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            tiles.push({
                x,
                y,
                fogged: Array.isArray(state.fogMask) ? !state.fogMask[y]?.[x] : false,
                heat: getHeatmapScore(heatmap, { x, y }),
            })
        }
    }

    const origin = getPlayerOrigin(state, playerId)

    tiles.sort((first, second) => Number(second.fogged) - Number(first.fogged)
        || second.heat - first.heat
        || distance(origin, second) - distance(origin, first))

    return tiles
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
    getCapturableTargets,
    isCapturableStructure,
    getCapturePriority,
    getBuildCandidates,
    getBuildTileScore,
    canBuild,
    getUpgradeableTargets,
    getOwnBase,
    getUpgradePriority,
    countCappedTypes,
    highestStructureLevel,
    getUpgradeCost,
    getNearestEnemyBase,
    getPlayerOrigin,
    isOccupied,
    isAvatarAvailable,
    isInsideMap,
    getHeatmapScore,
    getScoutTiles,
    rankByScores,
    distance,
}
