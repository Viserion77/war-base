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

function createOwnedStructures(game, room, player, type, count) {
    const castle = room.structures[player.castleId]
    const structures = []

    for (let index = 0; index < count; index += 1) {
        const tile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 6)
        structures.push(game.__testing.createStructure(room, {
            ownerId: player.playerId,
            type,
            x: tile.x,
            y: tile.y,
        }))
    }

    return structures
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
            gamerTag: '  Alice   Castle  ',
        })

        expect(match.state.players['player-1'].gamerTag).toBe('Alice Castle')
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

    test('builds a mine and rejects unknown actions', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const castle = getStructure(match.state, structure => structure.type === 'castle' && structure.ownerId === 'player-1')

        game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'build',
            structureType: 'mine',
            x: castle.x + 2,
            y: castle.y,
        })
        game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'dance',
        })

        const state = game.getPublicState(match.hostKey)
        expect(getPlayer(state, 'player-1').gold).toBe(210)
        expect(getStructure(state, structure => structure.type === 'mine' && structure.ownerId === 'player-1')).toMatchObject({
            x: castle.x + 2,
            y: castle.y,
            disabled: false,
        })
        expect(state.logs[0].message).toBe('Alice: unknown action: dance.')
    })

    test('upgrades the castle and unlocks library', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const castle = getStructure(match.state, structure => structure.type === 'castle' && structure.ownerId === 'player-1')

        createOwnedStructures(game, room, player, 'mine', 1)
        player.gold = 750

        game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'upgrade',
            structureId: castle.structureId,
        })

        const state = game.getPublicState(match.hostKey)
        expect(getStructure(state, structure => structure.structureId === castle.structureId)).toMatchObject({
            level: 2,
            maxIntegrity: 1025,
            maxBarrier: 525,
        })
        expect(getPlayer(state, 'player-1')).toMatchObject({
            gold: 0,
            unlocked: expect.objectContaining({ library: true }),
        })
    })

    test('enforces build limits and frees disabled owned slots', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const castle = room.structures[player.castleId]

        player.gold = 5000
        expect(game.__testing.getBuildLimit('mine', 1)).toBe(3)
        expect(game.__testing.getBuildLimit('mine', 2)).toBe(5)
        expect(game.__testing.getBuildLimit('mine', 20)).toBe(41)
        expect(game.__testing.getBuildLimit('missing', 1)).toBe(0)
        expect(game.__testing.getBuildLimit('castle', 1)).toBe(0)

        const covers = createOwnedStructures(game, room, player, 'mine', 3)
        const blockedTile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 6)

        expect(game.__testing.canBuildStructure(room, player, 'mine')).toBe(false)
        expect(game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'build',
            structureType: 'mine',
            x: blockedTile.x,
            y: blockedTile.y,
        })).toBe(false)
        expect(room.logs[0].message).toBe('Alice: Mine 3/3 - upgrade the castle to unlock more.')

        covers[0].disabled = true
        covers[0].integrity = 0
        covers[0].barrier = 0
        const rebuiltTile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 6)

        expect(game.__testing.canBuildStructure(room, player, 'mine')).toBe(true)
        expect(game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'build',
            structureType: 'mine',
            x: rebuiltTile.x,
            y: rebuiltTile.y,
        })).toBe(true)
        expect(game.__testing.countActiveOwnedStructures(room, 'player-1', 'mine')).toBe(3)
        expect(room.logs[0].message).toBe('Alice built Mine.')
    })

    test('caps soldiers at 3 per barracks level and tags units with barracksId', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const castle = room.structures[player.castleId]

        player.unlocked.barracks = true
        player.gold = 100000

        const tile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 6)
        const barracks = game.__testing.createStructure(room, {
            ownerId: 'player-1',
            type: 'barracks',
            x: tile.x,
            y: tile.y,
        })

        expect(game.__testing.getSoldierCapacity(1)).toBe(3)
        expect(game.__testing.getSoldierCapacity(2)).toBe(6)
        expect(game.__testing.getSoldierCapacity(0)).toBe(3)

        for (let index = 0; index < 3; index += 1) {
            expect(game.__testing.spawnNpc(room, player, { npcType: 'soldier' })).toBe(true)
        }

        expect(game.__testing.countSoldiersFromBarracks(room, barracks.structureId)).toBe(3)
        expect(game.__testing.countSoldiersFromBarracks(room, null)).toBe(0)

        const firstWave = Object.values(room.units).filter(unit => unit.type === 'soldier')
        expect(firstWave.every(unit => unit.barracksId === barracks.structureId)).toBe(true)

        expect(game.__testing.spawnNpc(room, player, { npcType: 'soldier' })).toBe(false)
        expect(room.logs[0].message).toBe('Alice: all Barracks at Soldier capacity.')

        const secondTile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 10)
        const secondBarracks = game.__testing.createStructure(room, {
            ownerId: 'player-1',
            type: 'barracks',
            x: secondTile.x,
            y: secondTile.y,
        })

        for (let index = 0; index < 3; index += 1) {
            expect(game.__testing.spawnNpc(room, player, { npcType: 'soldier' })).toBe(true)
        }
        expect(game.__testing.countSoldiersFromBarracks(room, secondBarracks.structureId)).toBe(3)
        expect(game.__testing.spawnNpc(room, player, { npcType: 'soldier' })).toBe(false)

        barracks.level = 2
        for (let index = 0; index < 3; index += 1) {
            expect(game.__testing.spawnNpc(room, player, { npcType: 'soldier' })).toBe(true)
        }
        expect(game.__testing.countSoldiersFromBarracks(room, barracks.structureId)).toBe(6)
        expect(game.__testing.spawnNpc(room, player, { npcType: 'soldier' })).toBe(false)

        expect(game.__testing.pickBarracksForSpawn(room, [barracks], 'herald')).toBe(barracks)
    })

    test('caps non-castle upgrades at the owner castle level', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const castle = room.structures[player.castleId]
        const mine = createOwnedStructures(game, room, player, 'mine', 1)[0]

        player.gold = 10000
        expect(game.__testing.upgradeStructure(room, player, { structureId: castle.structureId })).toBe(true)
        expect(castle.level).toBe(2)
        expect(game.__testing.upgradeStructure(room, player, { structureId: mine.structureId })).toBe(true)
        expect(mine.level).toBe(2)

        expect(game.__testing.upgradeStructure(room, player, { structureId: mine.structureId })).toBe(false)
        expect(room.logs[0].message).toBe('Alice: Mine is already at the max level allowed by the castle (lvl 2). Upgrade the castle to unlock more.')

        expect(game.__testing.upgradeStructure(room, player, { structureId: castle.structureId })).toBe(true)
        expect(castle.level).toBe(3)
        expect(game.__testing.upgradeStructure(room, player, { structureId: mine.structureId })).toBe(true)
        expect(mine.level).toBe(3)
    })

    test('allows capture over cap but blocks more builds of that type', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const castle = room.structures[player.castleId]

        player.gold = 5000
        createOwnedStructures(game, room, player, 'mine', 3)
        const targetTile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 6)
        const target = game.__testing.createStructure(room, {
            ownerId: null,
            type: 'mine',
            x: targetTile.x,
            y: targetTile.y,
            disabled: true,
        })

        game.__testing.captureStructure(room, target, player)
        expect(game.__testing.countActiveOwnedStructures(room, 'player-1', 'mine')).toBe(4)
        expect(target.ownerId).toBe('player-1')
        expect(target.disabled).toBe(false)

        const buildTile = game.__testing.getEmptyTileNear(room, castle.x, castle.y, 6)
        expect(game.executeAction({
            playerId: 'player-1',
            hostKey: match.hostKey,
            action: 'build',
            structureType: 'mine',
            x: buildTile.x,
            y: buildTile.y,
        })).toBe(false)
        expect(room.logs[0].message).toBe('Alice: Mine 4/3 - no new slots until count drops below the limit.')
    })

    test('exposes filtered build limits in the public catalog', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']

        createOwnedStructures(game, room, player, 'mine', 1)

        const filtered = game.getPublicState(match.hostKey, 'player-1')
        const unfiltered = game.getPublicState(match.hostKey)

        expect(filtered.catalog.structures.mine).toMatchObject({ buildLimitBase: 3, buildLimitSlope: 2 })
        expect(filtered.catalog.limits).toMatchObject({
            mine: { current: 1, max: 3 },
            library: { current: 0, max: 1 },
            archer: { current: 0, max: 1 },
            catapult: { current: 0, max: 1 },
            barracks: { current: 0, max: 1 },
        })
        expect(game.__testing.computePlayerLimits(room, 'missing').mine).toEqual({ current: 0, max: 0 })
        expect(unfiltered.catalog.limits).toBeUndefined()
    })

    test('generates resources and researches a tower unlock', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
            const castle = getStructure(match.state, structure => structure.type === 'castle' && structure.ownerId === 'player-1')

            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'build',
                structureType: 'mine',
                x: castle.x + 2,
                y: castle.y,
            })
            game.start()
            jest.advanceTimersByTime(27000)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'upgrade',
                structureId: castle.structureId,
            })
            jest.advanceTimersByTime(16000)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'build',
                structureType: 'library',
                x: castle.x + 3,
                y: castle.y,
            })
            jest.advanceTimersByTime(8000)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'research',
                recipe: 'archer',
            })

            let state = game.getPublicState(match.hostKey)
            expect(getPlayer(state, 'player-1').unlocked.archer).toBe(true)
            expect(getPlayer(state, 'player-1').wisdom).toBeCloseTo(5 / 3, 4)
            expect(getStructure(state, structure => structure.type === 'library' && structure.ownerId === 'player-1')).toBeDefined()

            const neutralCover = getStructure(state, structure => structure.type === 'mine' && structure.ownerId === null)
            const captureRoom = game.__testing.getRoom(match.hostKey)
            const capturePlayer = captureRoom.players['player-1']
            const captureHerald = game.__testing.spawnCaptureUnit(captureRoom, capturePlayer) || Object.values(captureRoom.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')
            game.__testing.assignHeraldCaptureOrder(captureRoom, capturePlayer, captureHerald, captureRoom.structures[neutralCover.structureId])
            jest.advanceTimersByTime(80000)
            state = game.getPublicState(match.hostKey)
            const capturedCover = getStructure(state, structure => structure.structureId === neutralCover.structureId)
            game.executeAction({
                playerId: 'player-1',
                hostKey: match.hostKey,
                action: 'build',
                structureType: 'archer',
                x: capturedCover.x + 5,
                y: capturedCover.y,
            })
            jest.advanceTimersByTime(1000)

            state = game.getPublicState(match.hostKey)
            expect(getStructure(state, structure => structure.type === 'archer' && structure.ownerId === 'player-1')).toBeDefined()
        } finally {
            jest.useRealTimers()
        }
    })

    test('autonomous herald captures a neutral factory over ticks', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            const room = game.__testing.getRoom(match.hostKey)
            const player = room.players['player-1']
            const neutralCover = getStructure(game.getPublicState(match.hostKey), structure => structure.type === 'mine' && structure.ownerId === null)
            const herald = Object.values(room.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')

            game.__testing.assignHeraldCaptureOrder(room, player, herald, room.structures[neutralCover.structureId])

            game.start()
            jest.advanceTimersByTime(80000)

            const state = game.getPublicState(match.hostKey)
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

    test('denies invalid build, upgrade, research, and player actions', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })

        const initialState = game.getPublicState(match.hostKey)
        const playerOneCastle = getStructure(initialState, structure => structure.type === 'castle' && structure.ownerId === 'player-1')
        const playerTwoCastle = getStructure(initialState, structure => structure.type === 'castle' && structure.ownerId === 'player-2')

        game.executeAction({ playerId: 'ghost', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: 1, y: 1 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'castle', x: 6, y: 4 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'archer', x: 6, y: 4 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: -1, y: 4 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: playerOneCastle.x, y: playerOneCastle.y })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: 40, y: 25 })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: playerOneCastle.x + 2, y: playerOneCastle.y })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: playerOneCastle.x + 3, y: playerOneCastle.y })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: 'missing' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: playerTwoCastle.structureId })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'research', recipe: 'unknown' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'research', recipe: 'archer' })
        game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'spawn-npc' })
        game.disconnectPlayer({ playerId: 'missing-player' })
        game.disconnectPlayer({ playerId: 'missing-player', hostKey: match.hostKey })

        const messages = game.getPublicState(match.hostKey).logs.map(log => log.message)
        expect(messages.length).toBeGreaterThanOrEqual(5)
        expect(messages).toEqual(expect.arrayContaining([
            'Alice needs 540 gold for Mine.',
            'Alice: no structure selected for upgrade.',
            'Alice: select one of your structures to upgrade.',
            'Alice needs Library level 1.',
            'Alice: NPC unavailable.',
        ]))
    })

    test('unlocks Barracks and spawns a Soldier that advances toward an enemy castle', () => {
        jest.useFakeTimers()
        try {
            const game = createGame()
            const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
            game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })

            const castle = getStructure(match.state, structure => structure.type === 'castle' && structure.ownerId === 'player-1')
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: castle.x + 2, y: castle.y })

            game.start()
            jest.advanceTimersByTime(27000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: castle.structureId })
            jest.advanceTimersByTime(16000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'library', x: castle.x + 3, y: castle.y })
            jest.advanceTimersByTime(24000)

            const library = getStructure(game.getPublicState(match.hostKey), structure => structure.type === 'library' && structure.ownerId === 'player-1')
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'upgrade', structureId: library.structureId })
            jest.advanceTimersByTime(4000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'research', recipe: 'barracks' })
            jest.advanceTimersByTime(26000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'barracks', x: castle.x + 4, y: castle.y })
            jest.advanceTimersByTime(4000)
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'spawn-npc', npcType: 'soldier' })

            let state = game.getPublicState(match.hostKey)
            const unit = Object.values(state.units).find(candidate => candidate.type === 'soldier')
            expect(unit).toMatchObject({ ownerId: 'player-1', damage: 10 })

            jest.advanceTimersByTime(10000)
            state = game.getPublicState(match.hostKey)
            expect({ x: state.units[unit.unitId].x, y: state.units[unit.unitId].y }).not.toEqual({ x: unit.x, y: unit.y })

            jest.advanceTimersByTime(200000)
            state = game.getPublicState(match.hostKey)
            const movedUnit = state.units[unit.unitId]
            expect(movedUnit ? movedUnit.x : null).not.toBe(unit.x)
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
            const baseOne = room.structures[playerOne.castleId]
            const baseTwo = room.structures[playerTwo.castleId]

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
            game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: 7, y: 5 })
            room.winnerId = null
            game.executeAction({ playerId: 'nobody', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: 7, y: 5 })
            game.executeAction({ playerId: 'player-1', hostKey: 'missing', action: 'build', structureType: 'mine', x: 7, y: 5 })

            const disabledCover = game.__testing.createStructure(room, { ownerId: 'player-1', type: 'mine', x: 7, y: 5, disabled: true })
            game.__testing.upgradeStructure(room, playerOne, { structureId: disabledCover.structureId })
            game.__testing.upgradeStructure(room, playerOne, { structureId: baseOne.structureId })
            playerOne.unlocked.archer = true
            game.__testing.researchRecipe(room, playerOne, { recipe: 'archer' })
            playerOne.unlocked.archer = false
            game.__testing.researchRecipe(room, playerOne, { recipe: 'archer' })

            playerOne.unlocked.barracks = true
            game.__testing.spawnNpc(room, playerOne, { npcType: 'soldier' })
            const barracks = game.__testing.createStructure(room, { ownerId: 'player-1', type: 'barracks', x: 8, y: 5 })
            playerOne.gold = 0
            game.__testing.spawnNpc(room, playerOne, { npcType: 'soldier' })
            playerOne.gold = 1000
            game.__testing.spawnNpc(room, playerOne, { npcType: 'soldier' })
            expect(Object.values(room.units).some(unit => unit.type === 'soldier')).toBe(true)

            playerOne.respawnAt = null
            const orderHerald = game.__testing.spawnCaptureUnit(room, playerOne) || Object.values(room.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')
            if (orderHerald) {
                game.__testing.assignHeraldCaptureOrder(room, playerOne, orderHerald, disabledCover)
            }

            game.__testing.applyDamageToPlayer(room, playerOne, 500, Date.now(), 'player-2')
            expect(playerOne.respawnAt).toBeTruthy()
            jest.advanceTimersByTime(room.config?.respawnDelayMs || 30000)
            game.__testing.processPlayerRespawns(room, Date.now() + 30000)

            const herald = Object.values(room.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')
            if (herald) {
                game.__testing.applyDamageToUnit(room, herald, 500, Date.now(), 'player-2')
            }

            game.__testing.applyDamageToStructure(room, disabledCover, 10, Date.now(), 'player-2')
            const targetCover = game.__testing.createStructure(room, { ownerId: 'player-2', type: 'mine', x: baseOne.x + 1, y: baseOne.y + 1 })
            game.__testing.applyDamageToStructure(room, targetCover, 1000, Date.now(), 'player-1')
            expect(targetCover.disabled).toBe(true)

            game.__testing.applyDamage(room, { kind: 'structure', value: baseTwo }, 5000, Date.now(), 'player-1')
            expect(playerTwo.alive).toBe(false)
            expect(room.winnerId).toBe('player-1')

            expect(game.__testing.getStepToward(room, { x: 0, y: 0 }, { x: 0, y: 3 })).toEqual({ x: 0, y: 1 })
            expect(game.__testing.getEmptyTileNear(room, -20, -20, 1)).toBeNull()
            expect(game.__testing.summarizeActor(playerOne)).toHaveProperty('playerId', 'player-1')
            expect(game.__testing.summarizeActor({ unitId: 'u', ownerId: 'player-1', type: 'soldier', x: 1, y: 1, integrity: 1, barrier: 0 })).toHaveProperty('unitId', 'u')
        } finally {
            jest.useRealTimers()
        }
    })


    test('starts new towers on cooldown instead of firing immediately', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const buildAt = 100000
        const playerTwo = room.players['player-2']
        const baseTwo = room.structures[playerTwo.castleId]

        room.units = {}
        playerTwo.avatarDeployed = true
        playerTwo.respawnAt = null
        playerTwo.x = baseTwo.x
        playerTwo.y = baseTwo.y - 2
        playerTwo.integrity = playerTwo.maxIntegrity
        playerTwo.barrier = playerTwo.maxBarrier

        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(buildAt)
        const tower = hooks.createStructure(room, { ownerId: 'player-1', type: 'archer', x: baseTwo.x - 1, y: baseTwo.y })
        nowSpy.mockRestore()

        const barrierBefore = playerTwo.barrier
        const archerCooldown = game.getPublicState(match.hostKey).catalog.structures.archer.attackEveryMs
        expect(tower.createdAt).toBe(buildAt)
        expect(tower.lastAttackAt).toBe(buildAt)
        expect(hooks.processTowerAttacks(room, buildAt + archerCooldown - 1)).toBe(false)
        expect(playerTwo.barrier).toBe(barrierBefore)
        expect(hooks.processTowerAttacks(room, buildAt + archerCooldown)).toBe(true)
        expect(playerTwo.barrier).toBeLessThan(barrierBefore)
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
        const baseOne = room.structures[playerOne.castleId]
        const baseTwo = room.structures[playerTwo.castleId]

        playerOne.gold = 0
        hooks.upgradeStructure(room, playerOne, { structureId: baseOne.structureId })
        const library = hooks.createStructure(room, { ownerId: 'player-1', type: 'library', x: baseOne.x + 2, y: baseOne.y + 2 })
        playerOne.wisdom = 0
        hooks.researchRecipe(room, playerOne, { recipe: 'catapult' })
        playerOne.wisdom = 100
        playerOne.unlocked.catapult = false
        hooks.researchRecipe(room, playerOne, { recipe: 'catapult' })
        expect(playerOne.unlocked.catapult).toBe(true)

        playerOne.unlocked.barracks = true
        hooks.spawnNpc(room, playerOne, { npcType: 'soldier' })
        const boxedTujai = hooks.createStructure(room, { ownerId: 'player-1', type: 'barracks', x: 20, y: 20 })
        playerOne.gold = 1000
        for (const [index, offset] of [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
        ].entries()) {
            hooks.createStructure(room, { ownerId: 'player-1', type: 'mine', x: boxedTujai.x + offset[0], y: boxedTujai.y + offset[1], structureId: 'box-' + index })
        }
        hooks.spawnNpc(room, playerOne, { npcType: 'soldier' })

        const neutralCover = Object.values(room.structures).find(structure => structure.type === 'mine' && structure.ownerId === null)
        baseOne.disabled = true
        playerOne.activeCaptureUnitId = null
        const failedHerald = hooks.spawnCaptureUnit(room, playerOne)
        if (failedHerald) {
            hooks.assignHeraldCaptureOrder(room, playerOne, failedHerald, neutralCover)
        }
        playerOne.respawnAt = now - 1
        hooks.processPlayerRespawns(room, now)
        baseOne.disabled = false

        room.units['orphan-herald'] = { unitId: 'orphan-herald', ownerId: 'missing', type: 'herald', x: 1, y: 1, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, order: null }
        hooks.processCaptureUnitOrders(room, now)
        expect(room.units['orphan-herald']).toBeUndefined()

        const herald = {
            unitId: 'manual-herald',
            ownerId: 'player-1',
            playerId: 'player-1',
            type: 'herald',
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
        room.units[herald.unitId] = herald
        playerOne.order = { ...herald.order, unitId: herald.unitId }
        hooks.processCaptureUnitOrders(room, now)
        expect(herald.order).toBeNull()

        const ownCover = hooks.createStructure(room, { ownerId: 'player-1', type: 'mine', x: neutralCover.x + 1, y: neutralCover.y })
        herald.order = { type: 'capture', structureId: ownCover.structureId, unitId: herald.unitId }
        hooks.processCaptureUnitOrders(room, now + 1000)
        expect(herald.order).toBeNull()

        neutralCover.capture = { playerId: 'player-1', progressMs: 1000 }
        hooks.processCaptures(room)
        expect(neutralCover.capture).toBeNull()

        const weakZunim = { unitId: 'weak-soldier', ownerId: 'player-1', type: 'soldier', x: 2, y: 2, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        room.units[weakZunim.unitId] = weakZunim
        hooks.applyDamage(room, { kind: 'unit', value: weakZunim }, 10, now, 'player-2')
        expect(room.units[weakZunim.unitId]).toBeUndefined()

        hooks.applyDamage(room, { kind: 'player', value: { ...playerOne, avatarDeployed: false } }, 10, now, 'player-2')
        hooks.applyDamageToUnit(room, { unitId: 'ghost-herald', ownerId: 'missing', type: 'herald', integrity: 0, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }, 10, now, 'player-2')
        hooks.eliminatePlayer(room, 'missing', 'player-1')

        const catapult = hooks.createStructure(room, { ownerId: 'player-1', type: 'catapult', x: baseTwo.x - 1, y: baseTwo.y })
        catapult.lastAttackAt = 0
        playerTwo.avatarDeployed = true
        playerTwo.x = baseTwo.x
        playerTwo.y = baseTwo.y
        hooks.processTowerAttacks(room, now + 2000)
        expect(playerTwo.barrier).toBeLessThan(playerTwo.maxBarrier)

        const enemyCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: baseTwo.x, y: baseTwo.y - 1 })
        room.units['enemy-soldier'] = { unitId: 'enemy-soldier', ownerId: 'player-2', type: 'soldier', x: baseTwo.x, y: baseTwo.y - 2, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        hooks.applyDamageToStructure(room, enemyCover, 1000, now, 'player-1')
        hooks.applyDamageToStructure(room, baseTwo, 5000, now, 'player-1')
        expect(room.units['enemy-soldier']).toBeUndefined()

        expect(hooks.getStepToward(room, { x: 0, y: 0 }, { x: -3, y: -3 })).toBeNull()
        expect(hooks.getEmptyNeighbor(room, -10, -10)).toBeNull()
        expect(library).toBeDefined()
    })

    test('lets troops jump allied structures, destroy path blockers, and respawn capturers near blocked bases', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const now = 500000
        const playerOne = room.players['player-1']
        const baseOne = room.structures[playerOne.castleId]

        const jumper = { unitId: 'jump-soldier', ownerId: 'player-1', type: 'soldier', x: 10, y: 10 }
        hooks.createStructure(room, { ownerId: 'player-1', type: 'mine', x: 11, y: 10, structureId: 'jump-allied-mine' })
        expect(hooks.getStepToward(room, jumper, { x: 14, y: 10 })).toEqual({ x: 12, y: 10 })

        const pathCapturer = {
            unitId: 'path-herald',
            ownerId: 'player-1',
            playerId: 'player-1',
            type: 'herald',
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
        const enemyBlocker = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 11, y: 12 })
        enemyBlocker.integrity = 20
        enemyBlocker.barrier = 0
        room.units[pathCapturer.unitId] = pathCapturer
        expect(hooks.processCaptureUnitOrder(room, pathCapturer, now)).toBe(true)
        expect(room.structures[enemyBlocker.structureId]).toBeUndefined()
        expect(pathCapturer.x).toBe(10)

        const neutralBlocker = hooks.createStructure(room, { ownerId: null, type: 'mine', x: 11, y: 13 })
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
                room.structures[structureId] = { ...baseOne, structureId, type: 'mine', x, y }
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
        const baseOne = room.structures[playerOne.castleId]
        const baseTwo = room.structures[playerTwo.castleId]

        playerOne.avatarDeployed = true
        playerOne.integrity = playerOne.maxIntegrity
        playerOne.barrier = 1
        playerOne.lastDamagedAt = 0
        room.units['regen-unit'] = {
            unitId: 'regen-unit',
            ownerId: 'player-1',
            type: 'soldier',
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
        const regenPerTick = game.getPublicState(match.hostKey).config.shieldRegenPerSecond * game.getPublicState(match.hostKey).config.tickRateMs / 1000
        expect(room.units['regen-unit'].barrier).toBe(1 + regenPerTick)
        expect(playerOne.barrier).toBe(1 + regenPerTick)

        const cooldownTower = hooks.createStructure(room, { ownerId: 'player-1', type: 'archer', x: 0, y: 0 })
        cooldownTower.lastAttackAt = now
        expect(hooks.processTowerAttacks(room, now + 1)).toBe(false)
        cooldownTower.lastAttackAt = 0
        expect(hooks.processTowerAttacks(room, now + 2000)).toBe(false)

        room.units['ownerless-soldier'] = { unitId: 'ownerless-soldier', ownerId: 'missing', type: 'soldier', x: 1, y: 1, integrity: 1, maxIntegrity: 1, barrier: 0, maxBarrier: 0, lastAttackAt: 0, lastDamagedAt: 0 }
        hooks.processNpcActions(room, now)
        expect(room.units['ownerless-soldier']).toBeUndefined()

        baseTwo.disabled = true
        playerTwo.alive = false
        room.units['idle-soldier'] = { unitId: 'idle-soldier', ownerId: 'player-1', type: 'soldier', x: 2, y: 2, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: 0, lastDamagedAt: 0 }
        hooks.processNpcActions(room, now + 3000)
        delete room.units['idle-soldier']
        baseTwo.disabled = false
        playerTwo.alive = true

        room.players['player-3'] = { ...playerTwo, playerId: 'player-3', ownerId: 'player-3', gamerTag: 'Carol', alive: true, castleId: 'extra-castle' }
        room.structures['extra-castle'] = { ...baseTwo, structureId: 'extra-castle', ownerId: 'player-3', x: baseTwo.x - 3, y: baseTwo.y }
        room.units['sort-soldier'] = { unitId: 'sort-soldier', ownerId: 'player-1', type: 'soldier', x: baseTwo.x - 5, y: baseTwo.y, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: 0, lastDamagedAt: 0 }
        expect(hooks.processNpcActions(room, now + 4000)).toBe(true)
        delete room.units['sort-soldier']
        delete room.players['player-3']
        delete room.structures['extra-castle']

        const disabledEnemyCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 12, y: 12, disabled: true })
        const herald = {
            unitId: 'combat-herald',
            ownerId: 'player-1',
            type: 'herald',
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
        const enemyCapturer = { ...herald, unitId: 'enemy-herald', ownerId: 'player-2', x: 12, y: 12, integrity: 80, barrier: 0, order: null, lastAttackAt: 0 }
        room.units[herald.unitId] = herald
        room.units[enemyCapturer.unitId] = enemyCapturer
        playerTwo.avatarDeployed = true
        playerTwo.x = 13
        playerTwo.y = 12
        expect(hooks.processCaptureUnitOrder(room, herald, now + 500)).toBe(false)
        expect(hooks.processCaptureUnitOrder(room, herald, now + 1500)).toBe(true)
        expect(enemyCapturer.integrity).toBeLessThan(80)

        herald.x = 10
        herald.y = 12
        herald.attackRange = 0.5
        herald.lastAttackAt = 0
        expect(hooks.processCaptureUnitOrder(room, herald, now + 3000)).toBe(true)
        expect(herald.x).toBe(11)

        const activeEnemyCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 15, y: 15 })
        herald.order = { type: 'capture', structureId: activeEnemyCover.structureId }
        herald.x = 12
        herald.y = 15
        herald.attackRange = 1.5
        herald.lastAttackAt = 0
        expect(hooks.processCaptureUnitOrder(room, herald, now + 4000)).toBe(true)
        expect(herald.x).toBe(13)
        herald.x = 15
        herald.y = 14
        expect(hooks.processCaptureUnitOrder(room, herald, now + 6000)).toBe(true)
        expect(activeEnemyCover.barrier).toBeLessThan(activeEnemyCover.maxBarrier)

        const boxedTarget = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 0, y: 0 })
        const boxUnit = { ...herald, unitId: 'boxed-herald', x: 1, y: 1, attackRange: 0.1, order: { type: 'capture', structureId: boxedTarget.structureId } }
        room.units[boxUnit.unitId] = boxUnit
        room.structures['box-a'] = { ...baseOne, structureId: 'box-a', x: 0, y: 1 }
        room.structures['box-b'] = { ...baseOne, structureId: 'box-b', x: 1, y: 0 }
        expect(hooks.processCaptureUnitOrder(room, boxUnit, now + 7000)).toBe(false)

        hooks.captureStructure(room, disabledEnemyCover, { playerId: 'ghost' })
        expect(disabledEnemyCover.disabled).toBe(true)

        const tower = hooks.createStructure(room, { ownerId: 'player-1', type: 'archer', x: 20, y: 20 })
        room.units['near-unit'] = { unitId: 'near-unit', ownerId: 'player-2', type: 'soldier', x: 21, y: 20, integrity: 50, maxIntegrity: 50, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        room.units['far-unit'] = { unitId: 'far-unit', ownerId: 'player-2', type: 'soldier', x: 22, y: 20, integrity: 50, maxIntegrity: 50, barrier: 0, maxBarrier: 0, lastDamagedAt: 0 }
        tower.lastAttackAt = 0
        expect(hooks.processTowerAttacks(room, now + 8000)).toBe(true)
        expect(room.units['near-unit'].integrity).toBeLessThan(50)

        const captureTarget = hooks.createStructure(room, { ownerId: null, type: 'mine', x: 25, y: 20, disabled: true })
        room.units['capture-sort-a'] = { ...herald, unitId: 'capture-sort-a', ownerId: 'player-1', playerId: 'player-1', x: 25, y: 19, order: { type: 'capture', structureId: captureTarget.structureId } }
        room.units['capture-sort-b'] = { ...herald, unitId: 'capture-sort-b', ownerId: 'player-1', playerId: 'player-1', x: 24, y: 20, order: { type: 'capture', structureId: captureTarget.structureId } }
        expect(hooks.processCaptures(room)).toBe(true)
        expect(captureTarget.capture.playerId).toBe('player-1')

        playerOne.activeCaptureUnitId = 'combat-herald'
        hooks.assignHeraldCaptureOrder(room, playerOne, room.units['combat-herald'], captureTarget)
        expect(room.units['combat-herald'].order.structureId).toBe(captureTarget.structureId)
        playerOne.activeCaptureUnitId = null
        const reissuedHerald = hooks.spawnCaptureUnit(room, playerOne) || Object.values(room.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')
        if (reissuedHerald) {
            hooks.assignHeraldCaptureOrder(room, playerOne, reissuedHerald, captureTarget)
        }
        expect(Object.values(room.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')).toBeDefined()

        captureTarget.capture = { playerId: 'player-1', progressMs: 100 }
        hooks.applyDamageToPlayer(room, playerOne, 10000, now + 9000)
        expect(captureTarget.capture).toBeNull()

        expect(hooks.canBuildStructure(room, playerOne, 'castle')).toBe(false)
        expect(hooks.canBuildStructure(room, { ...playerOne, castleId: 'missing-castle' }, 'mine')).toBe(false)
        expect(hooks.getBuildLimitStatus(room, { ...playerOne, castleId: 'missing-castle' }, 'mine')).toBeNull()
        const tinyRoom = {
            structures: { block: { x: 1, y: 0 } },
            players: {},
            units: { actor: { x: 0, y: 1 } },
        }
        expect(hooks.getEmptyTileNear(tinyRoom, 0, 0, 1)).toEqual({ x: 1, y: 1 })
        const missingOwnerCover = hooks.createStructure(room, { ownerId: 'ghost-owner', type: 'mine', x: 30, y: 20 })
        hooks.applyDamageToStructure(room, missingOwnerCover, 1000, now + 10000)
        expect(room.logs[0].message).toContain('Neutral')
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
        const baseOne = room.structures[playerOne.castleId]
        const baseTwo = room.structures[playerTwo.castleId]

        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'toggle-autoplay', enabled: true })).toBe(false)
        expect(room.logs[0].message).toBe('Alice: AI is unavailable for autoplay.')
        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'toggle-autoplay', enabled: false })).toBe(false)
        playerOne.autoplay = true
        game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'd' })
        playerOne.autoplay = false

        game.movePlayer({ playerId: 'player-1', hostKey: match.hostKey, keyPressed: 'w' })
        game.executeAction({ playerId: 'player-1', action: undefined })
        game.executeAction({ playerId: 'ghost', action: 'build', structureType: 'mine', x: 1, y: 1 })

        const orderedCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 31, y: 21 })
        room.units['ordered-herald'] = { unitId: 'ordered-herald', ownerId: 'player-1', type: 'herald', x: 30, y: 21, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, order: { type: 'capture', structureId: orderedCover.structureId } }
        playerOne.order = { type: 'capture', structureId: orderedCover.structureId }
        hooks.applyDamageToStructure(room, orderedCover, 10000, now + 1, 'player-1', { removeOnDestroyed: true })
        expect(room.units['ordered-herald'].order).toBeNull()
        expect(playerOne.order).toBeNull()

        const disabledCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 10, y: 10, disabled: true })
        const herald = {
            unitId: 'branch-herald',
            ownerId: 'player-1',
            type: 'herald',
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
        room.units[herald.unitId] = herald
        room.units['far-enemy-herald'] = { ...herald, unitId: 'far-enemy-herald', ownerId: 'player-2', x: 20, y: 20, order: null }
        playerTwo.avatarDeployed = false
        hooks.processCaptureUnitOrder(room, herald, now)

        const regenUnit = { unitId: 'fresh-barrier', ownerId: 'player-1', type: 'soldier', x: 3, y: 3, integrity: 1, maxIntegrity: 1, barrier: 1, maxBarrier: 10, lastDamagedAt: now }
        room.units[regenUnit.unitId] = regenUnit
        playerOne.avatarDeployed = true
        playerOne.barrier = 1
        playerOne.lastDamagedAt = now
        hooks.regenerateBarriers(room, now + 1000)
        expect(regenUnit.barrier).toBe(1)
        expect(playerOne.barrier).toBe(1)

        room.units = {}
        const obstacleActor = { unitId: 'obstacle-actor', ownerId: 'player-1', type: 'herald', x: baseTwo.x - 1, y: baseTwo.y - 1, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: 0, lastDamagedAt: 0 }
        const obstacleCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: baseTwo.x - 2, y: baseTwo.y })
        room.units[obstacleActor.unitId] = obstacleActor
        const obstacleCooldown = { unitId: 'obstacle-cooldown', ownerId: 'player-1', type: 'soldier', x: baseTwo.x - 2, y: baseTwo.y - 1, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 0.1, attackEveryMs: 1000, lastAttackAt: now + 3000, lastDamagedAt: 0 }
        room.units[obstacleCooldown.unitId] = obstacleCooldown
        hooks.processNpcActions(room, now + 3500)
        delete room.units[obstacleCooldown.unitId]
        const obstacleNoDamage = { ...obstacleCooldown, unitId: 'obstacle-no-damage', damage: 0, lastAttackAt: 0 }
        room.units[obstacleNoDamage.unitId] = obstacleNoDamage
        hooks.processNpcActions(room, now + 5000)
        delete room.units[obstacleNoDamage.unitId]
        delete room.units[obstacleActor.unitId]
        delete room.structures[obstacleCover.structureId]

        const attackingZunim = { unitId: 'cooldown-soldier', ownerId: 'player-1', type: 'soldier', x: baseTwo.x - 1, y: baseTwo.y, integrity: 10, maxIntegrity: 10, barrier: 0, maxBarrier: 0, damage: 1, attackRange: 1, attackEveryMs: 1000, lastAttackAt: now, lastDamagedAt: 0 }
        room.units[attackingZunim.unitId] = attackingZunim
        expect(hooks.processNpcActions(room, now + 500)).toBe(false)
        delete room.units[attackingZunim.unitId]
        const blockedZunim = { ...attackingZunim, unitId: 'blocked-soldier', x: baseTwo.x - 2, y: baseTwo.y - 1, attackRange: 0.1, lastAttackAt: 0 }
        room.units[blockedZunim.unitId] = blockedZunim
        room.structures['npc-block-a'] = { ...baseOne, structureId: 'npc-block-a', x: baseTwo.x - 1, y: baseTwo.y - 1 }
        room.structures['npc-block-b'] = { ...baseOne, structureId: 'npc-block-b', x: baseTwo.x - 2, y: baseTwo.y }
        expect(hooks.processNpcActions(room, now + 2000)).toBe(true)
        expect(blockedZunim).toMatchObject({ x: baseTwo.x, y: baseTwo.y - 1 })

        hooks.captureStructure(room, disabledCover, { ownerId: 'player-1' })
        expect(disabledCover.ownerId).toBe('player-1')
        const anotherDisabledCover = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: 12, y: 10, disabled: true })
        hooks.captureStructure(room, anotherDisabledCover, { playerId: 'player-1', order: null })
        expect(anotherDisabledCover.ownerId).toBe('player-1')

        const looseCapturer = { ...herald, unitId: 'loose-herald', ownerId: 'player-1', integrity: 1, barrier: 0 }
        room.units[looseCapturer.unitId] = looseCapturer
        hooks.applyDamageToUnit(room, looseCapturer, 10, now + 3000)
        expect(room.logs[0].message).toContain('combat')

        room.players['no-castle'] = { ...playerTwo, playerId: 'no-castle', ownerId: 'no-castle', gamerTag: 'No Castle', alive: true, castleId: 'missing-castle' }
        hooks.eliminatePlayer(room, 'no-castle')
        expect(room.logs[0].message).toContain('combat')

        const respawnPlayer = { ...playerOne, castleId: baseOne.structureId }
        for (const [index, offset] of [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
        ].entries()) {
            room.structures['respawn-block-' + index] = { ...baseOne, structureId: 'respawn-block-' + index, x: baseOne.x + offset[0], y: baseOne.y + offset[1] }
        }
        expect(hooks.getRespawnTile(room, respawnPlayer)).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    })



    test('adds an AI player and lets the injected neural agent issue a build order', () => {
        const game = createGame({
            aiAgent: {
                cooldownMs: 1000,
                decide: jest.fn(({ state, playerId }) => {
                    const player = state.players[playerId]
                    const castle = state.structures[player.castleId]

                    return {
                        action: 'build',
                        structureType: 'mine',
                        x: castle.x + 2,
                        y: castle.y,
                        checkedPlayerId: playerId,
                    }
                }),
            },
        })
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice', connected: false })
        const result = game.addAiPlayer({ hostKey: match.hostKey, gamerTag: 'Bot Neural', requestedBy: 'player-1' })
        const room = game.__testing.getRoom(match.hostKey)

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
        const newState = game.getPublicState(match.hostKey)
        expect(Object.values(newState.structures).some(structure => structure.type === 'mine' && structure.ownerId === result.playerId)).toBe(true)
        expect(game.__testing.getRoom(match.hostKey).hasHadCombatants).toBe(true)
    })

    test('toggles autoplay so the neural agent can control an existing player', () => {
        const agent = {
            cooldownMs: 0,
            decide: jest.fn(({ state, playerId }) => {
                const player = state.players[playerId]
                const castle = state.structures[player.castleId]
                return { action: 'build', structureType: 'mine', x: castle.x + 2, y: castle.y }
            }),
        }
        const game = createGame({ aiAgent: agent })
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const room = game.__testing.getRoom(match.hostKey)
        const player = room.players['player-1']
        const castle = room.structures[player.castleId]

        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'toggle-autoplay', enabled: true })).toBe(true)
        expect(player.autoplay).toBe(true)
        expect(room.aiPlayers['player-1']).toMatchObject({ playerId: 'player-1', autoplay: true })
        expect(game.getPublicState(match.hostKey).players['player-1'].autoplay).toBe(true)
        expect(game.executeAction({ playerId: 'player-1', hostKey: match.hostKey, action: 'build', structureType: 'mine', x: castle.x + 1, y: castle.y })).toBe(false)

        expect(game.__testing.runAiPlayers(room, 10000)).toBe(true)
        expect(agent.decide).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'player-1' }))
        expect(Object.values(room.structures).some(structure => structure.type === 'mine' && structure.ownerId === 'player-1')).toBe(true)

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

        const nullDecisionAgent = { cooldownMs: 0, decide: jest.fn(() => null) }
        const nullDecisionGame = createGame({ aiAgent: nullDecisionAgent })
        const nullDecisionMatch = nullDecisionGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        const nullAi = nullDecisionGame.addAiPlayer({ hostKey: nullDecisionMatch.hostKey })
        expect(nullDecisionGame.__testing.runAiPlayers(nullDecisionGame.__testing.getRoom(nullDecisionMatch.hostKey), 10000)).toBe(false)
        expect(nullDecisionAgent.decide).toHaveBeenCalledWith(expect.objectContaining({ playerId: nullAi.playerId }))

        const emptyDecisionGame = createGame({ aiAgent: { cooldownMs: 0, decide: jest.fn(() => ({})) } })
        const emptyDecisionMatch = emptyDecisionGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        emptyDecisionGame.addAiPlayer({ hostKey: emptyDecisionMatch.hostKey })
        expect(emptyDecisionGame.__testing.runAiPlayers(emptyDecisionGame.__testing.getRoom(emptyDecisionMatch.hostKey), 10000)).toBe(false)

        const deadAgent = { cooldownMs: 0, decide: jest.fn(() => ({ action: 'build', structureType: 'mine', x: 0, y: 0 })) }
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
                    const player = state.players[playerId]
                    const castle = state.structures[player.castleId]
                    return { action: 'build', structureType: 'mine', x: castle.x + 2, y: castle.y }
                }

                return { action: 'dance' }
            }),
        }
        const mixedGame = createGame({ aiAgent: mixedAgent })
        const mixedMatch = mixedGame.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        mixedGame.addAiPlayer({ hostKey: mixedMatch.hostKey })
        mixedGame.addAiPlayer({ hostKey: mixedMatch.hostKey })
        const mixedRoom = mixedGame.__testing.getRoom(mixedMatch.hostKey)
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


    test('computes archer-player fog, memory, and scout movement orders', () => {
        const game = createGame()
        const match = game.createMatch({ playerId: 'player-1', gamerTag: 'Alice' })
        game.joinMatch({ playerId: 'player-2', gamerTag: 'Bob', hostKey: match.hostKey })
        const room = game.__testing.getRoom(match.hostKey)
        const hooks = game.__testing
        const playerOne = room.players['player-1']
        const baseOne = room.structures[playerOne.castleId]

        expect(hooks.computeVisibilityMask(room, 'missing').flat().some(Boolean)).toBe(false)
        const originalCastleId = playerOne.castleId
        playerOne.castleId = 'missing-castle'
        expect(hooks.computeVisibilityMask(room, 'player-1').flat().some(Boolean)).toBe(true)
        playerOne.castleId = originalCastleId
        baseOne.disabled = true
        expect(hooks.computeVisibilityMask(room, 'player-1')[baseOne.y][baseOne.x]).toBe(true)
        const originalCastlePosition = { x: baseOne.x, y: baseOne.y }
        baseOne.x = -1
        baseOne.y = -1
        hooks.computeVisibilityMask(room, 'player-1')
        Object.assign(baseOne, originalCastlePosition)
        baseOne.disabled = false
        room.structures.manualSight = { structureId: 'manualSight', ownerId: 'player-1', type: 'unknown', x: 0, y: 0, disabled: false }
        expect(hooks.computeVisibilityMask(room, 'player-1')[0][0]).toBe(true)
        delete room.structures.manualSight
        expect(hooks.getStructureSightRange('archer')).toBe(20)
        expect(hooks.getStructureSightRange('missing')).toBe(0)
        expect(hooks.getNpcSightRange('soldier')).toBe(3)
        expect(hooks.getNpcSightRange('missing')).toBe(0)

        const visibleEnemy = hooks.createStructure(room, { ownerId: 'player-2', type: 'mine', x: baseOne.x + 2, y: baseOne.y })
        const filtered = game.getPublicState(match.hostKey, 'player-1')
        expect(filtered.structures[visibleEnemy.structureId]).toBeDefined()
        expect(filtered.memory.structures[visibleEnemy.structureId]).toMatchObject({ x: visibleEnemy.x, y: visibleEnemy.y })
        expect(filtered.players['player-2']).toHaveProperty('gamerTag', 'Bob')

        const farEnemyCastle = Object.values(room.structures).find(structure => structure.type === 'castle' && structure.ownerId === 'player-2')
        expect(filtered.structures[farEnemyCastle.structureId]).toBeUndefined()
        expect(filtered.players['player-2']).toHaveProperty('gold')

        delete playerOne.memory
        expect(hooks.refreshPlayerMemory(room, 'player-1', hooks.computeVisibilityMask(room, 'player-1')).structures).toBeDefined()
        playerOne.memory = {}
        expect(hooks.refreshPlayerMemory(room, 'player-1', hooks.computeVisibilityMask(room, 'player-1')).structures).toBeDefined()
        playerOne.memory = { structures: { sparse: { structureId: 'sparse', ownerId: 'player-2', type: 'mine', x: 0, y: 0, level: 1, disabled: false } } }
        hooks.refreshPlayerMemory(room, 'player-1', [undefined])
        expect(hooks.refreshPlayerMemory(room, 'missing', hooks.computeVisibilityMask(room, 'missing'))).toEqual({ structures: {} })

        delete room.structures[visibleEnemy.structureId]
        hooks.refreshPlayerMemory(room, 'player-1', hooks.computeVisibilityMask(room, 'player-1'))
        expect(playerOne.memory.structures[visibleEnemy.structureId]).toBeUndefined()

        const movingHerald = hooks.spawnCaptureUnit(room, playerOne) || Object.values(room.units).find(unit => unit.type === 'herald' && unit.ownerId === 'player-1')
        hooks.assignHeraldMoveOrder(room, playerOne, movingHerald, { x: baseOne.x + 3, y: baseOne.y })

        const herald = room.units[playerOne.activeCaptureUnitId]
        herald.order = { type: 'move', x: -1, y: -1 }
        expect(hooks.processCaptureUnitOrder(room, herald, Date.now())).toBe(true)
        herald.order = { type: 'move', x: herald.x, y: herald.y }
        expect(hooks.processCaptureUnitOrder(room, herald, Date.now())).toBe(true)
        herald.order = { type: 'move', x: herald.x + 1, y: herald.y }
        herald.lastMovedAt = 0
        expect(hooks.processCaptureUnitOrder(room, herald, Date.now())).toBe(true)
    })


})
