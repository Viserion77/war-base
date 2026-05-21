import { describe, expect, jest, test } from '@jest/globals'
import renderScreen, { __renderTestables, getStructureAt, getTileFromCanvasEvent, setupScreen } from '../public/render-screen.js'

function createContext() {
    const calls = []
    const context = new Proxy({}, {
        get(target, property) {
            if (!(property in target)) {
                target[property] = (...args) => calls.push([property, ...args])
            }
            return target[property]
        },
        set(target, property, value) {
            target[property] = value
            calls.push(['set:' + property, value])
            return true
        },
    })

    context.__calls = calls
    return context
}

function createCanvas(context) {
    return {
        width: 0,
        height: 0,
        style: {},
        attributes: {},
        setAttribute(name, value) {
            this.attributes[name] = value
        },
        getContext: jest.fn(() => context),
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    }
}

function createGameState() {
    const screen = { width: 12, height: 8, pixelsPerFields: 10 }
    const config = { buildRange: 6, captureRange: 2, captureDurationMs: 30000, maxPlayersPerRoom: 8 }
    const players = {
        p1: {
            playerId: 'p1',
            gamerTag: '<Alice>',
            color: '#1b9aaa',
            x: 2,
            y: 2,
            coal: 1200,
            knowledge: 100,
            alive: true,
            baseId: 'base-1',
            integrity: 120,
            maxIntegrity: 160,
            barrier: 20,
            maxBarrier: 40,
            respawnAt: null,
            activeCaptureUnitId: 'unit-1',
            avatarDeployed: true,
            order: { type: 'capture', structureId: 'cover-1' },
            unlocked: { cover: true, taraque: true, per: true, hef: true, tujai: true },
        },
        p2: {
            playerId: 'p2',
            gamerTag: 'Bob',
            color: '#ef476f',
            x: 9,
            y: 5,
            coal: 0,
            knowledge: 0,
            alive: true,
            baseId: 'base-2',
            integrity: 80,
            maxIntegrity: 160,
            barrier: 0,
            maxBarrier: 40,
            respawnAt: Date.now() + 5000,
            activeCaptureUnitId: null,
            avatarDeployed: true,
            order: null,
            unlocked: {},
        },
        p3: {
            playerId: 'p3',
            gamerTag: 'Carol',
            color: 'not-a-color',
            x: 8,
            y: 1,
            coal: 0,
            knowledge: 0,
            alive: false,
            baseId: 'base-3',
            integrity: 0,
            maxIntegrity: 160,
            barrier: 0,
            maxBarrier: 0,
            respawnAt: null,
            activeCaptureUnitId: null,
            avatarDeployed: false,
            order: null,
            unlocked: {},
        },
    }
    const structures = {
        'base-1': { structureId: 'base-1', ownerId: 'p1', type: 'base', x: 1, y: 1, level: 2, integrity: 900, maxIntegrity: 1000, barrier: 200, maxBarrier: 500, disabled: false, capture: null },
        'cover-1': { structureId: 'cover-1', ownerId: null, type: 'cover', x: 4, y: 1, level: 1, integrity: 0, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: true, capture: { playerId: 'p1', progressMs: 15000 } },
        'taraque-1': { structureId: 'taraque-1', ownerId: 'p1', type: 'taraque', x: 2, y: 1, level: 2, integrity: 350, maxIntegrity: 350, barrier: 150, maxBarrier: 150, disabled: false, capture: null },
        'per-1': { structureId: 'per-1', ownerId: 'p1', type: 'per', x: 3, y: 1, level: 1, integrity: 500, maxIntegrity: 500, barrier: 0, maxBarrier: 0, disabled: false, capture: null },
        'hef-1': { structureId: 'hef-1', ownerId: 'p1', type: 'hef', x: 5, y: 1, level: 1, integrity: 200, maxIntegrity: 200, barrier: 100, maxBarrier: 100, disabled: false, capture: null },
        'tujai-1': { structureId: 'tujai-1', ownerId: 'p1', type: 'tujai', x: 6, y: 1, level: 1, integrity: 200, maxIntegrity: 200, barrier: 0, maxBarrier: 0, disabled: false, capture: null },
        'base-2': { structureId: 'base-2', ownerId: 'p2', type: 'base', x: 10, y: 6, level: 1, integrity: 1000, maxIntegrity: 1000, barrier: 500, maxBarrier: 500, disabled: false, capture: null },
    }

    return {
        state: {
            hostKey: 'ABCDE',
            screen,
            config,
            players,
            structures,
            units: {
                'unit-1': { unitId: 'unit-1', ownerId: 'p1', type: 'capturer', x: 2, y: 2, integrity: 100, maxIntegrity: 160, barrier: 10, maxBarrier: 40 },
                'unit-2': { unitId: 'unit-2', ownerId: 'p2', type: 'zunim', x: 8, y: 6, integrity: 120, maxIntegrity: 150, barrier: 0, maxBarrier: 50 },
            },
            catalog: {
                structures: {
                    base: { label: 'Base', cost: 500 },
                    cover: { label: 'Cover', cost: 540, captureable: true },
                    taraque: { label: 'Taraque', cost: 320, requiresBaseLevel: 2 },
                    per: { label: 'Per', cost: 140, requiresResearch: 'per', attackRange: 20 },
                    hef: { label: 'Hef', cost: 200, requiresResearch: 'hef', attackRange: 10 },
                    tujai: { label: 'Tujai', cost: 600, requiresResearch: 'tujai' },
                    custom: { label: 'Custom', cost: 1 },
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
            logs: [{ message: '<evento>' }],
            winnerId: 'p1',
        },
    }
}

describe('render-screen', () => {
    test('sets up the canvas and maps canvas coordinates to tiles', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const game = { state: { screen: { width: 5, height: 4, pixelsPerFields: 10 } } }

        setupScreen(canvas, game)

        expect(canvas.width).toBe(50)
        expect(canvas.height).toBe(40)
        expect(canvas.style.aspectRatio).toBe('5 / 4')
        expect(canvas.attributes['aria-label']).toBe('Mapa da partida com 5 por 4 campos')
        expect(getTileFromCanvasEvent({ clientX: 60, clientY: 45 }, canvas, game)).toEqual({ x: 2, y: 2 })
        expect(getTileFromCanvasEvent({ clientX: -100, clientY: -100 }, canvas, game)).toEqual({ x: 0, y: 0 })
        expect(getTileFromCanvasEvent({ clientX: 1000, clientY: 1000 }, canvas, game)).toEqual({ x: 4, y: 3 })

        const minimalCanvas = { width: 0, height: 0 }
        setupScreen(minimalCanvas, game)
        expect(minimalCanvas.width).toBe(50)
    })

    test('finds structures by tile, including remembered structures', () => {
        const state = {
            structures: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } },
            memory: { structures: { remembered: { structureId: 'remembered', type: 'cover', x: 6, y: 6 } } },
        }

        expect(getStructureAt(state, 3, 4)).toBe(state.structures.b)
        expect(getStructureAt(state, 6, 6)).toMatchObject({ remembered: true, structureId: 'remembered' })
        expect(getStructureAt(state, 0, 0)).toBeNull()
    })

    test('renders terrain, entities, selection, ranges, and hud panels', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const hud = { innerHTML: '', __lastHtml: null }
        const game = createGameState()
        const requestAnimationFrame = jest.fn()

        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: { x: 4, y: 1 },
            selectedStructureId: 'cover-1',
        })

        expect(canvas.getContext).toHaveBeenCalledWith('2d')
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
        expect(context.__calls.some(call => call[0] === 'arc')).toBe(true)
        expect(context.__calls.some(call => call[0] === 'fillRect')).toBe(true)
        expect(hud.innerHTML).toContain('Sala ABCDE')
        expect(hud.innerHTML).toContain('Vencedor: &lt;Alice&gt;')
        expect(hud.innerHTML).toContain('Capturando Cover')
        expect(hud.innerHTML).toContain('Adicionar IA')
        expect(hud.innerHTML).toContain('Ligar autoplay')
        expect(hud.innerHTML).toContain('data-action="toggle-autoplay" data-enabled="true" title="Partida encerrada."')
        expect(hud.innerHTML).toContain('data-action="add-ai" title="Partida encerrada."')
        expect(hud.innerHTML).toContain('aria-label="Adicionar uma IA neural" disabled')
        expect(hud.innerHTML).toContain('&lt;evento&gt;')
        expect(hud.innerHTML).toContain('Estruturas')
        expect(hud.innerHTML).toContain('Unidades')
    })

    test('renders fog overlays and remembered structures', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const hud = { innerHTML: '', __lastHtml: null }
        const game = createGameState()
        game.state.fogMask = Array.from({ length: game.state.screen.height }, () => Array.from({ length: game.state.screen.width }, () => true))
        game.state.fogMask[2][2] = false
        game.state.fogMask[3][3] = false
        game.state.fogMask[4][4] = false
        game.state.memory = {
            structures: {
                'remembered-cover': { structureId: 'remembered-cover', ownerId: 'p2', type: 'cover', x: 4, y: 4, level: 1, disabled: false, seenAt: 1 },
                'remembered-per': { structureId: 'remembered-per', ownerId: 'p2', type: 'per', x: 3, y: 3, level: 1, disabled: false, seenAt: 1 },
            },
        }

        renderScreen(canvas, hud, game, jest.fn(), 'p1', {
            selectedTile: { x: 4, y: 4 },
            selectedStructureId: 'remembered-cover',
        })

        expect(__renderTestables.hasRememberedStructureAt(game.state, 4, 4)).toBe(true)
        expect(__renderTestables.hasRememberedStructureAt({ structures: { 'remembered-cover': { x: 4, y: 4 } }, memory: game.state.memory }, 4, 4)).toBe(false)
        expect(__renderTestables.hasRememberedStructureAt({ structures: {}, memory: null }, 4, 4)).toBe(false)
        expect(__renderTestables.isTileVisible(game.state.fogMask, 3, 3)).toBe(false)
        expect(__renderTestables.isTileVisible(null, 3, 3)).toBe(true)
        expect(__renderTestables.getRememberedStructureColor('#ef476f')).toMatch(/^#[0-9a-f]{6}$/)
        expect(__renderTestables.getRememberedStructureColor('bad')).toBe('#77736a')
        expect(__renderTestables.getRememberedStructureColor()).toBe('#77736a')
        expect(__renderTestables.getSelectedStructure(game.state, { selectedStructureId: 'remembered-cover' })).toMatchObject({ remembered: true })
        expect(__renderTestables.selectedPanel(game, game.state.players.p1, { ...game.state.memory.structures['remembered-cover'], remembered: true }, { selectedTile: { x: 4, y: 4 } })).toContain('Ultimo avistamento')
        expect(context.__calls.some(call => call[0] === 'set:fillStyle' && call[1] === 'rgba(22, 25, 28, 0.55)')).toBe(true)
        expect(context.__calls.some(call => call[0] === 'set:fillStyle' && call[1] === 'rgba(47, 51, 55, 0.30)')).toBe(true)
    })


    test('renders build placement states and clears hud when no player is active', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const hud = { innerHTML: '<p>old</p>', __lastHtml: '<p>old</p>' }
        const game = createGameState()
        const requestAnimationFrame = jest.fn()

        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: { x: 7, y: 1 },
            selectedStructureId: null,
        })
        expect(hud.innerHTML).toContain('Terreno livre para construir')

        game.state.hostKey = null
        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: null,
            selectedStructureId: null,
        })
        expect(hud.innerHTML).toBe('')
    })

    test('covers helper branches for disabled reasons, labels, and formatting', () => {
        const game = createGameState()
        const player = game.state.players.p1
        const cover = game.state.structures['cover-1']
        const base = game.state.structures['base-1']

        expect(__renderTestables.captureStatusPanel(null)).toBe('')
        expect(__renderTestables.getCaptureStatus({ state: { structures: {}, catalog: { structures: {} }, config: {} } }, 'p1')).toBeNull()
        expect(__renderTestables.getCaptureStatus(game, 'missing')).toBeNull()
        expect(__renderTestables.getResearchDisabledReason({ state: { catalog: { research: {} }, structures: {} } }, player, 'missing')).toBe('Pesquisa indisponivel.')
        expect(__renderTestables.getResearchDisabledReason(game, null, 'per')).toBe('Jogador fora da partida.')
        player.unlocked.per = true
        expect(__renderTestables.getResearchDisabledReason(game, player, 'per')).toBe('Per ja pesquisada.')
        player.unlocked.per = false
        game.state.structures['taraque-1'].level = 0
        expect(__renderTestables.getResearchDisabledReason(game, player, 'per')).toBe('Per requer Taraque nivel 1.')
        game.state.structures['taraque-1'].level = 1
        player.knowledge = 0
        expect(__renderTestables.getResearchDisabledReason(game, player, 'per')).toBe('Conhecimento insuficiente: precisa de 15.')
        player.knowledge = 100
        expect(__renderTestables.getResearchDisabledReason(game, player, 'per')).toBe('')

        expect(__renderTestables.addAiButton({ state: { ...game.state, winnerId: null } })).not.toContain('disabled')
        expect(__renderTestables.getAddAiDisabledReason({ state: { ...game.state, hostKey: null } })).toBe('Entre em uma sala primeiro.')
        expect(__renderTestables.getAddAiDisabledReason({ state: { ...game.state, winnerId: null, players: undefined } })).toBe('')
        expect(__renderTestables.getAddAiDisabledReason(game)).toBe('Partida encerrada.')
        const fullGame = createGameState()
        fullGame.state.winnerId = null
        fullGame.state.config.maxPlayersPerRoom = 3
        expect(__renderTestables.getAddAiDisabledReason(fullGame)).toBe('Sala cheia.')

        expect(__renderTestables.getSpawnNpcDisabledReason({ state: { catalog: { npcs: {} }, structures: {} } }, player, 'missing')).toBe('NPC indisponivel.')
        expect(__renderTestables.getSpawnNpcDisabledReason(game, null, 'zunim')).toBe('Jogador fora da partida.')
        player.unlocked.tujai = false
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'zunim')).toBe('Pesquise Tujai primeiro.')
        player.unlocked.tujai = true
        game.state.structures['tujai-1'].disabled = true
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'zunim')).toBe('Construa uma Tujai ativa primeiro.')
        game.state.structures['tujai-1'].disabled = false
        player.coal = 0
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'zunim')).toBe('Carvao insuficiente: precisa de 80.')
        player.coal = 1200
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'zunim')).toBe('')

        expect(__renderTestables.selectedPanel(game, player, null, { selectedTile: null })).toContain('Nenhum terreno')
        expect(__renderTestables.getUpgradeDisabledReason(player, game.state.structures['base-2'], 1)).toBe('Selecione uma construcao sua para upgrade.')
        expect(__renderTestables.getUpgradeDisabledReason(player, { ...cover, ownerId: 'p1' }, 1)).toBe('Esta construcao esta desativada.')
        expect(__renderTestables.getUpgradeDisabledReason({ ...player, coal: 0 }, base, 999)).toBe('Carvao insuficiente: precisa de 999.')
        expect(__renderTestables.getUpgradeDisabledReason(player, base, 1)).toBe('')

        expect(__renderTestables.getCaptureDisabledReason({ state: { catalog: { structures: {} } } }, player, { type: 'unknown' })).toBe('Esta construcao nao pode ser capturada.')
        expect(__renderTestables.getCaptureDisabledReason(game, null, cover)).toBe('Jogador fora da partida.')
        expect(__renderTestables.getCaptureDisabledReason(game, { ...player, respawnAt: Date.now() + 1000 }, cover)).toContain('Avatar reaparece')
        expect(__renderTestables.getCaptureDisabledReason(game, player, { ...cover, ownerId: 'p1', disabled: false })).toBe('Esta construcao ja e sua.')
        expect(__renderTestables.getCaptureDisabledReason(game, player, { ...cover, ownerId: 'p1', disabled: true })).toBe('Construcao sua desativada.')
        expect(__renderTestables.getCaptureDisabledReason(game, player, cover)).toBe('Ordem de captura ja ativa.')
        expect(__renderTestables.getCaptureDisabledReason(game, { ...player, order: null }, cover)).toBe('')

        expect(__renderTestables.logsList({ state: { logs: [] } })).toContain('Sem eventos')
        expect(__renderTestables.logsList({ state: { logs: [{ at: '2020-01-01T13:05:00.000Z', message: '<evento>' }] } })).toContain('<time>13:05</time>')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: { x: 7, y: 1 } }, 'missing')).toBe('Construcao indisponivel.')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: null }, 'cover')).toBe('Selecione um terreno.')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: { x: -1, y: 0 } }, 'cover')).toBe('Terreno invalido.')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: { x: 50, y: 50 } }, 'cover')).toBe('Terreno invalido.')
        expect(__renderTestables.getBuildDisabledReason(game, { ...player, alive: false }, { selectedTile: { x: 7, y: 1 } }, 'cover')).toBe('Jogador fora da partida.')
        expect(__renderTestables.getBuildDisabledReason(game, { ...player, coal: 0 }, { selectedTile: { x: 7, y: 1 } }, 'cover')).toBe('Carvao insuficiente: precisa de 540.')
        expect(__renderTestables.getBuildRequirementMessage(game, player, 'taraque')).toBe('Base nivel 2 necessaria.')
        player.unlocked.per = false
        expect(__renderTestables.getBuildRequirementMessage(game, player, 'per')).toBe('Pesquise Per primeiro.')
        expect(__renderTestables.getBuildRequirementMessage(game, { ...player, unlocked: { custom: false } }, 'custom')).toBe('Custom ainda nao liberada.')

        expect(__renderTestables.getSelectionColor(null).stroke).toBe('#f6bd16')
        expect(__renderTestables.getSelectionColor({ status: 'blocked' }).stroke).toBe('#d1495b')
        expect(__renderTestables.canBuild(game, player, 'cover')).toBe(true)
        expect(__renderTestables.highestStructureLevel(game.state, 'p1', 'taraque')).toBe(1)
        expect(__renderTestables.getSelectedStructure(game.state, { selectedTile: null })).toBeNull()
        expect(__renderTestables.getActorAt(game.state, 8, 6)).toBe(game.state.units['unit-2'])
        expect(__renderTestables.playerStatusLabel(null)).toBe('fora')
        expect(__renderTestables.playerStatusLabel({ alive: true, avatarDeployed: true })).toBe('ativa')
        expect(__renderTestables.getRespawnRemainingSeconds(null)).toBe(0)
        expect(__renderTestables.isAvatarAvailable(player)).toBe(true)
        expect(__renderTestables.isNearOwnedAnchor(game.state, 'missing', 1, 1)).toBe(false)
        expect(__renderTestables.isInsideMap(game.state, 0, 0)).toBe(true)
        expect(__renderTestables.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
        expect(__renderTestables.getStructureWeight('unknown')).toBe(10)
        game.state.structures['disabled-owned'] = { ...game.state.structures['base-1'], structureId: 'disabled-owned', disabled: true }
        expect(__renderTestables.getPlayerStructureCount(game.state, 'p1')).toBe(5)
        expect(__renderTestables.getPlayerStructureCount({ structures: undefined }, 'p1')).toBe(0)
        expect(__renderTestables.getPlayerUnitCount(game.state, 'p1')).toBe(1)
        expect(__renderTestables.getPlayerUnitCount({ units: undefined }, 'p1')).toBe(0)
        expect(__renderTestables.formatLogTime()).toBe('')
        expect(__renderTestables.formatLogTime('invalid')).toBe('')
        expect(__renderTestables.formatLogTime('2020-01-01T13:05:00.000Z')).toBe('13:05')
        expect(__renderTestables.formatNumber(1234.9)).toBe('1.234')
        expect(__renderTestables.formatNumber(Infinity)).toBe('0')
        expect(__renderTestables.clamp(7, 0, 4)).toBe(4)
        expect(__renderTestables.hexToRgba('bad', 0.5)).toBe('rgba(27, 154, 170, 0.5)')
        expect(__renderTestables.escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#039;')
    })


    test('covers remaining render branches for raf, empty ranges, null hud and helper fallbacks', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const game = createGameState()
        let rafCalls = 0
        const requestAnimationFrame = jest.fn(callback => {
            rafCalls += 1
            if (rafCalls === 1) {
                callback()
            }
        })

        renderScreen(canvas, null, game, requestAnimationFrame, 'missing', {
            selectedTile: { x: 7, y: 1 },
            selectedStructureId: null,
        })
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

        renderScreen(canvas, { innerHTML: '', __lastHtml: '' }, { state: { ...game.state, structures: {} } }, jest.fn(), 'p1', {
            selectedTile: { x: 7, y: 1 },
            selectedStructureId: null,
        })

        game.state.structures['cover-2'] = { ...game.state.structures['cover-1'], structureId: 'cover-2', x: 5, y: 1, capture: { playerId: 'p1', progressMs: 20000 } }
        expect(__renderTestables.getCaptureStatus(game, 'p1').percent).toBe(67)
        expect(__renderTestables.getBuildDisabledReason(game, game.state.players.p1, { selectedTile: { x: 7, y: 1 } }, 'custom')).toBe('Custom ainda nao liberada.')
        expect(__renderTestables.getBuildRequirementMessage(game, { ...game.state.players.p1, unlocked: { custom: true } }, 'custom')).toBe('Custom indisponivel.')
        expect(__renderTestables.getPlacementStatus(game.state, game.state.players.p1, { selectedTile: null })).toEqual({ status: 'blocked', message: 'Selecione um terreno.' })
        expect(__renderTestables.getPlacementStatus(game.state, game.state.players.p1, { selectedTile: { x: 11, y: 7 } })).toEqual({ status: 'blocked', message: 'Fora do alcance de construcao.' })
        expect(__renderTestables.canBuild(game, { ...game.state.players.p1, unlocked: { custom: true } }, 'custom')).toBe(true)
        expect(__renderTestables.getActorAt(game.state, 2, 2)).toBe(game.state.players.p1)
        game.state.players.p2.connected = false
        expect(__renderTestables.playersList(game, 'p1')).toContain('offline')
        game.state.players.ai = { ...game.state.players.p2, playerId: 'ai', gamerTag: 'Bot', isAi: true, connected: true, alive: true }
        expect(__renderTestables.playersList(game, 'p1')).toContain('<small>IA</small>')
        game.state.players.p1.autoplay = true
        expect(__renderTestables.playersList(game, 'p1')).toContain('<small>Autoplay</small>')
        expect(__renderTestables.getBuildDisabledReason(game, game.state.players.p1, { selectedTile: { x: 7, y: 1 } }, 'cover')).toBe('Autoplay ligado.')
        expect(__renderTestables.autoplayButton({ state: { ...game.state, winnerId: null } }, game.state.players.p1)).toContain('Desligar autoplay')
        expect(__renderTestables.playerStatusLabel({ alive: true, activeCaptureUnitId: null, avatarDeployed: false })).toBe('pronta')
    })

    test('covers alternate render branches for fallbacks and enabled controls', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const hud = { innerHTML: '', __lastHtml: '' }
        const requestAnimationFrame = jest.fn()
        const game = createGameState()

        expect(getStructureAt({}, 1, 1)).toBeNull()

        renderScreen(canvas, hud, { state: { ...game.state, hostKey: null, structures: undefined } }, requestAnimationFrame, 'p1', {
            selectedTile: { x: 7, y: 1 },
            selectedStructureId: null,
        })
        expect(hud.innerHTML).toBe('')

        game.state.winnerId = null
        game.state.structures['neutral-active'] = { structureId: 'neutral-active', ownerId: null, type: 'cover', x: 7, y: 2, level: 1, integrity: 300, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: false, capture: null }
        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'base-1',
        })
        const firstHtml = hud.innerHTML
        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'base-1',
        })
        expect(hud.innerHTML).toBe(firstHtml)
        expect(hud.innerHTML).not.toContain('Vencedor')
        expect(hud.innerHTML).toContain('Upgrade 1125')

        const deadPlayerGame = createGameState()
        renderScreen(canvas, { innerHTML: '', __lastHtml: null }, deadPlayerGame, jest.fn(), 'p3', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'base-1',
        })

        const captureFallbackGame = {
            state: {
                structures: {
                    mystery: { structureId: 'mystery', ownerId: null, type: 'mystery', capture: { playerId: 'p1', progressMs: 10 } },
                },
                catalog: { structures: {} },
                config: { captureDurationMs: 0 },
            },
        }
        expect(__renderTestables.getCaptureStatus(captureFallbackGame, 'p1')).toMatchObject({ label: 'mystery', percent: 100 })
        expect(__renderTestables.getCaptureStatus({ state: { structures: undefined, catalog: { structures: {} }, config: {} } }, 'p1')).toBeNull()

        game.state.structures['unknown-shape'] = { structureId: 'unknown-shape', ownerId: 'p1', type: 'custom', x: 8, y: 2, level: 1, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, disabled: false, capture: null }
        game.state.units['unit-without-owner'] = { unitId: 'unit-without-owner', ownerId: 'missing', type: 'zunim', x: 9, y: 2, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0 }
        renderScreen(canvas, { innerHTML: '', __lastHtml: null }, game, jest.fn(), 'p1', { selectedTile: null, selectedStructureId: null })

        const player = { ...game.state.players.p1, order: null, coal: 5000 }
        const researchReadyPlayer = { ...player, unlocked: { ...player.unlocked, per: false }, knowledge: 100 }
        expect(__renderTestables.researchButton(game, researchReadyPlayer, 'per')).not.toContain('disabled')
        expect(__renderTestables.researchButton({ state: { catalog: { research: {} }, structures: {} } }, player, 'missing')).toContain('missing')
        expect(__renderTestables.npcButton({ state: { catalog: { npcs: {}, structures: {} }, structures: {} } }, player, 'missing')).toContain('missing')
        expect(__renderTestables.selectedPanel(game, player, game.state.structures['base-1'], { selectedTile: { x: 1, y: 1 } })).not.toContain('Iniciar captura')
        expect(__renderTestables.selectedPanel(game, { ...player, order: null }, game.state.structures['cover-1'], { selectedTile: { x: 4, y: 1 } })).toContain('Iniciar captura')
        expect(__renderTestables.getBuildRequirementMessage({ state: { catalog: { structures: { tower: { label: 'Tower', requiresResearch: 'missing' } }, research: {} } } }, player, 'tower')).toBe('Pesquise missing primeiro.')
        expect(__renderTestables.highestStructureLevel({ structures: undefined }, 'p1', 'taraque')).toBe(0)
        expect(__renderTestables.getActorAt({ players: undefined, units: undefined }, 0, 0)).toBeNull()
        expect(__renderTestables.isNearOwnedAnchor({ structures: undefined, config: { buildRange: 1 } }, 'p1', 0, 0)).toBe(false)
    })


})
