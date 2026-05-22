const SCREEN = {
    width: 48,
    height: 30,
    pixelsPerFields: 18,
}

const CONFIG = {
    initialGold: 750,
    captureDurationMs: 30000,
    captureRange: 2,
    buildRange: 6,
    respawnDelayMs: 30000,
    playerMaxIntegrity: 160,
    playerMaxBarrier: 40,
    playerDamage: 20,
    playerAttackRange: 1.5,
    playerAttackEveryMs: 1000,
    tickRateMs: 1000,
    shieldRegenDelayMs: 3000,
    shieldRegenPerSecond: 8,
    maxPlayersPerRoom: 8,
    logLimit: 12,
    castleUpgradeAverageRatio: 0.75,
}

const STRUCTURES = {
    castle: {
        cost: 500,
        integrity: 1000,
        barrier: 500,
        sightRange: 8,
        integrityPerLevel: 25,
        barrierPerLevel: 25,
        captureable: false,
        buildable: false,
    },
    mine: {
        cost: 540,
        integrity: 300,
        barrier: 100,
        sightRange: 4,
        goldRate: 20,
        goldRatePerLevel: 5,
        captureable: true,
        buildable: true,
        buildLimitBase: 3,
        buildLimitSlope: 2,
    },
    library: {
        cost: 320,
        integrity: 350,
        barrier: 150,
        sightRange: 4,
        wisdomRate: 2,
        wisdomRatePerLevel: 1,
        captureable: true,
        buildable: true,
        requiresCastleLevel: 2,
        buildLimitBase: 1,
        buildLimitSlope: 1,
    },
    archer: {
        cost: 140,
        integrity: 500,
        barrier: 0,
        damage: 5,
        attackRange: 20,
        sightRange: 20,
        attackEveryMs: 1000,
        captureable: true,
        buildable: true,
        requiresResearch: 'archer',
        buildLimitBase: 1,
        buildLimitSlope: 1,
    },
    catapult: {
        cost: 200,
        integrity: 200,
        barrier: 100,
        damage: 15,
        splashRadius: 2,
        attackRange: 10,
        sightRange: 10,
        attackEveryMs: 1000,
        captureable: true,
        buildable: true,
        requiresResearch: 'catapult',
        buildLimitBase: 1,
        buildLimitSlope: 1,
    },
    barracks: {
        cost: 600,
        integrity: 200,
        barrier: 0,
        sightRange: 4,
        captureable: true,
        buildable: true,
        requiresResearch: 'barracks',
        buildLimitBase: 1,
        buildLimitSlope: 1,
    },
}

const RESEARCH = {
    archer: {
        cost: 15,
        requiresLibraryLevel: 1,
    },
    catapult: {
        cost: 25,
        requiresLibraryLevel: 1,
    },
    barracks: {
        cost: 60,
        requiresLibraryLevel: 2,
    },
}

const NPCS = {
    herald: {
        cost: 0,
        integrity: 160,
        barrier: 40,
        damage: 20,
        attackRange: 1.5,
        sightRange: 4,
        attackEveryMs: 1000,
        speed: 1,
    },
    soldier: {
        cost: 80,
        integrity: 150,
        barrier: 50,
        damage: 10,
        attackRange: 1,
        sightRange: 3,
        attackEveryMs: 1000,
        speed: 1,
        integrityPerBarracksLevel: 10,
        barrierPerBarracksLevel: 5,
        damagePerBarracksLevel: 2,
    },
}

const STRUCTURE_NAMES = {
    castle: 'Castle',
    mine: 'Mine',
    library: 'Library',
    archer: 'Archer Tower',
    catapult: 'Catapult',
    barracks: 'Barracks',
}

const RESEARCH_NAMES = {
    archer: 'Archery',
    catapult: 'Siege Engineering',
    barracks: 'Military Training',
}

const NPC_NAMES = {
    herald: 'Herald',
    soldier: 'Soldier',
}

const PLAYER_COLORS = [
    '#1b9aaa',
    '#ef476f',
    '#06d6a0',
    '#f77f00',
    '#8338ec',
    '#3a86ff',
    '#d62828',
    '#2d6a4f',
]

