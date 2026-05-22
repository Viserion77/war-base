import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, test } from '@jest/globals'
import Matrix from '../ai/rede-neural/matriz.js'
import NeuralNetwork from '../ai/rede-neural/rede-neural.js'
import {
    ATTACK_ACTIONS,
    BOARD_SIZE,
    COMPOSITE_INPUT_SIZE,
    DEFEND_ACTIONS,
    FARM_ACTIONS,
    MACRO_ACTIONS,
    RESEARCH_ACTIONS,
    SCALAR_INPUTS,
} from '../ai/agente-composto/constants.js'
import { encodeBoard, SPECTRAL_VALUES, toIndex } from '../ai/agente-composto/codificacao/board.js'
import { encodeScalars } from '../ai/agente-composto/codificacao/escalares.js'
import { createFrameBuffer, flattenFrames, pushFrame } from '../ai/agente-composto/codificacao/historico.js'
import {
    loadCompositeNetwork,
    loadCompositeNetworks,
    createCompositeWarBaseAgent,
    createZeroNetwork,
    createCompositeInput,
    decideWithNetworks,
    decideHeuristically,
    buildCommandFromMacro,
    oneHotStructureType,
    predictPlacement,
    predictNetwork,
} from '../ai/agente-composto/agente-composto.js'
import {
    __validadoresTestables,
    createBuildCommand,
    createCommandForAction,
    createResearchCommand,
    createUpgradeCommand,
    createSoldierCommand,
    findBuildTile,
    rankByScores,
} from '../ai/agente-composto/validadores.js'

