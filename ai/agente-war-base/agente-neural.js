import fs from 'fs'
import { fileURLToPath } from 'url'
import RedeNeural from '../rede-neural/rede-neural.js'

export const WAR_BASE_AI_ACTIONS = [
    'capture',
    'build-cover',
    'upgrade-base',
    'build-taraque',
    'research-per',
    'research-hef',
    'research-tujai',
    'build-per',
    'build-hef',
    'build-tujai',
    'spawn-zunim',
    'wait',
]

export const WAR_BASE_AI_INPUTS = [
    'coal',
    'knowledge',
    'baseLevel',
    'baseHealth',
    'coverCount',
    'taraqueCount',
    'perCount',
    'hefCount',
    'tujaiCount',
    'zunimCount',
    'taraqueUnlocked',
    'perUnlocked',
    'hefUnlocked',
    'tujaiUnlocked',
    'capturableTargets',
    'enemyBaseProximity',
    'hasCaptureOrder',
    'aliveEnemyCount',
]

const DEFAULT_MODEL_PATH = fileURLToPath(new URL('./rede-treinada.json', import.meta.url))

export function carregarRedeTreinada(caminhoModelo = DEFAULT_MODEL_PATH) {
    const modelo = JSON.parse(fs.readFileSync(caminhoModelo, 'utf8'))
    return RedeNeural.fromJSON(modelo.rede || modelo)
}

export function createNeuralWarBaseAgent(opcoes = {}) {
    const rede = opcoes.rede || opcoes.network || carregarRedeTreinada(opcoes.modelPath)

    return {
        cooldownMs: opcoes.cooldownMs ?? 1000,
        decidir(contexto) {
            return decidirComRede(rede, contexto.state, contexto.playerId)
        },
        decide(contexto) {
            return decidirComRede(rede, contexto.state, contexto.playerId)
        },
    }
}

export function decidirComRede(rede, state, playerId) {
    const entradas = extrairEntradasWarBase(state, playerId)
    const pontuacoes = rede.prever(entradas)
    const acoesOrdenadas = WAR_BASE_AI_ACTIONS
        .map((acao, index) => ({ acao, score: pontuacoes[index] || 0 }))
        .sort((primeira, segunda) => segunda.score - primeira.score)

    for (const escolha of acoesOrdenadas) {
        if (escolha.acao === 'wait') {
            continue
        }

        const comando = criarComandoParaAcao(escolha.acao, state, playerId)

        if (comando) {
            return {
                ...comando,
                aiDecision: {
                    policy: escolha.acao,
                    score: Number(escolha.score.toFixed(6)),
                },
            }
        }
    }

    return null
}

export function extrairEntradasWarBase(state, playerId) {
    const player = state.players[playerId]

    if (!player) {
        return WAR_BASE_AI_INPUTS.map(() => 0)
    }

    const base = state.structures[player.baseId]
    const activeStructures = Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
    const units = Object.values(state.units || {})
        .filter(unit => unit.ownerId === playerId)
    const aliveEnemies = Object.values(state.players || {})
        .filter(candidate => candidate.playerId !== playerId && candidate.alive)
    const enemyBase = getNearestEnemyBase(state, playerId, base || player)
    const enemyDistance = enemyBase ? distance(base || player, enemyBase) : state.screen.width + state.screen.height

    return [
        ratio(player.coal, 1500),
        ratio(player.knowledge, 120),
        ratio(base ? base.level : 0, 4),
        ratio((base ? base.integrity : 0) + (base ? base.barrier : 0), (base ? base.maxIntegrity : 1) + (base ? base.maxBarrier : 0)),
        ratio(countStructures(activeStructures, 'cover'), 6),
        ratio(countStructures(activeStructures, 'taraque'), 3),
        ratio(countStructures(activeStructures, 'per'), 6),
        ratio(countStructures(activeStructures, 'hef'), 4),
        ratio(countStructures(activeStructures, 'tujai'), 3),
        ratio(units.filter(unit => unit.type === 'zunim').length, 10),
        player.unlocked?.taraque ? 1 : 0,
        player.unlocked?.per ? 1 : 0,
        player.unlocked?.hef ? 1 : 0,
        player.unlocked?.tujai ? 1 : 0,
        ratio(getCapturableTargets(state, playerId).length, 6),
        clamp01(1 - ratio(enemyDistance, state.screen.width + state.screen.height)),
        player.order && player.order.type === 'capture' ? 1 : 0,
        ratio(aliveEnemies.length, 7),
    ]
}

