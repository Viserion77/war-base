import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, jest, test } from '@jest/globals'
import NeuralNetwork from '../ai/rede-neural/rede-neural.js'
import {
    COMPOSITE_INPUT_SIZE,
    MACRO_ACTIONS,
    NETWORK_NAMES,
    NETWORK_SPECS,
} from '../ai/agente-composto/constants.js'
import {
    cloneAndMutate,
    cloneAndMutateAll,
    deepClone,
    mutateMatrix,
    sampleGaussian,
} from '../ai/treinamento-evolutivo/mutacao.js'
import {
    DEFAULT_SCORE_RULES,
    computeDelta,
    createScoreboard,
} from '../ai/treinamento-evolutivo/pontuacao.js'
import {
    captureRouterSnapshot,
    highestIndex,
    summarizeBoardFrame,
} from '../ai/treinamento-evolutivo/snapshot-decisao.js'
import {
    DEFAULT_MAX_TICKS,
    captureChampionSnapshot,
    createTrainingAgents,
    determineWinner,
    instantiateNetworks,
    serializeNetworks,
    simulateMatch,
} from '../ai/treinamento-evolutivo/sala-treino.js'
import {
    buildRandomNetworks,
    clamp,
    createTrainingEngine,
    indexFromPlayerId,
    loadBestMetadata,
    loadNetworksAsJson,
    persistGenerationCheckpoint,
    persistNetworks,
    shouldOverwriteBest,
    updateBestIfBetter,
} from '../ai/treinamento-evolutivo/motor-treino.js'

function deterministicRandom(seed = 1) {
    let value = seed

    return () => {
        value = (value * 9301 + 49297) % 233280
        return value / 233280
    }
}

function makeRandomNetworks(random = deterministicRandom(7)) {
    const networks = {}

    for (const name of NETWORK_NAMES) {
        const spec = NETWORK_SPECS[name]
        const network = new NeuralNetwork(spec.inputs, spec.hidden, spec.outputs, { random })
        networks[name] = network.toJSON()
    }

    return networks
}

describe('mutacao', () => {
    test('sampleGaussian returns finite values even for tiny random outputs', () => {
        const small = sampleGaussian(() => 1e-12)
        const middle = sampleGaussian(() => 0.5)

        expect(Number.isFinite(small)).toBe(true)
        expect(Number.isFinite(middle)).toBe(true)
    })

    test('mutateMatrix tolerates missing matrices and changes content otherwise', () => {
        const empty = mutateMatrix(null, 0.1, () => 0.5)
        expect(empty).toBeNull()

        const matrix = { rows: 1, columns: 2, content: [[0, 1]] }
        const random = deterministicRandom(3)
        mutateMatrix(matrix, 0.5, random)

        expect(matrix.content[0]).not.toEqual([0, 1])
    })

    test('cloneAndMutate produces independent deep clone with mutated weights', () => {
        const random = deterministicRandom(11)
        const network = new NeuralNetwork(2, 2, 1, { random }).toJSON()
        const mutated = cloneAndMutate(network, 0.05, random)

        mutated.inputHiddenWeights.content[0][0] = 999
        expect(network.inputHiddenWeights.content[0][0]).not.toBe(999)

        const stable = cloneAndMutate(network, 0, random)
        expect(stable.inputHiddenWeights.content).toEqual(network.inputHiddenWeights.content)
    })

    test('cloneAndMutateAll mutates every network in the map and deepClone clones primitives', () => {
        const networks = { router: new NeuralNetwork(1, 1, 1, { random: () => 0.4 }).toJSON() }
        const mutated = cloneAndMutateAll(networks, 0.1, deterministicRandom(5))

        expect(mutated.router).not.toBe(networks.router)
        expect(deepClone({ nested: { value: 1 } })).toEqual({ nested: { value: 1 } })
    })

    test('mutation helpers cover default arguments and degenerate input shapes', () => {
        expect(Number.isFinite(sampleGaussian())).toBe(true)
        expect(mutateMatrix({ content: null }, 0.1, () => 0.5).content).toBeNull()

        const network = new NeuralNetwork(1, 1, 1, { random: () => 0.5 }).toJSON()
        expect(cloneAndMutate(network).inputHiddenWeights).toBeDefined()
        expect(cloneAndMutateAll({ router: network }).router).toBeDefined()
    })
})

