/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
import fs from 'fs'
import { fileURLToPath } from 'url'
import NeuralNetwork from '../rede-neural/rede-neural.js'
import { encodeBoard } from './codificacao/board.js'
import { encodeScalars } from './codificacao/escalares.js'
import { createFrameBuffer, flattenFrames } from './codificacao/historico.js'
import {
    ATTACK_ACTIONS,
    COMPOSITE_INPUT_SIZE,
    DEFEND_ACTIONS,
    FARM_ACTIONS,
    MACRO_ACTIONS,
    NETWORK_NAMES,
    NETWORK_SPECS,
    PLACEMENT_STRUCTURE_TYPES,
    RESEARCH_ACTIONS,
} from './constants.js'
import {
    countCappedTypes,
    createCaptureCommand,
    createBuildCommand,
    createCommandForAction,
    createResearchCommand,
    createScoutCommand,
    createUpgradeCommand,
    createSoldierCommand,
    rankByScores,
} from './validadores.js'

export const DEFAULT_NETWORKS_DIR = fileURLToPath(new URL('./redes/', import.meta.url))

export function createCompositeWarBaseAgent(options = {}) {
    const networks = options.networks || loadCompositeNetworks(options.networksDir || DEFAULT_NETWORKS_DIR)
    const frameBuffer = options.frameBuffer || createFrameBuffer()
    const heuristicFallback = options.heuristicFallback ?? true

    return {
        cooldownMs: options.cooldownMs ?? 1000,
        networks,
        frameBuffer,
        decide(context) {
            return decideWithNetworks(networks, context.state, context.playerId, {
                frameBuffer,
                heuristicFallback,
            })
        },
    }
}

export function loadCompositeNetworks(networksDir = DEFAULT_NETWORKS_DIR) {
    const networks = {}

    for (const name of NETWORK_NAMES) {
        networks[name] = loadCompositeNetwork(name, networksDir)
    }

    return networks
}

export function loadCompositeNetwork(name, networksDir = DEFAULT_NETWORKS_DIR) {
    const spec = NETWORK_SPECS[name]
    const path = networksDir.endsWith('/') ? networksDir + name + '.json' : networksDir + '/' + name + '.json'

    if (!spec || !fs.existsSync(path)) {
        return createZeroNetwork(spec?.outputs || 0)
    }

    const model = JSON.parse(fs.readFileSync(path, 'utf8'))
    const serialized = model.network || model

    if (serialized.inputNeurons !== spec.inputs
        || serialized.hiddenNeurons !== spec.hidden
        || serialized.outputNeurons !== spec.outputs) {
        return createZeroNetwork(spec.outputs)
    }

    return NeuralNetwork.fromJSON(serialized)
}

export function createZeroNetwork(outputs) {
    return {
        predict() {
            return new Array(outputs).fill(0)
        },
    }
}

export function decideWithNetworks(networks, state, playerId, options = {}) {
    const frameBuffer = options.frameBuffer || createFrameBuffer()
    const input = createCompositeInput(state, playerId, frameBuffer)
    const macroScores = predictNetwork(networks.router, input)
    const bestMacroScore = Math.max(...macroScores, 0)

    if (bestMacroScore <= 0) {
        return options.heuristicFallback ? decideHeuristically(state, playerId) : null
    }

    for (const choice of rankByScores(MACRO_ACTIONS, macroScores)) {
        if (choice.label === 'wait') {
            continue
        }

        const command = buildCommandFromMacro(choice.label, networks, input, state, playerId)

        if (command) {
            return {
                ...command,
                aiDecision: {
                    policy: choice.label,
                    score: Number(choice.score.toFixed(6)),
                },
            }
        }
    }

    return null
}

export function createCompositeInput(state, playerId, frameBuffer = createFrameBuffer()) {
    const board = encodeBoard(state, playerId)
    const frames = frameBuffer.push(playerId, board)
    const scalars = encodeScalars(state, playerId)
    const input = [...flattenFrames(frames), ...scalars]

    if (input.length !== COMPOSITE_INPUT_SIZE) {
        return input.slice(0, COMPOSITE_INPUT_SIZE).concat(new Array(Math.max(0, COMPOSITE_INPUT_SIZE - input.length)).fill(0))
    }

    return input
}

