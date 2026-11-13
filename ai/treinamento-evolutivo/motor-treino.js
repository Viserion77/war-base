import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import NeuralNetwork from '../rede-neural/rede-neural.js'
import { NETWORK_NAMES, NETWORK_SPECS } from '../agente-composto/constants.js'
import { DEFAULT_NETWORKS_DIR, loadCompositeNetworks } from '../agente-composto/agente-composto.js'
import { cloneAndMutateAll } from './mutacao.js'
import { DEFAULT_SCORE_RULES } from './pontuacao.js'
import { simulateMatch } from './sala-treino.js'

export const TRAINING_ROOT = fileURLToPath(new URL('./', import.meta.url))
export const BEST_DIR = path.join(TRAINING_ROOT, 'best')
export const CHECKPOINTS_DIR = path.join(TRAINING_ROOT, 'checkpoints')
export const SUPERVISED_DIR = DEFAULT_NETWORKS_DIR

export const DEFAULT_TRAINING_OPTIONS = Object.freeze({
    aiCount: 4,
    mode: 'survival',
    mutationSigma: 0.05,
    maxTicks: 1000,
    initialSource: 'best',
    scoreRules: DEFAULT_SCORE_RULES,
    snapshotThrottleMs: 200,
    cooldownMs: 50,
})

export function createTrainingEngine(dependencies = {}) {
    const fileSystem = dependencies.fs || fs
    const bestDir = dependencies.bestDir || BEST_DIR
    const checkpointsDir = dependencies.checkpointsDir || CHECKPOINTS_DIR
    const supervisedDir = dependencies.supervisedDir || SUPERVISED_DIR
    const simulate = dependencies.simulateMatch || simulateMatch
    const now = dependencies.now || (() => Date.now())
    const random = dependencies.random || Math.random

    const state = {
        running: false,
        stopRequested: false,
        generation: 0,
        parentNetworks: null,
        history: [],
        lastSnapshotAt: 0,
        bestRecord: null,
    }

    function start(options, listeners = {}) {
        const config = { ...DEFAULT_TRAINING_OPTIONS, ...options }
        const aiCount = clamp(Number(config.aiCount) || 4, 2, 8)
        const mutationSigma = Math.max(0, Number(config.mutationSigma) || 0)
        const maxTicks = Math.max(50, Number(config.maxTicks) || DEFAULT_TRAINING_OPTIONS.maxTicks)
        const mode = config.mode === 'score' ? 'score' : 'survival'

        if (state.running) {
            return { error: 'training already running' }
        }

        state.running = true
        state.stopRequested = false
        state.generation = 0
        state.history = []
        state.parentNetworks = loadInitialParent(config.initialSource)
        state.bestRecord = loadBestMetadata(fileSystem, bestDir)

        emit(listeners.onStart, {
            generation: 0,
            parentSource: config.initialSource,
            aiCount,
            mode,
            mutationSigma,
            maxTicks,
        })

        const plan = {
            aiCount,
            mode,
            mutationSigma,
            maxTicks,
            scoreRules: config.scoreRules,
            snapshotThrottleMs: config.snapshotThrottleMs,
            cooldownMs: Math.max(0, Number(config.cooldownMs) || 0),
        }

        if (typeof dependencies.scheduleNext === 'function') {
            dependencies.scheduleNext(() => runLoop(plan, listeners))
        } else {
            runLoop(plan, listeners)
        }

        return { started: true }
    }

    function stop(listeners = {}) {
        if (!state.running) {
            return { stopped: false }
        }

        state.stopRequested = true
        emit(listeners.onStop, { lastGeneration: state.generation })
        return { stopped: true }
    }

    function isRunning() {
        return state.running
    }

    function getState() {
        return {
            running: state.running,
            generation: state.generation,
            historyLength: state.history.length,
        }
    }

    function saveBest(listeners = {}) {
        if (!state.parentNetworks) {
            return { error: 'no parent to save' }
        }

        const metadata = {
            generation: state.generation,
            savedAt: now(),
            mode: state.bestRecord?.mode || 'manual',
            manual: true,
        }

        persistNetworks(fileSystem, bestDir, state.parentNetworks, metadata)
        state.bestRecord = metadata
        emit(listeners.onSave, { generation: state.generation, location: bestDir })
        return { saved: true, location: bestDir }
    }

    function runLoop(plan, listeners) {
        if (!state.running) {
            return
        }

        if (state.stopRequested) {
            state.running = false
            emit(listeners.onFinished, { lastGeneration: state.generation })
            return
        }

        const generation = state.generation + 1
        state.generation = generation

        emit(listeners.onGenerationStart, {
            generation,
            aiCount: plan.aiCount,
            mode: plan.mode,
        })

        const networksList = buildNetworksList(state.parentNetworks, plan.aiCount, plan.mutationSigma, random)

        const result = simulate(networksList, {
            mode: plan.mode,
            maxTicks: plan.maxTicks,
            scoreRules: plan.scoreRules,
            cooldownMs: plan.cooldownMs,
            onSnapshot: snapshot => {
                const elapsed = now() - state.lastSnapshotAt

                if (elapsed < plan.snapshotThrottleMs) {
                    return
                }

                state.lastSnapshotAt = now()
                emit(listeners.onSnapshot, { generation, ...snapshot })
            },
            onMatchEvent: event => emit(listeners.onMatchEvent, { generation, ...event }),
        })

        const winnerNetworks = networksList[indexFromPlayerId(result.winnerId)] || state.parentNetworks
        const summary = {
            generation,
            winnerId: result.winnerId,
            durationTicks: result.durationTicks,
            finalScores: result.finalScores,
            breakdown: result.breakdown,
            mode: plan.mode,
            timedOut: result.timedOut,
        }

        state.parentNetworks = winnerNetworks
        state.history.push(summary)

        const checkpointPath = persistGenerationCheckpoint(fileSystem, checkpointsDir, generation, winnerNetworks, summary)
        const updatedBest = updateBestIfBetter(fileSystem, bestDir, state.bestRecord, winnerNetworks, summary)

        if (updatedBest) {
            state.bestRecord = updatedBest
        }

        emit(listeners.onGenerationComplete, {
            ...summary,
            checkpointPath,
            bestUpdated: Boolean(updatedBest),
        })

        if (typeof dependencies.scheduleNext === 'function') {
            dependencies.scheduleNext(() => runLoop(plan, listeners))
            return
        }

        runLoop(plan, listeners)
    }

    function loadInitialParent(source) {
        if (source === 'random') {
            return buildRandomNetworks(random)
        }

        if (source === 'supervised') {
            return loadNetworksAsJson(supervisedDir, fileSystem) || buildRandomNetworks(random)
        }

        const fromBest = loadNetworksAsJson(bestDir, fileSystem)

        if (fromBest) {
            return fromBest
        }

        const fromSupervised = loadNetworksAsJson(supervisedDir, fileSystem)
        return fromSupervised || buildRandomNetworks(random)
    }

    function buildNetworksList(parentJson, aiCount, sigma, randomFn) {
        const networks = [parentJson]

        for (let index = 1; index < aiCount; index += 1) {
            networks.push(cloneAndMutateAll(parentJson, sigma, randomFn))
        }

        return networks
    }

    return {
        start,
        stop,
        isRunning,
        getState,
        saveBest,
    }
}

