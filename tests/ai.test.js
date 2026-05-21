import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, test } from '@jest/globals'
import Matriz from '../ai/rede-neural/matriz.js'
import RedeNeural from '../ai/rede-neural/rede-neural.js'
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
    carregarRedeComposta,
    carregarRedesCompostas,
    createCompositeWarBaseAgent,
    createZeroNetwork,
    criarEntradaComposta,
    decidirComRedes,
    decidirHeuristicamente,
    montarComandoDaMacro,
    oneHotStructureType,
    preverPlacement,
    preverRede,
} from '../ai/agente-composto/agente-composto.js'
import {
    __validadoresTestables,
    criarComandoCaptura,
    criarComandoConstrucao,
    criarComandoParaAcao,
    criarComandoPesquisa,
    criarComandoScout,
    criarComandoUpgrade,
    criarComandoZunim,
    findBuildTile,
    getCapturableTargets,
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
                'remembered-base': { structureId: 'remembered-base', ownerId: 'p2', type: 'base', x: 40, y: 24, level: 1, disabled: false, seenAt: 10 },
            },
        },
        players: {
            p1: {
                playerId: 'p1',
                gamerTag: 'Alice',
                color: '#1b9aaa',
                baseId: 'base-1',
                coal: 2000,
                knowledge: 100,
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
                unlocked: { cover: true, taraque: true, per: true, hef: true, tujai: true, custom: true },
            },
            p2: {
                playerId: 'p2',
                gamerTag: 'Bob',
                color: '#ef476f',
                baseId: 'base-2',
                coal: 0,
                knowledge: 0,
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
            'base-1': { structureId: 'base-1', ownerId: 'p1', type: 'base', x: 4, y: 4, level: 2, integrity: 1000, maxIntegrity: 1000, barrier: 500, maxBarrier: 500, disabled: false },
            'base-2': { structureId: 'base-2', ownerId: 'p2', type: 'base', x: 15, y: 15, level: 1, integrity: 1000, maxIntegrity: 1000, barrier: 500, maxBarrier: 500, disabled: false },
            'cover-neutral': { structureId: 'cover-neutral', ownerId: null, type: 'cover', x: 10, y: 10, level: 1, integrity: 0, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: true },
            'cover-enemy-disabled': { structureId: 'cover-enemy-disabled', ownerId: 'p2', type: 'cover', x: 11, y: 10, level: 1, integrity: 0, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: true },
            'cover-enemy-active': { structureId: 'cover-enemy-active', ownerId: 'p2', type: 'cover', x: 12, y: 10, level: 1, integrity: 300, maxIntegrity: 300, barrier: 100, maxBarrier: 100, disabled: false },
            'taraque-1': { structureId: 'taraque-1', ownerId: 'p1', type: 'taraque', x: 5, y: 4, level: 2, integrity: 350, maxIntegrity: 350, barrier: 150, maxBarrier: 150, disabled: false },
            'per-1': { structureId: 'per-1', ownerId: 'p1', type: 'per', x: 6, y: 4, level: 1, integrity: 500, maxIntegrity: 500, barrier: 0, maxBarrier: 0, disabled: false },
            'hef-1': { structureId: 'hef-1', ownerId: 'p1', type: 'hef', x: 7, y: 4, level: 1, integrity: 200, maxIntegrity: 200, barrier: 100, maxBarrier: 100, disabled: false },
            'tujai-1': { structureId: 'tujai-1', ownerId: 'p1', type: 'tujai', x: 8, y: 4, level: 1, integrity: 200, maxIntegrity: 200, barrier: 0, maxBarrier: 0, disabled: false },
        },
        units: {
            z1: { unitId: 'z1', ownerId: 'p1', type: 'zunim', x: 9, y: 4, integrity: 150, maxIntegrity: 150, barrier: 50, maxBarrier: 50 },
            c1: { unitId: 'c1', ownerId: 'p1', type: 'capturer', x: 9, y: 5, integrity: 160, maxIntegrity: 160, barrier: 40, maxBarrier: 40 },
            e1: { unitId: 'e1', ownerId: 'p2', type: 'zunim', x: 13, y: 10, integrity: 150, maxIntegrity: 150, barrier: 0, maxBarrier: 50 },
        },
        catalog: {
            structures: {
                base: { label: 'Base', cost: 500, sightRange: 8 },
                cover: { label: 'Cover', cost: 540, captureable: true, sightRange: 4 },
                taraque: { label: 'Taraque', cost: 320, captureable: true, requiresBaseLevel: 2, sightRange: 4 },
                per: { label: 'Per', cost: 140, captureable: true, requiresResearch: 'per', attackRange: 20, sightRange: 20 },
                hef: { label: 'Hef', cost: 200, captureable: true, requiresResearch: 'hef', attackRange: 10, sightRange: 10 },
                tujai: { label: 'Tujai', cost: 600, captureable: true, requiresResearch: 'tujai', sightRange: 4 },
                custom: { label: 'Custom', cost: 1, captureable: true },
            },
            research: {
                per: { label: 'Per', cost: 15, requiresTaraqueLevel: 1 },
                hef: { label: 'Hef', cost: 25, requiresTaraqueLevel: 1 },
                tujai: { label: 'Tujai', cost: 60, requiresTaraqueLevel: 2 },
            },
            npcs: {
                zunim: { label: 'Zunim', cost: 80 },
            },
            limits: {
                cover: { current: 0, max: 5 },
                taraque: { current: 1, max: 2 },
                per: { current: 1, max: 2 },
                hef: { current: 1, max: 2 },
                tujai: { current: 1, max: 2 },
                baseUpgrade: { averageLevel: 1.5, required: 1.5, ratio: 0.75, ready: true },
            },
        },
    }
}