export default function createGame(options = {}) {
    const state = createPublicShell()
    const rooms = {}
    const playerRooms = {}
    const observers = []
    const debugObservers = []
    const aiAgent = options.aiAgent || null
    let ticker = null

    function start() {
        if (ticker) {
            return
        }

        ticker = setInterval(() => {
            const now = Date.now()

            for (const hostKey in rooms) {
                const room = rooms[hostKey]
                const changed = tickRoom(room, now)

                if (changed) {
                    notifyRoomState(room, 'tick')
                }
            }
        }, CONFIG.tickRateMs)

        /* istanbul ignore next -- browser timers do not expose unref. */
        if (typeof ticker.unref === 'function') {
            ticker.unref()
        }
    }

    function stop() {
        if (!ticker) {
            return
        }

        clearInterval(ticker)
        ticker = null
    }

    function subscribe(observerFunction) {
        observers.push(observerFunction)

        return () => unsubscribeObserver(observers, observerFunction)
    }

    function subscribeDebug(observerFunction) {
        debugObservers.push(observerFunction)

        return () => unsubscribeObserver(debugObservers, observerFunction)
    }

    function notifyAll(command) {
        for (const observerFunction of observers.slice()) {
            observerFunction(command)
        }
    }

    function notifyRoomState(room, reason) {
        updateVisionMemories(room)

        debugLog(room, 'state-update', {
            reason,
            summary: summarizeRoom(room),
        })

        for (const playerId of Object.keys(room.players)) {
            notifyAll({
                type: 'state-update',
                hostKey: room.hostKey,
                playerId,
                reason,
                state: getPublicState(room.hostKey, playerId),
            })
        }
    }

    function debugLog(room, event, details = {}) {
        if (!room) {
            return
        }

        const entry = {
            hostKey: room.hostKey,
            event,
            tick: room.tick,
            at: new Date().toISOString(),
            details: clone(details),
        }

        for (const observerFunction of debugObservers.slice()) {
            observerFunction(entry)
        }
    }

    function unsubscribeObserver(observerList, observerFunction) {
        const index = observerList.indexOf(observerFunction)

        if (index >= 0) {
            observerList.splice(index, 1)
        }
    }

    function setState(newState) {
        for (const key in state) {
            delete state[key]
        }

        Object.assign(state, newState)
    }

    function createMatch(command) {
        const hostKey = generateHostKey()
        const room = createRoom(hostKey)
        rooms[hostKey] = room

        addPlayerToRoom(room, command)
        addLog(room, `${getPlayerName(room, command.playerId)} created room ${hostKey}.`)
        debugLog(room, 'match:create', {
            playerId: command.playerId,
            gamerTag: command.gamerTag,
            summary: summarizeRoom(room),
        })

        return {
            hostKey,
            state: getPublicState(hostKey, command.playerId),
        }
    }

    function joinMatch(command) {
        const hostKey = normalizeHostKey(command.hostKey)
        const room = rooms[hostKey]

        if (!room) {
            return { error: 'Sala nao encontrada.' }
        }

        debugLog(room, 'match:join-request', {
            playerId: command.playerId,
            gamerTag: command.gamerTag,
        })

        if (Object.keys(room.players).length >= CONFIG.maxPlayersPerRoom) {
            debugLog(room, 'match:join-denied', {
                playerId: command.playerId,
                reason: 'Sala cheia.',
                playerCount: Object.keys(room.players).length,
            })
            return { error: 'Sala cheia.' }
        }

        addPlayerToRoom(room, {
            ...command,
            hostKey,
        })

        room.hasHadCombatants = Object.keys(room.players).length >= 2
        addLog(room, `${getPlayerName(room, command.playerId)} joined the match.`)
        debugLog(room, 'match:join-success', {
            playerId: command.playerId,
            gamerTag: command.gamerTag,
            summary: summarizeRoom(room),
        })
        notifyRoomState(room, 'join-match')

        return {
            hostKey,
            state: getPublicState(hostKey, command.playerId),
        }
    }

    function addAiPlayer(command = {}) {
        const hostKey = normalizeHostKey(command.hostKey)
        const room = rooms[hostKey]

        if (!room) {
            return { error: 'Sala nao encontrada.' }
        }

        if (room.winnerId) {
            return { error: 'Partida encerrada.' }
        }

        if (Object.keys(room.players).length >= CONFIG.maxPlayersPerRoom) {
            addLog(room, 'Sala cheia para adicionar IA.')
            notifyRoomState(room, 'add-ai:failed')
            return { error: 'Sala cheia.' }
        }

        const aiIndex = room.nextAiId++
        const playerId = command.playerId || `ai-${room.hostKey}-${aiIndex}`

        addPlayerToRoom(room, {
            playerId,
            gamerTag: command.gamerTag || `IA Neural ${aiIndex}`,
            isAi: true,
        })

        room.aiPlayers[playerId] = {
            playerId,
            addedAt: Date.now(),
            lastDecisionAt: 0,
            autoplay: true,
        }
        room.hasHadCombatants = Object.keys(room.players).length >= 2
        addLog(room, `${getPlayerName(room, playerId)} joined as neural AI.`)
        debugLog(room, 'ai:add-player', {
            playerId,
            requestedBy: command.requestedBy,
            summary: summarizeRoom(room),
        })
        notifyRoomState(room, 'add-ai')

        return {
            hostKey: room.hostKey,
            playerId,
            state: getPublicState(room.hostKey, playerId),
        }
    }

    function toggleAutoplay(room, player, command = {}) {
        const enabled = command.enabled == null ? !player.autoplay : command.enabled === true || command.enabled === 'true'

        if (enabled) {
            return enableAutoplay(room, player)
        }

        return disableAutoplay(room, player)
    }

    function enableAutoplay(room, player) {
        if (!aiAgent) {
            addLog(room, player.gamerTag + ': AI is unavailable for autoplay.')
            return false
        }

        if (player.autoplay) {
            return false
        }

        player.autoplay = true
        room.aiPlayers[player.playerId] = room.aiPlayers[player.playerId] || {
            playerId: player.playerId,
            addedAt: Date.now(),
            lastDecisionAt: 0,
        }
        room.aiPlayers[player.playerId].autoplay = true
        addLog(room, player.gamerTag + ' ligou o autoplay.')
        debugLog(room, 'ai:autoplay-enabled', {
            playerId: player.playerId,
            summary: summarizeRoom(room),
        })
        return true
    }

    function disableAutoplay(room, player) {
        if (!player.autoplay) {
            return false
        }

        player.autoplay = false

        if (!player.isAi) {
            delete room.aiPlayers[player.playerId]
        }

        addLog(room, player.gamerTag + ' desligou o autoplay.')
        debugLog(room, 'ai:autoplay-disabled', {
            playerId: player.playerId,
            summary: summarizeRoom(room),
        })
        return true
    }

    function disconnectPlayer(command) {
        const hostKey = command.hostKey || playerRooms[command.playerId]

        if (!hostKey || !rooms[hostKey]) {
            return
        }

        const room = rooms[hostKey]
        const player = room.players[command.playerId]

        if (!player) {
            return
        }

        player.connected = false
        player.disconnectedAt = Date.now()
        addLog(room, `${player.gamerTag} desconectou.`)
        debugLog(room, 'player:disconnect', {
            playerId: command.playerId,
            gamerTag: player.gamerTag,
            x: player.x,
            y: player.y,
        })

        delete playerRooms[command.playerId]
        notifyRoomState(room, 'disconnect')
    }

    function movePlayer(command) {
        const room = getRoomFromCommand(command)

        if (!room) {
            return
        }

        if (room.winnerId) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: 'match ended',
            })
            return
        }

        const player = room.players[command.playerId]
        if (!player || !isPlayerAvailable(player)) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: player ? 'player waiting to respawn or out of match' : 'player not found',
            })
            return
        }

        if (player.autoplay) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: 'autoplay ligado',
            })
            return
        }

        const move = getMoveFromKey(command.keyPressed)

        if (!move) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: 'tecla invalida',
            })
            return
        }

        const nextX = player.x + move.x
        const nextY = player.y + move.y

        if (!isInsideMap(nextX, nextY)) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                from: { x: player.x, y: player.y },
                to: { x: nextX, y: nextY },
                reason: 'fora do mapa',
            })
            return
        }

        const blockingStructure = getStructureAt(room, nextX, nextY)

        if (blockingStructure && !blockingStructure.disabled) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                from: { x: player.x, y: player.y },
                to: { x: nextX, y: nextY },
                reason: 'active structure in path',
                structure: summarizeStructure(blockingStructure),
            })
            return
        }

        const blockingActor = getActorAt(room, nextX, nextY, player.playerId)

        if (blockingActor) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                from: { x: player.x, y: player.y },
                to: { x: nextX, y: nextY },
                reason: 'ator no caminho',
                actor: summarizeActor(blockingActor),
            })
            return
        }

        const from = { x: player.x, y: player.y }
        player.x = nextX
        player.y = nextY
        player.lastMovedAt = Date.now()

        debugLog(room, 'move:success', {
            playerId: command.playerId,
            keyPressed: command.keyPressed,
            from,
            to: { x: player.x, y: player.y },
        })

        resetCapturesForPlayer(room, player.playerId)
        notifyRoomState(room, 'move-player')
    }

    function executeAction(command) {
        const room = getRoomFromCommand(command)

        if (!room) {
            return false
        }

        debugLog(room, 'action:request', {
            command,
            player: room.players[command.playerId] ? summarizePlayer(room.players[command.playerId]) : null,
        })

        if (room.winnerId) {
            addLog(room, 'The match has already ended.')
            notifyRoomState(room, 'action-denied')
            return false
        }

        const player = room.players[command.playerId]
        if (!player || !player.alive) {
            addLog(room, 'Invalid player or out of match.')
            notifyRoomState(room, 'action-denied')
            return false
        }

        let changed = false
        let handled = true

        if (command.action === 'toggle-autoplay') {
            changed = toggleAutoplay(room, player, command)
        } else if (player.autoplay && !command.fromAi) {
            addLog(room, player.gamerTag + ': autoplay is enabled. Disable it before issuing manual commands.')
        } else if (command.action === 'build') {
            changed = buildStructure(room, player, command)
        } else if (command.action === 'upgrade') {
            changed = upgradeStructure(room, player, command)
        } else if (command.action === 'research') {
            changed = researchRecipe(room, player, command)
        } else if (command.action === 'spawn-npc') {
            changed = spawnNpc(room, player, command)
        } else {
            handled = false
            addLog(room, player.gamerTag + ': unknown action: ' + (command.action || 'empty') + '.')
        }

        debugLog(room, 'action:result', {
            action: command.action,
            handled,
            changed,
            player: summarizePlayer(player),
            summary: summarizeRoom(room),
        })

        const reason = changed ? command.action : (command.action || 'action') + ':failed'
        notifyRoomState(room, reason)

        return changed
    }

    function getPublicState(hostKey, playerId = null) {
        const room = rooms[hostKey]

        if (!room) {
            return createPublicShell()
        }

        if (!playerId || !room.players[playerId]) {
            return createUnfilteredPublicState(room)
        }

        return createFilteredPublicState(room, playerId)
    }

    function createUnfilteredPublicState(room) {
        return {
            hostKey: room.hostKey,
            createdAt: room.createdAt,
            hasHadCombatants: room.hasHadCombatants,
            players: clone(room.players),
            structures: clone(room.structures),
            units: clone(room.units),
            screen: clone(SCREEN),
            config: clone(CONFIG),
            catalog: {
                structures: clone(STRUCTURES),
                research: clone(RESEARCH),
                npcs: clone(NPCS),
            },
            logs: room.logs.slice(),
            winnerId: room.winnerId,
            tick: room.tick,
            fogMask: createFullVisibilityMask(),
            memory: { structures: {} },
        }
    }

    function createFilteredPublicState(room, playerId) {
        const fogMask = computeVisibilityMask(room, playerId)
        const memory = refreshPlayerMemory(room, playerId, fogMask)

        return {
            hostKey: room.hostKey,
            createdAt: room.createdAt,
            hasHadCombatants: room.hasHadCombatants,
            players: filterPlayersForVisibility(room, playerId, fogMask),
            structures: filterStructuresForVisibility(room, playerId, fogMask),
            units: filterUnitsForVisibility(room, playerId, fogMask),
            screen: clone(SCREEN),
            config: clone(CONFIG),
            catalog: {
                structures: clone(STRUCTURES),
                research: clone(RESEARCH),
                npcs: clone(NPCS),
                limits: computePlayerLimits(room, playerId),
            },
            logs: room.logs.slice(),
            winnerId: room.winnerId,
            tick: room.tick,
            fogMask,
            memory: clone(memory),
        }
    }

    function updateVisionMemories(room) {
        for (const playerId of Object.keys(room.players)) {
            refreshPlayerMemory(room, playerId, computeVisibilityMask(room, playerId))
        }
    }

    function computeVisibilityMask(room, playerId) {
        const mask = createEmptyVisibilityMask()
        const player = room.players[playerId]

        if (!player) {
            return mask
        }

        const castle = room.structures[player.castleId]

        if (castle) {
            markVisibleTile(mask, castle.x, castle.y)
        }

        for (const structure of Object.values(room.structures)) {
            if (structure.ownerId !== playerId) {
                continue
            }

            if (structure.disabled) {
                continue
            }

            markVisibleRadius(mask, structure, getStructureSightRange(structure.type))
        }

        for (const unit of Object.values(room.units)) {
            if (unit.ownerId !== playerId || !isUnitActiveForVision(unit)) {
                continue
            }

            markVisibleRadius(mask, unit, getNpcSightRange(unit.type))
        }

        if (isPlayerAvailable(player)) {
            markVisibleRadius(mask, player, getNpcSightRange('herald'))
        }

        return mask
    }

    function refreshPlayerMemory(room, playerId, fogMask) {
        const player = room.players[playerId]
        const memory = ensurePlayerMemory(player)

        if (!player) {
            return memory
        }

        for (const structureId of Object.keys(memory.structures)) {
            const remembered = memory.structures[structureId]

            if (!isTileVisible(fogMask, remembered.x, remembered.y)) {
                continue
            }

            const current = room.structures[structureId]
            const currentAtTile = getStructureAt(room, remembered.x, remembered.y)

            if (!current
                || current.x !== remembered.x
                || current.y !== remembered.y
                || current.ownerId === playerId
                || (currentAtTile && currentAtTile.structureId !== structureId)) {
                delete memory.structures[structureId]
            }
        }

        for (const structure of Object.values(room.structures)) {
            if (structure.ownerId === playerId || !isTileVisible(fogMask, structure.x, structure.y)) {
                continue
            }

            memory.structures[structure.structureId] = createStructureMemorySnapshot(room, structure)
        }

        return memory
    }

    function ensurePlayerMemory(player) {
        if (!player) {
            return { structures: {} }
        }

        if (!player.memory) {
            player.memory = { structures: {} }
        }

        if (!player.memory.structures) {
            player.memory.structures = {}
        }

        return player.memory
    }

    function createStructureMemorySnapshot(room, structure) {
        return {
            structureId: structure.structureId,
            type: structure.type,
            x: structure.x,
            y: structure.y,
            ownerId: structure.ownerId,
            level: structure.level,
            disabled: structure.disabled,
            seenAt: room.tick,
        }
    }

    function filterStructuresForVisibility(room, playerId, fogMask) {
        const visibleStructures = {}

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.ownerId === playerId || isTileVisible(fogMask, structure.x, structure.y)) {
                visibleStructures[structureId] = clone(structure)
            }
        }

        return visibleStructures
    }

    function filterUnitsForVisibility(room, playerId, fogMask) {
        const visibleUnits = {}

        for (const unitId in room.units) {
            const unit = room.units[unitId]

            if (unit.ownerId === playerId || isTileVisible(fogMask, unit.x, unit.y)) {
                visibleUnits[unitId] = clone(unit)
            }
        }

        return visibleUnits
    }

    function filterPlayersForVisibility(room, playerId, fogMask) {
        const visiblePlayers = {}

        for (const targetId in room.players) {
            const player = room.players[targetId]

            if (targetId === playerId) {
                visiblePlayers[targetId] = clone(player)
                continue
            }

            const publicPlayer = {
                playerId: player.playerId,
                gamerTag: player.gamerTag,
                color: player.color,
                alive: player.alive,
                connected: player.connected,
                isAi: player.isAi,
                autoplay: player.autoplay,
                joinedAt: player.joinedAt,
            }

            if (hasVisibleEntityForPlayer(room, targetId, fogMask)) {
                Object.assign(publicPlayer, {
                    x: player.x,
                    y: player.y,
                    gold: player.gold,
                    wisdom: player.wisdom,
                    integrity: player.integrity,
                    maxIntegrity: player.maxIntegrity,
                    barrier: player.barrier,
                    maxBarrier: player.maxBarrier,
                    order: player.order,
                    respawnAt: player.respawnAt,
                    activeCaptureUnitId: player.activeCaptureUnitId,
                    avatarDeployed: player.avatarDeployed,
                })
            }

            visiblePlayers[targetId] = publicPlayer
        }

        return visiblePlayers
    }

    function hasVisibleEntityForPlayer(room, targetId, fogMask) {
        const target = room.players[targetId]

        if (target && isPlayerAvailable(target) && isTileVisible(fogMask, target.x, target.y)) {
            return true
        }

        return Object.values(room.structures).some(structure => structure.ownerId === targetId && isTileVisible(fogMask, structure.x, structure.y))
            || Object.values(room.units).some(unit => unit.ownerId === targetId && isTileVisible(fogMask, unit.x, unit.y))
    }

    function markVisibleRadius(mask, source, range) {
        const sightRange = Math.max(0, Number(range) || 0)
        const minX = Math.max(0, Math.floor(source.x - sightRange))
        const maxX = Math.min(SCREEN.width - 1, Math.ceil(source.x + sightRange))
        const minY = Math.max(0, Math.floor(source.y - sightRange))
        const maxY = Math.min(SCREEN.height - 1, Math.ceil(source.y + sightRange))

        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                if (distance(source, { x, y }) <= sightRange) {
                    mask[y][x] = true
                }
            }
        }
    }

    function markVisibleTile(mask, x, y) {
        if (isInsideMap(x, y)) {
            mask[y][x] = true
        }
    }

    function isTileVisible(mask, x, y) {
        return Number.isInteger(x)
            && Number.isInteger(y)
            && y >= 0
            && y < mask.length
            && x >= 0
            && x < (mask[y] || []).length
            && mask[y][x] === true
    }

    function getStructureSightRange(type) {
        const catalog = STRUCTURES[type] || {}
        return catalog.sightRange ?? catalog.attackRange ?? 0
    }

    function getNpcSightRange(type) {
        const catalog = NPCS[type] || {}
        return catalog.sightRange ?? catalog.attackRange ?? 0
    }

    function isUnitActiveForVision(unit) {
        return Boolean(unit && unit.integrity > 0)
    }

    function getHostKeyForPlayer(playerId) {
        return playerRooms[playerId]
    }

    function getRoomFromCommand(command) {
        const hostKey = command.hostKey || playerRooms[command.playerId]
        return hostKey ? rooms[hostKey] : null
    }

    function addPlayerToRoom(room, command) {
        const now = Date.now()
        const playerIndex = Object.keys(room.players).length
        const spawn = getSpawnPoint(playerIndex)
        const playerId = command.playerId
        const gamerTag = sanitizeGamerTag(command.gamerTag, playerId)
        const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]

        playerRooms[playerId] = room.hostKey

        const castle = createStructure(room, {
            ownerId: playerId,
            type: 'castle',
            x: spawn.castleX,
            y: spawn.castleY,
        })

        room.players[playerId] = {
            playerId,
            ownerId: playerId,
            gamerTag,
            color,
            isAi: Boolean(command.isAi),
            autoplay: Boolean(command.isAi),
            x: spawn.playerX,
            y: spawn.playerY,
            gold: CONFIG.initialGold,
            wisdom: 0,
            alive: true,
            connected: command.connected ?? true,
            castleId: castle.structureId,
            maxIntegrity: CONFIG.playerMaxIntegrity,
            integrity: CONFIG.playerMaxIntegrity,
            maxBarrier: CONFIG.playerMaxBarrier,
            barrier: CONFIG.playerMaxBarrier,
            respawnAt: null,
            order: null,
            activeCaptureUnitId: null,
            avatarDeployed: false,
            memory: {
                structures: {},
            },
            unlocked: {
                mine: true,
                library: false,
                archer: false,
                catapult: false,
                barracks: false,
            },
            lastMovedAt: now,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            joinedAt: now,
            patrolAngle: 0,
        }

        spawnCaptureUnit(room, room.players[playerId])
    }

    function createRoom(hostKey) {
        const room = {
            hostKey,
            createdAt: Date.now(),
            players: {},
            structures: {},
            units: {},
            aiPlayers: {},
            logs: [],
            winnerId: null,
            tick: 0,
            hasHadCombatants: false,
            nextStructureId: 1,
            nextUnitId: 1,
            nextAiId: 1,
            nextLogId: 1,
        }

        addNeutralFactories(room)

        return room
    }

    function addNeutralFactories(room) {
        const neutralFactories = [
            { type: 'mine', x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) },
            { type: 'mine', x: Math.floor(SCREEN.width / 2) - 8, y: Math.floor(SCREEN.height / 2) },
            { type: 'mine', x: Math.floor(SCREEN.width / 2) + 8, y: Math.floor(SCREEN.height / 2) },
            { type: 'mine', x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) - 7 },
            { type: 'mine', x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) + 7 },
        ]

        for (const factory of neutralFactories) {
            const structure = createStructure(room, {
                ownerId: null,
                type: factory.type,
                x: factory.x,
                y: factory.y,
                disabled: true,
            })

            structure.integrity = 0
            structure.barrier = 0
        }
    }