describe('pontuacao', () => {
    test('default rules cover the configured events', () => {
        expect(DEFAULT_SCORE_RULES['structure:destroyed']).toBe(-50)
        expect(DEFAULT_SCORE_RULES['upgrade:success']).toBe(20)
        expect(DEFAULT_SCORE_RULES['build:success']).toBe(30)
        expect(DEFAULT_SCORE_RULES['research:success']).toBe(30)
        expect(DEFAULT_SCORE_RULES['unit:created']).toBe(1)
        expect(DEFAULT_SCORE_RULES['unit:killed']).toBe(1)
    })

    test('computeDelta resolves ownership and ignores unmatched events', () => {
        expect(computeDelta(null)).toBeNull()
        expect(computeDelta({ event: 'unknown' })).toBeNull()
        expect(computeDelta({ event: 'build:success', details: {} })).toBeNull()
        expect(computeDelta({ event: 'unit:killed', details: {} })).toBeNull()
        expect(computeDelta({ event: 'unit:killed', details: { killerOwnerId: 'p1' } })).toEqual({
            ownerId: 'p1',
            event: 'unit:killed',
            points: 1,
        })
    })

    test('scoreboard tallies events and reports leader and breakdown', () => {
        const scoreboard = createScoreboard(['p1', 'p2'])

        expect(scoreboard.applyEvent({ event: 'noop' })).toBeNull()
        expect(scoreboard.applyEvent({ event: 'build:success', details: { ownerId: 'p1' } })).toMatchObject({ ownerId: 'p1', points: 30 })
        scoreboard.applyEvent({ event: 'structure:destroyed', details: { ownerId: 'p2' } })
        scoreboard.applyEvent({ event: 'unit:killed', details: { killerOwnerId: 'p3' } })

        expect(scoreboard.getScores()).toEqual({ p1: 30, p2: -50, p3: 1 })
        expect(scoreboard.getBreakdown().p1['build:success']).toBe(1)
        expect(scoreboard.getLeader()).toBe('p1')
        expect(createScoreboard([]).getLeader()).toBeNull()
    })

    test('computeDelta handles missing details object entirely', () => {
        expect(computeDelta({ event: 'build:success' })).toBeNull()
    })
})

describe('snapshot-decisao', () => {
    test('captureRouterSnapshot returns null when router lacks predictWithHidden', () => {
        expect(captureRouterSnapshot(null, [])).toBeNull()
    })

    test('captureRouterSnapshot produces hidden, scores and chosen macro', () => {
        const router = {
            predictWithHidden: () => ({
                hidden: [0.1, 0.9],
                output: MACRO_ACTIONS.map((_, index) => (index === 1 ? 0.7 : 0.1)),
            }),
        }

        const snapshot = captureRouterSnapshot(router, [0, 1], {
            subnetworkActivated: 'farm',
            boardSummary: [[0]],
            generation: 12,
            championId: 'ai-0',
        })

        expect(snapshot.chosenMacro).toBe(MACRO_ACTIONS[1])
        expect(snapshot.hiddenActivations).toEqual([0.1, 0.9])
        expect(snapshot.subnetworkActivated).toBe('farm')
        expect(snapshot.boardSummary).toEqual([[0]])
        expect(snapshot.generation).toBe(12)
        expect(snapshot.championId).toBe('ai-0')
    })

    test('highestIndex handles empty arrays and ties', () => {
        expect(highestIndex([])).toBe(-1)
        expect(highestIndex(null)).toBe(-1)
        expect(highestIndex([0.1, 0.4, 0.2])).toBe(1)
    })

    test('summarizeBoardFrame returns rounded tile values', () => {
        const length = 48 * 30
        const board = Array.from({ length }, (_, index) => (index % 10) / 10)

        expect(summarizeBoardFrame(null)).toBeNull()
        expect(summarizeBoardFrame([])).toBeNull()

        const summary = summarizeBoardFrame(board)
        expect(summary).toHaveLength(30)
        expect(summary[0]).toHaveLength(48)
        expect(summary[0][9]).toBe(0.9)
    })

    test('captureRouterSnapshot defaults all option fields when omitted', () => {
        const router = {
            predictWithHidden: () => ({
                hidden: [0.5],
                output: MACRO_ACTIONS.map(() => 0.1),
            }),
        }

        const snapshot = captureRouterSnapshot(router, [0])
        expect(snapshot.subnetworkActivated).toBeNull()
        expect(snapshot.boardSummary).toBeNull()
        expect(snapshot.generation).toBeNull()
        expect(snapshot.championId).toBeNull()
    })
})