export function indexFromPlayerId(playerId) {
    if (typeof playerId !== 'string') {
        return -1
    }

    const match = playerId.match(/ai-(\d+)/)

    if (!match) {
        return -1
    }

    return Number(match[1])
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

export function loadNetworksAsJson(directory, fileSystem = fs) {
    if (!directory || !fileSystem.existsSync(directory)) {
        return null
    }

    const networks = {}

    for (const name of NETWORK_NAMES) {
        const filePath = path.join(directory, name + '.json')

        if (!fileSystem.existsSync(filePath)) {
            return null
        }

        try {
            const payload = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
            networks[name] = payload.network || payload
        } catch (error) {
            return null
        }
    }

    return networks
}

export function buildRandomNetworks(random = Math.random) {
    const networks = {}

    for (const name of NETWORK_NAMES) {
        const spec = NETWORK_SPECS[name]
        const network = new NeuralNetwork(spec.inputs, spec.hidden, spec.outputs, { random })
        networks[name] = network.toJSON()
    }

    return networks
}

export function persistNetworks(fileSystem, directory, networksJsonMap, metadata) {
    fileSystem.mkdirSync(directory, { recursive: true })

    for (const name of NETWORK_NAMES) {
        const filePath = path.join(directory, name + '.json')
        fileSystem.writeFileSync(filePath, JSON.stringify({ network: networksJsonMap[name] }, null, 2))
    }

    if (metadata) {
        fileSystem.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata, null, 2))
    }
}

export function persistGenerationCheckpoint(fileSystem, baseDir, generation, networksJsonMap, summary) {
    const generationDir = path.join(baseDir, 'gen-' + String(generation).padStart(4, '0'))
    persistNetworks(fileSystem, generationDir, networksJsonMap, summary)
    return generationDir
}

export function loadBestMetadata(fileSystem, bestDir) {
    const metadataPath = path.join(bestDir, 'metadata.json')

    if (!fileSystem.existsSync(metadataPath)) {
        return null
    }

    try {
        return JSON.parse(fileSystem.readFileSync(metadataPath, 'utf8'))
    } catch (error) {
        return null
    }
}

export function updateBestIfBetter(fileSystem, bestDir, currentBest, networksJsonMap, summary) {
    if (shouldOverwriteBest(currentBest, summary)) {
        persistNetworks(fileSystem, bestDir, networksJsonMap, summary)
        return summary
    }

    return null
}

export function shouldOverwriteBest(currentBest, summary) {
    if (!currentBest) {
        return true
    }

    if (summary.mode === 'score') {
        const newScore = summary.finalScores ? summary.finalScores[summary.winnerId] || 0 : 0
        const oldScore = currentBest.finalScores ? currentBest.finalScores[currentBest.winnerId] || 0 : 0
        return newScore > oldScore
    }

    const newDuration = summary.durationTicks || 0
    const oldDuration = currentBest.durationTicks || 0
    return newDuration > oldDuration
}

function emit(listener, payload) {
    if (typeof listener === 'function') {
        listener(payload)
    }
}