export function buildCommandFromMacro(macro, networks, input, state, playerId) {
    if (macro === 'farm') {
        return buildFarmCommand(networks, input, state, playerId)
    }

    if (macro === 'capture') {
        return createCaptureCommand(state, playerId, predictNetwork(networks.capture, input))
    }

    if (macro === 'research') {
        return buildResearchCommand(networks, input, state, playerId)
    }

    if (macro === 'defend') {
        return buildDefendCommand(networks, input, state, playerId)
    }

    if (macro === 'attack') {
        return buildAttackCommand(networks, input, state, playerId)
    }

    if (macro === 'upgrade') {
        return createUpgradeCommand(state, playerId, predictNetwork(networks.upgrade, input))
    }

    if (macro === 'upgrade-castle') {
        return createUpgradeCommand(state, playerId, predictNetwork(networks['target-upgrade'], input), ['castle'])
    }

    if (macro === 'scout') {
        return createScoutCommand(state, playerId, predictNetwork(networks.scout, input))
    }

    return null
}

export function buildFarmCommand(networks, input, state, playerId) {
    const scores = predictNetwork(networks.farm, input)

    for (const choice of rankByScores(FARM_ACTIONS, scores)) {
        if (choice.label === 'build-mine') {
            const command = createBuildCommand(state, playerId, 'mine', predictPlacement(networks, input, 'mine'))
            if (command) return command
        }

        if (choice.label === 'build-library') {
            const command = createBuildCommand(state, playerId, 'library', predictPlacement(networks, input, 'library'))
            if (command) return command
        }

        if (choice.label === 'capture-mine-target') {
            const command = createCaptureCommand(state, playerId, predictNetwork(networks['target-capture'], input), { type: 'mine' })
            if (command) return command
        }
    }

    return null
}

export function buildResearchCommand(networks, input, state, playerId) {
    const scores = predictNetwork(networks.research, input)

    for (const choice of rankByScores(RESEARCH_ACTIONS, scores)) {
        const command = createResearchCommand(state, playerId, choice.label)
        if (command) return command
    }

    return null
}

export function buildDefendCommand(networks, input, state, playerId) {
    const scores = predictNetwork(networks.defend, input)

    for (const choice of rankByScores(DEFEND_ACTIONS, scores)) {
        if (choice.label === 'build-archer') {
            const command = createBuildCommand(state, playerId, 'archer', predictPlacement(networks, input, 'archer'))
            if (command) return command
        }

        if (choice.label === 'build-catapult') {
            const command = createBuildCommand(state, playerId, 'catapult', predictPlacement(networks, input, 'catapult'))
            if (command) return command
        }

        if (choice.label === 'upgrade-defensive') {
            const command = createUpgradeCommand(state, playerId, predictNetwork(networks['target-defend-upgrade'], input), ['archer', 'catapult'])
            if (command) return command
        }
    }

    return null
}

export function buildAttackCommand(networks, input, state, playerId) {
    const scores = predictNetwork(networks.attack, input)

    for (const choice of rankByScores(ATTACK_ACTIONS, scores)) {
        if (choice.label === 'build-barracks') {
            const command = createBuildCommand(state, playerId, 'barracks', predictPlacement(networks, input, 'barracks'))
            if (command) return command
        }

        if (choice.label === 'spawn-soldier') {
            const command = createSoldierCommand(state, playerId)
            if (command) return command
        }

        if (choice.label === 'build-forward-tower') {
            const archer = createBuildCommand(state, playerId, 'archer', predictPlacement(networks, input, 'archer'))
            if (archer) return archer

            const catapult = createBuildCommand(state, playerId, 'catapult', predictPlacement(networks, input, 'catapult'))
            if (catapult) return catapult
        }
    }

    return null
}

export function predictPlacement(networks, input, structureType) {
    return predictNetwork(networks.placement, input.concat(oneHotStructureType(structureType)))
}

export function oneHotStructureType(structureType) {
    return PLACEMENT_STRUCTURE_TYPES.map(type => type === structureType ? 1 : 0)
}

export function predictNetwork(network, input) {
    if (!network || typeof network.predict !== 'function') {
        return []
    }

    return network.predict(input)
}

export function decideHeuristically(state, playerId) {
    const standardActions = [
        'capture',
        'build-mine',
        'upgrade-castle',
        'build-library',
        'research-archer',
        'research-catapult',
        'research-barracks',
        'build-archer',
        'build-catapult',
        'build-barracks',
        'spawn-soldier',
        'scout',
    ]
    const gate = state.catalog?.limits?.castleUpgrade
    const gateClosed = gate ? !gate.ready : false
    const fullCaps = countCappedTypes(state) >= 2

    let actions = standardActions

    if (gateClosed) {
        actions = ['upgrade', ...standardActions.filter(action => action !== 'upgrade-castle')]
    } else if (fullCaps) {
        actions = ['upgrade-castle', ...standardActions.filter(action => action !== 'upgrade-castle')]
    }

    for (const action of actions) {
        const command = createCommandForAction(action, state, playerId)

        if (command) {
            return {
                ...command,
                aiDecision: {
                    policy: 'heuristic:' + action,
                    score: 0,
                },
            }
        }
    }

    return null
}