function scoreByLabel(labels, label) {
    return { prever: () => labels.map(candidate => candidate === label ? 1 : 0) }
}

function heatAt(x, y) {
    const values = new Array(BOARD_SIZE).fill(0)
    values[y * 48 + x] = 1
    return { prever: () => values }
}

function createNetworks({ macro = 'farm', farm = 'build-cover', research = 'per', defend = 'build-per', attack = 'build-tujai' } = {}) {
    return {
        router: scoreByLabel(MACRO_ACTIONS, macro),
        farm: scoreByLabel(FARM_ACTIONS, farm),
        capture: heatAt(10, 10),
        research: scoreByLabel(RESEARCH_ACTIONS, research),
        defend: scoreByLabel(DEFEND_ACTIONS, defend),
        attack: scoreByLabel(ATTACK_ACTIONS, attack),
        upgrade: heatAt(4, 4),
        scout: heatAt(30, 20),
        placement: heatAt(6, 5),
        'target-capture': heatAt(10, 10),
        'target-defend-upgrade': heatAt(6, 4),
        'target-upgrade': heatAt(4, 4),
    }
}

describe('AI composite modules', () => {
    test('performs matrix math and serializes a neural network', () => {
        const first = new Matriz(2, 2, [[1, 2], [3, 4]])
        const second = new Matriz(2, 1, [[2], [1]])

        expect(Matriz.matrizParaArray(Matriz.multiplicar(first, second))).toEqual([4, 10])
        expect(Matriz.matrizParaArray(Matriz.adicionar(second, second))).toEqual([4, 2])
        expect(Matriz.matrizParaArray(Matriz.subtrair(second, second))).toEqual([0, 0])
        expect(Matriz.transpor(second).toJSON()).toMatchObject({ linhas: 1, colunas: 2 })
        expect(new Matriz(1, 1).aleatorizar().conteudo[0][0]).toBeGreaterThanOrEqual(-1)

        const rede = new RedeNeural(2, 3, 1, { taxaAprendizado: 0.2, aleatorio: () => 0.75 })
        rede.treinar([1, 0], [1])
        const restored = RedeNeural.fromJSON(rede.toJSON())
        const defaultRede = new RedeNeural(1, 1, 1)

        expect(restored.prever([1, 0])).toHaveLength(1)
        expect(defaultRede.taxaAprendizado).toBe(0.1)
    })

    test('encodes fog-aware board, scalars, and frame history', () => {
        const state = createAiState()
        state.fogMask[20][20] = false
        state.memory.structures['remembered-cover'] = { structureId: 'remembered-cover', ownerId: 'p2', type: 'cover', x: 20, y: 20, level: 1, disabled: false, seenAt: 1 }
        state.structures['disabled-over-unit'] = { structureId: 'disabled-over-unit', ownerId: null, type: 'cover', x: 9, y: 5, level: 1, disabled: true }

        const board = encodeBoard(state, 'p1')
        expect(board).toHaveLength(BOARD_SIZE)
        expect(board[toIndex(4, 4)]).toBe(SPECTRAL_VALUES.ownStructure.base)
        expect(board[toIndex(12, 10)]).toBe(SPECTRAL_VALUES.enemyStructure.cover)
        expect(board[toIndex(13, 10)]).toBe(SPECTRAL_VALUES.enemyUnit.zunim)
        expect(board[toIndex(10, 10)]).toBe(SPECTRAL_VALUES.capturableDisabled)
        expect(board[toIndex(20, 20)]).toBe(SPECTRAL_VALUES.rememberedStructure)
        expect(board[toIndex(9, 5)]).toBe(SPECTRAL_VALUES.capturableDisabled)

        expect(encodeScalars(state, 'missing')).toHaveLength(SCALAR_INPUTS.length)
        const scalars = encodeScalars(state, 'p1')
        expect(scalars).toHaveLength(SCALAR_INPUTS.length)
        expect(scalars[0]).toBe(1)
        expect(scalars[10]).toBe(1)
        expect(scalars[SCALAR_INPUTS.indexOf('taraqueSlotRatio')]).toBe(0.5)
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

        expect(getCapturableTargets(state, 'p1').map(target => target.structureId)).toEqual(expect.arrayContaining(['cover-neutral', 'cover-enemy-disabled', 'cover-enemy-active']))
        expect(criarComandoCaptura(state, 'p1')).toEqual({ action: 'capture', structureId: 'cover-neutral' })
        expect(criarComandoCaptura({ ...state, players: { ...state.players, p1: { ...state.players.p1, order: { type: 'capture' } } } }, 'p1')).toBeNull()
        expect(criarComandoConstrucao(state, 'p1', 'cover')).toMatchObject({ action: 'build', structureType: 'cover' })
        expect(criarComandoConstrucao({ ...state, players: { ...state.players, p1: { ...state.players.p1, coal: 0 } } }, 'p1', 'cover')).toBeNull()
        expect(criarComandoUpgrade(state, 'p1')).toEqual({ action: 'upgrade', structureId: 'base-1' })
        expect(criarComandoUpgrade(state, 'p1', null, ['base'])).toEqual({ action: 'upgrade', structureId: 'base-1' })
        expect(criarComandoPesquisa({ ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, per: false } } } }, 'p1', 'per')).toEqual({ action: 'research', recipe: 'per' })
        expect(criarComandoZunim(state, 'p1')).toEqual({ action: 'spawn-npc', npcType: 'zunim' })
        state.fogMask[20][30] = false
        expect(criarComandoScout(state, 'p1')).toMatchObject({ action: 'move-capturer-to' })
        expect(criarComandoParaAcao('wait', state, 'p1')).toBeNull()
        expect(criarComandoParaAcao('build-hef', state, 'p1')).toMatchObject({ structureType: 'hef' })
        expect(findBuildTile({ ...state, structures: {}, players: {} }, 'p1', 'cover')).toBeNull()

        expect(hooks.getCapturePriority({ ownerId: null, disabled: true })).toBe(0)
        expect(hooks.getCapturePriority({ ownerId: 'p2', disabled: true })).toBe(1)
        expect(hooks.getCapturePriority({ ownerId: 'p2', disabled: false })).toBe(2)
        expect(hooks.canBuild(state, state.players.p1, 'custom')).toBe(true)
        expect(hooks.canBuild(state, state.players.p1, 'missing')).toBe(false)
        expect(hooks.canBuild({ ...state, catalog: { ...state.catalog, limits: { ...state.catalog.limits, cover: { current: 5, max: 5 } } } }, state.players.p1, 'cover')).toBe(false)
        expect(hooks.getUpgradeableTargets(state, 'p1').map(structure => structure.structureId)).not.toContain('taraque-1')
        expect(hooks.getOwnBase(state, 'p1').structureId).toBe('base-1')
        expect(hooks.getUpgradePriority({ type: 'base' })).toBe(0)
        expect(hooks.getUpgradePriority({ type: 'base' }, { cappedTypes: 1 })).toBe(-1)
        expect(hooks.countCappedTypes({ ...state, catalog: { ...state.catalog, limits: { ...state.catalog.limits, cover: { current: 5, max: 5 }, taraque: { current: 2, max: 2 } } } })).toBe(2)
        expect(hooks.highestStructureLevel({ structures: undefined }, 'p1', 'taraque')).toBe(0)
        expect(hooks.getUpgradeCost(state, state.structures['base-1'])).toBe(1125)
        expect(hooks.getNearestEnemyBase(state, 'p1', state.structures['base-1']).structureId).toBe('base-2')
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
        const networks = createNetworks({ macro: 'farm', farm: 'build-cover' })
        const input = criarEntradaComposta(state, 'p1', frameBuffer)

        expect(input).toHaveLength(COMPOSITE_INPUT_SIZE)
        expect(oneHotStructureType('hef')).toEqual([0, 0, 0, 1, 0, 0])
        expect(preverRede(null, input)).toEqual([])
        expect(preverPlacement(networks, input, 'cover')).toHaveLength(BOARD_SIZE)
        expect(montarComandoDaMacro('farm', networks, input, state, 'p1')).toMatchObject({ action: 'build', structureType: 'cover' })
        expect(decidirComRedes(networks, state, 'p1', { frameBuffer })).toMatchObject({ action: 'build', aiDecision: { policy: 'farm' } })

        expect(montarComandoDaMacro('capture', createNetworks({ macro: 'capture' }), input, state, 'p1')).toMatchObject({ action: 'capture' })
        expect(montarComandoDaMacro('research', createNetworks({ macro: 'research', research: 'per' }), input, { ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, per: false } } } }, 'p1')).toEqual({ action: 'research', recipe: 'per' })
        expect(montarComandoDaMacro('defend', createNetworks({ macro: 'defend', defend: 'upgrade-defensive' }), input, state, 'p1')).toMatchObject({ action: 'upgrade' })
        expect(montarComandoDaMacro('attack', createNetworks({ macro: 'attack', attack: 'spawn-zunim' }), input, state, 'p1')).toEqual({ action: 'spawn-npc', npcType: 'zunim' })
        expect(montarComandoDaMacro('upgrade', createNetworks({ macro: 'upgrade' }), input, state, 'p1')).toMatchObject({ action: 'upgrade' })
        expect(montarComandoDaMacro('upgrade-base', createNetworks({ macro: 'upgrade-base' }), input, state, 'p1')).toEqual({ action: 'upgrade', structureId: 'base-1' })
        expect(montarComandoDaMacro('scout', createNetworks({ macro: 'scout' }), input, state, 'p1')).toMatchObject({ action: 'move-capturer-to' })
        expect(montarComandoDaMacro('wait', networks, input, state, 'p1')).toBeNull()
    })

    test('loads missing and saved networks and exposes both agent method names', () => {
        const state = createAiState()
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-composite-'))
        const rede = new RedeNeural(COMPOSITE_INPUT_SIZE, 2, MACRO_ACTIONS.length, { aleatorio: () => 0.5 })
        fs.writeFileSync(path.join(tmpDir, 'router.json'), JSON.stringify({ rede: rede.toJSON() }))

        expect(createZeroNetwork(3).prever()).toEqual([0, 0, 0])
        expect(carregarRedeComposta('router', tmpDir).prever(new Array(COMPOSITE_INPUT_SIZE).fill(0))).toHaveLength(MACRO_ACTIONS.length)
        expect(carregarRedeComposta('farm', tmpDir).prever()).toEqual([0, 0, 0])
        expect(Object.keys(carregarRedesCompostas(tmpDir))).toContain('router')

        const agent = createCompositeWarBaseAgent({ networks: createNetworks({ macro: 'farm' }), cooldownMs: 0, heuristicFallback: false })
        expect(agent.cooldownMs).toBe(0)
        expect(agent.decide({ state, playerId: 'p1' })).toHaveProperty('action')
        expect(agent.decidir({ state, playerId: 'p1' })).toHaveProperty('action')

        const zeroDecision = decidirComRedes({ router: createZeroNetwork(MACRO_ACTIONS.length) }, state, 'p1', { heuristicFallback: false })
        expect(zeroDecision).toBeNull()
        expect(decidirHeuristicamente(state, 'p1')).toHaveProperty('action')
        const cappedState = {
            ...state,
            catalog: {
                ...state.catalog,
                limits: {
                    ...state.catalog.limits,
                    cover: { current: 5, max: 5 },
                    taraque: { current: 2, max: 2 },
                },
            },
        }
        expect(decidirHeuristicamente(cappedState, 'p1')).toMatchObject({ action: 'upgrade', structureId: 'base-1', aiDecision: { policy: 'heuristic:upgrade-base' } })
        expect(createCompositeWarBaseAgent({ networks: { router: createZeroNetwork(MACRO_ACTIONS.length) } }).decide({ state, playerId: 'p1' })).toHaveProperty('action')
    })
})