function getStructureName(type) {
    return STRUCTURE_NAMES[type] || type || 'Structure'
}

function getResearchName(type) {
    return RESEARCH_NAMES[type] || type || 'Research'
}

function getNpcName(type) {
    return NPC_NAMES[type] || type || 'Unit'
}

    function createStructure(room, command) {
        const catalog = STRUCTURES[command.type]
        const structureId = command.structureId || `s-${room.nextStructureId++}`
        const maxIntegrity = getMaxIntegrity(command.type, 1)
        const maxBarrier = getMaxBarrier(command.type, 1)

        const structure = {
            structureId,
            ownerId: command.ownerId,
            type: command.type,
            x: command.x,
            y: command.y,
            level: 1,
            integrity: command.disabled ? 0 : maxIntegrity,
            maxIntegrity,
            barrier: command.disabled ? 0 : maxBarrier,
            maxBarrier,
            disabled: Boolean(command.disabled),
            capture: null,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            createdAt: Date.now(),
            cost: catalog.cost,
        }

        room.structures[structureId] = structure

        return structure
    }

    function buildStructure(room, player, command) {
        const type = command.structureType
        const catalog = STRUCTURES[type]

        if (!catalog || !catalog.buildable) {
            addLog(room, `${player.gamerTag}: invalid structure.`)
            return false
        }

        const limitStatus = getBuildLimitStatus(room, player, type)

        if (limitStatus && limitStatus.current >= limitStatus.max) {
            const reason = limitStatus.current > limitStatus.max
                ? 'no new slots until count drops below the limit'
                : 'upgrade the castle to unlock more'
            addLog(room, `${player.gamerTag}: ${getStructureName(type)} ${limitStatus.current}/${limitStatus.max} - ${reason}.`)
            return false
        }

        if (!canBuildStructure(room, player, type)) {
            addLog(room, `${player.gamerTag} has not unlocked ${getStructureName(type)} yet.`)
            return false
        }

        if (!Number.isInteger(command.x) || !Number.isInteger(command.y) || !isInsideMap(command.x, command.y)) {
            addLog(room, `${player.gamerTag}: invalid tile.`)
            return false
        }

        if (getStructureAt(room, command.x, command.y) || getActorAt(room, command.x, command.y)) {
            addLog(room, `${player.gamerTag}: tile occupied.`)
            return false
        }

        if (!isNearOwnedAnchor(room, player.playerId, command.x, command.y)) {
            addLog(room, `${player.gamerTag}: build near your castle or structures.`)
            return false
        }

        if (player.gold < catalog.cost) {
            addLog(room, `${player.gamerTag} needs ${catalog.cost} gold for ${getStructureName(type)}.`)
            return false
        }

        player.gold -= catalog.cost
        createStructure(room, {
            ownerId: player.playerId,
            type,
            x: command.x,
            y: command.y,
        })

        addLog(room, `${player.gamerTag} built ${getStructureName(type)}.`)
        return true
    }

    function upgradeStructure(room, player, command) {
        const structure = room.structures[command.structureId]

        if (!structure) {
            addLog(room, player.gamerTag + ': no structure selected for upgrade.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structureId: command.structureId,
                reason: 'structure not found',
            })
            return false
        }

        if (structure.ownerId !== player.playerId) {
            addLog(room, player.gamerTag + ': select one of your structures to upgrade.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structure: summarizeStructure(structure),
                reason: 'structure owned by another player',
            })
            return false
        }

        if (structure.disabled) {
            addLog(room, player.gamerTag + ': this structure is disabled.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structure: summarizeStructure(structure),
                reason: 'structure disabled',
            })
            return false
        }

        if (structure.type !== 'castle') {
            const castle = room.structures[player.castleId]

            if (!castle || structure.level >= castle.level) {
                const castleLevel = castle ? castle.level : 0
                addLog(room, `${player.gamerTag}: ${getStructureName(structure.type)} is already at the max level allowed by the castle (lvl ${castleLevel}). Upgrade the castle to unlock more.`)
                debugLog(room, 'upgrade:denied', {
                    player: summarizePlayer(player),
                    structure: summarizeStructure(structure),
                    castleLevel,
                    reason: 'castle level limit',
                })
                return false
            }
        }

        if (structure.type === 'castle') {
            const gate = computeCastleUpgradeGate(room, player.playerId, structure.level)

            if (!gate.ready) {
                addLog(room, `${player.gamerTag}: castle upgrade blocked - average structure level ${gate.averageLevel.toFixed(2)} < ${gate.required.toFixed(2)} (${Math.round(gate.ratio * 100)}% of current level).`)
                debugLog(room, 'upgrade:denied', {
                    player: summarizePlayer(player),
                    structure: summarizeStructure(structure),
                    averageLevel: gate.averageLevel,
                    required: gate.required,
                    reason: 'castle upgrade gate',
                })
                return false
            }
        }

        const cost = getUpgradeCost(structure)

        if (player.gold < cost) {
            addLog(room, player.gamerTag + ' needs ' + cost + ' gold to upgrade ' + getStructureName(structure.type) + '; has ' + Math.floor(player.gold) + '.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structure: summarizeStructure(structure),
                cost,
                gold: player.gold,
                reason: 'not enough gold',
            })
            return false
        }

        debugLog(room, 'upgrade:accepted', {
            player: summarizePlayer(player),
            structureBefore: summarizeStructure(structure),
            cost,
        })

        player.gold -= cost
        structure.level += 1

        const oldMaxIntegrity = structure.maxIntegrity
        const oldMaxBarrier = structure.maxBarrier

        structure.maxIntegrity = getMaxIntegrity(structure.type, structure.level)
        structure.maxBarrier = getMaxBarrier(structure.type, structure.level)
        structure.integrity += structure.maxIntegrity - oldMaxIntegrity
        structure.barrier += structure.maxBarrier - oldMaxBarrier

        if (structure.type === 'castle' && structure.level >= 2) {
            player.unlocked.library = true
        }

        addLog(room, player.gamerTag + ' upgraded ' + getStructureName(structure.type) + ' to level ' + structure.level + '.')
        debugLog(room, 'upgrade:success', {
            player: summarizePlayer(player),
            structureAfter: summarizeStructure(structure),
        })
        return true
    }

    function researchRecipe(room, player, command) {
        const recipe = command.recipe
        const research = RESEARCH[recipe]

        if (!research) {
            return false
        }

        if (player.unlocked[recipe]) {
            addLog(room, `${player.gamerTag} already unlocked ${getResearchName(recipe)}.`)
            return false
        }

        const libraryLevel = getHighestStructureLevel(room, player.playerId, 'library')

        if (libraryLevel < research.requiresLibraryLevel) {
            addLog(room, `${player.gamerTag} needs Library level ${research.requiresLibraryLevel}.`)
            return false
        }

        if (player.wisdom < research.cost) {
            addLog(room, `${player.gamerTag} needs ${research.cost} wisdom for ${getResearchName(recipe)}.`)
            return false
        }

        player.wisdom -= research.cost
        player.unlocked[recipe] = true

        addLog(room, `${player.gamerTag} researched ${getResearchName(recipe)}.`)
        return true
    }

    function spawnNpc(room, player, command) {
        const npcType = command.npcType || 'soldier'
        const npc = NPCS[npcType]

        if (!npc || !player.unlocked.barracks) {
            addLog(room, `${player.gamerTag}: NPC unavailable.`)
            return false
        }

        const barracks = getActiveStructures(room, player.playerId, 'barracks')[0]

        if (!barracks) {
            addLog(room, `${player.gamerTag} needs an active Barracks.`)
            return false
        }

        if (player.gold < npc.cost) {
            addLog(room, `${player.gamerTag} needs ${npc.cost} gold for ${getNpcName(npcType)}.`)
            return false
        }

        const spawnTile = getEmptyNeighbor(room, barracks.x, barracks.y)

        if (!spawnTile) {
            addLog(room, `${player.gamerTag}: no space around the Barracks.`)
            return false
        }

        const barracksLevel = getHighestStructureLevel(room, player.playerId, 'barracks')
        const levelBonus = Math.max(0, barracksLevel - 1)
        const maxIntegrity = npc.integrity + levelBonus * npc.integrityPerBarracksLevel
        const maxBarrier = npc.barrier + levelBonus * npc.barrierPerBarracksLevel
        const damage = npc.damage + levelBonus * npc.damagePerBarracksLevel
        const unitId = `u-${room.nextUnitId++}`

        player.gold -= npc.cost
        room.units[unitId] = {
            unitId,
            ownerId: player.playerId,
            type: npcType,
            x: spawnTile.x,
            y: spawnTile.y,
            integrity: maxIntegrity,
            maxIntegrity,
            barrier: maxBarrier,
            maxBarrier,
            damage,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            createdAt: Date.now(),
        }

        addLog(room, `${player.gamerTag} sent a ${getNpcName(npcType)}.`)
        return true
    }


    function assignHeraldMoveOrder(room, player, unit, target) {
        const order = {
            type: 'move',
            x: target.x,
            y: target.y,
            unitId: unit.unitId,
            createdAt: Date.now(),
        }

        unit.order = order
        player.order = order
        player.activeCaptureUnitId = unit.unitId
        syncPlayerToCaptureUnit(player, unit)
        resetCapturesForPlayer(room, player.playerId)
    }

    function assignHeraldCaptureOrder(room, player, unit, structure) {
        const order = {
            type: 'capture',
            structureId: structure.structureId,
            unitId: unit.unitId,
            createdAt: Date.now(),
        }

        unit.order = order
        player.order = order
        player.activeCaptureUnitId = unit.unitId
        syncPlayerToCaptureUnit(player, unit)
        resetCapturesForPlayer(room, player.playerId)
    }

    function spawnCaptureUnit(room, player) {
        const existing = getPlayerCaptureUnit(room, player)

        if (existing) {
            return existing
        }

        const spawnTile = getRespawnTile(room, player)

        if (!spawnTile) {
            return null
        }

        return createCaptureUnit(room, player, spawnTile)
    }

    function createCaptureUnit(room, player, spawnTile) {
        const catalog = NPCS.herald
        const unitId = 'u-' + room.nextUnitId++
        const unit = {
            unitId,
            ownerId: player.playerId,
            playerId: player.playerId,
            gamerTag: player.gamerTag,
            type: 'herald',
            x: spawnTile.x,
            y: spawnTile.y,
            integrity: catalog.integrity,
            maxIntegrity: catalog.integrity,
            barrier: catalog.barrier,
            maxBarrier: catalog.barrier,
            damage: catalog.damage,
            attackRange: catalog.attackRange,
            attackEveryMs: catalog.attackEveryMs,
            order: null,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            createdAt: Date.now(),
        }

        room.units[unitId] = unit
        player.activeCaptureUnitId = unitId
        player.avatarDeployed = false
        syncPlayerToCaptureUnit(player, unit)
        return unit
    }

    function processPlayerRespawns(room, now) {
        let changed = false

        for (const playerId in room.players) {
            const player = room.players[playerId]

            if (!player.alive || !player.respawnAt || now < player.respawnAt) {
                continue
            }

            const captureUnit = spawnCaptureUnit(room, player)

            if (!captureUnit) {
                continue
            }

            player.respawnAt = null
            player.order = null
            syncPlayerToCaptureUnit(player, captureUnit)
            addLog(room, player.gamerTag + ' respawned at the castle.')
            changed = true
        }

        return changed
    }

    function processHeraldAutonomy(room) {
        let changed = false

        for (const playerId of Object.keys(room.players)) {
            const player = room.players[playerId]

            if (!player.alive || player.respawnAt) {
                continue
            }

            const herald = getPlayerCaptureUnit(room, player)

            if (!herald || herald.order) {
                continue
            }

            const captureTarget = findCapturableForHerald(room, playerId)

            if (captureTarget) {
                assignHeraldCaptureOrder(room, player, herald, captureTarget)
                changed = true
                continue
            }

            const patrolTile = pickHeraldPatrolTile(room, player, herald)

            if (patrolTile) {
                assignHeraldMoveOrder(room, player, herald, patrolTile)
                changed = true
            }
        }

        return changed
    }

    function findCapturableForHerald(room, playerId) {
        const player = room.players[playerId]
        const castle = player ? room.structures[player.castleId] : null

        if (!castle) {
            return null
        }

        const fogMask = computeVisibilityMask(room, playerId)
        const memory = player.memory?.structures || {}

        const visible = Object.values(room.structures)
            .filter(structure => isHeraldCapturable(structure, playerId))
            .filter(structure => isTileVisible(fogMask, structure.x, structure.y))

        const remembered = Object.values(memory)
            .filter(remembered => !room.structures[remembered.structureId])
            .filter(structure => isHeraldCapturable(structure, playerId))

        const candidates = [...visible, ...remembered]

        if (!candidates.length) {
            return null
        }

        candidates.sort((first, second) => distance(castle, first) - distance(castle, second))

        return candidates[0]
    }

    function isHeraldCapturable(structure, playerId) {
        const catalog = STRUCTURES[structure.type]
        return Boolean(catalog && catalog.captureable
            && structure.ownerId !== playerId
            && (structure.disabled || structure.ownerId))
    }

    function pickHeraldPatrolTile(room, player, herald) {
        const fogMask = computeVisibilityMask(room, player.playerId)
        const borderTiles = getFogBorderTiles(fogMask)
        const origin = room.structures[player.castleId] || herald
        const patrolAngle = typeof player.patrolAngle === 'number' ? player.patrolAngle : 0

        player.patrolAngle = (patrolAngle + Math.PI / 3) % (Math.PI * 2)

        if (!borderTiles.length) {
            return getFallbackPatrolTile(origin)
        }

        borderTiles.sort((first, second) => angleDelta(origin, first, patrolAngle) - angleDelta(origin, second, patrolAngle)
            || distance(herald, second) - distance(herald, first))

        return borderTiles[0]
    }

    function getFogBorderTiles(fogMask) {
        const tiles = []

        for (let y = 0; y < SCREEN.height; y += 1) {
            for (let x = 0; x < SCREEN.width; x += 1) {
                if (!isTileVisible(fogMask, x, y)) {
                    continue
                }

                if (hasFoggedNeighbor(fogMask, x, y)) {
                    tiles.push({ x, y })
                }
            }
        }

        return tiles
    }

    function hasFoggedNeighbor(fogMask, x, y) {
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                if (dx === 0 && dy === 0) {
                    continue
                }

                const nx = x + dx
                const ny = y + dy

                if (!isInsideMap(nx, ny)) {
                    continue
                }

                if (!isTileVisible(fogMask, nx, ny)) {
                    return true
                }
            }
        }

        return false
    }

    function angleDelta(origin, tile, targetAngle) {
        const angle = Math.atan2(tile.y - origin.y, tile.x - origin.x)
        const diff = Math.abs(((angle - targetAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        return diff
    }

    function getFallbackPatrolTile(origin) {
        const centerX = Math.floor(SCREEN.width / 2)
        const centerY = Math.floor(SCREEN.height / 2)

        if (origin && origin.x === centerX && origin.y === centerY) {
            return { x: centerX, y: centerY }
        }

        return { x: centerX, y: centerY }
    }

    function processCaptureUnitOrders(room, now) {
        let changed = false

        for (const unitId in room.units) {
            const unit = room.units[unitId]

            if (unit.type !== 'herald') {
                continue
            }

            const player = room.players[unit.ownerId]

            if (!player || !player.alive) {
                delete room.units[unitId]
                changed = true
                continue
            }

            syncPlayerToCaptureUnit(player, unit)

            if (!unit.order) {
                continue
            }

            changed = processCaptureUnitOrder(room, unit, now) || changed
        }

        return changed
    }

    function processCaptureUnitOrder(room, unit, now) {
        if (unit.order.type === 'move') {
            const target = { x: unit.order.x, y: unit.order.y }

            if (!isInsideMap(target.x, target.y)) {
                clearCaptureUnitOrder(room, unit)
                return true
            }

            if (distance(unit, target) <= 0) {
                clearCaptureUnitOrder(room, unit)
                return true
            }

            return moveUnitToward(room, unit, target, 0, now)
        }

        const structure = room.structures[unit.order.structureId]

        if (!structure || !STRUCTURES[structure.type] || !STRUCTURES[structure.type].captureable) {
            clearCaptureUnitOrder(room, unit)
            return true
        }

        if (structure.ownerId === unit.ownerId && !structure.disabled) {
            clearCaptureUnitOrder(room, unit)
            return true
        }

        if (structure.disabled) {
            const contestTarget = findCaptureUnitContestTarget(room, unit, structure)

            if (contestTarget && distance(unit, structure) <= CONFIG.captureRange) {
                if (distance(unit, contestTarget.value) <= unit.attackRange) {
                    return attackWithUnit(room, unit, contestTarget, now)
                }

                return moveUnitToward(room, unit, contestTarget.value, unit.attackRange, now)
            }

            return moveUnitToward(room, unit, structure, CONFIG.captureRange, now)
        }

        if (distance(unit, structure) <= unit.attackRange) {
            return attackWithUnit(room, unit, { kind: 'structure', value: structure }, now)
        }

        return moveUnitToward(room, unit, structure, unit.attackRange, now)
    }

    function findCaptureUnitContestTarget(room, unit, structure) {
        const candidates = []

        for (const unitId in room.units) {
            const candidate = room.units[unitId]

            if (candidate.unitId === unit.unitId || candidate.ownerId === unit.ownerId) {
                continue
            }

            if (candidate.type === 'herald' && distance(candidate, structure) <= CONFIG.captureRange) {
                candidates.push({ kind: 'unit', value: candidate })
            }
        }

        for (const playerId in room.players) {
            const candidate = room.players[playerId]

            if (candidate.playerId !== unit.ownerId && isPlayerAvailable(candidate) && distance(candidate, structure) <= CONFIG.captureRange) {
                candidates.push({ kind: 'player', value: candidate })
            }
        }

        candidates.sort((first, second) => distance(unit, first.value) - distance(unit, second.value))

        return candidates[0] || null
    }

    function moveUnitToward(room, unit, target, minDistance, now = Date.now()) {
        if (distance(unit, target) <= minDistance) {
            return false
        }

        const nextTile = getStepToward(room, unit, target)

        if (nextTile) {
            unit.x = nextTile.x
            unit.y = nextTile.y
            syncPlayerToCaptureUnit(room.players[unit.ownerId], unit)

            if (unit.type === 'herald') {
                resetCapturesForPlayer(room, unit.ownerId)
            }

            return true
        }

        const obstacle = getAttackableMovementObstacle(room, unit, target)

        if (!obstacle) {
            return false
        }

        return attackMovementObstacle(room, unit, obstacle, now)
    }

    function attackWithUnit(room, unit, target, now) {
        if (now - unit.lastAttackAt < unit.attackEveryMs) {
            return false
        }

        unit.lastAttackAt = now
        unit.lastAttackTarget = createAttackTargetSnapshot(target)
        applyDamage(room, target, unit.damage, now, unit.ownerId)
        syncPlayerToCaptureUnit(room.players[unit.ownerId], unit)
        return true
    }

    function clearCaptureUnitOrder(room, unit) {
        unit.order = null

        const player = room.players[unit.ownerId]

        if (player && player.order && player.order.unitId === unit.unitId) {
            player.order = null
        }
    }

    function tickRoom(room, now) {
        let changed = false

        room.tick += 1
        room.hasHadCombatants = room.hasHadCombatants || Object.keys(room.players).length >= 2

        if (room.winnerId) {
            return false
        }

        changed = runAiPlayers(room, now) || changed
        changed = processPlayerRespawns(room, now) || changed
        changed = generateResources(room) || changed
        changed = regenerateBarriers(room, now) || changed
        changed = processHeraldAutonomy(room) || changed
        changed = processCaptureUnitOrders(room, now) || changed
        changed = processCaptures(room) || changed
        changed = processTowerAttacks(room, now) || changed
        changed = processNpcActions(room, now) || changed
        changed = checkVictory(room) || changed

        return changed
    }

    function runAiPlayers(room, now) {
        if (!aiAgent) {
            return false
        }

        const decide = aiAgent.decide

        if (typeof decide !== 'function') {
            return false
        }

        let changed = false

        for (const playerId of Object.keys(room.aiPlayers)) {
            const memory = room.aiPlayers[playerId]
            const player = room.players[playerId]

            if (!player || !player.alive || (!player.isAi && !player.autoplay)) {
                delete room.aiPlayers[playerId]
                continue
            }

            const cooldownMs = aiAgent.cooldownMs ?? CONFIG.tickRateMs

            if (now - memory.lastDecisionAt < cooldownMs) {
                continue
            }

            memory.lastDecisionAt = now

            try {
                const decision = decide({
                    state: getPublicState(room.hostKey, playerId),
                    playerId,
                    now,
                    memory: clone(memory),
                })

                if (!decision || !decision.action) {
                    continue
                }

                changed = executeAction({
                    ...decision,
                    playerId,
                    hostKey: room.hostKey,
                    fromAi: true,
                }) || changed
            } catch (error) {
                debugLog(room, 'ai:error', {
                    playerId,
                    message: error.message,
                })
            }
        }

        return changed
    }

    function generateResources(room) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]
            const player = structure.ownerId ? room.players[structure.ownerId] : null

            if (!player || !player.alive || structure.disabled) {
                continue
            }

            if (structure.type === 'mine') {
                player.gold += getGoldRate(structure)
                changed = true
            }

            if (structure.type === 'library') {
                player.wisdom += getWisdomRate(structure)
                changed = true
            }
        }

        return changed
    }

    function regenerateBarriers(room, now) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.disabled || structure.maxBarrier <= 0 || structure.barrier >= structure.maxBarrier) {
                continue
            }

            if (now - structure.lastDamagedAt >= CONFIG.shieldRegenDelayMs) {
                structure.barrier = Math.min(structure.maxBarrier, structure.barrier + CONFIG.shieldRegenPerSecond)
                changed = true
            }
        }

        for (const unitId in room.units) {
            const unit = room.units[unitId]

            if (unit.maxBarrier <= 0 || unit.barrier >= unit.maxBarrier) {
                continue
            }

            if (now - unit.lastDamagedAt >= CONFIG.shieldRegenDelayMs) {
                unit.barrier = Math.min(unit.maxBarrier, unit.barrier + CONFIG.shieldRegenPerSecond)
                changed = true
            }
        }

        for (const playerId in room.players) {
            const player = room.players[playerId]

            if (!isPlayerAvailable(player) || player.maxBarrier <= 0 || player.barrier >= player.maxBarrier) {
                continue
            }

            if (now - player.lastDamagedAt >= CONFIG.shieldRegenDelayMs) {
                player.barrier = Math.min(player.maxBarrier, player.barrier + CONFIG.shieldRegenPerSecond)
                changed = true
            }
        }

        return changed
    }

    function processCaptures(room) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]
            const catalog = STRUCTURES[structure.type]

            if (!structure.disabled || !catalog.captureable) {
                continue
            }

            const player = getCaptureCandidate(room, structure)

            if (!player) {
                if (structure.capture) {
                    structure.capture = null
                    changed = true
                }
                continue
            }

            const previousCapture = structure.capture
            const sameCapture = previousCapture
                && previousCapture.playerId === player.playerId
                && previousCapture.x === player.x
                && previousCapture.y === player.y

            if (!sameCapture) {
                structure.capture = {
                    playerId: player.playerId,
                    x: player.x,
                    y: player.y,
                    progressMs: 0,
                }
                changed = true
                continue
            }

            structure.capture.progressMs += CONFIG.tickRateMs
            changed = true

            if (structure.capture.progressMs >= CONFIG.captureDurationMs) {
                captureStructure(room, structure, player)
            }
        }

        return changed
    }

    function processTowerAttacks(room, now) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]
            const catalog = STRUCTURES[structure.type]

            if (!structure.ownerId || structure.disabled || !catalog.damage) {
                continue
            }

            if (now - structure.lastAttackAt < catalog.attackEveryMs) {
                continue
            }

            const target = findTowerTarget(room, structure)

            if (!target) {
                continue
            }

            structure.lastAttackAt = now
            structure.lastAttackTarget = createAttackTargetSnapshot(target)
            if (structure.type === 'catapult') {
                applySplashDamage(room, structure, target, catalog.damage, now)
            } else {
                applyDamage(room, target, catalog.damage, now, structure.ownerId)
            }

            changed = true
        }

        return changed
    }

    function processNpcActions(room, now) {
        let changed = false
        const fogMasks = {}

        for (const unitId in room.units) {
            const unit = room.units[unitId]
            const owner = room.players[unit.ownerId]

            if (!owner || !owner.alive) {
                delete room.units[unitId]
                changed = true
                continue
            }

            if (unit.type === 'herald') {
                continue
            }

            if (!fogMasks[unit.ownerId]) {
                fogMasks[unit.ownerId] = computeVisibilityMask(room, unit.ownerId)
            }

            const fogMask = fogMasks[unit.ownerId]
            const npc = NPCS[unit.type]
            const target = pickSoldierTarget(room, unit, owner, fogMask)

            if (!target) {
                continue
            }

            changed = executeSoldierAction(room, unit, npc, target, now) || changed
        }

        return changed
    }

    function pickSoldierTarget(room, unit, owner, fogMask) {
        const castle = room.structures[owner.castleId]
        const defensiveTarget = findClosestEnemyInFog(room, unit.ownerId, fogMask, castle)

        if (defensiveTarget) {
            return defensiveTarget
        }

        const herald = getPlayerCaptureUnit(room, owner)

        if (herald) {
            const heraldTarget = getHeraldSupportTarget(room, herald)

            if (heraldTarget) {
                return heraldTarget
            }
        }

        return getExplorationTarget(unit, fogMask)
    }

    function findClosestEnemyInFog(room, ownerId, fogMask, castle) {
        const origin = castle || { x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) }

        const enemyStructures = Object.values(room.structures)
            .filter(structure => structure.ownerId && structure.ownerId !== ownerId && !structure.disabled)
            .filter(structure => isTileVisible(fogMask, structure.x, structure.y))
            .map(structure => ({ kind: 'structure', value: structure }))

        const enemyUnits = Object.values(room.units)
            .filter(other => other.ownerId !== ownerId)
            .filter(other => isTileVisible(fogMask, other.x, other.y))
            .map(other => ({ kind: 'unit', value: other }))

        const candidates = [...enemyStructures, ...enemyUnits]

        if (!candidates.length) {
            return null
        }

        candidates.sort((first, second) => distance(origin, first.value) - distance(origin, second.value))

        return { kind: 'attack', target: candidates[0] }
    }

    function getHeraldSupportTarget(room, herald) {
        if (herald.order && herald.order.type === 'capture') {
            const structure = room.structures[herald.order.structureId]

            if (structure) {
                return { kind: 'escort-position', x: structure.x, y: structure.y }
            }
        }

        if (herald.order && herald.order.type === 'move') {
            return { kind: 'escort-position', x: herald.order.x, y: herald.order.y }
        }

        return { kind: 'escort-position', x: herald.x, y: herald.y }
    }

    function getExplorationTarget(unit, fogMask) {
        const tile = pickExplorationTile(unit, fogMask)

        if (!tile) {
            return null
        }

        return { kind: 'escort-position', x: tile.x, y: tile.y }
    }

    function pickExplorationTile(unit, fogMask) {
        const fogTiles = []

        for (let y = 0; y < SCREEN.height; y += 1) {
            for (let x = 0; x < SCREEN.width; x += 1) {
                if (!isTileVisible(fogMask, x, y)) {
                    fogTiles.push({ x, y })
                }
            }
        }

        if (!fogTiles.length) {
            return null
        }

        const hash = hashUnitId(unit.unitId)

        fogTiles.sort((first, second) => distance(unit, first) - distance(unit, second))

        const slice = fogTiles.slice(0, Math.min(fogTiles.length, 32))
        return slice[hash % slice.length]
    }

    function hashUnitId(unitId) {
        const text = String(unitId)
        let hash = 0

        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 31 + text.charCodeAt(i)) >>> 0
        }

        return hash
    }

    function executeSoldierAction(room, unit, npc, target, now) {
        if (target.kind === 'attack') {
            const distanceToTarget = distance(unit, target.target.value)

            if (distanceToTarget <= npc.attackRange) {
                if (now - unit.lastAttackAt < npc.attackEveryMs) {
                    return false
                }

                unit.lastAttackAt = now
                unit.lastAttackTarget = createAttackTargetSnapshot(target.target)
                applyDamage(room, target.target, unit.damage, now, unit.ownerId)
                return true
            }

            return moveUnitToward(room, unit, target.target.value, npc.attackRange, now)
        }

        return moveUnitToward(room, unit, target, 1, now)
    }

    function checkVictory(room) {
        if (!room.hasHadCombatants || room.winnerId) {
            return false
        }

        const alivePlayers = Object.values(room.players).filter(player => player.alive)

        if (alivePlayers.length === 1) {
            room.winnerId = alivePlayers[0].playerId
            addLog(room, `${alivePlayers[0].gamerTag} won the match.`)
            return true
        }

        return false
    }

    function captureStructure(room, structure, herald) {
        const player = room.players[herald.playerId || herald.ownerId]

        if (!player) {
            return
        }

        structure.ownerId = player.playerId
        structure.disabled = false
        structure.capture = null
        structure.integrity = Math.ceil(structure.maxIntegrity * 0.5)
        structure.barrier = Math.ceil(structure.maxBarrier * 0.5)
        structure.lastDamagedAt = Date.now()

        if (herald.order && herald.order.type === 'capture' && herald.order.structureId === structure.structureId) {
            herald.order = null
        }

        if (player.order && player.order.type === 'capture' && player.order.structureId === structure.structureId) {
            player.order = null
        }

        addLog(room, player.gamerTag + ' captured ' + getStructureName(structure.type) + '.')
    }

    function createAttackTargetSnapshot(target) {
        if (!target || !target.value) {
            return null
        }

        return {
            kind: target.kind,
            x: target.value.x,
            y: target.value.y,
            targetId: target.value.structureId || target.value.unitId || target.value.playerId || null,
        }
    }

    function applySplashDamage(room, sourceStructure, target, damage, now) {
        const splashTargets = collectDamageableTargets(room)
            .filter(candidate => getDamageableOwnerId(candidate) !== sourceStructure.ownerId)
            .filter(candidate => distance(candidate.value, target.value) <= STRUCTURES.catapult.splashRadius)

        for (const splashTarget of splashTargets) {
            applyDamage(room, splashTarget, damage, now, sourceStructure.ownerId)
        }
    }

    function applyDamage(room, target, amount, now, attackerId) {
        if (target.kind === 'unit') {
            applyDamageToUnit(room, target.value, amount, now, attackerId)
            return
        }

        if (target.kind === 'player') {
            applyDamageToPlayer(room, target.value, amount, now, attackerId)
            return
        }

        applyDamageToStructure(room, target.value, amount, now, attackerId)
    }

    function applyDamageToPlayer(room, player, amount, now, attackerId) {
        if (!isPlayerAvailable(player)) {
            return
        }

        const barrierDamage = Math.min(player.barrier, amount)
        player.barrier -= barrierDamage
        player.integrity -= amount - barrierDamage
        player.lastDamagedAt = now

        if (player.integrity <= 0) {
            knockOutPlayer(room, player, now, attackerId)
        }
    }

    function knockOutPlayer(room, player, now, attackerId) {
        player.integrity = 0
        player.barrier = 0
        player.respawnAt = now + CONFIG.respawnDelayMs
        player.order = null
        resetCapturesForPlayer(room, player.playerId)

        const attackerName = attackerId ? getPlayerName(room, attackerId) : 'combat'
        addLog(room, player.gamerTag + ' fell to ' + attackerName + ' and respawns at the castle in ' + Math.ceil(CONFIG.respawnDelayMs / 1000) + 's.')
    }

    function applyDamageToUnit(room, unit, amount, now, attackerId) {
        const barrierDamage = Math.min(unit.barrier, amount)
        unit.barrier -= barrierDamage
        unit.integrity -= amount - barrierDamage
        unit.lastDamagedAt = now
        syncPlayerToCaptureUnit(room.players[unit.ownerId], unit)

        if (unit.integrity <= 0) {
            if (unit.type === 'herald') {
                knockOutCaptureUnit(room, unit, now, attackerId)
                return
            }

            delete room.units[unit.unitId]
        }
    }

    function knockOutCaptureUnit(room, unit, now, attackerId) {
        const player = room.players[unit.ownerId]
        delete room.units[unit.unitId]

        if (!player || !player.alive) {
            return
        }

        player.activeCaptureUnitId = null
        player.integrity = 0
        player.barrier = 0
        player.respawnAt = now + CONFIG.respawnDelayMs
        player.order = null
        player.avatarDeployed = false
        resetCapturesForPlayer(room, player.playerId)

        const attackerName = attackerId ? getPlayerName(room, attackerId) : 'combat'
        addLog(room, player.gamerTag + ' lost the Herald to ' + attackerName + ' and respawns at the castle in ' + Math.ceil(CONFIG.respawnDelayMs / 1000) + 's.')
    }

    function applyDamageToStructure(room, structure, amount, now, attackerId, options = {}) {
        if (structure.disabled) {
            return
        }

        const barrierDamage = Math.min(structure.barrier, amount)
        structure.barrier -= barrierDamage
        structure.integrity -= amount - barrierDamage
        structure.lastDamagedAt = now

        if (structure.integrity > 0) {
            return
        }

        if (structure.type === 'castle') {
            eliminatePlayer(room, structure.ownerId, attackerId)
            return
        }

        if (options.removeOnDestroyed) {
            removeStructure(room, structure)
            return
        }

        structure.integrity = 0
        structure.barrier = 0
        structure.disabled = true
        structure.capture = null
        addLog(room, `${getStructureName(structure.type)} owned by ${getPlayerName(room, structure.ownerId)} was disabled.`)
    }

    function removeStructure(room, structure) {
        const label = getStructureName(structure.type)
        const ownerName = getPlayerName(room, structure.ownerId)

        clearOrdersForStructure(room, structure.structureId)
        delete room.structures[structure.structureId]
        addLog(room, `${label} owned by ${ownerName} was destroyed.`)
    }

    function clearOrdersForStructure(room, structureId) {
        for (const unitId in room.units) {
            const unit = room.units[unitId]

            if (unit.order && unit.order.type === 'capture' && unit.order.structureId === structureId) {
                unit.order = null
            }
        }

        for (const playerId in room.players) {
            const player = room.players[playerId]

            if (player.order && player.order.type === 'capture' && player.order.structureId === structureId) {
                player.order = null
            }
        }
    }

    function eliminatePlayer(room, playerId, attackerId) {
        const player = room.players[playerId]

        if (!player || !player.alive) {
            return
        }

        player.alive = false
        player.gold = 0
        player.wisdom = 0
        player.integrity = 0
        player.barrier = 0
        player.respawnAt = null
        player.order = null

        const castle = room.structures[player.castleId]
        if (castle) {
            castle.integrity = 0
            castle.barrier = 0
            castle.disabled = true
        }

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.ownerId === playerId && structure.type !== 'castle') {
                structure.disabled = true
                structure.integrity = 0
                structure.barrier = 0
                structure.capture = null
            }
        }

        for (const unitId in room.units) {
            if (room.units[unitId].ownerId === playerId) {
                delete room.units[unitId]
            }
        }

        const attackerName = attackerId ? getPlayerName(room, attackerId) : 'combat'
        addLog(room, `${player.gamerTag} lost the castle to ${attackerName}.`)
        checkVictory(room)
    }

    function findTowerTarget(room, structure) {
        const range = STRUCTURES[structure.type].attackRange
        const enemies = collectDamageableTargets(room)
            .filter(candidate => getDamageableOwnerId(candidate) !== structure.ownerId)
            .filter(candidate => !candidate.value.disabled)
            .filter(candidate => distance(structure, candidate.value) <= range)

        enemies.sort((first, second) => {
            const weights = { unit: 1, player: 2, structure: 3 }

            if (first.kind !== second.kind) {
                return weights[first.kind] - weights[second.kind]
            }

            return distance(structure, first.value) - distance(structure, second.value)
        })

        return enemies[0] || null
    }

    function collectDamageableTargets(room) {
        const targets = []

        for (const unitId in room.units) {
            targets.push({ kind: 'unit', value: room.units[unitId] })
        }

        for (const playerId in room.players) {
            const player = room.players[playerId]

            if (isPlayerAvailable(player)) {
                targets.push({ kind: 'player', value: player })
            }
        }

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (!structure.ownerId || structure.disabled) {
                continue
            }

            targets.push({ kind: 'structure', value: structure })
        }

        return targets
    }

    function getDamageableOwnerId(target) {
        if (target.kind === 'player') {
            return target.value.playerId
        }

        return target.value.ownerId
    }

    function getNearestEnemyCastle(room, ownerId, x, y) {
        const bases = Object.values(room.structures)
            .filter(structure => structure.type === 'castle')
            .filter(structure => structure.ownerId !== ownerId)
            .filter(structure => !structure.disabled)
            .filter(structure => room.players[structure.ownerId] && room.players[structure.ownerId].alive)

        bases.sort((first, second) => distance({ x, y }, first) - distance({ x, y }, second))

        return bases[0] || null
    }

    function getStepToward(room, unit, target) {
        for (const option of getMovementOptions(unit, target)) {
            if (!isInsideMap(option.x, option.y)) {
                continue
            }

            const structure = getStructureAt(room, option.x, option.y)

            if (structure && !structure.disabled && structure.structureId !== target.structureId) {
                const jumpTile = getAlliedStructureJumpTile(room, unit, option, structure)

                if (jumpTile) {
                    return jumpTile
                }

                continue
            }

            if (getActorAt(room, option.x, option.y)) {
                continue
            }

            return option
        }

        return null
    }

    function getMovementOptions(unit, target) {
        const options = []
        const dx = Math.sign(target.x - unit.x)
        const dy = Math.sign(target.y - unit.y)

        if (Math.abs(target.x - unit.x) >= Math.abs(target.y - unit.y)) {
            options.push({ x: unit.x + dx, y: unit.y })
            options.push({ x: unit.x, y: unit.y + dy })
        } else {
            options.push({ x: unit.x, y: unit.y + dy })
            options.push({ x: unit.x + dx, y: unit.y })
        }

        return options
    }

    function getAlliedStructureJumpTile(room, unit, blockedTile, structure) {
        if (structure.ownerId !== unit.ownerId) {
            return null
        }

        const dx = blockedTile.x - unit.x
        const dy = blockedTile.y - unit.y
        const jumpTile = { x: blockedTile.x + dx, y: blockedTile.y + dy }

        if (!isInsideMap(jumpTile.x, jumpTile.y)) {
            return null
        }

        if (getStructureAt(room, jumpTile.x, jumpTile.y) || getActorAt(room, jumpTile.x, jumpTile.y)) {
            return null
        }

        return jumpTile
    }

    function getAttackableMovementObstacle(room, unit, target) {
        for (const option of getMovementOptions(unit, target)) {
            if (!isInsideMap(option.x, option.y) || getActorAt(room, option.x, option.y)) {
                continue
            }

            const structure = getStructureAt(room, option.x, option.y)

            if (isAttackableMovementObstacle(unit, structure, target)) {
                return structure
            }
        }

        return null
    }

    function isAttackableMovementObstacle(unit, structure, target) {
        return Boolean(structure
            && !structure.disabled
            && structure.ownerId !== unit.ownerId
            && structure.structureId !== target.structureId)
    }

    function attackMovementObstacle(room, unit, structure, now) {
        const attackEveryMs = unit.attackEveryMs ?? NPCS[unit.type]?.attackEveryMs ?? CONFIG.tickRateMs

        if (now - unit.lastAttackAt < attackEveryMs) {
            return false
        }

        const damage = unit.damage ?? NPCS[unit.type]?.damage ?? 0

        if (damage <= 0) {
            return false
        }

        unit.lastAttackAt = now
        unit.lastAttackTarget = createAttackTargetSnapshot({ kind: 'structure', value: structure })
        applyDamageToStructure(room, structure, damage, now, unit.ownerId, { removeOnDestroyed: true })
        syncPlayerToCaptureUnit(room.players[unit.ownerId], unit)
        return true
    }

    function getCaptureCandidate(room, structure) {
        const candidates = Object.values(room.units)
            .filter(unit => unit.type === 'herald')
            .filter(unit => unit.ownerId !== structure.ownerId)
            .filter(unit => unit.order && unit.order.type === 'capture')
            .filter(unit => unit.order.structureId === structure.structureId)
            .filter(unit => room.players[unit.ownerId] && room.players[unit.ownerId].alive)
            .filter(unit => distance(unit, structure) <= CONFIG.captureRange)

        candidates.sort((first, second) => distance(first, structure) - distance(second, structure))

        return candidates[0] || null
    }

    function resetCapturesForPlayer(room, playerId) {
        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.capture && structure.capture.playerId === playerId) {
                structure.capture = null
            }
        }
    }

    function getPlayerCaptureUnit(room, player) {
        if (player.activeCaptureUnitId && room.units[player.activeCaptureUnitId]) {
            return room.units[player.activeCaptureUnitId]
        }

        return Object.values(room.units)
            .find(unit => unit.type === 'herald' && unit.ownerId === player.playerId) || null
    }

    function syncPlayerToCaptureUnit(player, unit) {
        if (!player || !unit || unit.type !== 'herald') {
            return
        }

        player.x = unit.x
        player.y = unit.y
        player.integrity = Math.max(0, unit.integrity)
        player.maxIntegrity = unit.maxIntegrity
        player.barrier = Math.max(0, unit.barrier)
        player.maxBarrier = unit.maxBarrier
        player.activeCaptureUnitId = unit.unitId
        player.lastMovedAt = Date.now()
        player.lastDamagedAt = unit.lastDamagedAt
    }

    function canBuildStructure(room, player, type) {
        const catalog = STRUCTURES[type]

        if (!catalog || !catalog.buildable) {
            return false
        }

        const castle = room.structures[player.castleId]

        if (!castle) {
            return false
        }

        const limitStatus = getBuildLimitStatus(room, player, type)

        if (limitStatus.current >= limitStatus.max) {
            return false
        }

        if (type === 'mine') {
            return true
        }

        if (catalog.requiresCastleLevel) {
            return castle.level >= catalog.requiresCastleLevel
        }

        if (catalog.requiresResearch) {
            return Boolean(player.unlocked[catalog.requiresResearch])
        }

        return Boolean(player.unlocked[type])
    }

    function getBuildLimitStatus(room, player, type) {
        const castle = room.structures[player.castleId]

        if (!castle) {
            return null
        }

        return {
            current: countActiveOwnedStructures(room, player.playerId, type),
            max: getBuildLimit(type, castle.level),
        }
    }

    function getBuildLimit(type, castleLevel) {
        const catalog = STRUCTURES[type]

        if (!catalog || !catalog.buildable) {
            return 0
        }

        const level = Math.max(1, Math.floor(Number(castleLevel) || 1))
        return catalog.buildLimitBase + catalog.buildLimitSlope * (level - 1)
    }

    function countActiveOwnedStructures(room, playerId, type) {
        return Object.values(room.structures)
            .filter(structure => structure.ownerId === playerId)
            .filter(structure => structure.type === type)
            .filter(structure => !structure.disabled)
            .length
    }

    function computePlayerLimits(room, playerId) {
        const player = room.players[playerId]
        const castle = player ? room.structures[player.castleId] : null
        const limits = {}

        for (const type of Object.keys(STRUCTURES).filter(candidate => STRUCTURES[candidate].buildable)) {
            limits[type] = {
                current: countActiveOwnedStructures(room, playerId, type),
                max: castle ? getBuildLimit(type, castle.level) : 0,
            }
        }

        limits.castleUpgrade = computeCastleUpgradeGate(room, playerId, castle ? castle.level : 0)
        return limits
    }

    function computeAverageStructureLevel(room, playerId) {
        const owned = Object.values(room.structures)
            .filter(structure => structure.ownerId === playerId)
            .filter(structure => structure.type !== 'castle')
            .filter(structure => !structure.disabled)

        if (owned.length === 0) {
            return 0
        }

        const sum = owned.reduce((total, structure) => total + structure.level, 0)
        return sum / owned.length
    }

    function computeCastleUpgradeGate(room, playerId, castleLevel) {
        const averageLevel = computeAverageStructureLevel(room, playerId)
        const required = castleLevel * CONFIG.castleUpgradeAverageRatio

        return {
            averageLevel,
            required,
            ratio: CONFIG.castleUpgradeAverageRatio,
            ready: averageLevel >= required,
        }
    }

    function isNearOwnedAnchor(room, playerId, x, y) {
        return Object.values(room.structures)
            .filter(structure => structure.ownerId === playerId && !structure.disabled)
            .some(structure => distance(structure, { x, y }) <= CONFIG.buildRange)
    }

    function getActiveStructures(room, playerId, type) {
        return Object.values(room.structures)
            .filter(structure => structure.ownerId === playerId)
            .filter(structure => structure.type === type)
            .filter(structure => !structure.disabled)
    }

    function getHighestStructureLevel(room, playerId, type) {
        return getActiveStructures(room, playerId, type)
            .reduce((highestLevel, structure) => Math.max(highestLevel, structure.level), 0)
    }

    function getStructureAt(room, x, y) {
        return Object.values(room.structures).find(structure => structure.x === x && structure.y === y) || null
    }

    function getActorAt(room, x, y, ignoredPlayerId = null) {
        const player = Object.values(room.players)
            .find(candidate => isPlayerAvailable(candidate)
                && candidate.playerId !== ignoredPlayerId
                && candidate.x === x
                && candidate.y === y)

        if (player) {
            return player
        }

        return Object.values(room.units)
            .find(unit => unit.x === x && unit.y === y) || null
    }

    function isPlayerCommandable(player) {
        return Boolean(player && player.alive && !player.respawnAt)
    }

    function isPlayerAvailable(player) {
        return Boolean(player && player.alive && player.avatarDeployed !== false && !player.respawnAt && player.integrity > 0)
    }

    function getRespawnTile(room, player) {
        const castle = room.structures[player.castleId]

        if (!castle || castle.disabled) {
            return null
        }

        return getEmptyNeighbor(room, castle.x, castle.y) || getEmptyTileNear(room, castle.x, castle.y, Math.max(SCREEN.width, SCREEN.height))
    }

    function getEmptyTileNear(room, x, y, maxRadius) {
        for (let radius = 1; radius <= maxRadius; radius += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
                        continue
                    }

                    const next = { x: x + dx, y: y + dy }

                    if (!isInsideMap(next.x, next.y)) {
                        continue
                    }

                    if (getStructureAt(room, next.x, next.y) || getActorAt(room, next.x, next.y)) {
                        continue
                    }

                    return next
                }
            }
        }

        return null
    }

    function getEmptyNeighbor(room, x, y) {
        const offsets = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
        ]

        for (const offset of offsets) {
            const next = { x: x + offset.x, y: y + offset.y }

            if (!isInsideMap(next.x, next.y)) {
                continue
            }

            if (getStructureAt(room, next.x, next.y) || getActorAt(room, next.x, next.y)) {
                continue
            }

            return next
        }

        return null
    }

    function getMoveFromKey(keyPressed) {
        const acceptedMoves = {
            ArrowUp: { x: 0, y: -1 },
            w: { x: 0, y: -1 },
            W: { x: 0, y: -1 },
            ArrowRight: { x: 1, y: 0 },
            d: { x: 1, y: 0 },
            D: { x: 1, y: 0 },
            ArrowDown: { x: 0, y: 1 },
            s: { x: 0, y: 1 },
            S: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 },
            a: { x: -1, y: 0 },
            A: { x: -1, y: 0 },
        }

        return acceptedMoves[keyPressed]
    }

    function getSpawnPoint(index) {
        const spawns = [
            { castleX: 4, castleY: 4, playerX: 6, playerY: 4 },
            { castleX: SCREEN.width - 5, castleY: SCREEN.height - 5, playerX: SCREEN.width - 7, playerY: SCREEN.height - 5 },
            { castleX: SCREEN.width - 5, castleY: 4, playerX: SCREEN.width - 7, playerY: 4 },
            { castleX: 4, castleY: SCREEN.height - 5, playerX: 6, playerY: SCREEN.height - 5 },
            { castleX: Math.floor(SCREEN.width / 2), castleY: 4, playerX: Math.floor(SCREEN.width / 2), playerY: 6 },
            { castleX: Math.floor(SCREEN.width / 2), castleY: SCREEN.height - 5, playerX: Math.floor(SCREEN.width / 2), playerY: SCREEN.height - 7 },
            { castleX: 4, castleY: Math.floor(SCREEN.height / 2), playerX: 6, playerY: Math.floor(SCREEN.height / 2) },
            { castleX: SCREEN.width - 5, castleY: Math.floor(SCREEN.height / 2), playerX: SCREEN.width - 7, playerY: Math.floor(SCREEN.height / 2) },
        ]

        return spawns[index % spawns.length]
    }

    function getMaxIntegrity(type, level) {
        const catalog = STRUCTURES[type]
        const explicitBonus = catalog.integrityPerLevel || 0
        const genericBonus = type === 'castle' ? 0 : Math.ceil(catalog.integrity * 0.1) * (level - 1)

        return catalog.integrity + explicitBonus * (level - 1) + genericBonus
    }

    function getMaxBarrier(type, level) {
        const catalog = STRUCTURES[type]
        const explicitBonus = catalog.barrierPerLevel || 0
        const genericBonus = type === 'castle' ? 0 : Math.ceil(catalog.barrier * 0.1) * (level - 1)

        return catalog.barrier + explicitBonus * (level - 1) + genericBonus
    }

    function getUpgradeCost(structure) {
        return Math.round(STRUCTURES[structure.type].cost * (1.5 ** structure.level))
    }

    function getGoldRate(structure) {
        return STRUCTURES.mine.goldRate + (structure.level - 1) * STRUCTURES.mine.goldRatePerLevel
    }

    function getWisdomRate(structure) {
        return STRUCTURES.library.wisdomRate + (structure.level - 1) * STRUCTURES.library.wisdomRatePerLevel
    }

    function addLog(room, message) {
        const logEntry = {
            id: room.hostKey + '-' + room.nextLogId++,
            message,
            at: Date.now(),
        }

        room.logs.unshift(logEntry)
        room.logs = room.logs.slice(0, CONFIG.logLimit)

        debugLog(room, 'game-log', logEntry)
    }

    function getPlayerName(room, playerId) {
        if (!playerId || !room.players[playerId]) {
            return 'Neutral'
        }

        return room.players[playerId].gamerTag
    }

    function generateHostKey() {
        let hostKey = ''

        do {
            hostKey = Math.random().toString(36).slice(2, 7).toUpperCase()
        } while (rooms[hostKey])

        return hostKey
    }

    function getRoomCount() {
        return Object.keys(rooms).length
    }

    return {
        state,
        setState,
        subscribe,
        subscribeDebug,
        start,
        stop,
        createMatch,
        joinMatch,
        addAiPlayer,
        disconnectPlayer,
        movePlayer,
        executeAction,
        getPublicState,
        getHostKeyForPlayer,
        getRoomCount,
        __testing: {
            getRoom(hostKey) {
                return rooms[hostKey]
            },
            tickRoom,
            runAiPlayers,
            debugLog,
            createUnfilteredPublicState,
            createFilteredPublicState,
            updateVisionMemories,
            computeVisibilityMask,
            refreshPlayerMemory,
            filterPlayersForVisibility,
            filterStructuresForVisibility,
            filterUnitsForVisibility,
            getStructureSightRange,
            getNpcSightRange,
            createStructure,
            buildStructure,
            upgradeStructure,
            researchRecipe,
            spawnNpc,
            toggleAutoplay,
            processPlayerRespawns,
            regenerateBarriers,
            processHeraldAutonomy,
            findCapturableForHerald,
            pickHeraldPatrolTile,
            assignHeraldMoveOrder,
            assignHeraldCaptureOrder,
            spawnCaptureUnit,
            processCaptureUnitOrders,
            processCaptureUnitOrder,
            processCaptures,
            captureStructure,
            processTowerAttacks,
            processNpcActions,
            checkVictory,
            applyDamage,
            applySplashDamage,
            applyDamageToPlayer,
            applyDamageToUnit,
            applyDamageToStructure,
            eliminatePlayer,
            getStepToward,
            getRespawnTile,
            canBuildStructure,
            getBuildLimitStatus,
            getBuildLimit,
            countActiveOwnedStructures,
            computePlayerLimits,
            computeAverageStructureLevel,
            computeCastleUpgradeGate,
            getEmptyTileNear,
            getEmptyNeighbor,
            summarizeActor,
            normalizeHostKey,
            sanitizeGamerTag,
        },
    }
}

