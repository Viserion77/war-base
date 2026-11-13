import createGame from '../../public/game.js'
import { createCompositeWarBaseAgent } from '../agente-composto/agente-composto.js'
import { createFrameBuffer } from '../agente-composto/codificacao/historico.js'
import NeuralNetwork from '../rede-neural/rede-neural.js'
import { BOARD_SIZE, NETWORK_NAMES, NETWORK_SPECS } from '../agente-composto/constants.js'
import { createScoreboard, DEFAULT_SCORE_RULES } from './pontuacao.js'
import { captureRouterSnapshot, summarizeBoardFrame } from './snapshot-decisao.js'

export const DEFAULT_MAX_TICKS = 1000
export const DEFAULT_TRAINING_COOLDOWN_MS = 50
export const TRAINING_TICK_RATE_MS = 1

export function instantiateNetworks(networksJsonMap) {
    const networks = {}

    for (const name of NETWORK_NAMES) {
        const spec = NETWORK_SPECS[name]
        const json = networksJsonMap[name]

        if (json && json.inputNeurons === spec.inputs && json.hiddenNeurons === spec.hidden && json.outputNeurons === spec.outputs) {
            networks[name] = NeuralNetwork.fromJSON(json)
            continue
        }

        networks[name] = new NeuralNetwork(spec.inputs, spec.hidden, spec.outputs)
    }

    return networks
}

export function serializeNetworks(networksMap) {
    const serialized = {}

    for (const name of NETWORK_NAMES) {
        const network = networksMap[name]
        serialized[name] = network && typeof network.toJSON === 'function' ? network.toJSON() : null
    }

    return serialized
}

export function createTrainingAgents(networksJsonList, options = {}) {
    const agents = []
    const playerIds = []

    for (let index = 0; index < networksJsonList.length; index += 1) {
        const playerId = `ai-${index}`
        const networks = instantiateNetworks(networksJsonList[index])
        const isChampion = index === 0
        const onSnapshot = isChampion && typeof options.onSnapshot === 'function'
            ? snapshot => options.onSnapshot(enrichSnapshot(snapshot, networks, playerId))
            : null

        agents.push(createCompositeWarBaseAgent({
            networks,
            frameBuffer: createFrameBuffer(),
            cooldownMs: options.cooldownMs ?? DEFAULT_TRAINING_COOLDOWN_MS,
            heuristicFallback: options.heuristicFallback ?? true,
            onSnapshot,
        }))
        playerIds.push(playerId)
    }

    return { agents, playerIds }
}

export function enrichSnapshot(snapshot, networks, playerId) {
    const boards = extractBoardFrames(snapshot.input)

    return {
        playerId,
        hiddenActivations: snapshot.hiddenActivations || [],
        macroScores: snapshot.macroScores || [],
        chosenMacro: snapshot.chosenMacro || null,
        subnetworkActivated: snapshot.subnetworkActivated || null,
        boardSummary: boards.map(frame => summarizeBoardFrame(frame)),
        outputWeights: extractRouterOutputWeights(networks.router),
    }
}

export function extractBoardFrames(input) {
    if (!Array.isArray(input)) {
        return []
    }

    const frames = []

    for (let frame = 0; frame < 3; frame += 1) {
        frames.push(input.slice(frame * BOARD_SIZE, (frame + 1) * BOARD_SIZE))
    }

    return frames
}

export function extractRouterOutputWeights(router) {
    if (!router || !router.hiddenOutputWeights || !router.hiddenOutputWeights.content) {
        return []
    }

    return router.hiddenOutputWeights.content.map(row => row.slice())
}

