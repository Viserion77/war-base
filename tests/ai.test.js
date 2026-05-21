import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, test } from '@jest/globals'
import Matriz from '../ai/rede-neural/matriz.js'
import RedeNeural from '../ai/rede-neural/rede-neural.js'
import {
    WAR_BASE_AI_ACTIONS,
    WAR_BASE_AI_INPUTS,
    __agentTestables,
    carregarRedeTreinada,
    criarComandoParaAcao,
    createNeuralWarBaseAgent,
    decidirComRede,
    extrairEntradasWarBase,
} from '../ai/agente-war-base/agente-neural.js'
import {
    criarGeradorAleatorio,
    criarModelo,
    dataset,
    exemplo,
    respostaParaAcao,
    salvarModelo,
    treinarRede,
    vetor,
} from '../ai/agente-war-base/treinar.js'

function createAiState() {
    return {
        hostKey: 'ABCDE',
        screen: { width: 20, height: 20 },
        config: { buildRange: 6, maxPlayersPerRoom: 8 },
        players: {
            p1: {
                playerId: 'p1',
                gamerTag: 'Alice',
                baseId: 'base-1',
                coal: 1200,
                knowledge: 100,
                alive: true,
                x: 5,
                y: 4,
                integrity: 160,
                avatarDeployed: false,
                respawnAt: null,
                order: null,
                unlocked: { cover: true, taraque: true, per: true, hef: true, tujai: true, custom: true },
            },
            p2: {
                playerId: 'p2',
                gamerTag: 'Bob',
                baseId: 'base-2',
                coal: 0,
                knowledge: 0,
                alive: true,
                x: 15,
                y: 14,
                integrity: 160,
                avatarDeployed: false,
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
            'tujai-1': { structureId: 'tujai-1', ownerId: 'p1', type: 'tujai', x: 6, y: 4, level: 1, integrity: 200, maxIntegrity: 200, barrier: 0, maxBarrier: 0, disabled: false },
        },
        units: {},
        catalog: {
            structures: {
                base: { label: 'Base', cost: 500 },
                cover: { label: 'Cover', cost: 540, captureable: true },
                taraque: { label: 'Taraque', cost: 320, captureable: true, requiresBaseLevel: 2 },
                per: { label: 'Per', cost: 140, captureable: true, requiresResearch: 'per' },
                hef: { label: 'Hef', cost: 200, captureable: true, requiresResearch: 'hef' },
                tujai: { label: 'Tujai', cost: 600, captureable: true, requiresResearch: 'tujai' },
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
        },
    }
}

function scoreAction(actionName) {
    return {
        prever() {
            return WAR_BASE_AI_ACTIONS.map(action => action === actionName ? 1 : 0)
        },
    }
}

describe('AI neural modules', () => {
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

    test('extracts game features and creates playable commands', () => {
        const state = createAiState()

        expect(extrairEntradasWarBase(state, 'missing')).toEqual(expect.arrayContaining([0]))
        expect(extrairEntradasWarBase({ ...state, players: undefined, structures: undefined, units: undefined }, 'p1')).toEqual(expect.arrayContaining([0]))
        expect(extrairEntradasWarBase({ ...state, units: undefined }, 'p1')).toHaveLength(18)
        expect(extrairEntradasWarBase({ ...state, players: { ...state.players, p1: { ...state.players.p1, baseId: 'missing', order: { type: 'capture' }, unlocked: {} } } }, 'p1')).toHaveLength(18)
        expect(extrairEntradasWarBase({ ...state, players: { p1: state.players.p1 }, structures: { 'base-1': state.structures['base-1'] } }, 'p1')).toHaveLength(18)
        expect(extrairEntradasWarBase(state, 'p2')).toHaveLength(18)
        state.units.z1 = { unitId: 'z1', ownerId: 'p1', type: 'zunim', x: 7, y: 4 }
        state.units.c1 = { unitId: 'c1', ownerId: 'p1', type: 'capturer', x: 8, y: 4 }
        expect(extrairEntradasWarBase(state, 'p1')).toHaveLength(WAR_BASE_AI_INPUTS.length)
        expect(criarComandoParaAcao('capture', state, 'p1')).toEqual({ action: 'capture', structureId: 'cover-neutral' })
        expect(criarComandoParaAcao('build-cover', state, 'p1')).toMatchObject({ action: 'build', structureType: 'cover' })
        expect(criarComandoParaAcao('build-taraque', state, 'p1')).toMatchObject({ action: 'build', structureType: 'taraque' })
        expect(criarComandoParaAcao('upgrade-base', state, 'p1')).toEqual({ action: 'upgrade', structureId: 'base-1' })
        state.players.p1.unlocked.per = false
        expect(criarComandoParaAcao('research-per', state, 'p1')).toEqual({ action: 'research', recipe: 'per' })
        state.players.p1.unlocked.per = true
        state.players.p1.unlocked.hef = false
        expect(criarComandoParaAcao('research-hef', state, 'p1')).toEqual({ action: 'research', recipe: 'hef' })
        state.players.p1.unlocked.hef = true
        state.players.p1.unlocked.tujai = false
        expect(criarComandoParaAcao('research-tujai', state, 'p1')).toEqual({ action: 'research', recipe: 'tujai' })
        state.players.p1.unlocked.tujai = true
        expect(criarComandoParaAcao('build-per', state, 'p1')).toMatchObject({ action: 'build', structureType: 'per' })
        expect(criarComandoParaAcao('build-hef', state, 'p1')).toMatchObject({ action: 'build', structureType: 'hef' })
        expect(criarComandoParaAcao('build-tujai', state, 'p1')).toMatchObject({ action: 'build', structureType: 'tujai' })
        expect(criarComandoParaAcao('spawn-zunim', state, 'p1')).toEqual({ action: 'spawn-npc', npcType: 'zunim' })
        expect(criarComandoParaAcao('wait', state, 'p1')).toBeNull()
    })

    test('covers defensive command branches and helper decisions', () => {
        const state = createAiState()
        const hooks = __agentTestables

        expect(criarComandoParaAcao('unknown', state, 'p1')).toBeNull()
        expect(criarComandoParaAcao('capture', state, 'missing')).toBeNull()
        expect(criarComandoParaAcao('capture', { ...state, players: { ...state.players, p1: { ...state.players.p1, order: { type: 'capture' } } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('capture', { ...state, players: { ...state.players, p1: { ...state.players.p1, respawnAt: Date.now() } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('capture', { ...state, players: { ...state.players, p1: { ...state.players.p1, alive: false } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('capture', { ...state, structures: { 'base-1': state.structures['base-1'], 'base-2': state.structures['base-2'] } }, 'p1')).toBeNull()

        expect(criarComandoParaAcao('build-cover', state, 'missing')).toBeNull()
        expect(criarComandoParaAcao('build-cover', { ...state, players: { ...state.players, p1: { ...state.players.p1, coal: 0 } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('build-taraque', { ...state, structures: { ...state.structures, 'base-1': { ...state.structures['base-1'], level: 1 } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('build-cover', { ...state, screen: { width: 1, height: 1 }, config: { ...state.config, buildRange: 0 }, structures: { 'base-1': { ...state.structures['base-1'], x: 0, y: 0 } } }, 'p1')).toBeNull()

        expect(criarComandoParaAcao('upgrade-base', state, 'missing')).toBeNull()
        expect(criarComandoParaAcao('upgrade-base', { ...state, players: { ...state.players, p1: { ...state.players.p1, baseId: 'missing' } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('upgrade-base', { ...state, structures: { ...state.structures, 'base-1': { ...state.structures['base-1'], disabled: true } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('upgrade-base', { ...state, players: { ...state.players, p1: { ...state.players.p1, coal: 0 } } }, 'p1')).toBeNull()

        expect(criarComandoParaAcao('research-per', state, 'missing')).toBeNull()
        expect(criarComandoParaAcao('research-per', { ...state, catalog: { ...state.catalog, research: {} } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('research-per', state, 'p1')).toBeNull()
        expect(criarComandoParaAcao('research-per', { ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, per: false }, knowledge: 0 } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('research-per', { ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, per: false } } }, structures: { ...state.structures, 'taraque-1': { ...state.structures['taraque-1'], disabled: true } } }, 'p1')).toBeNull()

        expect(criarComandoParaAcao('spawn-zunim', state, 'missing')).toBeNull()
        expect(criarComandoParaAcao('spawn-zunim', { ...state, catalog: { ...state.catalog, npcs: {} } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('spawn-zunim', { ...state, players: { ...state.players, p1: { ...state.players.p1, unlocked: { ...state.players.p1.unlocked, tujai: false } } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('spawn-zunim', { ...state, players: { ...state.players, p1: { ...state.players.p1, coal: 0 } } }, 'p1')).toBeNull()
        expect(criarComandoParaAcao('spawn-zunim', { ...state, structures: { ...state.structures, 'tujai-1': { ...state.structures['tujai-1'], disabled: true } } }, 'p1')).toBeNull()

        expect(hooks.getCapturableTargets(state, 'missing')[0].structureId).toBe('cover-neutral')
        expect(hooks.getCapturableTargets({ ...state, players: undefined, structures: undefined }, 'missing')).toEqual([])
        expect(hooks.getCapturableTargets({ ...state, players: { ...state.players, p1: { ...state.players.p1, baseId: 'missing' } } }, 'p1')[0].structureId).toBe('cover-neutral')
        expect(hooks.getCapturePriority({ ownerId: null, disabled: true })).toBe(0)
        expect(hooks.getCapturePriority({ ownerId: 'p2', disabled: true })).toBe(1)
        expect(hooks.getCapturePriority({ ownerId: 'p2', disabled: false })).toBe(2)
        expect(hooks.findBuildTile(state, 'missing', 'cover')).toBeNull()
        expect(hooks.findBuildTile({ ...state, players: undefined, structures: undefined }, 'p1', 'cover')).toBeNull()
        expect(hooks.findBuildTile({ ...state, players: { ...state.players, p1: { ...state.players.p1, baseId: 'missing' } } }, 'p1', 'cover')).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
        expect(hooks.getBuildTileScore('per', { x: 7, y: 4 }, state.structures['base-1'], state.structures['base-2'])).toBeGreaterThan(0)
        expect(hooks.getBuildTileScore('custom', { x: 7, y: 4 }, state.structures['base-1'], null)).toBe(1)
        expect(hooks.canBuild(state, state.players.p1, 'cover')).toBe(true)
        expect(hooks.canBuild(state, state.players.p1, 'custom')).toBe(true)
        expect(hooks.canBuild({ ...state, structures: { ...state.structures, 'base-1': { ...state.structures['base-1'], level: 1 } } }, state.players.p1, 'taraque')).toBe(false)
        expect(hooks.highestStructureLevel({ structures: undefined }, 'p1', 'taraque')).toBe(0)
        expect(hooks.countStructures(Object.values(state.structures), 'cover')).toBe(3)
        expect(hooks.getUpgradeCost(state, state.structures['base-1'])).toBe(1125)
        expect(hooks.getNearestEnemyBase({
            ...state,
            players: { ...state.players, p3: { ...state.players.p2, playerId: 'p3', alive: true } },
            structures: { ...state.structures, 'base-3': { ...state.structures['base-2'], structureId: 'base-3', ownerId: 'p3', x: 12, y: 12 } },
        }, 'p1', state.structures['base-1']).structureId).toBe('base-3')
        expect(hooks.getNearestEnemyBase({ ...state, structures: { 'base-1': state.structures['base-1'] } }, 'p1', state.structures['base-1'])).toBeNull()
        expect(hooks.getNearestEnemyBase({ ...state, players: undefined, structures: undefined }, 'p1', state.structures['base-1'])).toBeNull()
        expect(hooks.isOccupied(state, 4, 4)).toBe(true)
        expect(hooks.isOccupied({ ...state, units: { u1: { x: 3, y: 3 } } }, 3, 3)).toBe(true)
        expect(hooks.isOccupied({ ...state, players: { p1: { ...state.players.p1, x: 2, y: 2, avatarDeployed: true } } }, 2, 2)).toBe(true)
        expect(hooks.isOccupied({ structures: undefined, units: undefined, players: undefined }, 9, 9)).toBe(false)
        expect(hooks.isAvatarAvailable({ ...state.players.p1, avatarDeployed: true })).toBe(true)
        expect(hooks.isInsideMap(state, 0, 0)).toBe(true)
        expect(hooks.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
        expect(hooks.ratio(Infinity, 1)).toBe(0)
        expect(hooks.ratio(1, 0)).toBe(0)
        expect(hooks.clamp01(2)).toBe(1)
    })

    test('loads trained models and ranks commands through both agent methods', () => {
        const state = createAiState()
        const rede = carregarRedeTreinada()
        const outputs = rede.prever(extrairEntradasWarBase(state, 'p1'))
        const agent = createNeuralWarBaseAgent({ rede, cooldownMs: 0 })
        const networkAgent = createNeuralWarBaseAgent({ network: scoreAction('build-cover') })
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-ai-'))
        const rawModelPath = path.join(tmpDir, 'raw-model.json')
        fs.writeFileSync(rawModelPath, JSON.stringify(rede.toJSON()))

        expect(outputs).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(agent.decide({ state, playerId: 'p1' })).toHaveProperty('action')
        expect(agent.decidir({ state, playerId: 'p1' })).toHaveProperty('action')
        expect(networkAgent.cooldownMs).toBe(1000)
        expect(networkAgent.decide({ state, playerId: 'p1' })).toMatchObject({ action: 'build', structureType: 'cover' })
        expect(carregarRedeTreinada(rawModelPath).prever(extrairEntradasWarBase(state, 'p1'))).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(decidirComRede(scoreAction('build-cover'), state, 'p1')).toMatchObject({ action: 'build', structureType: 'cover' })
        expect(decidirComRede({ prever: () => [] }, state, 'p1')).toHaveProperty('action')
        expect(decidirComRede(scoreAction('wait'), state, 'missing')).toBeNull()
        expect(decidirComRede({ prever: () => WAR_BASE_AI_ACTIONS.map(action => action === 'wait' ? 1 : action === 'build-cover' ? 0.5 : 0) }, state, 'p1')).toMatchObject({ action: 'build', structureType: 'cover' })
    })

    test('builds and saves deterministic training models', () => {
        const random = criarGeradorAleatorio(1)
        const first = random()
        const second = random()
        const sample = exemplo(vetor({ coal: 1 }), 'capture')
        const smallDataset = [sample]
        const rede = treinarRede({ dataset: smallDataset, epocas: 1, seed: 2, taxaAprendizado: 0.05 })
        const customRede = treinarRede({ dataset: smallDataset, epocas: 1, aleatorio: () => 0.5 })
        const defaultDatasetRede = treinarRede({ epocas: 0 })
        const defaultEpochRede = treinarRede({ dataset: [] })
        const defaultRede = treinarRede()
        const modelo = criarModelo({ rede, dataset: smallDataset, trainedAt: '2026-05-21T00:00:00.000Z' })
        const defaultDatasetModelo = criarModelo({ rede, trainedAt: '2026-05-21T00:00:00.000Z' })
        const defaultModelo = criarModelo()
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-ai-model-'))
        const caminhoModelo = path.join(tmpDir, 'modelo.json')
        const caminhoModeloCriado = path.join(tmpDir, 'modelo-criado.json')
        const modeloVersionado = JSON.parse(fs.readFileSync('ai/agente-war-base/rede-treinada.json', 'utf8'))

        expect(first).not.toBe(second)
        expect(respostaParaAcao('capture')).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(sample.saidas[WAR_BASE_AI_ACTIONS.indexOf('capture')]).toBe(1)
        expect(dataset.length).toBeGreaterThan(1)
        expect(rede.prever(sample.entradas)).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(customRede.prever(sample.entradas)).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(defaultDatasetRede.prever(sample.entradas)).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(defaultEpochRede.prever(sample.entradas)).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(defaultRede.prever(sample.entradas)).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(modelo.examples).toBe(1)
        expect(defaultDatasetModelo.examples).toBe(dataset.length)
        expect(defaultModelo.examples).toBe(dataset.length)
        expect(salvarModelo({ caminhoModelo, modelo })).toBe(caminhoModelo)
        expect(JSON.parse(fs.readFileSync(caminhoModelo, 'utf8')).name).toBe('war-base-neural-agent')
        expect(salvarModelo({ caminhoModelo: caminhoModeloCriado, dataset: smallDataset, epocas: 1 })).toBe(caminhoModeloCriado)
        expect(salvarModelo({ modelo: modeloVersionado })).toBe(path.resolve('ai/agente-war-base/rede-treinada.json'))
        expect(salvarModelo()).toBe(path.resolve('ai/agente-war-base/rede-treinada.json'))
    })
})