function summarizeRoom(room) {
    return {
        players: Object.keys(room.players).length,
        alivePlayers: Object.values(room.players).filter(player => player.alive).length,
        structures: Object.keys(room.structures).length,
        units: Object.keys(room.units).length,
        winnerId: room.winnerId,
        hasHadCombatants: room.hasHadCombatants,
    }
}

function summarizePlayer(player) {
    return {
        playerId: player.playerId,
        gamerTag: player.gamerTag,
        x: player.x,
        y: player.y,
        gold: player.gold,
        wisdom: player.wisdom,
        alive: player.alive,
        connected: player.connected,
        isAi: player.isAi,
        autoplay: player.autoplay,
        castleId: player.castleId,
        integrity: player.integrity,
        maxIntegrity: player.maxIntegrity,
        barrier: player.barrier,
        maxBarrier: player.maxBarrier,
        respawnAt: player.respawnAt,
        order: player.order,
        activeCaptureUnitId: player.activeCaptureUnitId,
        avatarDeployed: player.avatarDeployed,
        unlocked: player.unlocked,
    }
}

function summarizeStructure(structure) {
    return {
        structureId: structure.structureId,
        ownerId: structure.ownerId,
        type: structure.type,
        x: structure.x,
        y: structure.y,
        level: structure.level,
        integrity: structure.integrity,
        maxIntegrity: structure.maxIntegrity,
        barrier: structure.barrier,
        maxBarrier: structure.maxBarrier,
        disabled: structure.disabled,
    }
}