function createAiState() {
    const fogMask = Array.from({ length: 30 }, () => Array.from({ length: 48 }, () => true))

    return {
        hostKey: 'ABCDE',
        screen: { width: 48, height: 30 },
        config: { buildRange: 6, maxPlayersPerRoom: 8 },
        tick: 120,
        fogMask,
        memory: {
            structures: {
                'remembered-castle': { structureId: 'remembered-castle', ownerId: 'p2', type: 'castle', x: 40, y: 24, level: 1, disabled: false, seenAt: 10 },
            },
        },
        players: {
            p1: {
                playerId: 'p1',
                gamerTag: 'Alice',
                color: '#1b9aaa',
                castleId: 'castle-1',
                gold: 2000,
                wisdom: 100,
                alive: true,
                connected: true,
                x: 5,
                y: 4,
                integrity: 160,
                maxIntegrity: 160,
                barrier: 40,
                maxBarrier: 40,
                avatarDeployed: false,
                respawnAt: null,
                order: null,
                unlocked: { mine: true, library: true, archer: true, catapult: true, barracks: true, custom: true },
            },
            p2: {
                playerId: 'p2',
                gamerTag: 'Bob',
                color: '#ef476f',
                castleId: 'castle-2',
                gold: 0,
                wisdom: 0,
                alive: true,
                connected: true,
                x: 15,
                y: 14,
                integrity: 160,
                maxIntegrity: 160,
                barrier: 40,
                maxBarrier: 40,
                avatarDeployed: true,
                respawnAt: null,
                order: null,
                unlocked: {},
            },
        },
        structures: {
            'castle-1': { structureId: 'castle-1', ownerId: 'p1', type: 'castle', x: 4, y: 4, level: 2, integrity: 1000, maxIntegrity: 1000, barrier: 500, maxBarrier: 500, disabled: false },
            'castle-2': { structureId: 'castle-2', ownerId: 'p2', type: 'castle', x: 15, y: 15, level: 1, integrity: 1000, maxIntegrity: 1000, barrier: 500, maxBarrier: 500, disabled: false },
            'mine-neutral': { structureId: 'mine-neutral', ownerId: null, type: 'mine', x: 10, y: 10, level: 1, integrity: 0, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: true },
            'mine-enemy-disabled': { structureId: 'mine-enemy-disabled', ownerId: 'p2', type: 'mine', x: 11, y: 10, level: 1, integrity: 0, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: true },
            'mine-enemy-active': { structureId: 'mine-enemy-active', ownerId: 'p2', type: 'mine', x: 12, y: 10, level: 1, integrity: 300, maxIntegrity: 300, barrier: 100, maxBarrier: 100, disabled: false },
            'library-1': { structureId: 'library-1', ownerId: 'p1', type: 'library', x: 5, y: 4, level: 2, integrity: 350, maxIntegrity: 350, barrier: 150, maxBarrier: 150, disabled: false },
            'archer-1': { structureId: 'archer-1', ownerId: 'p1', type: 'archer', x: 6, y: 4, level: 1, integrity: 500, maxIntegrity: 500, barrier: 0, maxBarrier: 0, disabled: false },
            'catapult-1': { structureId: 'catapult-1', ownerId: 'p1', type: 'catapult', x: 7, y: 4, level: 1, integrity: 200, maxIntegrity: 200, barrier: 100, maxBarrier: 100, disabled: false },
            'barracks-1': { structureId: 'barracks-1', ownerId: 'p1', type: 'barracks', x: 8, y: 4, level: 1, integrity: 200, maxIntegrity: 200, barrier: 0, maxBarrier: 0, disabled: false },
        },
        units: {
            z1: { unitId: 'z1', ownerId: 'p1', type: 'soldier', x: 9, y: 4, integrity: 150, maxIntegrity: 150, barrier: 50, maxBarrier: 50 },
            c1: { unitId: 'c1', ownerId: 'p1', type: 'herald', x: 9, y: 5, integrity: 160, maxIntegrity: 160, barrier: 40, maxBarrier: 40 },
            e1: { unitId: 'e1', ownerId: 'p2', type: 'soldier', x: 13, y: 10, integrity: 150, maxIntegrity: 150, barrier: 0, maxBarrier: 50 },
        },
        catalog: {
            structures: {
                castle: { label: 'Castle', cost: 500, sightRange: 8 },
                mine: { label: 'Mine', cost: 540, captureable: true, sightRange: 4 },
                library: { label: 'Library', cost: 320, captureable: true, requiresCastleLevel: 2, sightRange: 4 },
                archer: { label: 'Archer', cost: 140, captureable: true, requiresResearch: 'archer', attackRange: 20, sightRange: 20 },
                catapult: { label: 'Catapult', cost: 200, captureable: true, requiresResearch: 'catapult', attackRange: 10, sightRange: 10 },
                barracks: { label: 'Barracks', cost: 600, captureable: true, requiresResearch: 'barracks', sightRange: 4 },
                custom: { label: 'Custom', cost: 1, captureable: true },
            },
            research: {
                archer: { label: 'Archer', cost: 15, requiresLibraryLevel: 1 },
                catapult: { label: 'Catapult', cost: 25, requiresLibraryLevel: 1 },
                barracks: { label: 'Barracks', cost: 60, requiresLibraryLevel: 2 },
            },
            npcs: {
                soldier: { label: 'Soldier', cost: 80 },
            },
            limits: {
                mine: { current: 0, max: 5 },
                library: { current: 1, max: 2 },
                archer: { current: 1, max: 2 },
                catapult: { current: 1, max: 2 },
                barracks: { current: 1, max: 2 },
                castleUpgrade: { averageLevel: 1.5, required: 1.5, ratio: 0.75, ready: true },
            },
        },
    }
}

function scoreByLabel(labels, label) {
    return { predict: () => labels.map(candidate => candidate === label ? 1 : 0) }
}

function heatAt(x, y) {
    const values = new Array(BOARD_SIZE).fill(0)
    values[y * 48 + x] = 1
    return { predict: () => values }
}