export function criarComandoParaAcao(acao, state, playerId) {
    if (acao === 'capture') {
        return criarComandoCaptura(state, playerId)
    }

    if (acao === 'build-cover') {
        return criarComandoConstrucao(state, playerId, 'cover')
    }

    if (acao === 'upgrade-base') {
        return criarComandoUpgradeBase(state, playerId)
    }

    if (acao === 'build-taraque') {
        return criarComandoConstrucao(state, playerId, 'taraque')
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

    if (acao === 'build-per') {
        return criarComandoConstrucao(state, playerId, 'per')
    }

    if (acao === 'build-hef') {
        return criarComandoConstrucao(state, playerId, 'hef')
    }

    if (acao === 'build-tujai') {
        return criarComandoConstrucao(state, playerId, 'tujai')
    }

    if (acao === 'spawn-zunim') {
        return criarComandoZunim(state, playerId)
    }

    return null
}

function criarComandoCaptura(state, playerId) {
    const player = state.players[playerId]

    if (!player || player.order?.type === 'capture' || player.respawnAt || !player.alive) {
        return null
    }

    const target = getCapturableTargets(state, playerId)[0]

    if (!target) {
        return null
    }

    return {
        action: 'capture',
        structureId: target.structureId,
    }
}

function criarComandoConstrucao(state, playerId, structureType) {
    const player = state.players[playerId]
    const catalog = state.catalog.structures[structureType]

    if (!player || !catalog || player.coal < catalog.cost || !canBuild(state, player, structureType)) {
        return null
    }

    const tile = findBuildTile(state, playerId, structureType)

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

function criarComandoUpgradeBase(state, playerId) {
    const player = state.players[playerId]
    const base = player ? state.structures[player.baseId] : null

    if (!player || !base || base.disabled) {
        return null
    }

    const cost = getUpgradeCost(state, base)

    if (player.coal < cost) {
        return null
    }

    return {
        action: 'upgrade',
        structureId: base.structureId,
    }
}

function criarComandoPesquisa(state, playerId, recipe) {
    const player = state.players[playerId]
    const research = state.catalog.research[recipe]

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

function criarComandoZunim(state, playerId) {
    const player = state.players[playerId]
    const npc = state.catalog.npcs.zunim

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

function getCapturableTargets(state, playerId) {
    const player = state.players[playerId]
    const origin = player ? state.structures[player.baseId] || player : { x: 0, y: 0 }

    return Object.values(state.structures || {})
        .filter(structure => {
            const catalog = state.catalog.structures[structure.type]
            return catalog
                && catalog.captureable
                && structure.ownerId !== playerId
                && (structure.disabled || structure.ownerId)
        })
        .sort((first, second) => getCapturePriority(first) - getCapturePriority(second)
            || distance(origin, first) - distance(origin, second))
}

function getCapturePriority(structure) {
    if (!structure.ownerId && structure.disabled) {
        return 0
    }

    if (structure.disabled) {
        return 1
    }

    return 2
}

function findBuildTile(state, playerId, structureType) {
    const player = state.players[playerId]
    const anchors = Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)

    if (!player || !anchors.length) {
        return null
    }

    const enemyBase = getNearestEnemyBase(state, playerId, state.structures[player.baseId] || player)
    const buildRange = state.config.buildRange
    const candidates = []

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

    candidates.sort((first, second) => first.score - second.score || first.y - second.y || first.x - second.x)

    return candidates[0] || null
}

function getBuildTileScore(structureType, tile, anchor, enemyBase) {
    const anchorDistance = distance(tile, anchor)

    if (enemyBase && ['per', 'hef'].includes(structureType)) {
        return distance(tile, enemyBase) + anchorDistance * 0.15
    }

    if (enemyBase && structureType === 'cover') {
        return Math.abs(anchorDistance - 2) + distance(tile, enemyBase) * 0.02
    }

    return Math.abs(anchorDistance - 2)
}

function canBuild(state, player, type) {
    if (type === 'cover') {
        return true
    }

    const catalog = state.catalog.structures[type]

    if (catalog.requiresBaseLevel) {
        const base = state.structures[player.baseId]
        return Boolean(base && base.level >= catalog.requiresBaseLevel)
    }

    if (catalog.requiresResearch) {
        return Boolean(player.unlocked?.[catalog.requiresResearch])
    }

    return Boolean(player.unlocked?.[type])
}

function highestStructureLevel(state, playerId, type) {
    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && structure.type === type && !structure.disabled)
        .reduce((highest, structure) => Math.max(highest, structure.level), 0)
}

function countStructures(structures, type) {
    return structures.filter(structure => structure.type === type).length
}

function getUpgradeCost(state, structure) {
    return Math.round(state.catalog.structures[structure.type].cost * (1.5 ** structure.level))
}

function getNearestEnemyBase(state, playerId, origin) {
    const bases = Object.values(state.structures || {})
        .filter(structure => structure.type === 'base')
        .filter(structure => structure.ownerId !== playerId)
        .filter(structure => !structure.disabled)
        .filter(structure => state.players[structure.ownerId]?.alive)

    bases.sort((first, second) => distance(origin, first) - distance(origin, second))

    return bases[0] || null
}

function isOccupied(state, x, y) {
    return Object.values(state.structures || {}).some(structure => structure.x === x && structure.y === y)
        || Object.values(state.units || {}).some(unit => unit.x === x && unit.y === y)
        || Object.values(state.players || {}).some(player => isAvatarAvailable(player) && player.x === x && player.y === y)
}

function isAvatarAvailable(player) {
    return Boolean(player && player.alive && player.avatarDeployed !== false && !player.respawnAt && player.integrity > 0)
}

function isInsideMap(state, x, y) {
    return x >= 0 && x < state.screen.width && y >= 0 && y < state.screen.height
}

function distance(first, second) {
    const dx = first.x - second.x
    const dy = first.y - second.y

    return Math.sqrt(dx * dx + dy * dy)
}

function ratio(value, max) {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
        return 0
    }

    return clamp01(value / max)
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value))
}