function summarizeActor(actor) {
    if (actor.playerId) {
        return summarizePlayer(actor)
    }

    return {
        unitId: actor.unitId,
        ownerId: actor.ownerId,
        type: actor.type,
        x: actor.x,
        y: actor.y,
        integrity: actor.integrity,
        barrier: actor.barrier,
    }
}

function createPublicShell() {
    return {
        hostKey: null,
        createdAt: null,
        hasHadCombatants: false,
        players: {},
        structures: {},
        units: {},
        screen: clone(SCREEN),
        config: clone(CONFIG),
        catalog: {
            structures: clone(STRUCTURES),
            research: clone(RESEARCH),
            npcs: clone(NPCS),
        },
        logs: [],
        winnerId: null,
        tick: 0,
        fogMask: createEmptyVisibilityMask(),
        memory: { structures: {} },
    }
}

function createEmptyVisibilityMask() {
    return Array.from({ length: SCREEN.height }, () => Array.from({ length: SCREEN.width }, () => false))
}

function createFullVisibilityMask() {
    return Array.from({ length: SCREEN.height }, () => Array.from({ length: SCREEN.width }, () => true))
}

function isInsideMap(x, y) {
    return x >= 0 && x < SCREEN.width && y >= 0 && y < SCREEN.height
}

function distance(first, second) {
    const dx = first.x - second.x
    const dy = first.y - second.y

    return Math.sqrt(dx * dx + dy * dy)
}

function normalizeHostKey(hostKey) {
    return String(hostKey || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5)
}

function sanitizeGamerTag(gamerTag, fallback) {
    const sanitized = String(gamerTag || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 18)
        .trim()

    if (sanitized) {
        return sanitized
    }

    return `Player ${String(fallback).slice(0, 4)}`
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}