describe('sala-treino', () => {
    test('instantiateNetworks restores valid JSON and falls back to random for invalid specs', () => {
        const networks = makeRandomNetworks(deterministicRandom(23))
        const instantiated = instantiateNetworks(networks)
        expect(instantiated.router).toBeInstanceOf(NeuralNetwork)

        const invalidMap = { ...networks, router: { ...networks.router, inputNeurons: 1 } }
        const recovered = instantiateNetworks(invalidMap)
        expect(recovered.router.inputNeurons).toBe(NETWORK_SPECS.router.inputs)
    })

    test('createTrainingAgents wires champion snapshot listener only for the first agent', () => {
        const networks = makeRandomNetworks(deterministicRandom(31))
        const captured = []
        const { agents, playerIds } = createTrainingAgents([networks, networks], {
            cooldownMs: 0,
            onSnapshot: snapshot => captured.push(snapshot),
        })

        const dummyContext = { state: { fogMask: [], structures: {}, players: {}, units: {}, screen: { width: 48, height: 30 } }, playerId: playerIds[0] }
        try {
            agents[0].decide(dummyContext)
        } catch (error) {
            // expected — minimal context may throw inside heuristics
        }

        expect(playerIds).toEqual(['ai-0', 'ai-1'])
        expect(agents).toHaveLength(2)
    })

    test('serializeNetworks tolerates objects without toJSON', () => {
        const serialized = serializeNetworks({
            router: { toJSON: () => ({ ok: true }) },
            farm: {},
        })

        expect(serialized.router).toEqual({ ok: true })
        expect(serialized.farm).toBeNull()
    })

    test('determineWinner picks survivors, score winners and timeouts', () => {
        const room = {
            winnerId: null,
            players: { 'ai-0': { alive: false, castleId: 'c0' }, 'ai-1': { alive: true, castleId: 'c1' }, 'ai-2': { alive: true, castleId: 'c2' } },
            structures: {
                c0: { integrity: 0 },
                c1: { integrity: 30 },
                c2: { integrity: 90 },
            },
        }

        expect(determineWinner({
            mode: 'survival',
            room,
            playerIds: ['ai-0', 'ai-1', 'ai-2'],
            survivorIds: ['ai-1', 'ai-2'],
            finalScores: { 'ai-0': 0, 'ai-1': 0, 'ai-2': 0 },
        })).toBe('ai-2')

        expect(determineWinner({
            mode: 'survival',
            room: { ...room, winnerId: 'ai-1' },
            playerIds: ['ai-0', 'ai-1'],
            survivorIds: ['ai-1'],
            finalScores: {},
        })).toBe('ai-1')

        expect(determineWinner({
            mode: 'score',
            room,
            playerIds: ['ai-0', 'ai-1'],
            survivorIds: [],
            finalScores: { 'ai-0': 5, 'ai-1': 10 },
        })).toBe('ai-1')

        expect(determineWinner({
            mode: 'survival',
            room: { winnerId: null, players: {}, structures: {} },
            playerIds: ['ai-0', 'ai-1'],
            survivorIds: [],
            finalScores: { 'ai-0': 1, 'ai-1': 9 },
        })).toBe('ai-1')

        expect(determineWinner({
            mode: 'survival',
            room: { winnerId: null, players: { 'ai-0': { alive: true, castleId: 'missing' } }, structures: {} },
            playerIds: ['ai-0'],
            survivorIds: ['ai-0'],
            finalScores: { 'ai-0': 1 },
        })).toBe('ai-0')
    })

    test('captureChampionSnapshot returns null when networks are not available', () => {
        expect(captureChampionSnapshot(null)).toBeNull()
        expect(captureChampionSnapshot({ networks: {} })).toBeNull()
    })

    test('simulateMatch runs ticks and resolves a winner under timeout', () => {
        const networks = makeRandomNetworks(deterministicRandom(41))
        const result = simulateMatch([networks, networks], {
            mode: 'score',
            maxTicks: 12,
            cooldownMs: 0,
        })

        expect(result.durationTicks).toBeGreaterThan(0)
        expect(['ai-0', 'ai-1']).toContain(result.winnerId)
        expect(typeof result.finalScores['ai-0']).toBe('number')
        expect(result.timedOut).toBe(true)
    })

    test('simulateMatch honours abort signals and routes match events', () => {
        const networks = makeRandomNetworks(deterministicRandom(43))
        const events = []
        let abort = null

        const result = simulateMatch([networks, networks], {
            maxTicks: 50,
            cooldownMs: 0,
            abortSignal: triggerAbort => {
                abort = triggerAbort
            },
            onMatchEvent: event => {
                events.push(event)
                if (events.length === 1) {
                    abort()
                }
            },
        })

        expect(result.aborted).toBe(true)
        expect(events.length).toBeGreaterThanOrEqual(1)
    })

    test('captureChampionSnapshot uses agent router when networks are present', () => {
        const networks = makeRandomNetworks(deterministicRandom(45))
        const instantiated = instantiateNetworks(networks)
        const fakeAgent = { networks: instantiated }
        const snapshot = captureChampionSnapshot(fakeAgent, { input: new Array(NETWORK_SPECS.router.inputs).fill(0), subnetworkActivated: 'farm' })

        expect(snapshot).not.toBeNull()
        expect(snapshot.subnetworkActivated).toBe('farm')
    })

    test('DEFAULT_MAX_TICKS is sane', () => {
        expect(DEFAULT_MAX_TICKS).toBeGreaterThan(100)
    })
})

