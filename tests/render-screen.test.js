import { describe, expect, jest, test } from '@jest/globals'
import renderScreen, { __renderTestables, getStructureAt, getTileFromCanvasEvent, setupScreen } from '../public/render-screen.js'
import { __resetI18nForTests, getLang, onLangChange, setLang, t } from '../public/i18n/index.js'

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
            gold: 1200,
            wisdom: 100,
            alive: true,
            castleId: 'castle-1',
            integrity: 120,
            maxIntegrity: 160,
            barrier: 20,
            maxBarrier: 40,
            respawnAt: null,
            activeCaptureUnitId: 'unit-1',
            avatarDeployed: true,
            order: { type: 'capture', structureId: 'mine-1' },
            unlocked: { mine: true, library: true, archer: true, catapult: true, barracks: true },
        },
        p2: {
            playerId: 'p2',
            gamerTag: 'Bob',
            color: '#ef476f',
            x: 9,
            y: 5,
            gold: 0,
            wisdom: 0,
            alive: true,
            castleId: 'castle-2',
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
            gold: 0,
            wisdom: 0,
            alive: false,
            castleId: 'castle-3',
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
        'castle-1': { structureId: 'castle-1', ownerId: 'p1', type: 'castle', x: 1, y: 1, level: 2, integrity: 900, maxIntegrity: 1000, barrier: 200, maxBarrier: 500, disabled: false, capture: null },
        'mine-1': { structureId: 'mine-1', ownerId: null, type: 'mine', x: 4, y: 1, level: 1, integrity: 0, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: true, capture: { playerId: 'p1', progressMs: 15000 } },
        'library-1': { structureId: 'library-1', ownerId: 'p1', type: 'library', x: 2, y: 1, level: 2, integrity: 350, maxIntegrity: 350, barrier: 150, maxBarrier: 150, disabled: false, capture: null },
        'archer-1': { structureId: 'archer-1', ownerId: 'p1', type: 'archer', x: 3, y: 1, level: 1, integrity: 500, maxIntegrity: 500, barrier: 0, maxBarrier: 0, disabled: false, capture: null },
        'catapult-1': { structureId: 'catapult-1', ownerId: 'p1', type: 'catapult', x: 5, y: 1, level: 1, integrity: 200, maxIntegrity: 200, barrier: 100, maxBarrier: 100, disabled: false, capture: null },
        'barracks-1': { structureId: 'barracks-1', ownerId: 'p1', type: 'barracks', x: 6, y: 1, level: 1, integrity: 200, maxIntegrity: 200, barrier: 0, maxBarrier: 0, disabled: false, capture: null },
        'castle-2': { structureId: 'castle-2', ownerId: 'p2', type: 'castle', x: 10, y: 6, level: 1, integrity: 1000, maxIntegrity: 1000, barrier: 500, maxBarrier: 500, disabled: false, capture: null },
    }

    return {
        state: {
            hostKey: 'ABCDE',
            screen,
            config,
            players,
            structures,
            units: {
                'unit-1': { unitId: 'unit-1', ownerId: 'p1', type: 'herald', x: 2, y: 2, integrity: 100, maxIntegrity: 160, barrier: 10, maxBarrier: 40 },
                'unit-2': { unitId: 'unit-2', ownerId: 'p2', type: 'soldier', x: 8, y: 6, integrity: 120, maxIntegrity: 150, barrier: 0, maxBarrier: 50 },
            },
            catalog: {
                structures: {
                    castle: { label: 'Castle', cost: 500 },
                    mine: { label: 'Mine', cost: 540, captureable: true },
                    library: { label: 'Library', cost: 320, requiresCastleLevel: 2 },
                    archer: { label: 'Archer', cost: 140, requiresResearch: 'archer', attackRange: 20 },
                    catapult: { label: 'Catapult', cost: 200, requiresResearch: 'catapult', attackRange: 10 },
                    barracks: { label: 'Barracks', cost: 600, requiresResearch: 'barracks' },
                    custom: { label: 'Custom', cost: 1 },
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
                },
            },
            logs: [{ message: '<evento>' }],
            winnerId: 'p1',
        },
    }
}

