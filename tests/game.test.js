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
            const neutralCover = getStructure(game.getPublicState(match.hostKey), structure => structure.type === 'cover' && structure.ownerId === null)

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

    test('lets troops jump allied structures, destroy path blockers, and respawn capturers near blocked bases', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const now = 500000
        const playerOne = room.players['player-1']
        const baseOne = room.structures[playerOne.baseId]

        const jumper = { unitId: 'jump-zunim', ownerId: 'player-1', type: 'zunim', x: 10, y: 10 }
        hooks.createStructure(room, { ownerId: 'player-1', type: 'cover', x: 11, y: 10, structureId: 'jump-allied-cover' })
        expect(hooks.getStepToward(room, jumper, { x: 14, y: 10 })).toEqual({ x: 12, y: 10 })

        const pathCapturer = {
            unitId: 'path-capturer',
            ownerId: 'player-1',
            playerId: 'player-1',
            type: 'capturer',
            x: 10,
            y: 12,
            integrity: 160,
            maxIntegrity: 160,
            barrier: 40,
            maxBarrier: 40,
            damage: 25,
            attackRange: 1,
            attackEveryMs: 1000,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            order: { type: 'move', x: 14, y: 12 },
        }
        const enemyBlocker = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: 11, y: 12 })
        enemyBlocker.integrity = 20
        enemyBlocker.barrier = 0
        room.units[pathCapturer.unitId] = pathCapturer
        expect(hooks.processCaptureUnitOrder(room, pathCapturer, now)).toBe(true)
        expect(room.structures[enemyBlocker.structureId]).toBeUndefined()
        expect(pathCapturer.x).toBe(10)

        const neutralBlocker = hooks.createStructure(room, { ownerId: null, type: 'cover', x: 11, y: 13 })
        neutralBlocker.integrity = 20
        neutralBlocker.barrier = 0
        pathCapturer.y = 13
        pathCapturer.lastAttackAt = 0
        pathCapturer.order = { type: 'move', x: 14, y: 13 }
        expect(hooks.processCaptureUnitOrder(room, pathCapturer, now + 2000)).toBe(true)
        expect(room.structures[neutralBlocker.structureId]).toBeUndefined()

        for (let dy = -4; dy <= 4; dy += 1) {
            for (let dx = -4; dx <= 4; dx += 1) {
                if (dx === 0 && dy === 0) {
                    continue
                }

                const x = baseOne.x + dx
                const y = baseOne.y + dy

                if (x < 0 || x >= 48 || y < 0 || y >= 30) {
                    continue
                }

                const structureId = `respawn-wide-block-${dx}-${dy}`
                room.structures[structureId] = { ...baseOne, structureId, type: 'cover', x, y }
            }
        }

        const respawnTile = hooks.getRespawnTile(room, playerOne)
        expect(Math.max(Math.abs(respawnTile.x - baseOne.x), Math.abs(respawnTile.y - baseOne.y))).toBe(5)
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
        expect(hooks.processNpcActions(room, now + 2000)).toBe(true)
        expect(blockedZunim).toMatchObject({ x: baseTwo.x, y: baseTwo.y - 1 })

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



    test('adds an AI player and lets the injected neural agent issue a capture order', () => {
        const game = createGame({
            aiAgent: {
                cooldownMs: 1000,
                decide: jest.fn(({ state, playerId }) => {
                    const target = Object.values(state.structures)
                        .find(structure => structure.type === 'cover' && structure.ownerId === null)

                    return {
                        action: 'capture',
                        structureId: target.structureId,
                        checkedPlayerId: playerId,
                    }
                }),
            },
        })
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice', connected: false })
        const result = game.addAiPlayer({ hostKey: match.hostKey, gamerTag: 'Bot Neural', requestedBy: 'player-1' })
        const room = game.__testing.getRoom(match.hostKey)
        const aiPlayer = room.players[result.playerId]
        const aiBase = room.structures[aiPlayer.baseId]
        const visibleCover = game.__testing.createStructure(room, {
            ownerId: null,
            type: 'cover',
            x: aiBase.x - 2,
            y: aiBase.y,
            disabled: true,
        })
        visibleCover.integrity = 0
        visibleCover.barrier = 0

        expect(result.error).toBeUndefined()
        expect(result.playerId).toBe('ai-' + match.hostKey + '-1')
        expect(result.state.players[result.playerId]).toMatchObject({
            gamerTag: 'Bot Neural',
            isAi: true,
            connected: true,
            alive: true,
        })
        expect(game.getPublicState(match.hostKey).players['player-1'].connected).toBe(false)
        expect(game.getHostKeyForPlayer(result.playerId)).toBe(match.hostKey)
        expect(game.__testing.runAiPlayers(room, 10000)).toBe(true)
        expect(game.__testing.runAiPlayers(room, 10001)).toBe(false)
        expect(game.getPublicState(match.hostKey).players[result.playerId].order).toMatchObject({ type: 'capture' })
        expect(game.__testing.getRoom(match.hostKey).hasHadCombatants).toBe(true)
    })

    test('toggles autoplay so the neural agent can control an existing player', () => {
        const agent = {
            cooldownMs: 0,
            decide: jest.fn(({ state }) => {
                const target = Object.values(state.structures)
                    .find(structure => structure.type === 'cover' && structure.ownerId === null)

                return { action: 'capture', structureId: target.structureId }
            }),
        }
        const game = createGame({ aiAgent: agent })
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const base = room.structures[player.baseId]
        const visibleCover = game.__testing.createStructure(room, {
            ownerId: null,
            type: 'cover',
            x: base.x + 2,
            y: base.y,
            disabled: true,
        })
        visibleCover.integrity = 0
        visibleCover.barrier = 0

        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'toggle-autoplay', enabled: true })).toBe(true)
        expect(player.autoplay).toBe(true)
        expect(room.aiPlayers['player-1']).toMatchObject({ playerId: 'player-1', autoplay: true })
        expect(game.getPublicState(match.hostKey).players['player-1'].autoplay).toBe(true)
        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'cover', x: base.x + 1, y: base.y })).toBe(false)

        expect(game.__testing.runAiPlayers(room, 10000)).toBe(true)
        expect(agent.decide).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'player-1' }))
        expect(player.order).toMatchObject({ type: 'capture', structureId: visibleCover.structureId })

        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'toggle-autoplay', enabled: false })).toBe(true)
        expect(player.autoplay).toBe(false)
        expect(room.aiPlayers['player-1']).toBeUndefined()
    })

    test('handles AI add denials and defensive agent branches', () => {
        const game = createGame()
        expect(game.addAiPlayer()).toEqual({ error: 'Sala nao encontrada.' })
        expect(game.addAiPlayer({ hostKey: 'missing' })).toEqual({ error: 'Sala nao encontrada.' })

        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        expect(game.__testing.runAiPlayers(room, Date.now())).toBe(false)

        room.winnerId = 'player-1'
        expect(game.addAiPlayer({ hostKey: match.hostKey })).toEqual({ error: 'Partida encerrada.' })
        room.winnerId = null

        for (let index = 2; index <= 8; index += 1) {
            game.joinMatch({ playerId: 'player-' + index, gamerTag: 'Player ' + index, hostKey: match.hostKey })
        }
        expect(game.addAiPlayer({ hostKey: match.hostKey })).toEqual({ error: 'Sala cheia.' })

        const missingDecideGame = createGame({ aiAgent: {} })
        const missingDecideMatch = missingDecideGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        missingDecideGame.addAiPlayer({ hostKey: missingDecideMatch.hostKey })
        expect(missingDecideGame.__testing.runAiPlayers(missingDecideGame.__testing.getRoom(missingDecideMatch.hostKey), 10000)).toBe(false)

        const nullDecisionAgent = { cooldownMs: 0, decidir: jest.fn(() => null) }
        const nullDecisionGame = createGame({ aiAgent: nullDecisionAgent })
        const nullDecisionMatch = nullDecisionGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const nullAi = nullDecisionGame.addAiPlayer({ hostKey: nullDecisionMatch.hostKey })
        expect(nullDecisionGame.__testing.runAiPlayers(nullDecisionGame.__testing.getRoom(nullDecisionMatch.hostKey), 10000)).toBe(false)
        expect(nullDecisionAgent.decidir).toHaveBeenCalledWith(expect.objectContaining({ playerId: nullAi.playerId }))

        const emptyDecisionGame = createGame({ aiAgent: { cooldownMs: 0, decide: jest.fn(() => ({})) } })
        const emptyDecisionMatch = emptyDecisionGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        emptyDecisionGame.addAiPlayer({ hostKey: emptyDecisionMatch.hostKey })
        expect(emptyDecisionGame.__testing.runAiPlayers(emptyDecisionGame.__testing.getRoom(emptyDecisionMatch.hostKey), 10000)).toBe(false)

        const deadAgent = { cooldownMs: 0, decide: jest.fn(() => ({ action: 'capture', structureId: 'missing' })) }
        const deadGame = createGame({ aiAgent: deadAgent })
        const deadMatch = deadGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const deadAi = deadGame.addAiPlayer({ hostKey: deadMatch.hostKey, playerId: 'bot-fixed' })
        const deadRoom = deadGame.__testing.getRoom(deadMatch.hostKey)
        deadRoom.players[deadAi.playerId].alive = false
        expect(deadGame.__testing.runAiPlayers(deadRoom, 10000)).toBe(false)
        expect(deadRoom.aiPlayers[deadAi.playerId]).toBeUndefined()
        expect(deadAgent.decide).not.toHaveBeenCalled()

        const mixedAgent = {
            decide: jest.fn(({ state, playerId }) => {
                if (playerId.endsWith('-1')) {
                    const target = Object.values(state.structures).find(structure => structure.type === 'cover' && structure.ownerId === null)
                    return { action: 'capture', structureId: target.structureId }
                }

                return { action: 'dance' }
            }),
        }
        const mixedGame = createGame({ aiAgent: mixedAgent })
        const mixedMatch = mixedGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const mixedAi = mixedGame.addAiPlayer({ hostKey: mixedMatch.hostKey })
        mixedGame.addAiPlayer({ hostKey: mixedMatch.hostKey })
        const mixedRoom = mixedGame.__testing.getRoom(mixedMatch.hostKey)
        const mixedAiBase = mixedRoom.structures[mixedRoom.players[mixedAi.playerId].baseId]
        const mixedVisibleCover = mixedGame.__testing.createStructure(mixedRoom, {
            ownerId: null,
            type: 'cover',
            x: mixedAiBase.x - 2,
            y: mixedAiBase.y,
            disabled: true,
        })
        mixedVisibleCover.integrity = 0
        mixedVisibleCover.barrier = 0
        expect(mixedGame.__testing.runAiPlayers(mixedRoom, 10000)).toBe(true)

        const throwingGame = createGame({ aiAgent: { cooldownMs: 0, decide: jest.fn(() => { throw new Error('boom') }) } })
        const debugEntries = []
        throwingGame.subscribeDebug(entry => debugEntries.push(entry))
        const throwingMatch = throwingGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const throwingAi = throwingGame.addAiPlayer({ hostKey: throwingMatch.hostKey })
        expect(throwingAi.state.players[throwingAi.playerId].gamerTag).toBe('IA Neural 1')
        expect(throwingGame.__testing.runAiPlayers(throwingGame.__testing.getRoom(throwingMatch.hostKey), 10000)).toBe(false)
        expect(debugEntries).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'ai:error' }),
        ]))
    })


    test('computes per-player fog, memory, and scout movement orders', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const playerOne = room.players['player-1']
        const baseOne = room.structures[playerOne.baseId]

        expect(hooks.computeVisibilityMask(room, 'missing').flat().some(Boolean)).toBe(false)
        const originalBaseId = playerOne.baseId
        playerOne.baseId = 'missing-base'
        expect(hooks.computeVisibilityMask(room, 'player-1').flat().some(Boolean)).toBe(true)
        playerOne.baseId = originalBaseId
        baseOne.disabled = true
        expect(hooks.computeVisibilityMask(room, 'player-1')[baseOne.y][baseOne.x]).toBe(true)
        const originalBasePosition = { x: baseOne.x, y: baseOne.y }
        baseOne.x = -1
        baseOne.y = -1
        hooks.computeVisibilityMask(room, 'player-1')
        Object.assign(baseOne, originalBasePosition)
        baseOne.disabled = false
        room.structures.manualSight = { structureId: 'manualSight', ownerId: 'player-1', type: 'unknown', x: 0, y: 0, disabled: false }
        expect(hooks.computeVisibilityMask(room, 'player-1')[0][0]).toBe(true)
        delete room.structures.manualSight
        expect(hooks.getStructureSightRange('per')).toBe(20)
        expect(hooks.getStructureSightRange('missing')).toBe(0)
        expect(hooks.getNpcSightRange('zunim')).toBe(3)
        expect(hooks.getNpcSightRange('missing')).toBe(0)

        const visibleEnemy = hooks.createStructure(room, { ownerId: 'player-2', type: 'cover', x: baseOne.x + 2, y: baseOne.y })
        const filtered = game.getPublicState(match.hostKey, 'player-1')
        expect(filtered.structures[visibleEnemy.structureId]).toBeDefined()
        expect(filtered.memory.structures[visibleEnemy.structureId]).toMatchObject({ x: visibleEnemy.x, y: visibleEnemy.y })
        expect(filtered.players['player-2']).toHaveProperty('gamerTag', 'Bob')

        const farEnemyBase = Object.values(room.structures).find(structure => structure.type === 'base' && structure.ownerId === 'player-2')
        expect(filtered.structures[farEnemyBase.structureId]).toBeUndefined()
        expect(filtered.players['player-2']).toHaveProperty('coal')

        delete playerOne.memory
        expect(hooks.refreshPlayerMemory(room, 'player-1', hooks.computeVisibilityMask(room, 'player-1')).structures).toBeDefined()
        playerOne.memory = {}
        expect(hooks.refreshPlayerMemory(room, 'player-1', hooks.computeVisibilityMask(room, 'player-1')).structures).toBeDefined()
        playerOne.memory = { structures: { sparse: { structureId: 'sparse', ownerId: 'player-2', type: 'cover', x: 0, y: 0, level: 1, disabled: false } } }
        hooks.refreshPlayerMemory(room, 'player-1', [undefined])
        expect(hooks.refreshPlayerMemory(room, 'missing', hooks.computeVisibilityMask(room, 'missing'))).toEqual({ structures: {} })

        delete room.structures[visibleEnemy.structureId]
        hooks.refreshPlayerMemory(room, 'player-1', hooks.computeVisibilityMask(room, 'player-1'))
        expect(playerOne.memory.structures[visibleEnemy.structureId]).toBeUndefined()

        playerOne.respawnAt = Date.now() + 1000
        expect(hooks.moveCaptureUnitTo(room, playerOne, { x: baseOne.x + 1, y: baseOne.y })).toBe(false)
        playerOne.respawnAt = null
        expect(hooks.moveCaptureUnitTo(room, playerOne, { x: -1, y: baseOne.y })).toBe(false)
        baseOne.disabled = true
        playerOne.activeCaptureUnitId = null
        expect(hooks.moveCaptureUnitTo(room, playerOne, { x: baseOne.x + 1, y: baseOne.y })).toBe(false)
        baseOne.disabled = false

        expect(game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'move-capturer-to',
            x: baseOne.x + 3,
            y: baseOne.y,
        })).toBe(true)

        const capturer = room.units[playerOne.activeCaptureUnitId]
        capturer.order = { type: 'move', x: -1, y: -1 }
        expect(hooks.processCaptureUnitOrder(room, capturer, Date.now())).toBe(true)
        capturer.order = { type: 'move', x: capturer.x, y: capturer.y }
        expect(hooks.processCaptureUnitOrder(room, capturer, Date.now())).toBe(true)
        capturer.order = { type: 'move', x: capturer.x + 1, y: capturer.y }
        expect(hooks.processCaptureUnitOrder(room, capturer, Date.now())).toBe(true)
    })


})
