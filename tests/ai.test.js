import { describe, expect, test } from '@jest/globals'
import Matriz from '../ai/rede-neural/matriz.js'
import RedeNeural from '../ai/rede-neural/rede-neural.js'
import {
    WAR_BASE_AI_ACTIONS,
    carregarRedeTreinada,
    criarComandoParaAcao,
    createNeuralWarBaseAgent,
    decidirComRede,
    extrairEntradasWarBase,
} from '../ai/agente-war-base/agente-neural.js'

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
                unlocked: { cover: true, taraque: true, per: true, hef: true, tujai: true },
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

describe('AI neural modules', () => {
    test('performs matrix math and serializes a neural network', () => {
        const first = new Matriz(2, 2, [[1, 2], [3, 4]])
        const second = new Matriz(2, 1, [[2], [1]])

        expect(Matriz.matrizParaArray(Matriz.multiplicar(first, second))).toEqual([4, 10])
        expect(Matriz.matrizParaArray(Matriz.adicionar(second, second))).toEqual([4, 2])
        expect(Matriz.matrizParaArray(Matriz.subtrair(second, second))).toEqual([0, 0])
        expect(Matriz.transpor(second).toJSON()).toMatchObject({ linhas: 1, colunas: 2 })

        const rede = new RedeNeural(2, 3, 1, { taxaAprendizado: 0.2, aleatorio: () => 0.75 })
        rede.treinar([1, 0], [1])
        const restored = RedeNeural.fromJSON(rede.toJSON())

        expect(restored.prever([1, 0])).toHaveLength(1)
    })

    test('extracts game features and creates playable commands', () => {
        const state = createAiState()

        expect(extrairEntradasWarBase(state, 'missing')).toEqual(expect.arrayContaining([0]))
        expect(extrairEntradasWarBase(state, 'p1')).toHaveLength(18)
        expect(criarComandoParaAcao('capture', state, 'p1')).toEqual({ action: 'capture', structureId: 'cover-neutral' })
        expect(criarComandoParaAcao('build-cover', state, 'p1')).toMatchObject({ action: 'build', structureType: 'cover' })
        expect(criarComandoParaAcao('upgrade-base', state, 'p1')).toEqual({ action: 'upgrade', structureId: 'base-1' })
        state.players.p1.unlocked.per = false
        expect(criarComandoParaAcao('research-per', state, 'p1')).toEqual({ action: 'research', recipe: 'per' })
        state.players.p1.unlocked.per = true
        expect(criarComandoParaAcao('spawn-zunim', state, 'p1')).toEqual({ action: 'spawn-npc', npcType: 'zunim' })
        expect(criarComandoParaAcao('wait', state, 'p1')).toBeNull()
    })

    test('loads the trained model and ranks commands through the agent', () => {
        const state = createAiState()
        const rede = carregarRedeTreinada()
        const outputs = rede.prever(extrairEntradasWarBase(state, 'p1'))
        const agent = createNeuralWarBaseAgent({ rede, cooldownMs: 0 })
        const fakeRede = {
            prever() {
                return WAR_BASE_AI_ACTIONS.map(action => action === 'build-cover' ? 1 : 0)
            },
        }

        expect(outputs).toHaveLength(WAR_BASE_AI_ACTIONS.length)
        expect(agent.decide({ state, playerId: 'p1' })).toHaveProperty('action')
        expect(decidirComRede(fakeRede, state, 'p1')).toMatchObject({ action: 'build', structureType: 'cover' })
    })
})