export function simulateMatch(networksJsonList, options = {}) {
    const mode = options.mode === 'score' ? 'score' : 'survival'
    const maxTicks = Number(options.maxTicks) > 0 ? Number(options.maxTicks) : DEFAULT_MAX_TICKS
    const scoreRules = options.scoreRules || DEFAULT_SCORE_RULES
    const cooldownMs = options.cooldownMs ?? DEFAULT_TRAINING_COOLDOWN_MS
    const { agents, playerIds } = createTrainingAgents(networksJsonList, {
        cooldownMs,
        heuristicFallback: options.heuristicFallback ?? true,
        onSnapshot: options.onSnapshot || null,
    })
    const agentMap = {}

    for (let index = 0; index < playerIds.length; index += 1) {
        agentMap[playerIds[index]] = agents[index]
    }

    const game = createGame({
        getAgentForPlayer(playerId) {
            return agentMap[playerId] || null
        },
    })

    const scoreboard = createScoreboard(playerIds, scoreRules)
    const onMatchEvent = options.onMatchEvent || null
    const aborted = { value: false }

    if (typeof options.abortSignal === 'function') {
        options.abortSignal(() => {
            aborted.value = true
        })
    }

    game.subscribeDebug(entry => {
        const delta = scoreboard.applyEvent(entry)

        if (delta && onMatchEvent) {
            onMatchEvent({
                tick: entry.tick,
                event: entry.event,
                ownerId: delta.ownerId,
                scoreDelta: delta.points,
                totalScore: delta.total,
                runningScores: scoreboard.getScores(),
            })
        }
    })

    const match = game.createMatch({ playerId: playerIds[0], gamerTag: 'IA-0', isAi: true })
    const room = game.__testing.getRoom(match.hostKey)

    room.aiPlayers[playerIds[0]] = {
        playerId: playerIds[0],
        addedAt: 0,
        lastDecisionAt: -Infinity,
        autoplay: true,
    }

    for (let index = 1; index < playerIds.length; index += 1) {
        game.addAiPlayer({
            hostKey: match.hostKey,
            playerId: playerIds[index],
            gamerTag: 'IA-' + index,
        })
        room.aiPlayers[playerIds[index]].lastDecisionAt = -Infinity
    }

    let ticks = 0
    let now = 0

    while (!aborted.value && !room.winnerId && ticks < maxTicks) {
        now += TRAINING_TICK_RATE_MS
        game.__testing.tickRoom(room, now)
        ticks += 1
    }

    const finalScores = scoreboard.getScores()
    const breakdown = scoreboard.getBreakdown()
    const survivorIds = playerIds.filter(playerId => room.players[playerId]?.alive)
    const winnerId = determineWinner({
        mode,
        room,
        playerIds,
        survivorIds,
        finalScores,
    })

    return {
        winnerId,
        mode,
        durationTicks: ticks,
        finalScores,
        breakdown,
        survivorIds,
        aborted: aborted.value,
        timedOut: !room.winnerId && ticks >= maxTicks,
    }
}

export function determineWinner({ mode, room, playerIds, survivorIds, finalScores }) {
    if (mode === 'score') {
        return playerIds.reduce((best, current) => {
            if (best === null) {
                return current
            }

            return (finalScores[current] || 0) > (finalScores[best] || 0) ? current : best
        }, null)
    }

    if (room.winnerId && playerIds.includes(room.winnerId)) {
        return room.winnerId
    }

    if (survivorIds.length === 1) {
        return survivorIds[0]
    }

    if (survivorIds.length > 1) {
        return survivorIds.reduce((best, current) => {
            const currentCastle = playerCastleIntegrity(room, current)
            const bestCastle = playerCastleIntegrity(room, best)
            return currentCastle > bestCastle ? current : best
        })
    }

    return playerIds.reduce((best, current) => {
        if (best === null) {
            return current
        }

        return (finalScores[current] || 0) > (finalScores[best] || 0) ? current : best
    }, null)
}

function playerCastleIntegrity(room, playerId) {
    const player = room.players[playerId]

    if (!player) {
        return 0
    }

    const castle = room.structures[player.castleId]
    return castle ? castle.integrity : 0
}

export function captureChampionSnapshot(agent, options = {}) {
    if (!agent || !agent.networks || !agent.networks.router) {
        return null
    }

    return captureRouterSnapshot(agent.networks.router, options.input || [], options)
}
