import { describe, expect, jest, test } from '@jest/globals'
import createGame from '../public/game.js'

function getStructures(state, predicate) {
    return Object.values(state.structures).filter(predicate)
}

function getStructure(state, predicate) {
    return getStructures(state, predicate)[0]
}

function getPlayer(state, playerId) {
    return state.players[playerId]
}

describe('createGame', () => {
    test('creates a match with a public state for the host player', () => {
        const game = createGame()

        const result = game.createMatch({
            playerId: 'player-1',
            gamerTag: 'Alice',
        })

        expect(result.hostKey).toMatch(/^[A-Z0-9]{5}$/)
        expect(result.state.hostKey).toBe(result.hostKey)
        expect(result.state.players['player-1']).toMatchObject({
            gamerTag: 'Alice',
            connected: true,
            alive: true,
        })
        expect(game.getHostKeyForPlayer('player-1')).toBe(result.hostKey)
        expect(game.getRoomCount()).toBe(1)
        expect(result.state.logs[0].id).toBe(result.hostKey + '-1')
    })

    test('sanitizes gamer tags and host keys consistently', () => {
        const game = createGame()
        const match = game.createMatch({
            playerId: 'player-1',
            gamerTag: '  Alice   Base  ',
        })

        expect(match.state.players['player-1'].gamerTag).toBe('Alice Base')
        expect(game.__testing.normalizeHostKey(' ab-c_12!! ')).toBe('ABC12')
        expect(game.__testing.sanitizeGamerTag('\n\t', 'fallback-player')).toBe('Player fall')
    })

    test('lets a second player join an existing match', () => {
        const game = createGame()
        const match = game.createMatch({
            playerId: 'player-1',
            gamerTag: 'Alice',
        })

        const result = game.joinMatch({
            playerId: 'player-2',
            gamerTag: 'Bob',
            hostKey: match.hostKey.toLowerCase(),
        })

        expect(result.error).toBeUndefined()
        expect(result.hostKey).toBe(match.hostKey)
        expect(result.state.hasHadCombatants).toBe(true)
        expect(Object.keys(result.state.players)).toEqual(['player-1', 'player-2'])
        expect(game.getHostKeyForPlayer('player-2')).toBe(match.hostKey)
    })

    test('rejects joins for rooms that do not exist', () => {
        const game = createGame()

        const result = game.joinMatch({
            playerId: 'player-2',
            gamerTag: 'Bob',
            hostKey: 'ABCDE',
        })

        expect(result).toEqual({ error: 'Sala nao encontrada.' })
    })

    test('rejects joins when the room is full', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })

        for (let index = 2; index <= 8; index += 1) {
            expect(game.joinMatch({
                playerId: 'player-' + index,
                gamerTag: 'Player ' + index,
                hostKey: match.hostKey,
            }).error).toBeUndefined()
        }

        expect(game.joinMatch({
            playerId: 'player-9',
            gamerTag: 'Player 9',
            hostKey: match.hostKey,
        })).toEqual({ error: 'Sala cheia.' })
    })

    test('allows observers and timers to be cleaned up', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const commands = []
            const debugEntries = []
            const unsubscribe = game.subscribe(command => commands.push(command))
            const unsubscribeDebug = game.subscribeDebug(entry => debugEntries.push(entry))
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })

            unsubscribe()
            unsubscribe()
            unsubscribeDebug()
            unsubscribeDebug()
            game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
            game.start()
            game.stop()
            game.stop()
            jest.advanceTimersByTime(1000)

            expect(commands).toEqual([])
            expect(debugEntries).toEqual(expect.arrayContaining([
                expect.objectContaining({ event: 'game-log' }),
                expect.objectContaining({ event: 'match:create' }),
            ]))
            expect(debugEntries).not.toContainEqual(expect.objectContaining({ event: 'match:join-success' }))
        } finally {
            jest.useRealTimers()
        }
    })

    test('notifies observers and debug observers for state changes', () => {
        const game = createGame()
        const commands = []
        const debugEntries = []

        game.subscribe(command => commands.push(command))
        game.subscribeDebug(entry => debugEntries.push(entry))

        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })

        expect(commands).toContainEqual(expect.objectContaining({
            type: 'state-update',
            hostKey: match.hostKey,
            reason: 'join-match',
        }))
        expect(debugEntries).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'match:create', hostKey: match.hostKey }),
            expect.objectContaining({ event: 'match:join-success', hostKey: match.hostKey }),
        ]))
    })

    test('builds a cover and rejects unknown actions', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const base = getStructure(match.state, structure => structure.type === 'base' && structure.ownerId === 'player-1')

        game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'build',
            structureType: 'cover',
            x: base.x + 2,
            y: base.y,
        })
        game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'dance',
        })

        const state = game.getPublicState(match.hostKey)
        expect(getPlayer(state, 'player-1').coal).toBe(210)
        expect(getStructure(state, structure => structure.type === 'cover' && structure.ownerId === 'player-1')).toMatchObject({
            x: base.x + 2,
            y: base.y,
            disabled: false,
        })
        expect(state.logs[0].message).toBe('Alice: acao desconhecida: dance.')
    })

    test('upgrades the base and unlocks taraque', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const base = getStructure(match.state, structure => structure.type === 'base' && structure.ownerId === 'player-1')

        game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'upgrade',
            structureId: base.structureId,
        })

        const state = game.getPublicState(match.hostKey)
        expect(getStructure(state, structure => structure.structureId === base.structureId)).toMatchObject({
            level: 2,
            maxIntegrity: 1025,
            maxBarrier: 525,
        })
        expect(getPlayer(state, 'player-1')).toMatchObject({
            coal: 0,
            unlocked: expect.objectContaining({ taraque: true }),
        })
    })

    test('generates resources and researches a tower unlock', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
            const base = getStructure(match.state, structure => structure.type === 'base' && structure.ownerId === 'player-1')

            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'build',
                structureType: 'cover',
                x: base.x + 2,
                y: base.y,
            })
            game.start()
            jest.advanceTimersByTime(27000)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'upgrade',
                structureId: base.structureId,
            })
            jest.advanceTimersByTime(16000)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'build',
                structureType: 'taraque',
                x: base.x + 3,
                y: base.y,
            })
            jest.advanceTimersByTime(8000)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'research',
                recipe: 'per',
            })

            let state = game.getPublicState(match.hostKey)
            expect(getPlayer(state, 'player-1').unlocked.per).toBe(true)
            expect(getPlayer(state, 'player-1').knowledge).toBe(1)
            expect(getStructure(state, structure => structure.type === 'taraque' && structure.ownerId === 'player-1')).toBeDefined()

            const neutralCover = getStructure(state, structure => structure.type === 'cover' && structure.ownerId === null)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'capture',
                structureId: neutralCover.structureId,
            })
            jest.advanceTimersByTime(80000)
            state = game.getPublicState(match.hostKey)
            const capturedCover = getStructure(state, structure => structure.structureId === neutralCover.structureId)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'build',
                structureType: 'per',
                x: capturedCover.x + 5,
                y: capturedCover.y,
            })
            jest.advanceTimersByTime(1000)

            state = game.getPublicState(match.hostKey)
            const bobBase = getStructure(state, structure => structure.type === 'base' && structure.ownerId === 'player-2')
            expect(bobBase.barrier).toBeLessThan(bobBase.maxBarrier)
        } finally {
            jest.useRealTimers()
        }
    })

    test('sends a capturer and captures a neutral factory over ticks', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            const neutralCover = getStructure(match.state, structure => structure.type === 'cover' && structure.ownerId === null)

            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'capture',
                structureId: neutralCover.structureId,
            })

            let state = game.getPublicState(match.hostKey)
            expect(Object.values(state.units)).toContainEqual(expect.objectContaining({
                type: 'capturer',
                ownerId: 'player-1',
                order: expect.objectContaining({ structureId: neutralCover.structureId }),
            }))

            game.start()
            jest.advanceTimersByTime(80000)

            state = game.getPublicState(match.hostKey)
            expect(getStructure(state, structure => structure.structureId === neutralCover.structureId)).toMatchObject({
                ownerId: 'player-1',
                disabled: false,
                capture: null,
            })
        } finally {
            jest.useRealTimers()
        }
    })

    test('disconnects a player from their room', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })

        game.disconnectPlayer({ playerId: 'player-1' })

        const state = game.getPublicState(match.hostKey)
        expect(state.players['player-1'].connected).toBe(false)
        expect(game.getHostKeyForPlayer('player-1')).toBeUndefined()
    })

    test('returns an empty shell for missing rooms and allows shell state replacement', () => {
        const game = createGame()

        expect(game.getPublicState('missing')).toMatchObject({
            hostKey: null,
            players: {},
            structures: {},
            units: {},
            winnerId: null,
            tick: 0,
        })

        game.setState({ custom: true })
        expect(game.state).toEqual({ custom: true })
    })

    test('denies invalid build, upgrade, research, capture, and player actions', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })

        const initialState = game.getPublicState(match.hostKey)
        const playerOneBase = getStructure(initialState, structure => structure.type === 'base' && structure.ownerId === 'player-1')
        const playerTwoBase = getStructure(initialState, structure => structure.type === 'base' && structure.ownerId === 'player-2')

        game.executeAction({ playerId: 'ghost', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: 1, y: 1 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'base', x: 6, y: 4 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'per', x: 6, y: 4 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: -1, y: 4 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: playerOneBase.x, y: playerOneBase.y })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: 40, y: 25 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: playerOneBase.x + 2, y: playerOneBase.y })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: playerOneBase.x + 3, y: playerOneBase.y })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: 'missing' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: playerTwoBase.structureId })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'research', recipe: 'unknown' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'research', recipe: 'per' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'spawn-npc' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'capture', structureId: 'missing' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'capture', structureId: playerOneBase.structureId })

        const ownedCover = getStructure(game.getPublicState(match.hostKey), structure => structure.type === 'cover' && structure.ownerId === 'player-1')
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'capture', structureId: ownedCover.structureId })
        game.disconnectPlayer({ playerId: 'missing-player' })
        game.disconnectPlayer({ playerId: 'missing-player', hostKey: match.hostKey })

        const messages = game.getPublicState(match.hostKey).logs.map(log => log.message)
        expect(messages).toHaveLength(12)
        expect(messages).toEqual(expect.arrayContaining([
            'Alice precisa de 540 carvoes para Cover.',
            'Alice: nenhuma construcao selecionada para upgrade.',
            'Alice: selecione uma construcao sua para upgrade.',
            'Alice precisa de Taraque nivel 1.',
            'Alice: NPC indisponivel.',
            'Alice: selecione uma construcao capturavel.',
            'Alice: esta construcao nao pode ser capturada.',
            'Alice: esta construcao ja e sua.',
        ]))
    })

    test('unlocks Tujai and spawns a Zunim that advances toward an enemy base', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })

            const base = getStructure(match.state, structure => structure.type === 'base' && structure.ownerId === 'player-1')
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: base.x + 2, y: base.y })

            game.start()
            jest.advanceTimersByTime(27000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: base.structureId })
            jest.advanceTimersByTime(16000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'taraque', x: base.x + 3, y: base.y })
            jest.advanceTimersByTime(24000)

            const taraque = getStructure(game.getPublicState(match.hostKey), structure => structure.type === 'taraque' && structure.ownerId === 'player-1')
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: taraque.structureId })
            jest.advanceTimersByTime(4000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'research', recipe: 'tujai' })
            jest.advanceTimersByTime(26000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'tujai', x: base.x + 4, y: base.y })
            jest.advanceTimersByTime(4000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'spawn-npc', npcType: 'zunim' })

            let state = game.getPublicState(match.hostKey)
            const unit = Object.values(state.units).find(candidate => candidate.type === 'zunim')
            expect(unit).toMatchObject({ ownerId: 'player-1', damage: 10 })

            jest.advanceTimersByTime(10000)
            state = game.getPublicState(match.hostKey)
            expect(state.units[unit.unitId].x).toBeGreaterThan(unit.x)

            jest.advanceTimersByTime(200000)
            state = game.getPublicState(match.hostKey)
            const bobBase = getStructure(state, structure => structure.type === 'base' && structure.ownerId === 'player-2')
            expect(bobBase.barrier).toBeLessThan(bobBase.maxBarrier)
        } finally {
            jest.useRealTimers()
        }
    })


    test('covers internal movement, damage, respawn, and denial branches', () => {
        jest.useFakeTimers()
        try {
            const fallbackGame = createGame()
            const fallbackMatch = fallbackGame.createMatch({ playerId: 'abcd-1234', gamerTag: '   ' })
            expect(fallbackMatch.state.players['abcd-1234'].gamerTag).toBe('Player abcd')

            const game = createGame()
            game.__testing.debugLog(null, 'ignored')
            game.start()
            game.start()

            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
            const room = game.__testing.getRoom(match.hostKey)
            const playerOne = room.players['player-1']
            const playerTwo = room.players['player-2']
            const baseOne = room.structures[playerOne.baseId]
            const baseTwo = room.structures[playerTwo.baseId]

            game.movePlayer({ playerId: 'ghost', hostKey: 'missing', keyPressed: 'w' })
            game.movePlayer({ playerId: 'missing', hostKey: match.hostKey, keyPressed: 'w' })
            playerOne.avatarDeployed = true
            game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: '?' })
            playerOne.x = 0
            playerOne.y = 0
            game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'ArrowLeft' })

            playerOne.x = baseOne.x - 1
            playerOne.y = baseOne.y
            game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'ArrowRight' })

            playerOne.x = 5
            playerOne.y = 5
            playerTwo.avatarDeployed = true
            playerTwo.x = 6
            playerTwo.y = 5
            game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'ArrowRight' })

            playerTwo.x = 10
            playerTwo.y = 5
            game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'ArrowRight' })
            expect(playerOne.x).toBe(6)

            room.winnerId = 'player-1'
            game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'ArrowRight' })
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: 7, y: 5 })
            room.winnerId = null
            game.executeAction({ playerId: 'nobody', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: 7, y: 5 })
            game.executeAction({ playerId: 'player-1', hostKey: 'missing', action: 'build', structureType: 'cover', x: 7, y: 5 })

            const disabledCover = game.__testing.createStructure(room, { ownerId: 'player-1', type: 'cover', x: 7, y: 5, disabled: true })
            game.__testing.upgradeStructure(room, playerOne, { structureId: disabledCover.structureId })
            game.__testing.upgradeStructure(room, playerOne, { structureId: baseOne.structureId })
            playerOne.unlocked.per = true
            game.__testing.researchRecipe(room, playerOne, { recipe: 'per' })
            playerOne.unlocked.per = false
            game.__testing.researchRecipe(room, playerOne, { recipe: 'per' })

            playerOne.unlocked.tujai = true
            game.__testing.spawnNpc(room, playerOne, { npcType: 'zunim' })
            const tujai = game.__testing.createStructure(room, { ownerId: 'player-1', type: 'tujai', x: 8, y: 5 })
            playerOne.coal = 0
            game.__testing.spawnNpc(room, playerOne, { npcType: 'zunim' })
            playerOne.coal = 1000
            game.__testing.spawnNpc(room, playerOne, { npcType: 'zunim' })
            expect(Object.values(room.units).some(unit => unit.type === 'zunim')).toBe(true)

            playerOne.respawnAt = Date.now() + 1000
            game.__testing.startCaptureOrder(room, playerOne, { structureId: disabledCover.structureId })
            playerOne.respawnAt = null
            game.__testing.startCaptureOrder(room, playerOne, { structureId: disabledCover.structureId })

            game.__testing.applyDamageToPlayer(room, playerOne, 500, Date.now(), 'player-2')
            expect(playerOne.respawnAt).toBeTruthy()
            jest.advanceTimersByTime(room.config?.respawnDelayMs || 30000)
            game.__testing.processPlayerRespawns(room, Date.now() + 30000)

            const capturer = Object.values(room.units).find(unit => unit.type === 'capturer' && unit.ownerId === 'player-1')
            if (capturer) {
                game.__testing.applyDamageToUnit(room, capturer, 500, Date.now(), 'player-2')
            }

            game.__testing.applyDamageToStructure(room, disabledCover, 10, Date.now(), 'player-2')
            const targetCover = game.__testing.createStructure(room, { ownerId: 'player-2', type: 'cover', x: baseOne.x + 1, y: baseOne.y + 1 })
            game.__testing.applyDamageToStructure(room, targetCover, 1000, Date.now(), 'player-1')
            expect(targetCover.disabled).toBe(true)

            game.__testing.applyDamage(room, { kind: 'structure', value: baseTwo }, 5000, Date.now(), 'player-1')
            expect(playerTwo.alive).toBe(false)
            expect(room.winnerId).toBe('player-1')

            expect(game.__testing.getStepToward(room, { x: 0, y: 0 }, { x: 0, y: 3 })).toEqual({ x: 0, y: 1 })
            expect(game.__testing.getEmptyTileNear(room, -20, -20, 1)).toBeNull()
            expect(game.__testing.summarizeActor(playerOne)).toHaveProperty('playerId', 'player-1')
            expect(game.__testing.summarizeActor({ unitId: 'u', ownerId: 'player-1', type: 'zunim', x: 1, y: 1, integrity: 1, barrier: 0 })).toHaveProperty('unitId', 'u')
        } finally {
            jest.useRealTimers()
        }
    })


    test('covers rare game internals for failed spawns, cooldowns, splash, and cleanup', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const now = Date.now()
        const playerOne = room.players['player-1']
        const playerTwo = room.players['player-2']
        const baseOne = room.structures[playerOne.baseId]
        const baseTwo = room.structures[playerTwo.baseId]

        playerOne.coal = 0
        hooks.upgradeStructure(room, playerOne, { structureId: baseOne.structureId })
        const taraque = hooks.createStructure(room, { ownerId: 'player-1', type: 'taraque', x: baseOne.x + 2, y: baseOne.y + 2 })
        playerOne.knowledge = 0
        hooks.researchRecipe(room, playerOne, { recipe: 'hef' })
        playerOne.knowledge = 100
        playerOne.unlocked.hef = false
        hooks.researchRecipe(room, playerOne, { recipe: 'hef' })
        expect(playerOne.unlocked.hef).toBe(true)

        playerOne.unlocked.tujai = true
        hooks.spawnNpc(room, playerOne, { npcType: 'zunim' })
        const boxedTujai = hooks.createStructure(room, { ownerId: 'player-1', type: 'tujai', x: 20, y: 20 })
        playerOne.coal = 1000
        for (const [index, offset] of [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
        ].entries()) {
            hooks.createStructure(room, { ownerId: 'player-1', type: 'cover', x: boxedTujai.x + offset[0], y: boxedTujai.y + offset[1], structureId: 'box-' + index })
        }
        hooks.spawnNpc(room, playerOne, { npcType: 'zunim' })

        const neutralCover = Object.values(room.structures).find(structure => structure.type === 'cover' && structure.ownerId === null)
        baseOne.disabled = true
        playerOne.activeCaptureUnitId = null
        hooks.startCaptureOrder(room, playerOne, { structureId: neutralCover.structureId })
        playerOne.respawnAt = now - 1
        hooks.processPlayerRespawns(room, now)
        baseOne.disabled = false

        room.units['orphan-capturer'] = { unitId: 'orphan-capturer', ownerId: 'missing', type: 'capturer', x: 1, y: 1, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, order: null }
        hooks.processCaptureUnitOrders(room, now)
        expect(room.units['orphan-capturer']).toBeUndefined()

        const capturer = {
            unitId: 'manual-capturer',
            ownerId: 'player-1',
            playerId: 'player-1',
            type: 'capturer',
            x: neutralCover.x,
            y: neutralCover.y,
            integrity: 160,
            maxIntegrity: 160,
            barrier: 40,
            maxBarrier: 40,
            damage: 20,
            attackRange: 1.5,
            attackEveryMs: 1000,
            lastAttackAt: now,
            lastDamagedAt: 0,
            order: { type: 'capture', structureId: 'missing' },
        }
        room.units[capturer.unitId] = capturer
        playerOne.order = { ...capturer.order, unitId: capturer.unitId }
        hooks.processCaptureUnitOrders(room, now)
        expect(capturer.order).toBeNull()

        const ownCover = hooks.createStructure(room, { ownerId: 'player-1', type: 'cover', x: neutralCover.x + 1, y: neutralCover.y })
        capturer.order = { type: 'capture', structureId: ownCover.structureId, unitId: capturer.unitId }
        hooks.processCaptureUnitOrders(room, now + 1000)
        expect(capturer.order).toBeNull()

        neutralCover.capture = { playerId: 'player-1', progressMs: 1000 }
        hooks.processCaptures(room)
        expect(neutralCover.capture).toBeNull()

        const weakZunim = { unitId: 'weak-zunim', ownerId: 'player-1', type: 'zunim', x: 2, y: 2, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        room.units[weakZunim.unitId] = weakZunim
        hooks.applyDamage(room, { kind: 'unit', value: weakZunim }, 10, now, 'player-2')
        expect(room.units[weakZunim.unitId]).toBeUndefined()

        hooks.applyDamage(room, { kind: 'player', value: { ...playerOne, avatarDeployed: false } }, 10, now, 'player-2')
        hooks.applyDamageToUnit(room, { unitId: 'ghost-capturer', ownerId: 'missing', type: 'capturer', integrity: 0, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }, 10, now, 'player-2')
        hooks.eliminatePlayer(room, 'missing', 'player-1')

        const hef = hooks.createStructure(room, { ownerId: 'player-1', type: 'hef', x: baseTwo.x - 1, y: baseTwo.y })
        hef.lastAttackAt = 0
        playerTwo.avatarDeployed = true
        playerTwo.x = baseTwo.x
        playerTwo.y = baseTwo.y
        hooks.processTowerAttacks(room, now + 2000)
        expect(playerTwo.barrier).toBeLessThan(playerTwo.maxBarrier)

        const enemyCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: baseTwo.x, y: baseTwo.y - 1 })
        room.units['enemy-zunim'] = { unitId: 'enemy-zunim', ownerId: 'player-2', type: 'zunim', x: baseTwo.x, y: baseTwo.y - 2, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        hooks.applyDamageToStructure(room, enemyCover, 1000, now, 'player-1')
        hooks.applyDamageToStructure(room, baseTwo, 5000, now, 'player-1')
        expect(room.units['enemy-zunim']).toBeUndefined()

        expect(hooks.getStepToward(room, { x: 0, y: 0 }, { x: -3, y: -3 })).toBeNull()
        expect(hooks.getEmptyNeighbor(room, -10, -10)).toBeNull()
        expect(taraque).toBeDefined()
    })

    test('covers targeted combat orders, regeneration, targeting, and helper fallbacks', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const now = 100000
        const playerOne = room.players['player-1']
        const playerTwo = room.players['player-2']
        const baseOne = room.structures[playerOne.baseId]
        const baseTwo = room.structures[playerTwo.baseId]

        playerOne.avatarDeployed = true
        playerOne.integrity = playerOne.maxIntegrity
        playerOne.barrier = 1
        playerOne.lastDamagedAt = 0
        room.units['regen-unit'] = {
            unitId: 'regen-unit',
            ownerId: 'player-1',
            type: 'zunim',
            x: 8,
            y: 8,
            integrity: 100,
            maxIntegrity: 100,
            barrier: 1,
            maxBarrier: 10,
            lastDamagedAt: 0,
            lastAttackAt: 0,
        }
        expect(hooks.regenerateBarriers(room, now)).toBe(true)
        expect(room.units['regen-unit'].barrier).toBe(9)
        expect(playerOne.barrier).toBe(9)

        const cooldownTower = hooks.createStructure(room, { ownerId: 'player-1', type: 'per', x: 0, y: 0 })
        cooldownTower.lastAttackAt = now
        expect(hooks.processTowerAttacks(room, now + 1)).toBe(false)
        cooldownTower.lastAttackAt = 0
        expect(hooks.processTowerAttacks(room, now + 2000)).toBe(false)

        room.units['ownerless-zunim'] = { unitId: 'ownerless-zunim', ownerId: 'missing', type: 'zunim', x: 1, y: 1, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastAttackAt: 0, lastDamagedAt: 0 }
        hooks.processNpcActions(room, now)
        expect(room.units['ownerless-zunim']).toBeUndefined()

        baseTwo.disabled = true
        playerTwo.alive = false
        room.units['idle-zunim'] = { unitId: 'idle-zunim', ownerId: 'player-1', type: 'zunim', x: 2, y: 2, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: 0, lastDamagedAt: 0 }
        expect(hooks.processNpcActions(room, now + 3000)).toBe(false)
        delete room.units['idle-zunim']
        baseTwo.disabled = false
        playerTwo.alive = true

        room.players['player-3'] = { ...playerTwo, playerId: 'player-3', ownerId: 'player-3', gamerTag: 'Carol', alive: true, baseId: 'extra-base' }
        room.structures['extra-base'] = { ...baseTwo, structureId: 'extra-base', ownerId: 'player-3', x: baseTwo.x - 3, y: baseTwo.y }
        room.units['sort-zunim'] = { unitId: 'sort-zunim', ownerId: 'player-1', type: 'zunim', x: baseTwo.x - 5, y: baseTwo.y, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: 0, lastDamagedAt: 0 }
        expect(hooks.processNpcActions(room, now + 4000)).toBe(true)
        delete room.units['sort-zunim']
        delete room.players['player-3']
        delete room.structures['extra-base']

        const disabledEnemyCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: 12, y: 12, disabled: true })
        const capturer = {
            unitId: 'combat-capturer',
            ownerId: 'player-1',
            type: 'capturer',
            x: 12,
            y: 11,
            integrity: 160,
            maxIntegrity: 160,
            barrier: 40,
            maxBarrier: 40,
            damage: 20,
            attackRange: 1.5,
            attackEveryMs: 1000,
            lastAttackAt: now,
            lastDamagedAt: 0,
            order: { type: 'capture', structureId: disabledEnemyCover.structureId },
        }
        const enemyCapturer = { ...capturer, unitId: 'enemy-capturer', ownerId: 'player-2', x: 12, y: 12, integrity: 80, barrier: 0, order: null, lastAttackAt: 0 }
        room.units[capturer.unitId] = capturer
        room.units[enemyCapturer.unitId] = enemyCapturer
        playerTwo.avatarDeployed = true
        playerTwo.x = 13
        playerTwo.y = 12
        expect(hooks.processCaptureUnitOrder(room, capturer, now + 500)).toBe(false)
        expect(hooks.processCaptureUnitOrder(room, capturer, now + 1500)).toBe(true)
        expect(enemyCapturer.integrity).toBeLessThan(80)

        capturer.x = 10
        capturer.y = 12
        capturer.attackRange = 0.5
        capturer.lastAttackAt = 0
        expect(hooks.processCaptureUnitOrder(room, capturer, now + 3000)).toBe(true)
        expect(capturer.x).toBe(11)

        const activeEnemyCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: 15, y: 15 })
        capturer.order = { type: 'capture', structureId: activeEnemyCover.structureId }
        capturer.x = 12
        capturer.y = 15
        capturer.attackRange = 1.5
        capturer.lastAttackAt = 0
        expect(hooks.processCaptureUnitOrder(room, capturer, now + 4000)).toBe(true)
        expect(capturer.x).toBe(13)
        capturer.x = 15
        capturer.y = 14
        expect(hooks.processCaptureUnitOrder(room, capturer, now + 6000)).toBe(true)
        expect(activeEnemyCover.barrier).toBeLessThan(activeEnemyCover.maxBarrier)

        const boxedTarget = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: 0, y: 0 })
        const boxUnit = { ...capturer, unitId: 'boxed-capturer', x: 1, y: 1, attackRange: 0.1, order: { type: 'capture', structureId: boxedTarget.structureId } }
        room.units[boxUnit.unitId] = boxUnit
        room.structures['box-a'] = { ...baseOne, structureId: 'box-a', x: 0, y: 1 }
        room.structures['box-b'] = { ...baseOne, structureId: 'box-b', x: 1, y: 0 }
        expect(hooks.processCaptureUnitOrder(room, boxUnit, now + 7000)).toBe(false)

        hooks.captureStructure(room, disabledEnemyCover, { playerId: 'ghost' })
        expect(disabledEnemyCover.disabled).toBe(true)

        const tower = hooks.createStructure(room, { ownerId: 'player-1', type: 'per', x: 20, y: 20 })
        room.units['near-unit'] = { unitId: 'near-unit', ownerId: 'player-2', type: 'zunim', x: 21, y: 20, integrity: 50, maxIntegrity: 50, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        room.units['far-unit'] = { unitId: 'far-unit', ownerId: 'player-2', type: 'zunim', x: 22, y: 20, integrity: 50, maxIntegrity: 50, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        tower.lastAttackAt = 0
        expect(hooks.processTowerAttacks(room, now + 8000)).toBe(true)
        expect(room.units['near-unit'].integrity).toBeLessThan(50)

        const captureTarget = hooks.createStructure(room, { ownerId: null, type: 'cover', x: 25, y: 20, disabled: true })
        room.units['capture-sort-a'] = { ...capturer, unitId: 'capture-sort-a', ownerId: 'player-1', playerId: 'player-1', x: 25, y: 19, order: { type: 'capture', structureId: captureTarget.structureId } }
        room.units['capture-sort-b'] = { ...capturer, unitId: 'capture-sort-b', ownerId: 'player-1', playerId: 'player-1', x: 24, y: 20, order: { type: 'capture', structureId: captureTarget.structureId } }
        expect(hooks.processCaptures(room)).toBe(true)
        expect(captureTarget.capture.playerId).toBe('player-1')

        playerOne.activeCaptureUnitId = 'combat-capturer'
        hooks.startCaptureOrder(room, playerOne, { structureId: captureTarget.structureId })
        expect(room.units['combat-capturer'].order.structureId).toBe(captureTarget.structureId)
        playerOne.activeCaptureUnitId = null
        hooks.startCaptureOrder(room, playerOne, { structureId: captureTarget.structureId })
        expect(Object.values(room.units).find(unit => unit.type === 'capturer' && unit.ownerId === 'player-1')).toBeDefined()

        captureTarget.capture = { playerId: 'player-1', progressMs: 100 }
        hooks.applyDamageToPlayer(room, playerOne, 10000, now + 9000)
        expect(captureTarget.capture).toBeNull()

        expect(hooks.canBuildStructure(room, playerOne, 'base')).toBe(false)
        const tinyRoom = {
            structures: { block: { x: 1, y: 0 } },
            players: {},
            units: { actor: { x: 0, y: 1 } },
        }
        expect(hooks.getEmptyTileNear(tinyRoom, 0, 0, 1)).toEqual({ x: 1, y: 1 })
        const missingOwnerCover = hooks.createStructure(room, { ownerId: 'ghost-owner', type: 'cover', x: 30, y: 20 })
        hooks.applyDamageToStructure(room, missingOwnerCover, 1000, now + 10000)
        expect(room.logs[0].message).toContain('Neutro')
    })


    test('covers final game fallback branches', () => {
        const game = createGame()
        expect(game.joinMatch({ playerId: 'nobody', gamerTag: null, hostKey: null })).toEqual({ error: 'Sala nao encontrada.' })
        const fallbackMatch = game.createMatch({ playerId: 'fallback-player', gamerTag: null })
        expect(fallbackMatch.state.players['fallback-player'].gamerTag).toBe('Player fall')

        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const now = 200000
        const playerOne = room.players['player-1']
        const playerTwo = room.players['player-2']
        const baseOne = room.structures[playerOne.baseId]
        const baseTwo = room.structures[playerTwo.baseId]

        game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'w' })
        game.executeAction({ playerId: 'player-1', action: undefined })
        game.executeAction({ playerId: 'ghost', action: 'build', structureType: 'cover', x: 1, y: 1 })

        const disabledCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: 10, y: 10, disabled: true })
        const capturer = {
            unitId: 'branch-capturer',
            ownerId: 'player-1',
            type: 'capturer',
            x: 10,
            y: 9,
            integrity: 160,
            maxIntegrity: 160,
            barrier: 40,
            maxBarrier: 40,
            damage: 20,
            attackRange: 1,
            attackEveryMs: 1000,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            order: { type: 'capture', structureId: disabledCover.structureId },
        }
        room.units[capturer.unitId] = capturer
        room.units['far-enemy-capturer'] = { ...capturer, unitId: 'far-enemy-capturer', ownerId: 'player-2', x: 20, y: 20, order: null }
        playerTwo.avatarDeployed = false
        hooks.processCaptureUnitOrder(room, capturer, now)

        const regenUnit = { unitId: 'fresh-barrier', ownerId: 'player-1', type: 'zunim', x: 3, y: 3, integrity: 1, maxIntegrity: 1, barrier: 1, maxBarrier: 10, lastDamagedAt: now }
        room.units[regenUnit.unitId] = regenUnit
        playerOne.avatarDeployed = true
        playerOne.barrier = 1
        playerOne.lastDamagedAt = now
        hooks.regenerateBarriers(room, now + 1000)
        expect(regenUnit.barrier).toBe(1)
        expect(playerOne.barrier).toBe(1)

        room.units = {}
        const attackingZunim = { unitId: 'cooldown-zunim', ownerId: 'player-1', type: 'zunim', x: baseTwo.x - 1, y: baseTwo.y, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: now, lastDamagedAt: 0 }
        room.units[attackingZunim.unitId] = attackingZunim
        expect(hooks.processNpcActions(room, now + 500)).toBe(false)
        delete room.units[attackingZunim.unitId]
        const blockedZunim = { ...attackingZunim, unitId: 'blocked-zunim', x: baseTwo.x - 2, y: baseTwo.y - 1, attackRange: 0.1, lastAttackAt: 0 }
        room.units[blockedZunim.unitId] = blockedZunim
        room.structures['npc-block-a'] = { ...baseOne, structureId: 'npc-block-a', x: baseTwo.x - 1, y: baseTwo.y - 1 }
        room.structures['npc-block-b'] = { ...baseOne, structureId: 'npc-block-b', x: baseTwo.x - 2, y: baseTwo.y }
        expect(hooks.processNpcActions(room, now + 2000)).toBe(false)

        hooks.captureStructure(room, disabledCover, { ownerId: 'player-1' })
        expect(disabledCover.ownerId).toBe('player-1')
        const anotherDisabledCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: 12, y: 10, disabled: true })
        hooks.captureStructure(room, anotherDisabledCover, { playerId: 'player-1', order: null })
        expect(anotherDisabledCover.ownerId).toBe('player-1')

        const looseCapturer = { ...capturer, unitId: 'loose-capturer', ownerId: 'player-1', integrity: 1, barrier: 0 }
        room.units[looseCapturer.unitId] = looseCapturer
        hooks.applyDamageToUnit(room, looseCapturer, 10, now + 3000)
        expect(room.logs[0].message).toContain('o combate')

        room.players['no-base'] = { ...playerTwo, playerId: 'no-base', ownerId: 'no-base', gamerTag: 'No Base', alive: true, baseId: 'missing-base' }
        hooks.eliminatePlayer(room, 'no-base')
        expect(room.logs[0].message).toContain('o combate')

        const respawnPlayer = { ...playerOne, baseId: baseOne.structureId }
        for (const [index, offset] of [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
        ].entries()) {
            room.structures['respawn-block-' + index] = { ...baseOne, structureId: 'respawn-block-' + index, x: baseOne.x + offset[0], y: baseOne.y + offset[1] }
        }
        expect(hooks.getRespawnTile(room, respawnPlayer)).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    })


})