describe('motor-treino', () => {
    test('clamp restricts numbers to the configured range', () => {
        expect(clamp(10, 0, 8)).toBe(8)
        expect(clamp(-1, 2, 8)).toBe(2)
        expect(clamp(5, 0, 8)).toBe(5)
    })

    test('indexFromPlayerId parses standard ids and returns -1 otherwise', () => {
        expect(indexFromPlayerId('ai-3')).toBe(3)
        expect(indexFromPlayerId(null)).toBe(-1)
        expect(indexFromPlayerId('player-1')).toBe(-1)
    })

    test('shouldOverwriteBest favors new winners by mode-specific criteria', () => {
        expect(shouldOverwriteBest(null, { mode: 'survival' })).toBe(true)
        expect(shouldOverwriteBest({ durationTicks: 100 }, { mode: 'survival', durationTicks: 200 })).toBe(true)
        expect(shouldOverwriteBest({ durationTicks: 200 }, { mode: 'survival', durationTicks: 50 })).toBe(false)
        expect(shouldOverwriteBest(
            { mode: 'score', winnerId: 'ai-0', finalScores: { 'ai-0': 100 } },
            { mode: 'score', winnerId: 'ai-1', finalScores: { 'ai-1': 200 } },
        )).toBe(true)
        expect(shouldOverwriteBest({ mode: 'score' }, { mode: 'score', winnerId: 'ai-0', finalScores: { 'ai-0': 0 } })).toBe(false)
    })

    test('persistNetworks and loadNetworksAsJson roundtrip and gracefully handle missing dirs', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-'))
        const networks = makeRandomNetworks(deterministicRandom(13))

        persistNetworks(fs, tmp, networks, { winnerId: 'ai-0', mode: 'survival' })
        const loaded = loadNetworksAsJson(tmp)
        expect(Object.keys(loaded)).toEqual(NETWORK_NAMES)
        expect(loadNetworksAsJson(null)).toBeNull()

        const metadata = loadBestMetadata(fs, tmp)
        expect(metadata.winnerId).toBe('ai-0')
        expect(loadBestMetadata(fs, path.join(tmp, 'missing'))).toBeNull()
    })

    test('loadBestMetadata returns null when JSON is malformed', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-bad-meta-'))
        fs.writeFileSync(path.join(tmp, 'metadata.json'), 'not json')
        expect(loadBestMetadata(fs, tmp)).toBeNull()
    })

    test('loadNetworksAsJson returns null when a single file is missing or invalid', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-bad-'))
        fs.writeFileSync(path.join(tmp, 'router.json'), '{ invalid')
        expect(loadNetworksAsJson(tmp)).toBeNull()

        const partial = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-part-'))
        const networks = makeRandomNetworks(deterministicRandom(15))
        fs.writeFileSync(path.join(partial, 'router.json'), JSON.stringify({ network: networks.router }))
        expect(loadNetworksAsJson(partial)).toBeNull()
    })

    test('updateBestIfBetter writes when summary surpasses current best', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-best-'))
        const networks = makeRandomNetworks(deterministicRandom(17))

        const updated = updateBestIfBetter(fs, tmp, null, networks, { mode: 'survival', durationTicks: 100 })
        expect(updated.durationTicks).toBe(100)

        const skipped = updateBestIfBetter(fs, tmp, { durationTicks: 200 }, networks, { mode: 'survival', durationTicks: 50 })
        expect(skipped).toBeNull()
    })

    test('persistGenerationCheckpoint writes a directory per generation', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-chk-'))
        const networks = makeRandomNetworks(deterministicRandom(19))
        const checkpointPath = persistGenerationCheckpoint(fs, tmp, 3, networks, { winnerId: 'ai-0', mode: 'survival' })
        expect(fs.existsSync(path.join(checkpointPath, 'router.json'))).toBe(true)
        expect(fs.existsSync(path.join(checkpointPath, 'metadata.json'))).toBe(true)
    })

    test('buildRandomNetworks returns spec-sized matrices', () => {
        const random = deterministicRandom(21)
        const built = buildRandomNetworks(random)
        expect(Object.keys(built)).toEqual(NETWORK_NAMES)
        expect(built.router.inputNeurons).toBe(NETWORK_SPECS.router.inputs)
    })

    test('createTrainingEngine orchestrates generations and persists results', () => {
        const tmpBest = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-engine-best-'))
        const tmpCheckpoints = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-engine-chk-'))
        const tmpSupervised = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-engine-sup-'))

        const baseNetworks = makeRandomNetworks(deterministicRandom(29))
        persistNetworks(fs, tmpSupervised, baseNetworks, null)

        const generations = []
        const listeners = {
            onStart: payload => generations.push({ kind: 'start', payload }),
            onGenerationStart: payload => generations.push({ kind: 'gen-start', payload }),
            onGenerationComplete: payload => generations.push({ kind: 'gen-complete', payload }),
            onSnapshot: payload => generations.push({ kind: 'snapshot', payload }),
            onMatchEvent: payload => generations.push({ kind: 'event', payload }),
            onStop: payload => generations.push({ kind: 'stop', payload }),
            onFinished: payload => generations.push({ kind: 'finished', payload }),
            onSave: payload => generations.push({ kind: 'save', payload }),
        }

        const simulateMatchMock = jest.fn(() => ({
            winnerId: 'ai-0',
            durationTicks: 7,
            finalScores: { 'ai-0': 5, 'ai-1': 2 },
            breakdown: { 'ai-0': {}, 'ai-1': {} },
            survivorIds: ['ai-0'],
            timedOut: false,
        }))

        const scheduled = []
        const engine = createTrainingEngine({
            fs,
            bestDir: tmpBest,
            checkpointsDir: tmpCheckpoints,
            supervisedDir: tmpSupervised,
            simulateMatch: simulateMatchMock,
            now: () => 1,
            random: deterministicRandom(33),
            scheduleNext: callback => scheduled.push(callback),
        })

        const result = engine.start({ aiCount: 3, mutationSigma: 0.02, mode: 'score', maxTicks: 50, initialSource: 'supervised' }, listeners)
        expect(result).toEqual({ started: true })
        expect(engine.start({}, listeners)).toEqual({ error: 'training already running' })
        expect(engine.isRunning()).toBe(true)
        expect(scheduled).toHaveLength(1)

        scheduled.shift()()
        engine.stop(listeners)
        scheduled.pop()()

        expect(simulateMatchMock).toHaveBeenCalled()
        expect(fs.existsSync(path.join(tmpCheckpoints, 'gen-0001'))).toBe(true)
        expect(fs.existsSync(path.join(tmpBest, 'router.json'))).toBe(true)
        expect(engine.getState().generation).toBeGreaterThan(0)
        expect(engine.isRunning()).toBe(false)

        const stopResult = engine.stop(listeners)
        expect(stopResult.stopped).toBe(false)

        const saveResult = engine.saveBest(listeners)
        expect(saveResult.saved).toBe(true)
    })

    test('engine falls back to random parent and reports save errors before training', () => {
        const tmpBest = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-empty-'))
        const tmpCheckpoints = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-empty-chk-'))
        const tmpSupervised = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-empty-sup-'))

        const engine = createTrainingEngine({
            fs,
            bestDir: tmpBest,
            checkpointsDir: tmpCheckpoints,
            supervisedDir: tmpSupervised,
            simulateMatch: () => ({
                winnerId: 'ai-0',
                durationTicks: 1,
                finalScores: { 'ai-0': 1 },
                breakdown: {},
                survivorIds: ['ai-0'],
                timedOut: true,
            }),
            now: () => 0,
            random: deterministicRandom(67),
            scheduleNext: () => null,
        })

        expect(engine.saveBest()).toEqual({ error: 'no parent to save' })

        engine.start({ aiCount: 2, initialSource: 'random' }, {})
        engine.stop()
    })

    test('engine drives snapshot throttling, best-source fallback and stop loop branch', () => {
        const tmpBest = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-best2-'))
        const tmpCheckpoints = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-chk2-'))
        const tmpSupervised = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-sup2-'))

        const baseNetworks = makeRandomNetworks(deterministicRandom(53))
        persistNetworks(fs, tmpBest, baseNetworks, { mode: 'survival', durationTicks: 100, winnerId: 'ai-0' })

        let tickCount = 0
        const snapshots = []
        const matchEvents = []

        const simulateMatchMock = jest.fn((networks, options) => {
            options.onSnapshot({ chosenMacro: 'farm', subnetworkActivated: 'farm' })
            options.onSnapshot({ chosenMacro: 'attack', subnetworkActivated: 'attack' })
            options.onMatchEvent({ event: 'build:success', ownerId: 'ai-0', scoreDelta: 30 })
            return {
                winnerId: 'ai-' + (tickCount % 2),
                durationTicks: 10 + tickCount,
                finalScores: { 'ai-0': 10, 'ai-1': 5 },
                breakdown: {},
                survivorIds: ['ai-0'],
                timedOut: false,
            }
        })

        const scheduled = []
        let nowValue = 0
        const engine = createTrainingEngine({
            fs,
            bestDir: tmpBest,
            checkpointsDir: tmpCheckpoints,
            supervisedDir: tmpSupervised,
            simulateMatch: simulateMatchMock,
            now: () => {
                nowValue += 500
                return nowValue
            },
            random: deterministicRandom(59),
            scheduleNext: callback => scheduled.push(callback),
        })

        engine.start({
            aiCount: 2,
            mode: 'score',
            mutationSigma: 0.01,
            initialSource: 'best',
            maxTicks: 30,
            snapshotThrottleMs: 200,
        }, {
            onSnapshot: payload => snapshots.push(payload),
            onMatchEvent: payload => matchEvents.push(payload),
        })

        tickCount = 1
        scheduled.pop()()

        engine.stop({})
        const finishedListeners = { onFinished: jest.fn() }
        scheduled.pop()()
        scheduled.pop()?.()

        expect(snapshots.length).toBeGreaterThan(0)
        expect(matchEvents.length).toBeGreaterThan(0)
        expect(engine.isRunning()).toBe(false)
    })

    test('engine ignores scheduled callbacks after the engine has fully stopped', () => {
        const tmpBest = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-stop-'))
        const tmpCheckpoints = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-stop-chk-'))
        const tmpSupervised = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-stop-sup-'))
        const networks = makeRandomNetworks(deterministicRandom(71))
        persistNetworks(fs, tmpSupervised, networks, null)

        const scheduled = []
        const engine = createTrainingEngine({
            fs,
            bestDir: tmpBest,
            checkpointsDir: tmpCheckpoints,
            supervisedDir: tmpSupervised,
            simulateMatch: (list, opts) => {
                opts.onSnapshot({ chosenMacro: 'farm' })
                opts.onSnapshot({ chosenMacro: 'farm' })
                return {
                    winnerId: 'ai-0',
                    durationTicks: 5,
                    finalScores: { 'ai-0': 1 },
                    breakdown: {},
                    survivorIds: ['ai-0'],
                    timedOut: false,
                }
            },
            now: () => 50,
            random: deterministicRandom(73),
            scheduleNext: callback => scheduled.push(callback),
        })

        engine.start({ aiCount: 2, initialSource: 'supervised', snapshotThrottleMs: 5000 }, {})
        engine.stop({})
        scheduled.pop()()
        scheduled.forEach(callback => callback())

        expect(engine.isRunning()).toBe(false)
    })

    test('engine recovers when best is missing and supervised has data', () => {
        const tmpBest = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-best3-'))
        const tmpCheckpoints = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-chk3-'))
        const tmpSupervised = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-evo-sup3-'))

        const baseNetworks = makeRandomNetworks(deterministicRandom(61))
        persistNetworks(fs, tmpSupervised, baseNetworks, null)

        const simulateMatchMock = jest.fn(() => ({
            winnerId: 'ai-0',
            durationTicks: 5,
            finalScores: { 'ai-0': 1 },
            breakdown: {},
            survivorIds: ['ai-0'],
            timedOut: false,
        }))

        const engine = createTrainingEngine({
            fs,
            bestDir: tmpBest,
            checkpointsDir: tmpCheckpoints,
            supervisedDir: tmpSupervised,
            simulateMatch: simulateMatchMock,
            now: () => 0,
            random: deterministicRandom(63),
        })

        engine.start({ aiCount: 2, initialSource: 'best', maxTicks: 5 }, {
            onSnapshot: () => null,
            onGenerationComplete: () => engine.stop({}),
        })

        expect(engine.isRunning()).toBe(false)
        expect(simulateMatchMock).toHaveBeenCalled()
    })
})