function createNetworks({ macro = 'farm', farm = 'build-mine', research = 'archer', defend = 'build-archer', attack = 'build-barracks' } = {}) {
    return {
        router: scoreByLabel(MACRO_ACTIONS, macro),
        farm: scoreByLabel(FARM_ACTIONS, farm),
        research: scoreByLabel(RESEARCH_ACTIONS, research),
        defend: scoreByLabel(DEFEND_ACTIONS, defend),
        attack: scoreByLabel(ATTACK_ACTIONS, attack),
        upgrade: heatAt(4, 4),
        placement: heatAt(6, 5),
        'target-defend-upgrade': heatAt(6, 4),
        'target-upgrade': heatAt(4, 4),
    }
}

describe('AI composite modules', () => {
    test('performs matrix math and serializes a neural network', () => {
        const first = new Matrix(2, 2, [[1, 2], [3, 4]])
        const second = new Matrix(2, 1, [[2], [1]])

        expect(Matrix.toArray(Matrix.multiply(first, second))).toEqual([4, 10])
        expect(Matrix.toArray(Matrix.add(second, second))).toEqual([4, 2])
        expect(Matrix.toArray(Matrix.subtract(second, second))).toEqual([0, 0])
        expect(Matrix.transpose(second).toJSON()).toMatchObject({ rows: 1, columns: 2 })
        expect(new Matrix(1, 1).randomize().content[0][0]).toBeGreaterThanOrEqual(-1)

        const network = new NeuralNetwork(2, 3, 1, { learningRate: 0.2, random: () => 0.75 })
        network.train([1, 0], [1])
        const restored = NeuralNetwork.fromJSON(network.toJSON())
        const defaultNetwork = new NeuralNetwork(1, 1, 1)

        expect(restored.predict([1, 0])).toHaveLength(1)
        expect(defaultNetwork.learningRate).toBe(0.1)
    })

    test('encodes fog-aware board, scalars, and frame history', () => {
        const state = createAiState()
        state.fogMask[20][20] = false
        state.memory.structures['remembered-mine'] = { structureId: 'remembered-mine', ownerId: 'p2', type: 'mine', x: 20, y: 20, level: 1, disabled: false, seenAt: 1 }
        state.structures['disabled-over-unit'] = { structureId: 'disabled-over-unit', ownerId: null, type: 'mine', x: 9, y: 5, level: 1, disabled: true }

        const board = encodeBoard(state, 'p1')
        expect(board).toHaveLength(BOARD_SIZE)
        expect(board[toIndex(4, 4)]).toBe(SPECTRAL_VALUES.ownStructure.castle)
        expect(board[toIndex(12, 10)]).toBe(SPECTRAL_VALUES.enemyStructure.mine)
        expect(board[toIndex(13, 10)]).toBe(SPECTRAL_VALUES.enemyUnit.soldier)
        expect(board[toIndex(10, 10)]).toBe(SPECTRAL_VALUES.capturableDisabled)
        expect(board[toIndex(20, 20)]).toBe(SPECTRAL_VALUES.rememberedStructure)
        expect(board[toIndex(9, 5)]).toBe(SPECTRAL_VALUES.capturableDisabled)

        expect(encodeScalars(state, 'missing')).toHaveLength(SCALAR_INPUTS.length)
        const scalars = encodeScalars(state, 'p1')
        expect(scalars).toHaveLength(SCALAR_INPUTS.length)
        expect(scalars[0]).toBe(1)
        expect(scalars[10]).toBe(1)
        expect(scalars[SCALAR_INPUTS.indexOf('librarySlotRatio')]).toBe(0.5)
        expect(scalars[SCALAR_INPUTS.indexOf('cappedTypesFraction')]).toBe(0)

        const frameBuffer = createFrameBuffer()
        const frames = frameBuffer.push('p1', board)
        expect(frames).toHaveLength(3)
        expect(flattenFrames(frames)).toHaveLength(BOARD_SIZE * 3)
        expect(frameBuffer.get('p1')).toHaveLength(2)
        frameBuffer.reset('p1')
        expect(frameBuffer.get('p1')).toEqual([])
        expect(pushFrame({}, 'p2', [1, 2])[2]).toEqual([1, 2])
    })

    test('validates commands and helper branches deterministically', () => {
        const state = createAiState()
        const hooks = __validadoresTestables

        expect(createBuildCommand(state, 'p1', 'mine')).toMatchObject({ action: 'build', structureType: 'mine' })
        expect(createBuildCommand({ ...state, players: { ...state.players, p1: { ...state.players.p1, gold: 0 } } }, 'p1', 'mine')).toBeNull()
        expect(createUpgradeCommand(state, 'p1')).toEqual({ action: 'upgrade', structureId: 'castle-1' })
        expect(createUpgradeCommand(state, 'p1', null, ['castle'])).toEqual({ action: 'upgrade', structureId: 'castle-1' })
        expect(createResearchCommand({ ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, archer: false } } } }, 'p1', 'archer')).toEqual({ action: 'research', recipe: 'archer' })
        expect(createSoldierCommand(state, 'p1')).toEqual({ action: 'spawn-npc', npcType: 'soldier' })
        expect(createCommandForAction('wait', state, 'p1')).toBeNull()
        expect(createCommandForAction('build-catapult', state, 'p1')).toMatchObject({ structureType: 'catapult' })
        expect(findBuildTile({ ...state, structures: {}, players: {} }, 'p1', 'mine')).toBeNull()

        expect(hooks.canBuild(state, state.players.p1, 'custom')).toBe(true)
        expect(hooks.canBuild(state, state.players.p1, 'missing')).toBe(false)
        expect(hooks.canBuild({ ...state, catalog: { ...state.catalog, limits: { ...state.catalog.limits, mine: { current: 5, max: 5 } } } }, state.players.p1, 'mine')).toBe(false)
        expect(hooks.getUpgradeableTargets(state, 'p1').map(structure => structure.structureId)).not.toContain('library-1')
        expect(hooks.getOwnCastle(state, 'p1').structureId).toBe('castle-1')
        expect(hooks.getUpgradePriority({ type: 'castle' })).toBe(0)
        expect(hooks.getUpgradePriority({ type: 'castle' }, { cappedTypes: 1 })).toBe(-1)
        expect(hooks.countCappedTypes({ ...state, catalog: { ...state.catalog, limits: { ...state.catalog.limits, mine: { current: 5, max: 5 }, library: { current: 2, max: 2 } } } })).toBe(2)
        expect(hooks.highestStructureLevel({ structures: undefined }, 'p1', 'library')).toBe(0)
        expect(hooks.getUpgradeCost(state, state.structures['castle-1'])).toBe(1125)
        expect(hooks.getNearestEnemyCastle(state, 'p1', state.structures['castle-1']).structureId).toBe('castle-2')
        expect(hooks.getPlayerOrigin({ players: {}, structures: {} }, 'missing')).toEqual({ x: 0, y: 0 })
        expect(hooks.isOccupied(state, 4, 4)).toBe(true)
        expect(hooks.isAvatarAvailable({ ...state.players.p1, avatarDeployed: true })).toBe(true)
        expect(hooks.isInsideMap(state, 0, 0)).toBe(true)
        expect(hooks.getHeatmapScore([1], { x: 1, y: 1 })).toBe(0)
        expect(hooks.rankByScores(['a', 'b'], [0.2, 0.9])[0].label).toBe('b')
        expect(hooks.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
        expect(rankByScores(['a'], null)).toEqual([{ label: 'a', score: 0 }])
    })

    test('routes composite networks through macro and subnetwork decisions', () => {
        const state = createAiState()
        const frameBuffer = createFrameBuffer()
        const networks = createNetworks({ macro: 'farm', farm: 'build-mine' })
        const input = createCompositeInput(state, 'p1', frameBuffer)

        expect(input).toHaveLength(COMPOSITE_INPUT_SIZE)
        expect(oneHotStructureType('catapult')).toEqual([0, 0, 0, 1, 0, 0])
        expect(predictNetwork(null, input)).toEqual([])
        expect(predictPlacement(networks, input, 'mine')).toHaveLength(BOARD_SIZE)
        expect(buildCommandFromMacro('farm', networks, input, state, 'p1')).toMatchObject({ action: 'build', structureType: 'mine' })
        expect(decideWithNetworks(networks, state, 'p1', { frameBuffer })).toMatchObject({ action: 'build', aiDecision: { policy: 'farm' } })

        expect(buildCommandFromMacro('research', createNetworks({ macro: 'research', research: 'archer' }), input, { ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, archer: false } } } }, 'p1')).toEqual({ action: 'research', recipe: 'archer' })
        expect(buildCommandFromMacro('defend', createNetworks({ macro: 'defend', defend: 'upgrade-defensive' }), input, state, 'p1')).toMatchObject({ action: 'upgrade' })
        expect(buildCommandFromMacro('attack', createNetworks({ macro: 'attack', attack: 'spawn-soldier' }), input, state, 'p1')).toEqual({ action: 'spawn-npc', npcType: 'soldier' })
        expect(buildCommandFromMacro('upgrade', createNetworks({ macro: 'upgrade' }), input, state, 'p1')).toMatchObject({ action: 'upgrade' })
        expect(buildCommandFromMacro('upgrade-castle', createNetworks({ macro: 'upgrade-castle' }), input, state, 'p1')).toEqual({ action: 'upgrade', structureId: 'castle-1' })
        expect(buildCommandFromMacro('wait', networks, input, state, 'p1')).toBeNull()
    })

    test('loads missing and saved networks and exposes the agent decide method', () => {
        const state = createAiState()
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-composite-'))
        const network = new NeuralNetwork(COMPOSITE_INPUT_SIZE, 2, MACRO_ACTIONS.length, { random: () => 0.5 })
        fs.writeFileSync(path.join(tmpDir, 'router.json'), JSON.stringify({ network: network.toJSON() }))

        expect(createZeroNetwork(3).predict()).toEqual([0, 0, 0])
        expect(loadCompositeNetwork('router', tmpDir).predict(new Array(COMPOSITE_INPUT_SIZE).fill(0))).toHaveLength(MACRO_ACTIONS.length)
        expect(loadCompositeNetwork('farm', tmpDir).predict()).toEqual(new Array(FARM_ACTIONS.length).fill(0))
        expect(Object.keys(loadCompositeNetworks(tmpDir))).toContain('router')

        const agent = createCompositeWarBaseAgent({ networks: createNetworks({ macro: 'farm' }), cooldownMs: 0, heuristicFallback: false })
        expect(agent.cooldownMs).toBe(0)
        expect(agent.decide({ state, playerId: 'p1' })).toHaveProperty('action')

        const zeroDecision = decideWithNetworks({ router: createZeroNetwork(MACRO_ACTIONS.length) }, state, 'p1', { heuristicFallback: false })
        expect(zeroDecision).toBeNull()
        expect(decideHeuristically(state, 'p1')).toHaveProperty('action')
        const cappedState = {
            ...state,
            catalog: {
                ...state.catalog,
                limits: {
                    ...state.catalog.limits,
                    mine: { current: 5, max: 5 },
                    library: { current: 2, max: 2 },
                },
            },
        }
        expect(decideHeuristically(cappedState, 'p1')).toMatchObject({ action: 'upgrade', structureId: 'castle-1', aiDecision: { policy: 'heuristic:upgrade-castle' } })
        expect(createCompositeWarBaseAgent({ networks: { router: createZeroNetwork(MACRO_ACTIONS.length) } }).decide({ state, playerId: 'p1' })).toHaveProperty('action')
    })
})