describe('render-screen', () => {
    test('translates and persists language selection', () => {
        const storage = new Map()
        const hadStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
        const previousStorage = globalThis.localStorage
        globalThis.localStorage = {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
        }

        __resetI18nForTests()
        const listener = jest.fn()
        const unsubscribe = onLangChange(listener)

        expect(getLang()).toBe('pt-BR')
        expect(t('structure.mine.label')).toBe('Mina')
        expect(t('hud.tile', { x: 1, y: 2 })).toBe('Terreno 1, 2')

        setLang('en')
        expect(getLang()).toBe('en')
        expect(storage.get('war-base:lang')).toBe('en')
        expect(listener).toHaveBeenCalledWith('en')
        expect(t('structure.mine.label')).toBe('Mine')
        expect(t('missing.key')).toBe('missing.key')

        setLang('missing')
        expect(getLang()).toBe('en')

        unsubscribe()
        __resetI18nForTests()
        if (hadStorage) {
            globalThis.localStorage = previousStorage
        } else {
            delete globalThis.localStorage
        }
    })

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

    test('draws terrain and structures from image assets when loaded', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const game = createGameState()
        const terrainImage = { complete: true, naturalWidth: 1536 }
        const spriteSheet = { complete: true, naturalWidth: 384 }
        const unitSpriteSheet = { complete: true, naturalWidth: 128 }

        __renderTestables.setRenderAssetsForTests({ terrainImage, structureSpriteSheet: spriteSheet, unitSpriteSheet })
        renderScreen(canvas, { innerHTML: '', __lastHtml: null }, game, jest.fn(), 'p1', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'castle-1',
        })
        __renderTestables.setRenderAssetsForTests()

        expect(context.__calls.filter(call => call[0] === 'drawImage').length).toBeGreaterThan(1)
        expect(__renderTestables.isImageReady(terrainImage)).toBe(true)
        expect(__renderTestables.isImageReady(spriteSheet)).toBe(true)
        expect(__renderTestables.isImageReady(unitSpriteSheet)).toBe(true)
        expect(__renderTestables.drawTerrainImage(context, 100, 50)).toBe(false)
        expect(__renderTestables.drawStructureSprite(context, 'missing', 0, 0, 10, '#000')).toBe(false)
        expect(__renderTestables.drawUnitSprite(context, 'missing', 0, 0, 10, '#000')).toBe(false)

        const roadMap = __renderTestables.buildRoadMap(game.state)
        expect(roadMap.has(__renderTestables.tileKey(1, 1))).toBe(true)
        expect(roadMap.has(__renderTestables.tileKey(6, 1))).toBe(true)
        expect(__renderTestables.getRoadMask(roadMap, 2, 1)).toBe(10)
    })

    test('finds structures by tile, including remembered structures', () => {
        const state = {
            structures: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } },
            memory: { structures: { remembered: { structureId: 'remembered', type: 'mine', x: 6, y: 6 } } },
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
            selectedStructureId: 'mine-1',
        })

        expect(canvas.getContext).toHaveBeenCalledWith('2d')
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
        expect(context.__calls.some(call => call[0] === 'arc')).toBe(true)
        expect(context.__calls.some(call => call[0] === 'fillRect')).toBe(true)
        expect(hud.innerHTML).toContain('Sala ABCDE')
        expect(hud.innerHTML).toContain('Vencedor: &lt;Alice&gt;')
        expect(hud.innerHTML).toContain('Capturando Mina')
        expect(hud.innerHTML).toContain('Adicionar IA')
        expect(hud.innerHTML).toContain('Ligar autoplay')
        expect(hud.innerHTML).toContain('data-action="toggle-autoplay" data-enabled="true" title="Partida encerrada."')
        expect(hud.innerHTML).toContain('data-action="add-ai" title="Partida encerrada."')
        expect(hud.innerHTML).toContain('aria-label="Adicionar uma IA neural a esta sala." disabled')
        expect(hud.innerHTML).toContain('&lt;evento&gt;')
        expect(hud.innerHTML).toContain('Estruturas')
        expect(hud.innerHTML).toContain('Unidades')
        expect(hud.innerHTML).toContain('0/5')
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
                'remembered-mine': { structureId: 'remembered-mine', ownerId: 'p2', type: 'mine', x: 4, y: 4, level: 1, disabled: false, seenAt: 1 },
                'remembered-archer': { structureId: 'remembered-archer', ownerId: 'p2', type: 'archer', x: 3, y: 3, level: 1, disabled: false, seenAt: 1 },
            },
        }

        renderScreen(canvas, hud, game, jest.fn(), 'p1', {
            selectedTile: { x: 4, y: 4 },
            selectedStructureId: 'remembered-mine',
        })

        expect(__renderTestables.hasRememberedStructureAt(game.state, 4, 4)).toBe(true)
        expect(__renderTestables.hasRememberedStructureAt({ structures: { 'remembered-mine': { x: 4, y: 4 } }, memory: game.state.memory }, 4, 4)).toBe(false)
        expect(__renderTestables.hasRememberedStructureAt({ structures: {}, memory: null }, 4, 4)).toBe(false)
        expect(__renderTestables.isTileVisible(game.state.fogMask, 3, 3)).toBe(false)
        expect(__renderTestables.isTileVisible(null, 3, 3)).toBe(true)
        expect(__renderTestables.getRememberedStructureColor('#ef476f')).toMatch(/^#[0-9a-f]{6}$/)
        expect(__renderTestables.getRememberedStructureColor('bad')).toBe('#77736a')
        expect(__renderTestables.getRememberedStructureColor()).toBe('#77736a')
        expect(__renderTestables.getSelectedStructure(game.state, { selectedStructureId: 'remembered-mine' })).toMatchObject({ remembered: true })
        expect(__renderTestables.selectedPanel(game, game.state.players.p1, { ...game.state.memory.structures['remembered-mine'], remembered: true }, { selectedTile: { x: 4, y: 4 } })).toContain('Ultimo avistamento')
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
        const mine = game.state.structures['mine-1']
        const castle = game.state.structures['castle-1']

        expect(__renderTestables.captureStatusPanel(null)).toBe('')
        expect(__renderTestables.getCaptureStatus({ state: { structures: {}, catalog: { structures: {} }, config: {} } }, 'p1')).toBeNull()
        expect(__renderTestables.getCaptureStatus(game, 'missing')).toBeNull()
        expect(__renderTestables.getResearchDisabledReason({ state: { catalog: { research: {} }, structures: {} } }, player, 'missing')).toBe('Pesquisa indisponivel.')
        expect(__renderTestables.getResearchDisabledReason(game, null, 'archer')).toBe('Jogador fora da partida.')
        player.unlocked.archer = true
        expect(__renderTestables.getResearchDisabledReason(game, player, 'archer')).toBe('Tiro de Arqueiro ja pesquisada.')
        player.unlocked.archer = false
        game.state.structures['library-1'].level = 0
        expect(__renderTestables.getResearchDisabledReason(game, player, 'archer')).toBe('Tiro de Arqueiro requer Biblioteca nivel 1.')
        game.state.structures['library-1'].level = 1
        player.wisdom = 0
        expect(__renderTestables.getResearchDisabledReason(game, player, 'archer')).toBe('Sabedoria insuficiente: precisa de 15.')
        player.wisdom = 100
        expect(__renderTestables.getResearchDisabledReason(game, player, 'archer')).toBe('')
        player.autoplay = true
        expect(__renderTestables.getResearchDisabledReason(game, player, 'archer')).toBe('Autoplay ligado.')
        player.autoplay = false

        expect(__renderTestables.addAiButton({ state: { ...game.state, winnerId: null } })).not.toContain('disabled')
        expect(__renderTestables.getAddAiDisabledReason({ state: { ...game.state, hostKey: null } })).toBe('Entre em uma sala primeiro.')
        expect(__renderTestables.getAddAiDisabledReason({ state: { ...game.state, winnerId: null, players: undefined } })).toBe('')
        expect(__renderTestables.getAddAiDisabledReason(game)).toBe('Partida encerrada.')
        expect(__renderTestables.getAutoplayDisabledReason({ state: { ...game.state, hostKey: null } }, player)).toBe('Entre em uma sala primeiro.')
        expect(__renderTestables.getAutoplayDisabledReason({ state: { ...game.state, winnerId: null } }, null)).toBe('Jogador fora da partida.')
        expect(__renderTestables.getAutoplayDisabledReason({ state: { ...game.state, winnerId: null } }, { ...player, isAi: true })).toBe('IA ja controla este jogador.')
        const fullGame = createGameState()
        fullGame.state.winnerId = null
        fullGame.state.config.maxPlayersPerRoom = 3
        expect(__renderTestables.getAddAiDisabledReason(fullGame)).toBe('Sala cheia.')

        expect(__renderTestables.getSpawnNpcDisabledReason({ state: { catalog: { npcs: {} }, structures: {} } }, player, 'missing')).toBe('Unidade indisponivel.')
        expect(__renderTestables.getSpawnNpcDisabledReason(game, null, 'soldier')).toBe('Jogador fora da partida.')
        player.unlocked.barracks = false
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'soldier')).toBe('Pesquise Treinamento Militar primeiro.')
        player.unlocked.barracks = true
        player.autoplay = true
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'soldier')).toBe('Autoplay ligado.')
        player.autoplay = false
        game.state.structures['barracks-1'].disabled = true
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'soldier')).toBe('Construa um Quartel ativo primeiro.')
        game.state.structures['barracks-1'].disabled = false
        player.gold = 0
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'soldier')).toBe('Ouro insuficiente: precisa de 80.')
        player.gold = 1200
        expect(__renderTestables.getSpawnNpcDisabledReason(game, player, 'soldier')).toBe('')

        expect(__renderTestables.selectedPanel(game, player, null, { selectedTile: null })).toContain('Nenhum terreno')
        expect(__renderTestables.getUpgradeDisabledReason(player, game.state.structures['castle-2'], 1)).toBe('Selecione uma construcao sua para evoluir.')
        expect(__renderTestables.getUpgradeDisabledReason(player, { ...mine, ownerId: 'p1' }, 1)).toBe('Esta construcao esta desativada.')
        expect(__renderTestables.getUpgradeDisabledReason({ ...player, autoplay: true }, { ...game.state.structures['archer-1'], level: 1 }, 1, 2)).toBe('Autoplay ligado.')
        expect(__renderTestables.getUpgradeDisabledReason(player, { ...game.state.structures['archer-1'], level: 2 }, 1, 2)).toBe('Bloqueado: nivel da estrutura ja igual ao nivel do Castelo.')
        expect(__renderTestables.getUpgradeDisabledReason({ ...player, gold: 0 }, castle, 999)).toBe('Ouro insuficiente: precisa de 999.')
        expect(__renderTestables.getUpgradeDisabledReason(player, castle, 1)).toBe('')

        expect(__renderTestables.logsList({ state: { logs: [] } })).toContain('Sem eventos')
        expect(__renderTestables.logsList({ state: { logs: [{ at: '2020-01-01T13:05:00.000Z', message: '<evento>' }] } })).toContain('<time>13:05</time>')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: { x: 7, y: 1 } }, 'missing')).toBe('Construcao indisponivel.')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: null }, 'mine')).toBe('Selecione um terreno.')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: { x: -1, y: 0 } }, 'mine')).toBe('Terreno invalido.')
        expect(__renderTestables.getBuildDisabledReason(game, player, { selectedTile: { x: 50, y: 50 } }, 'mine')).toBe('Terreno invalido.')
        expect(__renderTestables.getBuildDisabledReason(game, { ...player, alive: false }, { selectedTile: { x: 7, y: 1 } }, 'mine')).toBe('Jogador fora da partida.')
        expect(__renderTestables.getBuildDisabledReason(game, { ...player, gold: 0 }, { selectedTile: { x: 7, y: 1 } }, 'mine')).toBe('Ouro insuficiente: precisa de 540.')
        const limitGame = createGameState()
        limitGame.state.catalog.limits.mine = { current: 5, max: 5 }
        expect(__renderTestables.getBuildDisabledReason(limitGame, limitGame.state.players.p1, { selectedTile: { x: 7, y: 1 } }, 'mine')).toBe('5/5 - suba o Castelo.')
        expect(__renderTestables.getBuildRequirementMessage(limitGame, limitGame.state.players.p1, 'mine')).toBe('5/5 - suba o Castelo.')
        expect(__renderTestables.canBuild(limitGame, limitGame.state.players.p1, 'mine')).toBe(false)
        expect(__renderTestables.canBuild(limitGame, null, 'mine')).toBe(false)
        expect(__renderTestables.canBuild(limitGame, limitGame.state.players.p1, 'missing')).toBe(false)
        expect(__renderTestables.buildButton(limitGame, limitGame.state.players.p1, { selectedTile: { x: 7, y: 1 } }, 'mine')).toContain('limit-full')
        limitGame.state.catalog.limits.mine = { current: 6, max: 5 }
        expect(__renderTestables.getBuildLimitDisabledReason(limitGame, 'mine')).toBe('6/5 - sem novos slots ate cair abaixo do limite.')
        expect(__renderTestables.buildButton(limitGame, limitGame.state.players.p1, { selectedTile: { x: 7, y: 1 } }, 'mine')).toContain('limit-over')
        expect(__renderTestables.getBuildLimitClass(null)).toBe('')
        expect(__renderTestables.getBuildLimitDisabledReason({ state: { catalog: {} } }, 'mine')).toBe('')

        expect(__renderTestables.getBuildRequirementMessage(game, player, 'library')).toBe('Castelo nivel 2 necessario.')
        player.unlocked.archer = false
        expect(__renderTestables.getBuildRequirementMessage(game, player, 'archer')).toBe('Pesquise Tiro de Arqueiro primeiro.')
        expect(__renderTestables.getBuildRequirementMessage(game, { ...player, unlocked: { custom: false } }, 'custom')).toBe('Custom ainda nao liberada.')

        expect(__renderTestables.getSelectionColor(null).stroke).toBe('#f6bd16')
        expect(__renderTestables.getSelectionColor({ status: 'blocked' }).stroke).toBe('#d1495b')
        expect(__renderTestables.canBuild(game, player, 'mine')).toBe(true)
        expect(__renderTestables.highestStructureLevel(game.state, 'p1', 'library')).toBe(1)
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
        game.state.structures['disabled-owned'] = { ...game.state.structures['castle-1'], structureId: 'disabled-owned', disabled: true }
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

        game.state.structures['mine-2'] = { ...game.state.structures['mine-1'], structureId: 'mine-2', x: 5, y: 1, capture: { playerId: 'p1', progressMs: 20000 } }
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
        expect(__renderTestables.getBuildDisabledReason(game, game.state.players.p1, { selectedTile: { x: 7, y: 1 } }, 'mine')).toBe('Autoplay ligado.')
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
        game.state.structures['neutral-active'] = { structureId: 'neutral-active', ownerId: null, type: 'mine', x: 7, y: 2, level: 1, integrity: 300, maxIntegrity: 300, barrier: 0, maxBarrier: 100, disabled: false, capture: null }
        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'castle-1',
        })
        const firstHtml = hud.innerHTML
        renderScreen(canvas, hud, game, requestAnimationFrame, 'p1', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'castle-1',
        })
        expect(hud.innerHTML).toBe(firstHtml)
        expect(hud.innerHTML).not.toContain('Vencedor')
        expect(hud.innerHTML).toContain('Evoluir 1125')

        const deadPlayerGame = createGameState()
        renderScreen(canvas, { innerHTML: '', __lastHtml: null }, deadPlayerGame, jest.fn(), 'p3', {
            selectedTile: { x: 1, y: 1 },
            selectedStructureId: 'castle-1',
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
        expect(__renderTestables.getCaptureStatus(captureFallbackGame, 'p1')).toMatchObject({ label: 'Mystery', percent: 100 })
        expect(__renderTestables.getCaptureStatus({ state: { structures: undefined, catalog: { structures: {} }, config: {} } }, 'p1')).toBeNull()

        game.state.structures['unknown-shape'] = { structureId: 'unknown-shape', ownerId: 'p1', type: 'custom', x: 8, y: 2, level: 1, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, disabled: false, capture: null }
        game.state.units['unit-without-owner'] = { unitId: 'unit-without-owner', ownerId: 'missing', type: 'soldier', x: 9, y: 2, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0 }
        renderScreen(canvas, { innerHTML: '', __lastHtml: null }, game, jest.fn(), 'p1', { selectedTile: null, selectedStructureId: null })

        const player = { ...game.state.players.p1, order: null, gold: 5000 }
        const researchReadyPlayer = { ...player, unlocked: { ...player.unlocked, archer: false }, wisdom: 100 }
        expect(__renderTestables.researchButton(game, researchReadyPlayer, 'archer')).not.toContain('disabled')
        expect(__renderTestables.researchButton({ state: { catalog: { research: {} }, structures: {} } }, player, 'missing')).toContain('missing')
        expect(__renderTestables.npcButton({ state: { catalog: { npcs: {}, structures: {} }, structures: {} } }, player, 'missing')).toContain('missing')
        expect(__renderTestables.selectedPanel(game, player, game.state.structures['castle-1'], { selectedTile: { x: 1, y: 1 } })).not.toContain('Iniciar captura')
        expect(__renderTestables.selectedPanel(game, { ...player, order: null }, game.state.structures['mine-1'], { selectedTile: { x: 4, y: 1 } })).not.toContain('Iniciar captura')
        expect(__renderTestables.getBuildRequirementMessage({ state: { catalog: { structures: { tower: { label: 'Tower', requiresResearch: 'missing' } }, research: {} } } }, player, 'tower')).toBe('Pesquise Missing primeiro.')
        expect(__renderTestables.highestStructureLevel({ structures: undefined }, 'p1', 'library')).toBe(0)
        expect(__renderTestables.getActorAt({ players: undefined, units: undefined }, 0, 0)).toBeNull()
        expect(__renderTestables.isNearOwnedAnchor({ structures: undefined, config: { buildRange: 1 } }, 'p1', 0, 0)).toBe(false)
    })


})
